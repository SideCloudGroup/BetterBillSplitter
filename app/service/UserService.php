<?php
declare (strict_types=1);

namespace app\service;

use app\model\Item;
use app\model\Party;
use app\model\User;
use app\Request;
use DateTime;
use DateTimeZone;
use Exception;
use GuzzleHttp\Client as GuzzleHttpClient;
use GuzzleHttp\Psr7\HttpFactory;
use HCaptcha\HCaptcha;
use think\facade\Cookie;
use think\facade\Db;
use think\facade\Log;
use think\facade\Session;
use think\Service;
use Turnstile\Client\Client;
use Turnstile\Turnstile;
use voku\helper\AntiXSS;

class UserService extends Service
{
    private ?User $user = null;

    public function register()
    {
        $this->app->bind('userService', UserService::class);
    }

    public function getUser(): User|null
    {
        // 检查Session中是否有userid
        if (! Session::has('userid')) {
            $this->user = null;
            return null;
        }

        if (! Session::has('auth') || Session::get('auth') !== true) {
            Session::clear();
            Cookie::delete('user');
            $this->user = null;
            return null;
        }

        // 如果已经缓存了用户对象，直接返回
        if ($this->user !== null) {
            return $this->user;
        }

        // 从数据库获取用户信息
        $_user = (new User())->where('id', Session::get('userid'))->findOrEmpty();

        // 用户不存在，清理Session和Cookie
        if ($_user->isEmpty()) {
            Session::clear();
            Cookie::delete('user');
            $this->user = null;
            return null;
        }

        // 检查用户是否被禁用
        if ($_user->enable === false) {
            Session::clear();
            Cookie::delete('user');
            $this->user = null;
            return null;
        }

        $this->user = $_user;
        return $this->user;
    }

    public function logout(): void
    {
        $this->user = null;
        Session::clear();
        Cookie::delete('user');
    }

    public function getUserList(): array
    {
        $user = new User();
        return $user->where('enable', true)->field('id,username')->order('username', 'asc')->select()->toArray();
    }

    public function getUserDetails(int $id): array
    {
        $user = (new User())->where('id', $id)->findOrEmpty();
        if ($user === null) {
            return ['ret' => 0, 'msg' => 'User not found'];
        }
        $userDetails = (new Item())->where('userid', $id)->select()->toArray();
        $totalPrice = '0';
        foreach ($userDetails as $item) {
            $totalPrice = bcadd($totalPrice, (string) $item['amount'], 2);
        }
        return ['ret' => 1, 'data' => $userDetails, 'totalPrice' => $totalPrice];
    }

    public function addItem(int $userID, string $description, float $amount, int $initiator, ?int $partyId = null): bool
    {
        $item = new Item();
        $item->userid = $userID;
        $item->description = $description;
        $item->amount = $amount;
        $item->paid = $userID === $initiator;

        // 使用派对时区创建时间
        if ($partyId) {
            $party = Party::find($partyId);
            if ($party && $party->timezone) {
                $timezone = new DateTimeZone($party->timezone);
                $now = new DateTime('now', $timezone);
                $item->created_at = $now->format('Y-m-d H:i:s');
            } else {
                $item->created_at = date('Y-m-d H:i:s');
            }
        } else {
            $item->created_at = date('Y-m-d H:i:s');
        }

        $item->initiator = $initiator;
        $item->party_id = $partyId;
        return $item->save();
    }

    public function getUserStat(): array
    {
        $users = Db::table('user')->field('id, username')->select()->toArray();
        $users = array_column($users, 'username', 'id');
        $userStat = [];
        foreach ($users as $id => $username) {
            $userStat[$username]['in'] = (new Item())->where('initiator', $id)->where('paid', 0)->sum('amount');
            $userStat[$username]['out'] = (new Item())->where('userid', $id)->where('paid', 0)->sum('amount');
        }
        return $userStat;
    }

