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
use Throwable;
use Turnstile\Client\Client;
use Turnstile\Turnstile;
use voku\helper\AntiXSS;

class UserService extends Service
{
    private ?User $user = null;
    private ?int $jwtUserId = null;

    public function register()
    {
        $this->app->bind('userService', UserService::class);
    }

    public function setJwtUserId(?int $userId): void
    {
        $this->jwtUserId = $userId;
        $this->user = null;
    }

    public function getUser(): User|null
    {
        if ($this->jwtUserId === null) {
            $this->user = null;

            return null;
        }

        if ($this->user !== null) {
            return $this->user;
        }

        $_user = (new User())->where('id', $this->jwtUserId)->findOrEmpty();
        if ($_user->isEmpty() || $_user->enable === false) {
            $this->user = null;

            return null;
        }

        $this->user = $_user;

        return $this->user;
    }

    public function logout(): void
    {
        $this->user = null;
        $this->jwtUserId = null;
        Session::clear();
        Cookie::delete('user');
        try {
            app('jwtTokenService')->revokeRefreshFromCookie();
        } catch (Throwable) {
            // JWT 未配置或容器未就绪时忽略
        }
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
            $totalPrice = bcadd($totalPrice, (string)$item['amount'], 2);
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
        $unpaid = (new Item())->where('paid', 0)->field(['userid, amount, initiator'])->select();
        $items = [];
        foreach ($unpaid as $item) {
            $items[] = [
                'userid' => $item->userid,
                'initiator' => $item->initiator,
                'amount' => $item->amount,
            ];
        }

        return $this->settlement()->compute(
            $this->settlement()->aggregateUnpaid($items),
            $users
        );
    }

    private function settlement(): PaymentSettlementService
    {
        return new PaymentSettlementService();
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
                    return captcha_check($antixss->xss_clean($request->param('captcha', '')));
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
                        $request->server('REMOTE_ADDR')
                    );
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
     * 归档前保存快照（含未付账目与最优支付），供归档后下载
     */
    public function savePartyArchiveSnapshot(int $partyId): bool
    {
        $data = $this->buildPartyExportData($partyId);
        if ($data === []) {
            return false;
        }
        $data['snapshot_kind'] = 'pre_archive';
        $data['party_id'] = $partyId;
        $dir = runtime_path() . 'archive';
        if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
            return false;
        }
        $path = $this->getPartyArchiveSnapshotPath($partyId);

        return file_put_contents(
                $path,
                json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
            ) !== false;
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

    /**
     * 获取派对的最优支付方案
     */
    public function getPartyBestPay(int $partyId): array
    {
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
        $unpaid = (new Item())->where('paid', 0)
            ->where('party_id', $partyId)
            ->field(['userid, amount, initiator'])
            ->select();
        $items = [];
        foreach ($unpaid as $item) {
            $items[] = [
                'userid' => $item->userid,
                'initiator' => $item->initiator,
                'amount' => $item->amount,
            ];
        }

        return $this->settlement()->compute(
            $this->settlement()->aggregateUnpaid($items),
            $users
        );
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

    /**
     * @return list<array<string, mixed>>
     */
    public function getPartyItemsForExport(int $partyId): array
    {
        return Db::table('item')
            ->join('user payer', 'item.userid = payer.id')
            ->join('user initiator', 'item.initiator = initiator.id')
            ->where('item.party_id', $partyId)
            ->field(
                'item.id, item.description, item.amount, item.userid, item.initiator, item.paid, item.party_id, item.created_at, payer.username as payer_name, initiator.username as initiator_name'
            )
            ->order('item.id', 'asc')
            ->select()
            ->toArray();
    }

    public function getPartyArchiveSnapshotPath(int $partyId): string
    {
        return runtime_path() . 'archive' . DIRECTORY_SEPARATOR . 'party_' . $partyId . '.json';
    }
}
