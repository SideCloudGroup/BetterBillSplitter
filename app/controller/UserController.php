<?php
declare (strict_types=1);

namespace app\controller;

use app\BaseController;
use app\model\Item;
use app\model\MFACredential;
use app\model\Party;
use app\service\MFA\FIDO;
use app\service\MFA\TOTP;
use app\service\MFA\WebAuthn;
use Exception;
use think\exception\ValidateException;
use think\facade\Cookie;
use think\facade\Db;
use think\facade\Session;
use think\Request;
use think\response\Json;
use think\response\Response;
use think\response\View;
use voku\helper\AntiXSS;

class UserController extends BaseController
{
    public function invoice(Request $request): View
    {
        $userId = Session::get('userid');

        // 获取用户加入的所有派对及其未支付款项
        $partiesWithItems = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->leftJoin('item', 'party.id = item.party_id')
            ->leftJoin('user payer', 'item.userid = payer.id')
            ->leftJoin('user initiator', 'item.initiator = initiator.id')
            ->where('party_member.user_id', $userId)
            ->where('item.paid', 0)
            ->where('item.userid', $userId) // 只显示当前用户需要支付的
            ->field('party.id as party_id, party.name as party_name, party.description as party_description, 
                    item.id as item_id, item.description as item_description, item.amount, 
                    initiator.username as initiator_name, item.created_at')
            ->order('party.id, item.created_at DESC')
            ->select();

        // 按派对分组
        $groupedItems = [];
        foreach ($partiesWithItems as $item) {
            $partyId = $item['party_id'];
            if (! isset($groupedItems[$partyId])) {
                $groupedItems[$partyId] = [
                    'party_name' => $item['party_name'],
                    'party_description' => $item['party_description'],
                    'items' => [],
                    'total_amount' => 0
                ];
            }
            $groupedItems[$partyId]['items'][] = [
                'description' => $item['item_description'],
                'amount' => $item['amount'],
                'username' => $item['initiator_name'],
                'created_at' => $item['created_at']
            ];
            $groupedItems[$partyId]['total_amount'] += $item['amount'];
        }

        return view('/user/dashboard/invoice', ['groupedItems' => $groupedItems]);
    }


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
            $userId = Session::get('userid');
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
                    if (! in_array((int) $user, $partyMemberIds)) {
                        return json(['ret' => 0, 'msg' => "用户ID {$user} 不属于该派对"]);
                    }
                }
            }
        }

        $baseCurrency = app()->currencyService->getDefaultCurrency();
        $exchangeRate = app()->currencyService->getExchangeRate();
        if ($request->param('unit') === $baseCurrency) {
            $amount = $request->param('amount');
        } else {
            $amount = $request->param('amount') / $exchangeRate[$request->param('unit')];
        }

        foreach ($users as $user) {
            app()->userService->addItem((int) $user, $request->param('description'), (float) $amount, session('userid'), (int) $partyId);
        }
        return json(['ret' => 1, 'msg' => '添加成功'])->header(['HX-Refresh' => "true"]);
    }

    public function addItem(Request $request): View
    {
        $userId = Session::get('userid');

        // 获取用户加入的所有Party
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('party.id, party.name, party.description')
            ->select();

        $currencies = $this->app->currencyService->getExchangeRate();

        return view('/user/item/add', [
            'parties' => $parties,
            'currencies' => $currencies
        ]);
    }

    /**
     * 首页 - 显示统计信息和概览
     */
    public function index(Request $request): View
    {
        $userId = Session::get('userid');
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
            'total_items_to_pay' => 0
        ];

        // 计算各项统计
        foreach ($parties as $party) {
            // 未支付金额（需要支付的）
            $unpaidAmount = Db::table('item')
                ->where('party_id', $party['id'])
                ->where('userid', $userId)
                ->where('paid', 0)
                ->sum('amount');
            $stats['total_unpaid_amount'] += $unpaidAmount ? : 0;

            // 应收金额（创建的收款）
            $receivableAmount = Db::table('item')
                ->where('party_id', $party['id'])
                ->where('initiator', $userId)
                ->where('paid', 0)
                ->sum('amount');
            $stats['total_receivable_amount'] += $receivableAmount ? : 0;

            // 创建的项目数量
            $itemsCreated = Db::table('item')
                ->where('party_id', $party['id'])
                ->where('initiator', $userId)
                ->count();
            $stats['total_items_created'] += $itemsCreated;

            // 需要支付的项目数量
            $itemsToPay = Db::table('item')
                ->where('party_id', $party['id'])
                ->where('userid', $userId)
                ->where('paid', 0)
                ->count();
            $stats['total_items_to_pay'] += $itemsToPay;
        }

        // 计算衍生统计数据
        $stats['total_amount'] = $stats['total_unpaid_amount'] + $stats['total_receivable_amount'];
        $stats['total_items'] = $stats['total_items_created'] + $stats['total_items_to_pay'];

        // 计算百分比
        if ($stats['total_amount'] > 0) {
            $stats['unpaid_percentage'] = round(($stats['total_unpaid_amount'] / $stats['total_amount']) * 100, 1);
            $stats['receivable_percentage'] = round(($stats['total_receivable_amount'] / $stats['total_amount']) * 100, 1);
        } else {
            $stats['unpaid_percentage'] = 0;
            $stats['receivable_percentage'] = 0;
        }

        // 获取最近的5个派对
        $recentParties = array_slice($parties, 0, 5);

        return view('/user/dashboard/index', [
            'user' => $user,
            'parties' => $parties,
            'stats' => $stats,
            'recentParties' => $recentParties
        ]);
    }

    public function payment(Request $request): View
    {
        $userId = Session::get('userid');

        // 获取用户加入的所有派对，并计算每个派对的待支付总金额
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('party.id, party.name, party.description')
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

            // 调试每个派对的查询
            trace("Party {$party['id']} ({$party['name']}): totalAmount = {$totalAmount}", 'debug');
        }

        return view('/user/payment/list', ['parties' => $parties]);
    }

    public function paymentByParty(Request $request, int $partyId): View
    {
        $userId = Session::get('userid');

        // 验证用户是否为该派对成员
        $isMember = Db::table('party_member')
            ->where('party_id', $partyId)
            ->where('user_id', $userId)
            ->count();
        if (! $isMember) {
            return view('/404');
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
        $totalAmount = 0;
        foreach ($items as $item) {
            $totalAmount += $item['amount'];
        }

        return view('/user/payment/by_party', [
            'party' => $party,
            'items' => $items,
            'totalAmount' => $totalAmount
        ]);
    }

    public function itemList(Request $request): View
    {
        $userId = Session::get('userid');

        // 获取用户加入的所有派对，并计算每个派对的未收款总金额
        $parties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->field('party.id, party.name, party.description')
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

            // 调试每个派对的查询
            trace("Party {$party['id']} ({$party['name']}): totalAmount = {$totalAmount}", 'debug');
        }

        return view('/user/item/list', ['parties' => $parties]);
    }

    public function itemListByParty(Request $request, int $partyId): View
    {
        $userId = Session::get('userid');

        // 验证用户是否为该派对成员
        $isMember = Db::table('party_member')
            ->where('party_id', $partyId)
            ->where('user_id', $userId)
            ->count();
        if (! $isMember) {
            return view('/404');
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
        $totalAmount = 0;
        $paidAmount = 0;
        $unpaidAmount = 0;

        foreach ($items as $item) {
            $totalAmount += $item['amount'];
            if ($item['paid']) {
                $paidAmount += $item['amount'];
            } else {
                $unpaidAmount += $item['amount'];
            }
        }

        return view('/user/item/by_party', [
            'party' => $party,
            'items' => $items,
            'totalAmount' => $totalAmount,
            'paidAmount' => $paidAmount,
            'unpaidAmount' => $unpaidAmount
        ]);
    }

    public function updateItemStatus(Request $request): Json
    {
        $item = (new Item())->where('id', $request->param('id'))->where('initiator', session('userid'))->findOrEmpty();
        if ($item->isEmpty()) {
            return json(['ret' => 0, 'msg' => '未找到指定项目'])->header(['HX-Refresh' => 'true']);
        }

        // 验证用户是否为该收款项所属派对的成员
        $userId = session('userid');
        $isMember = Db::table('party_member')
            ->where('party_id', $item->party_id)
            ->where('user_id', $userId)
            ->count();
        if (! $isMember) {
            return json(['ret' => 0, 'msg' => '您不是该派对的成员'])->header(['HX-Refresh' => 'true']);
        }

        $item->paid = $request->param('paid');
        $item->save();
        return json(['ret' => 1, 'msg' => '更新成功'])->header(['HX-Refresh' => 'true']);
    }

    public function currency(Request $request): View
    {
        $baseCurrency = app()->currencyService->getDefaultCurrency();
        $exchangeRate = app()->currencyService->getExchangeRate();
        foreach ($exchangeRate as $currency => $rate) {
            $exchangeRate[$currency] = round(1 / $rate, 3);
        }
        return view('/user/account/currency', ['baseCurrency' => $baseCurrency, 'currencies' => $exchangeRate]);
    }

    public function logout(Request $request): Json
    {
        Session::delete('userid');
        Session::delete('auth');
        Cookie::delete('user');
        return json(['ret' => 1, 'msg' => '登出成功'])->header(['HX-Redirect' => '/']);
    }

    public function profile(Request $request): View
    {
        $user = app()->userService->getUser();
        $webauthnDevices = (new MFACredential())->where('userid', $user->id)->where('type', 'passkey')->select();
        $totpDevices = (new MFACredential())->where('userid', $user->id)->where('type', 'totp')->select();
        $fidoDevices = (new MFACredential())->where('userid', $user->id)->where('type', 'fido')->select();
        return view('/user/account/profile', [
            'user' => $user,
            'webauthn_devices' => $webauthnDevices,
            'totp_devices' => $totpDevices,
            'fido_devices' => $fidoDevices,
        ]);
    }

    public function updateProfile(Request $request): Json
    {
        $user = app()->userService->getUser();

        // 验证用户只能更新自己的资料
        if ($user->id != session('userid')) {
            return json(['ret' => 0, 'msg' => '无权限更新其他用户资料'])->header(['HX-Refresh' => 'true']);
        }

        $user->username = $request->param('username');
        $user->save();
        return json(['ret' => 1, 'msg' => '更新成功'])->header(['HX-Refresh' => 'true']);
    }

    public function webauthnRequestRegister(Request $request): Json
    {
        $user = app()->userService->getUser();
        return json(json_decode(WebAuthn::registerRequest($user)));
    }

    public function webauthnRegisterHandler(Request $request): Json
    {
        $user = app()->userService->getUser();
        $antixss = new AntiXSS();
        return json(WebAuthn::registerHandle($user, $antixss->xss_clean($request->param())));
    }

    public function webauthnDelete(Request $request, string $id): Json
    {
        $user = app()->userService->getUser();
        $device = (new MFACredential())
            ->where('id', (int) $id)
            ->where('userid', $user->id)
            ->where('type', 'passkey')
            ->findOrEmpty();
        if ($device->isEmpty()) {
            return json(['ret' => 0, 'msg' => '设备不存在']);
        }
        $device->delete();
        return json(['ret' => 1, 'msg' => '删除成功'])->header(['HX-Refresh' => 'true']);
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

        return json(TOTP::totpRegisterHandle(app()->userService->getUser(), $code));
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
        return json(['ret' => 1, 'msg' => '删除成功'])->header(['HX-Refresh' => 'true']);
    }

    public function fidoRegisterRequest(Request $request): Json
    {
        $user = app()->userService->getUser();
        return json(json_decode(FIDO::fidoRegisterRequest($user)));
    }

    public function fidoRegisterHandle(Request $request): Json
    {
        $user = app()->userService->getUser();
        $antixss = new AntiXSS();
        return json(FIDO::fidoRegisterHandle($user, $antixss->xss_clean($request->param())));
    }

    public function fidoDelete(Request $request, string $id): Json
    {
        $user = app()->userService->getUser();
        $device = (new MFACredential())
            ->where('id', (int) $id)
            ->where('userid', $user->id)
            ->where('type', 'fido')
            ->findOrEmpty();
        if ($device->isEmpty()) {
            return json(['ret' => 0, 'msg' => '设备不存在']);
        }
        $device->delete();
        return json(['ret' => 1, 'msg' => '删除成功'])->header(['HX-Refresh' => 'true']);
    }

    /**
     * 显示派对最优支付页面
     */
    public function partyBestPay(Request $request, int $partyId): View
    {
        $userId = Session::get('userid');

        // 检查用户是否为派对成员
        $isMember = Db::table('party_member')
                ->where('party_id', $partyId)
                ->where('user_id', $userId)
                ->count() > 0;

        if (! $isMember) {
            return view('/404');
        }

        // 获取派对信息
        $party = Party::find($partyId);
        if (! $party) {
            return view('/404');
        }

        // 检查是否为派对所有者
        $isOwner = $party->owner_id === $userId;

        // 获取最优支付方案
        $bestPay = $this->app->userService->getPartyBestPay($partyId);
        $userStat = $this->app->userService->getPartyUserStat($partyId);

        return view('/user/party/bestpay', [
            'party' => $party,
            'bestPayAll' => $bestPay[1],
            'bestPayFinal' => $bestPay[0],
            'userStat' => $userStat,
            'isOwner' => $isOwner
        ]);
    }

    /**
     * 下载派对最优支付方案
     */
    public function downloadPartyBestPay(Request $request, int $partyId): \think\Response
    {
        $userId = Session::get('userid');
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
        // 获取最优支付方案
        $bestPay = $this->app->userService->getPartyBestPay($partyId);
        $userStat = $this->app->userService->getPartyUserStat($partyId);
        $data = [
            'party_name' => $party->name,
            'party_description' => $party->description,
            'bestPayFinal' => $bestPay[0],
            'userStat' => $userStat,
            'export_time' => date('Y-m-d H:i:s')
        ];
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $filename = 'party_bestpay_' . $party->name . '_' . date('Ymd_His') . '.json';
        $tempPath = runtime_path() . 'temp/' . uniqid('party_bestpay_', true) . '.json';
        file_put_contents($tempPath, $json);
        return download($tempPath, $filename, false, 60);
    }

    /**
     * 清空派对待支付记录（仅派对所有者）
     */
    public function clearPartyBestPay(Request $request, int $partyId): Json
    {
        $userId = Session::get('userid');

        // 检查用户是否为派对所有者
        $party = Party::find($partyId);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        if ($party->owner_id !== $userId) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以清空记录']);
        }

        try {
            // 将派对内所有未支付项目标记为已支付
            Db::table('item')
                ->where('party_id', $partyId)
                ->where('paid', false)
                ->update(['paid' => true]);

            return json(['ret' => 1, 'msg' => '派对待支付记录已清空'])
                ->header(['HX-Refresh' => 'true']);

        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '清空失败：' . $e->getMessage()]);
        }
    }
}
