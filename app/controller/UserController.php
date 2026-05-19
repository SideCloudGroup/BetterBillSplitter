<?php

declare (strict_types=1);

namespace app\controller;

use app\BaseController;
use app\model\Currency;
use app\model\Item;
use app\model\MFACredential;
use app\model\Party;
use app\service\MFA\FIDO;
use app\service\MFA\TOTP;
use app\service\MFA\WebAuthn;
use Exception;
use think\exception\ValidateException;
use think\facade\Db;
use think\Request;
use think\Response;
use think\response\Json;
use voku\helper\AntiXSS;

class UserController extends BaseController
{
    public function processAddItem(Request $request): Json
    {
        $users = json_decode($request->param('users'));
        $partyId = $request->param('party_id');
        try {
            validate(\app\validate\Item::class)->check([
                'description' => $request->param('description'),
                'amount' => $request->param('amount'),
                'users' => $users,
                'unit' => $request->param('unit'),
                'party_id' => $partyId,
            ]);
        } catch (ValidateException $e) {
            return json(['ret' => 0, 'msg' => $e->getError()]);
        }

        // 验证派对权限
        if ($partyId) {
            $userId = $this->currentUserId();
            $isMember = Db::table('party_member')
                ->where('party_id', $partyId)
                ->where('user_id', $userId)
                ->count();
            if (! $isMember) {
                return json(['ret' => 0, 'msg' => '您不是该派对的成员']);
            }

            // 验证提交的用户ID是否都属于该派对
            if (! empty($users)) {
                $partyMemberIds = Db::table('party_member')
                    ->where('party_id', $partyId)
                    ->column('user_id');

                foreach ($users as $user) {
                    if (! in_array((int)$user, $partyMemberIds)) {
                        return json(['ret' => 0, 'msg' => "用户ID {$user} 不属于该派对"]);
                    }
                }
            }
        }

        // 获取派对货币信息
        $party = null;
        if ($partyId) {
            $party = Db::table('party')->where('id', $partyId)->find();
        }

        if ($party) {
            if (! empty($party['archived_at'])) {
                return json(['ret' => 0, 'msg' => '该派对已归档，无法添加收款项']);
            }
            // 使用派对特定的货币
            $baseCurrency = $party['base_currency'];
            $supportedCurrencies = json_decode($party['supported_currencies'], true) ? : [$baseCurrency];

            // 验证货币是否被派对支持
            if (! in_array($request->param('unit'), $supportedCurrencies)) {
                return json(['ret' => 0, 'msg' => '该派对不支持此货币']);
            }

            $exchangeRate = app()->currencyService->getPartyExchangeRate($baseCurrency, $supportedCurrencies);
        } else {
            // 如果没有派对，使用默认货币（CNY）
            $baseCurrency = 'cny';
            $exchangeRate = ['cny' => 1];
        }

        if ($request->param('unit') === $baseCurrency) {
            $amount = $request->param('amount');
        } else {
            if (! isset($exchangeRate[$request->param('unit')])) {
                return json(['ret' => 0, 'msg' => '无法获取该货币的汇率信息']);
            }
            $amount = bcdiv((string)$request->param('amount'), (string)$exchangeRate[$request->param('unit')], 2);
        }

        foreach ($users as $user) {
            app()->userService->addItem(
                (int)$user,
                $request->param('description'),
                (float)$amount,
                $this->currentUserId(),
                (int)$partyId
            );
        }

        return json(['ret' => 1, 'msg' => '添加成功']);
    }

    public function addItem(Request $request): Json
    {
        $userId = $this->currentUserId();

        // 获取用户加入的所有Party（只返回基本信息）
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->whereNull('party.archived_at')
            ->field('party.id, party.name, party.description')
            ->select();

        return json(['ret' => 1, 'data' => ['parties' => $parties]]);
    }