    public function getBestPay(): array
    {
        $users = Db::table('user')->field('id, username')->select()->toArray();
        $users = array_column($users, 'username', 'id');
        $userUnpaid = [];
        // 获取所有未支付订单
        $unpaid = (new Item())->where('paid', 0)->field(['userid, amount, initiator'])->select();
        foreach ($unpaid as $item) {
            if (! isset($userUnpaid[$item->userid][$item->initiator])) {
                $userUnpaid[$item->userid][$item->initiator] = '0';
            }
            $userUnpaid[$item->userid][$item->initiator] = bcadd($userUnpaid[$item->userid][$item->initiator], (string) $item->amount, 2);
        }
        $tmpResult = [];
        // 抵消付款人和收款人
        foreach ($users as $payer_id => $payer) {
            foreach ($users as $payee_id => $payee) {
                if ($payer_id == $payee_id) {
                    continue;
                }
                if (isset($tmpResult[$payer_id][$payee_id]) || isset($tmpResult[$payee_id][$payer_id])) {
                    continue;
                }
                $diff = bcsub(($userUnpaid[$payer_id][$payee_id] ?? '0'), ($userUnpaid[$payee_id][$payer_id] ?? '0'), 2);
                match (true) {
                    bccomp($diff, '0', 2) < 0 => [
                        $tmpResult[$payer_id][$payee_id] = '0',
                        $tmpResult[$payee_id][$payer_id] = bcsub('0', $diff, 2),
                    ],
                    bccomp($diff, '0', 2) > 0 => [
                        $tmpResult[$payer_id][$payee_id] = $diff,
                        $tmpResult[$payee_id][$payer_id] = '0',
                    ],
                    default => [
                        $tmpResult[$payer_id][$payee_id] = '0',
                        $tmpResult[$payee_id][$payer_id] = '0',
                    ],
                };
            }
        }
        // 使用用户名替换用户ID，并去除0值
        $result = [];
        foreach ($tmpResult as $payer_id => $payer) {
            foreach ($payer as $payee_id => $amount) {
                if ($amount !== 0) {
                    $result[$users[$payer_id]][$users[$payee_id]] = $amount;
                }
            }
        }
        $stage1 = $result;
        // 进一步优化
        $debtsDict = $result;
        $balance = [];

        // 计算每个人的净余额
        foreach ($debtsDict as $debtor => $creditors) {
            foreach ($creditors as $creditor => $amount) {
                if (! isset($balance[$debtor])) {
                    $balance[$debtor] = '0';
                }
                if (! isset($balance[$creditor])) {
                    $balance[$creditor] = '0';
                }
                $balance[$debtor] = bcsub($balance[$debtor], (string) $amount, 2);
                $balance[$creditor] = bcadd($balance[$creditor], (string) $amount, 2);
            }
        }

        // 分离出正负余额
        $creditors = [];
        $debtors = [];
        foreach ($balance as $person => $bal) {
            if (bccomp($bal, '0', 2) > 0) {
                $creditors[] = [$person, $bal];
            } elseif (bccomp($bal, '0', 2) < 0) {
                $debtors[] = [$person, bcsub('0', $bal, 2)];
            }
        }

        // 优化支付方案
        $optimizedDebts = [];
        $i = 0;
        $j = 0;
        while ($i < count($creditors) && $j < count($debtors)) {
            list($creditor, $credAmount) = $creditors[$i];
            list($debtor, $debtAmount) = $debtors[$j];

            if (bccomp($credAmount, $debtAmount, 2) > 0) {
                $optimizedDebts[] = [$debtor, $creditor, $debtAmount];
                $creditors[$i][1] = bcsub($credAmount, $debtAmount, 2);
                $j++;
            } elseif (bccomp($credAmount, $debtAmount, 2) < 0) {
                $optimizedDebts[] = [$debtor, $creditor, $credAmount];
                $debtors[$j][1] = bcsub($debtAmount, $credAmount, 2);
                $i++;
            } else {
                $optimizedDebts[] = [$debtor, $creditor, $credAmount];
                $i++;
                $j++;
            }
        }

        // 转换为字典形式
        $optimizedDict = [];
        foreach ($optimizedDebts as $debt) {
            list($debtor, $creditor, $amount) = $debt;
            if (! isset($optimizedDict[$debtor])) {
                $optimizedDict[$debtor] = [];
            }
            $optimizedDict[$debtor][$creditor] = (string) $amount;
        }

        return [$optimizedDict, $stage1];
    }