    /**
     * 首页 - 显示统计信息和概览
     */
    public function index(Request $request): Json
    {
        $userId = $this->currentUserId();
        $user = app()->userService->getUser();

        // 获取用户加入的所有派对
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('party.id, party.name, party.description')
            ->select()
            ->toArray();

        // 统计信息
        $stats = [
            'total_parties' => count($parties),
            'total_unpaid_amount' => 0,
            'total_receivable_amount' => 0,
            'total_items_created' => 0,
            'total_items_to_pay' => 0,
            'total_unpaid_items' => 0,
            'total_receivable_items' => 0
        ];

        // 计算各项统计
        // 优化：一次性查询所有相关数据，然后在PHP中计算
        $allItems = Db::table('item')
            ->join('party_member', 'item.party_id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('item.userid, item.initiator, item.amount, item.paid')
            ->select()
            ->toArray();

        // 在PHP中计算统计数据
        // 使用数组分组方式，减少循环中的条件判断
        $userItems = [];
        $initiatorItems = [];

        foreach ($allItems as $item) {
            // 按用户ID分组（需要支付的项目）
            if ($item['userid'] == $userId) {
                $userItems[] = $item;
            }

            // 按发起人ID分组（创建的收款项目）
            if ($item['initiator'] == $userId) {
                $initiatorItems[] = $item;
            }
        }

        // 计算统计数据
        foreach ($userItems as $item) {
            $stats['total_items_to_pay']++;
            if ($item['paid'] == 0) {
                $stats['total_unpaid_amount'] = bcadd(
                    (string)$stats['total_unpaid_amount'],
                    (string)$item['amount'],
                    2
                );
                $stats['total_unpaid_items']++;
            }
        }

        foreach ($initiatorItems as $item) {
            $stats['total_items_created']++;
            if ($item['paid'] == 0) {
                $stats['total_receivable_amount'] = bcadd(
                    (string)$stats['total_receivable_amount'],
                    (string)$item['amount'],
                    2
                );
                $stats['total_receivable_items']++;
            }
        }

        // 获取默认货币信息（用于显示）
        $defaultCurrency = Currency::getDefaultCurrency();
        $currencySymbol = $defaultCurrency ? $defaultCurrency->symbol : '¥';
        $currencyCode = $defaultCurrency ? strtoupper($defaultCurrency->code) : 'CNY';

        // 计算衍生统计数据
        $stats['total_amount'] = bcadd(
            (string)$stats['total_unpaid_amount'],
            (string)$stats['total_receivable_amount'],
            2
        );
        $stats['total_items'] = $stats['total_items_created'] + $stats['total_items_to_pay'];

        // 计算实际的项目总数（所有相关项目）
        $stats['total_all_items'] = $stats['total_unpaid_items'] + $stats['total_receivable_items'];

        // 计算百分比（基于实际项目数量）
        if ($stats['total_all_items'] > 0) {
            $stats['unpaid_percentage'] = bcmul(
                bcdiv((string)$stats['total_unpaid_items'], (string)$stats['total_all_items'], 3),
                '100',
                1
            );
            $stats['receivable_percentage'] = bcmul(
                bcdiv((string)$stats['total_receivable_items'], (string)$stats['total_all_items'], 3),
                '100',
                1
            );
        } else {
            $stats['unpaid_percentage'] = '0.0';
            $stats['receivable_percentage'] = '0.0';
        }

        // 获取最近的5个派对
        $recentParties = array_slice($parties, 0, 5);

        return json([
            'ret' => 1,
            'data' => [
                'user' => $user,
                'parties' => $parties,
                'stats' => $stats,
                'recentParties' => $recentParties,
                'currencySymbol' => $currencySymbol,
                'currencyCode' => $currencyCode,
            ],
        ]);
    }

    public function payment(Request $request): Json
    {
        $userId = $this->currentUserId();

        // 获取用户加入的所有派对，并计算每个派对的待支付总金额
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('party.id, party.name, party.description, party.base_currency')
            ->select()
            ->toArray();

        // 为每个派对计算待支付总金额
        foreach ($parties as $key => $party) {
            $totalAmount = Db::table('item')
                ->where('party_id', $party['id'])
                ->where('userid', $userId)
                ->where('paid', 0)
                ->sum('amount');
            $parties[$key]['total_amount'] = $totalAmount ? : 0;

            // 获取派对货币信息
            $currency = Currency::getByCode($party['base_currency']);
            $parties[$key]['currency_symbol'] = $currency ? $currency->symbol : '¥';
        }

        return json(['ret' => 1, 'data' => ['parties' => $parties]]);
    }

    public function paymentByParty(Request $request, int $partyId): Json
    {
        $userId = $this->currentUserId();

        // 验证用户是否为该派对成员
        $isMember = Db::table('party_member')
            ->where('party_id', $partyId)
            ->where('user_id', $userId)
            ->count();
        if (! $isMember) {
            return json(['ret' => 0, 'msg' => '未找到派对或无权访问'], 404);
        }

        // 获取派对信息
        $party = Db::table('party')->where('id', $partyId)->find();

        // 获取当前用户在该派对中需要支付的款项
        $items = Db::table('item')
            ->join('user', 'item.initiator = user.id')
            ->where('item.party_id', $partyId)
            ->where('item.userid', $userId)
            ->where('item.paid', 0)
            ->field('item.id, user.username, item.description, item.amount, item.paid, item.created_at')
            ->order('item.created_at DESC')
            ->select();

        // 计算总金额
        $totalAmount = '0';
        foreach ($items as $item) {
            $totalAmount = bcadd($totalAmount, (string)$item['amount'], 2);
        }

        // 获取派对货币信息
        $partyCurrency = Party::find($partyId);
        $currencySymbol = '¥';
        if ($partyCurrency && $partyCurrency->base_currency) {
            $currency = Currency::getByCode($partyCurrency->base_currency);
            $currencySymbol = $currency ? $currency->symbol : '¥';
        }

        // 将货币符号添加到party对象中
        $party['currency_symbol'] = $currencySymbol;

        return json([
            'ret' => 1,
            'data' => [
                'party' => $party,
                'items' => $items,
                'totalAmount' => $totalAmount,
            ],
        ]);
    }

    public function itemList(Request $request): Json
    {
        $userId = $this->currentUserId();

        // 获取用户加入的所有派对，并计算每个派对的未收款总金额
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('party.id, party.name, party.description, party.base_currency')
            ->select()
            ->toArray();

        // 为每个派对计算未收款总金额
        foreach ($parties as $key => $party) {
            $totalAmount = Db::table('item')
                ->where('party_id', $party['id'])
                ->where('initiator', $userId)
                ->where('paid', 0)
                ->sum('amount');
            $parties[$key]['total_amount'] = $totalAmount ? : 0;

            // 获取派对货币信息
            $currency = Currency::getByCode($party['base_currency']);
            $parties[$key]['currency_symbol'] = $currency ? $currency->symbol : '¥';
        }

        return json(['ret' => 1, 'data' => ['parties' => $parties]]);
    }

    public function itemListByParty(Request $request, int $partyId): Json
    {
        $userId = $this->currentUserId();

        // 验证用户是否为该派对成员
        $isMember = Db::table('party_member')
            ->where('party_id', $partyId)
            ->where('user_id', $userId)
            ->count();
        if (! $isMember) {
            return json(['ret' => 0, 'msg' => '未找到派对或无权访问'], 404);
        }

        // 获取派对信息
        $party = Db::table('party')->where('id', $partyId)->find();

        // 获取当前用户在该派对中发起的款项
        $items = Db::table('item')
            ->join('user', 'item.userid = user.id')
            ->where('item.party_id', $partyId)
            ->where('item.initiator', $userId)
            ->field('item.id, user.username, item.description, item.amount, item.paid, item.created_at')
            ->order('item.paid, item.created_at DESC')
            ->select();

        // 计算金额统计
        $totalAmount = '0';
        $paidAmount = '0';
        $unpaidAmount = '0';

        foreach ($items as $item) {
            $totalAmount = bcadd($totalAmount, (string)$item['amount'], 2);
            if ($item['paid'] == 1) {
                $paidAmount = bcadd($paidAmount, (string)$item['amount'], 2);
            } else {
                $unpaidAmount = bcadd($unpaidAmount, (string)$item['amount'], 2);
            }
        }

        // 获取派对货币信息
        $partyCurrency = Party::find($partyId);
        $currencySymbol = '¥';
        if ($partyCurrency && $partyCurrency->base_currency) {
            $currency = Currency::getByCode($partyCurrency->base_currency);
            $currencySymbol = $currency ? $currency->symbol : '¥';
        }

        // 将货币符号添加到party对象中
        $party['currency_symbol'] = $currencySymbol;
        $partyModel = Party::find($partyId);
        $party['is_archived'] = $partyModel ? $partyModel->isArchived() : false;

        return json([
            'ret' => 1,
            'data' => [
                'party' => $party,
                'items' => $items,
                'totalAmount' => $totalAmount,
                'paidAmount' => $paidAmount,
                'unpaidAmount' => $unpaidAmount,
            ],
        ]);
    }

    public function updateItemStatus(Request $request): Json
    {
        $item = (new Item())->where('id', $request->param('id'))->where(
            'initiator',
            $this->currentUserId()
        )->findOrEmpty();
        if ($item->isEmpty()) {
            return json(['ret' => 0, 'msg' => '未找到指定项目']);
        }

        // 验证用户是否为该收款项所属派对的成员
        $userId = $this->currentUserId();
        $isMember = Db::table('party_member')
            ->where('party_id', $item->party_id)
            ->where('user_id', $userId)
            ->count();
        if (! $isMember) {
            return json(['ret' => 0, 'msg' => '您不是该派对的成员']);
        }

        $partyRow = Party::find($item->party_id);
        if ($partyRow && $partyRow->isArchived()) {
            return json(['ret' => 0, 'msg' => '该派对已归档，无法修改支付状态']);
        }

        $item->paid = $request->param('paid');
        $item->save();
        return json(['ret' => 1, 'msg' => '更新成功']);
    }

    public function logout(Request $request): Json
    {
        app()->userService->logout();
        return json(['ret' => 1, 'msg' => '登出成功']);
    }

    public function profile(Request $request): Json
    {
        $user = app()->userService->getUser();
        $webauthnDevices = (new MFACredential())->where('userid', $user->id)->where('type', 'passkey')->select();
        $totpDevices = (new MFACredential())->where('userid', $user->id)->where('type', 'totp')->select();
        $fidoDevices = (new MFACredential())->where('userid', $user->id)->where('type', 'fido')->select();

        return json([
            'ret' => 1,
            'data' => [
                'user' => $user,
                'webauthn_devices' => $webauthnDevices,
                'totp_devices' => $totpDevices,
                'fido_devices' => $fidoDevices,
            ],
        ]);
    }

    public function updateProfile(Request $request): Json
    {
        $user = app()->userService->getUser();

        $user->username = $request->param('username');
        $user->save();

        return json(['ret' => 1, 'msg' => '更新成功']);
    }

    public function webauthnRequestRegister(Request $request): Json
    {
        $user = app()->userService->getUser();
        return json(WebAuthn::registerRequest($user));
    }

    public function webauthnRegisterHandler(Request $request): Json
    {
        $user = app()->userService->getUser();
        $antixss = new AntiXSS();
        $params = $antixss->xss_clean($request->param());
        $challengeId = (string)($params['challenge_id'] ?? '');
        if ($challengeId === '') {
            return json(['ret' => 0, 'msg' => '缺少 challenge_id']);
        }

        return json(WebAuthn::registerHandle($user, $params, $challengeId));
    }

    public function webauthnDelete(Request $request, string $id): Json
    {
        $user = app()->userService->getUser();
        $device = (new MFACredential())
            ->where('id', (int)$id)
            ->where('userid', $user->id)
            ->where('type', 'passkey')
            ->findOrEmpty();
        if ($device->isEmpty()) {
            return json(['ret' => 0, 'msg' => '设备不存在']);
        }
        $device->delete();
        return json(['ret' => 1, 'msg' => '删除成功']);
    }

    public function totpRegisterRequest(Request $request): Json
    {
        return json(TOTP::totpRegisterRequest(app()->userService->getUser()));
    }

    public function totpRegisterHandle(Request $request): Json
    {
        $antixss = new AntiXSS();
        $code = $antixss->xss_clean($request->param('code'));
        if ($code === '' || $code === null) {
            return json([
                'ret' => 0,
                'msg' => '验证码不能为空',
            ]);
        }

        $challengeId = (string)$request->param('challenge_id', '');
        if ($challengeId === '') {
            return json(['ret' => 0, 'msg' => '缺少 challenge_id']);
        }

        return json(TOTP::totpRegisterHandle(app()->userService->getUser(), $code, $challengeId));
    }

    public function totpDelete(Request $request): Json
    {
        $user = app()->userService->getUser();
        $device = (new MFACredential())
            ->where('userid', $user->id)
            ->where('type', 'totp')
            ->findOrEmpty();
        if ($device->isEmpty()) {
            return json(['ret' => 0, 'msg' => '设备不存在']);
        }
        $device->delete();
        return json(['ret' => 1, 'msg' => '删除成功']);
    }

    public function fidoRegisterRequest(Request $request): Json
    {
        $user = app()->userService->getUser();
        return json(FIDO::fidoRegisterRequest($user));
    }

    public function fidoRegisterHandle(Request $request): Json
    {
        $user = app()->userService->getUser();
        $antixss = new AntiXSS();
        $params = $antixss->xss_clean($request->param());
        $challengeId = (string)($params['challenge_id'] ?? '');
        if ($challengeId === '') {
            return json(['ret' => 0, 'msg' => '缺少 challenge_id']);
        }

        return json(FIDO::fidoRegisterHandle($user, $params, $challengeId));
    }

    public function fidoDelete(Request $request, string $id): Json
    {
        $user = app()->userService->getUser();
        $device = (new MFACredential())
            ->where('id', (int)$id)
            ->where('userid', $user->id)
            ->where('type', 'fido')
            ->findOrEmpty();
        if ($device->isEmpty()) {
            return json(['ret' => 0, 'msg' => '设备不存在']);
        }
        $device->delete();
        return json(['ret' => 1, 'msg' => '删除成功']);
    }

    /**
     * 显示派对最优支付页面
     */
    public function partyBestPay(Request $request, int $partyId): Json
    {
        $userId = $this->currentUserId();

        // 检查用户是否为派对成员
        $isMember = Db::table('party_member')
                ->where('party_id', $partyId)
                ->where('user_id', $userId)
                ->count() > 0;

        if (! $isMember) {
            return json(['ret' => 0, 'msg' => '未找到派对或无权访问'], 404);
        }

        // 获取派对信息
        $party = Party::find($partyId);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在'], 404);
        }

        // 检查是否为派对所有者
        $isOwner = $party->owner_id === $userId;

        // 获取最优支付方案
        $bestPay = $this->app->userService->getPartyBestPay($partyId);
        $userStat = $this->app->userService->getPartyUserStat($partyId);

        // 获取派对货币信息
        $partyCurrency = Party::find($partyId);
        $currencySymbol = '¥';
        if ($partyCurrency && $partyCurrency->base_currency) {
            $currency = Currency::getByCode($partyCurrency->base_currency);
            $currencySymbol = $currency ? $currency->symbol : '¥';
        }

        return json([
            'ret' => 1,
            'data' => [
                'party' => $party,
                'bestPayAll' => $bestPay[1],
                'bestPayFinal' => $bestPay[0],
                'userStat' => $userStat,
                'isOwner' => $isOwner,
                'currencySymbol' => $currencySymbol,
            ],
        ]);
    }