    /**
     * 获取派对的最优支付方案
     */
    public function getPartyBestPay(int $partyId): array
    {
        // 获取派对成员
        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->where('party_member.party_id', $partyId)
            ->field('user.id, user.username')
            ->select()
            ->toArray();

        if (empty($members)) {
            return [[], []];
        }

        $users = array_column($members, 'username', 'id');
        $userUnpaid = [];

        // 获取派对内所有未支付订单
        $unpaid = (new Item())->where('paid', 0)
            ->where('party_id', $partyId)
            ->field(['userid, amount, initiator'])
            ->select();

        foreach ($unpaid as $item) {
            if (! isset($userUnpaid[$item->userid][$item->initiator])) {
                $userUnpaid[$item->userid][$item->initiator] = '0';
            }
            $userUnpaid[$item->userid][$item->initiator] = bcadd($userUnpaid[$item->userid][$item->initiator], (string) $item->amount, 2);
        }

        $tmpResult = [];
        // 抵消付款人和收款人
        foreach ($users as $payer_id => $payer) {
            foreach ($users as $payee_id => $payee) {
                if ($payer_id == $payee_id) {
                    continue;
                }
                if (isset($tmpResult[$payer_id][$payee_id]) || isset($tmpResult[$payee_id][$payer_id])) {
                    continue;
                }
                $diff = bcsub(($userUnpaid[$payer_id][$payee_id] ?? '0'), ($userUnpaid[$payee_id][$payer_id] ?? '0'), 2);
                match (true) {
                    bccomp($diff, '0', 2) < 0 => [
                        $tmpResult[$payer_id][$payee_id] = '0',
                        $tmpResult[$payee_id][$payer_id] = bcsub('0', $diff, 2),
                    ],
                    bccomp($diff, '0', 2) > 0 => [
                        $tmpResult[$payer_id][$payee_id] = $diff,
                        $tmpResult[$payee_id][$payer_id] = '0',
                    ],
                    default => [
                        $tmpResult[$payer_id][$payee_id] = '0',
                        $tmpResult[$payee_id][$payer_id] = '0',
                    ],
                };
            }
        }

        // 使用用户名替换用户ID，并去除0值
        $result = [];
        foreach ($tmpResult as $payer_id => $payer) {
            foreach ($payer as $payee_id => $amount) {
                if ($amount !== 0) {
                    $result[$users[$payer_id]][$users[$payee_id]] = $amount;
                }
            }
        }

        $stage1 = $result;

        // 进一步优化
        $debtsDict = $result;
        $balance = [];

        // 计算每个人的净余额
        foreach ($debtsDict as $debtor => $creditors) {
            foreach ($creditors as $creditor => $amount) {
                if (! isset($balance[$debtor])) {
                    $balance[$debtor] = '0';
                }
                if (! isset($balance[$creditor])) {
                    $balance[$creditor] = '0';
                }
                $balance[$debtor] = bcsub($balance[$debtor], (string) $amount, 2);
                $balance[$creditor] = bcadd($balance[$creditor], (string) $amount, 2);
            }
        }

        // 分离出正负余额
        $creditors = [];
        $debtors = [];
        foreach ($balance as $person => $bal) {
            if (bccomp($bal, '0', 2) > 0) {
                $creditors[] = [$person, $bal];
            } elseif (bccomp($bal, '0', 2) < 0) {
                $debtors[] = [$person, bcsub('0', $bal, 2)];
            }
        }

        // 优化支付方案
        $optimizedDebts = [];
        $i = 0;
        $j = 0;
        while ($i < count($creditors) && $j < count($debtors)) {
            list($creditor, $credAmount) = $creditors[$i];
            list($debtor, $debtAmount) = $debtors[$j];

            if (bccomp($credAmount, $debtAmount, 2) > 0) {
                $optimizedDebts[] = [$debtor, $creditor, $debtAmount];
                $creditors[$i][1] = bcsub($credAmount, $debtAmount, 2);
                $j++;
            } elseif (bccomp($credAmount, $debtAmount, 2) < 0) {
                $optimizedDebts[] = [$debtor, $creditor, $credAmount];
                $debtors[$j][1] = bcsub($debtAmount, $credAmount, 2);
                $i++;
            } else {
                $optimizedDebts[] = [$debtor, $creditor, $credAmount];
                $i++;
                $j++;
            }
        }

        // 转换为字典形式
        $optimizedDict = [];
        foreach ($optimizedDebts as $debt) {
            list($debtor, $creditor, $amount) = $debt;
            if (! isset($optimizedDict[$debtor])) {
                $optimizedDict[$debtor] = [];
            }
            $optimizedDict[$debtor][$creditor] = (string) $amount;
        }

        return [$optimizedDict, $stage1];
    }