    /**
     * 下载派对最优支付方案
     */
    public function downloadPartyBestPay(Request $request, int $partyId): Response
    {
        $userId = $this->currentUserId();
        // 检查用户是否为派对成员
        $isMember = Db::table('party_member')
                ->where('party_id', $partyId)
                ->where('user_id', $userId)
                ->count() > 0;
        if (! $isMember) {
            return response('无权限访问', 403);
        }
        // 获取派对信息
        $party = Party::find($partyId);
        if (! $party) {
            return response('派对不存在', 404);
        }
        $data = $this->app->userService->buildPartyExportData($partyId);
        if ($data === []) {
            return response('派对不存在', 404);
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $filename = 'party_bestpay_' . $party->id . '_' . date('Ymd_His') . '.json';
        $tempPath = runtime_path() . 'temp/' . uniqid('party_bestpay_', true) . '.json';
        file_put_contents($tempPath, $json);
        return download($tempPath, $filename, false, 60);
    }

    /**
     * 清空派对待支付记录（仅派对所有者）
     */
    public function clearPartyBestPay(Request $request, int $partyId): Json
    {
        $userId = $this->currentUserId();

        // 检查用户是否为派对所有者
        $party = Party::find($partyId);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        if ($party->owner_id !== $userId) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以清空记录']);
        }

        if ($party->isArchived()) {
            return json(['ret' => 0, 'msg' => '已归档的派对无法清空记录']);
        }

        try {
            // 将派对内所有未支付项目标记为已支付
            Db::table('item')
                ->where('party_id', $partyId)
                ->where('paid', false)
                ->update(['paid' => true]);

            return json(['ret' => 1, 'msg' => '派对待支付记录已清空']);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '清空失败：' . $e->getMessage()]);
        }
    }
}