    /**
     * 获取派对用户统计
     */
    public function getPartyUserStat(int $partyId): array
    {
        // 获取派对成员
        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->where('party_member.party_id', $partyId)
            ->field('user.id, user.username')
            ->select()
            ->toArray();

        if (empty($members)) {
            return [];
        }

        $userStat = [];
        foreach ($members as $member) {
            $id = $member['id'];
            $username = $member['username'];
            $userStat[$username]['in'] = (new Item())->where('initiator', $id)
                ->where('party_id', $partyId)
                ->where('paid', 0)
                ->sum('amount');
            $userStat[$username]['out'] = (new Item())->where('userid', $id)
                ->where('party_id', $partyId)
                ->where('paid', 0)
                ->sum('amount');
        }
        return $userStat;
    }

    public function updateUserProfile(int $id, string $username, string $password): array
    {
        $user = (new User())->where('id', $id)->findOrEmpty();
        if ($user->isEmpty()) {
            return array('ret' => 0, 'msg' => '未找到该用户');
        }
        # 检查用户名是否重复
        if ($user->username != $username) {
            # 检查用户名是否重复
            $user_tmp = (new User())->where('username', $username)->findOrEmpty();
            if (! $user_tmp->isEmpty()) {
                return array('ret' => 0, 'msg' => '用户名已存在');
            }
            $user->username = $username;
        }
        # 更新密码
        if ($password != '') {
            $user->password = password_hash($password, PASSWORD_ARGON2ID);
        }
        $user->save();
        return array('ret' => 1, 'msg' => '更新成功');
    }

    public function verifyCaptcha(Request $request): bool
    {
        try {
            $antixss = new AntiXSS();
            switch (getSetting('captcha_driver', 'none')) {
                case 'numeric':
                {
                    return captcha_check($antixss->xss_clean($request->param('captcha')));
                }
                case 'turnstile':
                {
                    $turnstile = new Turnstile(
                        client: (new Client(
                            new GuzzleHttpClient(),
                            new HttpFactory(),
                        )),
                        secretKey: getSetting('captcha_siteSecret'),
                    );
                    $response = $turnstile->verify(
                        $antixss->xss_clean($request->param('cf-turnstile-response', '')),
                        $request->server('REMOTE_ADDR'),
                    );
                    return $response->success;
                }
                case 'hcaptcha':
                {
                    $hcaptcha = new HCaptcha(getSetting('captcha_siteSecret'));
                    $resp = $hcaptcha->verify(
                        $antixss->xss_clean($request->param('h-captcha-response', '')),
                        $request->server('REMOTE_ADDR'));
                    return $resp->isSuccess();
                }
                case 'cap':
                {
                    $siteURL = getSetting('captcha_customUrl');
                    $siteKey = getSetting('captcha_siteKey');
                    $siteSecret = getSetting('captcha_siteSecret');
                    $captcha_token = $antixss->xss_clean($request->param('cap-token', ''));
                    $client = new GuzzleHttpClient();
                    $response = $client->post("$siteURL/$siteKey/siteverify", [
                        'headers' => [
                            'Content-Type' => 'application/json',
                        ],
                        'json' => [
                            'secret' => $siteSecret,
                            'response' => $captcha_token,
                        ],
                    ]);
                    $result = json_decode($response->getBody()->getContents(), true);
                    return $result['success'] ?? false;
                }
                default:
                {
                    return true;
                }
            }
        } catch (Exception $e) {
            Log::error("Captcha Error:" . $e->getMessage());
            return false;
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function getPartyItemsForExport(int $partyId): array
    {
        return Db::table('item')
            ->join('user payer', 'item.userid = payer.id')
            ->join('user initiator', 'item.initiator = initiator.id')
            ->where('item.party_id', $partyId)
            ->field('item.id, item.description, item.amount, item.userid, item.initiator, item.paid, item.party_id, item.created_at, payer.username as payer_name, initiator.username as initiator_name')
            ->order('item.id', 'asc')
            ->select()
            ->toArray();
    }

    /**
     * 最优支付下载与归档导出共用数据结构
     *
     * @return array<string, mixed>
     */
    public function buildPartyExportData(int $partyId): array
    {
        $party = Party::find($partyId);
        if (! $party) {
            return [];
        }
        $bestPay = $this->getPartyBestPay($partyId);

        return [
            'party_name' => $party->name,
            'party_description' => $party->description,
            'archived_at' => $party->archived_at,
            'bestPayFinal' => $bestPay[0],
            'bestPayAll' => $bestPay[1],
            'userStat' => $this->getPartyUserStat($partyId),
            'items' => $this->getPartyItemsForExport($partyId),
            'export_time' => date('Y-m-d H:i:s'),
        ];
    }
}
