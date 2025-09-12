<?php
declare (strict_types=1);

namespace app\controller;

use app\BaseController;
use app\model\Currency;
use app\model\User;
use Exception;
use think\facade\Db;
use think\Request;
use think\response\Json;
use think\response\View;

class AdminController extends BaseController
{
    public function index(Request $request): View
    {
        // 用户统计
        $totalUsers = (new User())->count();
        $adminUsers = (new User())->where('is_admin', 1)->count();
        $regularUsers = $totalUsers - $adminUsers;

        // 项目统计
        $totalItems = Db::table('item')->count();
        $paidItems = Db::table('item')->where('paid', 1)->count();
        $unpaidItems = Db::table('item')->where('paid', 0)->count();

        // 计算项目未支付比例
        $unpaidItemsPercentage = $totalItems > 0 ? bcmul(bcdiv((string) $unpaidItems, (string) $totalItems, 3), '100', 1) : '0.0';

        // 派对统计
        $totalParties = Db::table('party')->count();
        $activeParties = Db::table('party')
            ->join('party_member', 'party.id = party_member.party_id')
            ->group('party.id')
            ->having('COUNT(party_member.user_id) > 1')
            ->count();

        // 用户活跃度统计（最近30天有活动的用户）
        $thirtyDaysAgo = date('Y-m-d H:i:s', strtotime('-30 days'));
        $activeUsers = Db::table('item')
            ->where('created_at', '>=', $thirtyDaysAgo)
            ->group('userid')
            ->count();

        // 支付完成率
        $paymentCompletionRate = $totalItems > 0 ? round(($paidItems / $totalItems) * 100, 1) : 0;

        // 用户活跃度百分比
        $userActivityRate = $totalUsers > 0 ? round(($activeUsers / $totalUsers) * 100, 1) : 0;

        // 派对活跃度百分比
        $partyActivityRate = $totalParties > 0 ? round(($activeParties / $totalParties) * 100, 1) : 0;

        return view('/admin/index', [
            'totalUsers' => $totalUsers,
            'adminUsers' => $adminUsers,
            'regularUsers' => $regularUsers,
            'totalItems' => $totalItems,
            'paidItems' => $paidItems,
            'unpaidItems' => $unpaidItems,
            'unpaidItemsPercentage' => $unpaidItemsPercentage,
            'totalParties' => $totalParties,
            'activeParties' => $activeParties,
            'activeUsers' => $activeUsers,
            'paymentCompletionRate' => $paymentCompletionRate,
            'userActivityRate' => $userActivityRate,
            'partyActivityRate' => $partyActivityRate
        ]);
    }


    public function user(Request $request): View
    {
        $users = (new User())->field('id,username,is_admin')->select();
        return view('/admin/user', ['users' => $users]);
    }

    /**
     * 修改用户密码
     */
    public function changePassword(Request $request): Json
    {
        $data = $request->param();
        $userId = $data['user_id'] ?? null;
        $newPassword = $data['new_password'] ?? null;

        if (! $userId || ! $newPassword) {
            return json(['ret' => 0, 'msg' => '参数不完整']);
        }

        // 验证密码长度
        if (strlen($newPassword) < 6) {
            return json(['ret' => 0, 'msg' => '密码长度至少6位']);
        }

        try {
            $user = User::find($userId);
            if (! $user) {
                return json(['ret' => 0, 'msg' => '用户不存在']);
            }

            // 更新密码
            $user->password = password_hash($newPassword, PASSWORD_ARGON2ID);
            $user->save();

            return json(['ret' => 1, 'msg' => '密码修改成功']);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '密码修改失败：' . $e->getMessage()]);
        }
    }

    /**
     * 切换用户管理员权限
     */
    public function toggleAdmin(Request $request): Json
    {
        $data = $request->param();
        $userId = $data['user_id'] ?? null;
        $setAsAdmin = $data['set_as_admin'] ?? null;

        if ($userId === null || $setAsAdmin === null) {
            return json(['ret' => 0, 'msg' => '参数不完整']);
        }

        try {
            $user = User::find($userId);
            if (! $user) {
                return json(['ret' => 0, 'msg' => '用户不存在']);
            }

            // 检查是否为当前登录的管理员
            $currentUser = User::find(session('userid'));
            if ($currentUser && $currentUser->id == $userId) {
                return json(['ret' => 0, 'msg' => '不能修改自己的管理员权限']);
            }

            // 更新管理员权限
            $user->is_admin = (bool) $setAsAdmin;
            $user->save();

            $action = $setAsAdmin ? '设为管理员' : '取消管理员权限';
            return json(['ret' => 1, 'msg' => "用户权限已更新：{$action}"]);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '权限更新失败：' . $e->getMessage()]);
        }
    }

    /**
     * 派对管理页面
     */
    public function party(Request $request): View
    {
        // 获取所有派对及其成员统计
        $parties = Db::table('party')
            ->field('party.*, COUNT(DISTINCT party_member.user_id) as member_count')
            ->leftJoin('party_member', 'party.id = party_member.party_id')
            ->group('party.id')
            ->order('party.id', 'desc')
            ->select()
            ->toArray();

        // 一次性获取所有派对的统计数据
        $partyIds = array_column($parties, 'id');
        $allPartyStats = [];

        if (! empty($partyIds)) {
            $partyStats = Db::table('item')
                ->whereIn('party_id', $partyIds)
                ->field('party_id, COUNT(*) as total_items, SUM(amount) as total_amount, COUNT(CASE WHEN paid = 1 THEN 1 END) as paid_items, SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END) as paid_amount')
                ->group('party_id')
                ->select()
                ->toArray();

            // 转换为以party_id为键的数组
            foreach ($partyStats as $stat) {
                $allPartyStats[$stat['party_id']] = $stat;
            }
        }

        // 一次性获取所有货币信息
        $allCurrencies = [];
        $currencyCodes = array_unique(array_filter(array_column($parties, 'base_currency')));
        if (! empty($currencyCodes)) {
            $currencies = Db::table('currencies')
                ->whereIn('code', $currencyCodes)
                ->field('code, symbol')
                ->select()
                ->toArray();

            foreach ($currencies as $currency) {
                $allCurrencies[$currency['code']] = $currency['symbol'];
            }
        }

        // 为每个派对添加统计信息
        foreach ($parties as $key => $party) {
            $partyId = $party['id'];
            $partyStat = $allPartyStats[$partyId] ?? null;

            if ($partyStat) {
                $parties[$key]['total_items'] = $partyStat['total_items'] ? : 0;
                $parties[$key]['total_amount'] = $partyStat['total_amount'] ? : 0;
                $parties[$key]['paid_items'] = $partyStat['paid_items'] ? : 0;
                $parties[$key]['paid_amount'] = $partyStat['paid_amount'] ? : 0;
                $parties[$key]['unpaid_items'] = $partyStat['total_items'] - $partyStat['paid_items'];
                $parties[$key]['unpaid_amount'] = bcsub((string) $partyStat['total_amount'], (string) $partyStat['paid_amount'], 2);

                // 计算支付完成率
                $parties[$key]['payment_completion_rate'] = $partyStat['total_items'] > 0 ?
                    bcmul(bcdiv((string) $partyStat['paid_items'], (string) $partyStat['total_items'], 3), '100', 1) : '0.0';
            } else {
                $parties[$key]['total_items'] = 0;
                $parties[$key]['total_amount'] = 0;
                $parties[$key]['paid_items'] = 0;
                $parties[$key]['paid_amount'] = 0;
                $parties[$key]['unpaid_items'] = 0;
                $parties[$key]['unpaid_amount'] = 0;
                $parties[$key]['payment_completion_rate'] = 0;
            }

            // 获取派对货币符号
            $baseCurrency = $party['base_currency'] ?? '';
            $parties[$key]['currency_symbol'] = $allCurrencies[$baseCurrency] ?? '¥';
        }

        return view('/admin/party/list', [
            'parties' => $parties
        ]);
    }

    /**
     * 获取派对成员列表页面
     */
    public function partyMembers(Request $request): View
    {
        $partyId = $request->param('id');
        if (! $partyId) {
            return view('/error', ['msg' => '参数错误']);
        }

        // 获取派对信息
        $party = Db::table('party')->where('id', $partyId)->find();
        if (! $party) {
            return view('/error', ['msg' => '派对不存在']);
        }

        // 获取成员列表
        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->join('party', 'party_member.party_id = party.id')
            ->where('party_member.party_id', $partyId)
            ->field('user.id, user.username, CASE WHEN party.owner_id = party_member.user_id THEN 1 ELSE 0 END as is_owner, party_member.joined_at')
            ->order('party_member.joined_at', 'asc')
            ->select();

        // 获取派对统计信息 - 使用一次查询获取所有统计
        $partyStats = Db::table('item')
            ->where('party_id', $partyId)
            ->field('COUNT(*) as total_items, SUM(amount) as total_amount, COUNT(CASE WHEN paid = 1 THEN 1 END) as paid_items, SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END) as paid_amount')
            ->find();

        $totalItems = $partyStats['total_items'] ?? 0;
        $totalAmount = $partyStats['total_amount'] ?? 0;
        $paidItems = $partyStats['paid_items'] ?? 0;
        $paidAmount = $partyStats['paid_amount'] ?? 0;

        $stats = [
            'total_items' => $totalItems,
            'total_amount' => $totalAmount,
            'paid_items' => $paidItems,
            'paid_amount' => $paidAmount,
            'unpaid_items' => $totalItems - $paidItems,
            'unpaid_amount' => bcsub((string) $totalAmount, (string) $paidAmount, 2),
            'payment_completion_rate' => $totalItems > 0 ? bcmul(bcdiv((string) $paidItems, (string) $totalItems, 3), '100', 1) : '0.0'
        ];

        // 获取派对货币信息
        $currencySymbol = '¥';
        if ($party['base_currency']) {
            $currency = Db::table('currencies')->where('code', $party['base_currency'])->field('symbol')->find();
            $currencySymbol = $currency ? $currency['symbol'] : '¥';
        }

        return view('/admin/party/members', [
            'party' => $party,
            'members' => $members,
            'stats' => $stats,
            'currencySymbol' => $currencySymbol
        ]);
    }

    /**
     * 获取派对成员列表（API）
     */
    public function getPartyMembers(Request $request): Json
    {
        $partyId = $request->param('party_id');
        if (! $partyId) {
            return json(['ret' => 0, 'msg' => '参数错误']);
        }

        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->join('party', 'party_member.party_id = party.id')
            ->where('party_member.party_id', $partyId)
            ->field('user.id, user.username, CASE WHEN party.owner_id = party_member.user_id THEN 1 ELSE 0 END as is_owner')
            ->select();

        return json(['ret' => 1, 'data' => $members]);
    }

    public function settings(): View
    {
        $settings = app()->settingService->getAllSettings();
        $settingData = [];
        $categories = [];

        foreach ($settings as $category => $items) {
            $categories[] = $category;
            foreach ($items as $item) {
                $key = $item['key'];
                $settingData[$key] = app()->settingService->getSetting($key);
            }
        }
        return view('/admin/setting/index', [
            'settings' => $settings,
            'settingData' => $settingData,
            'categories' => $categories,
        ]);
    }

    public function updateSetting(Request $request): Json
    {
        $data = $request->param();
        foreach ($data as $key => $value) {
            app()->settingService->updateSetting($key, $value);
        }
        return json(['ret' => 1, 'msg' => "设置已更新"]);
    }

    /**
     * 货币管理页面
     */
    public function currencies(Request $request): View
    {
        $currencyService = app()->currencyService;
        $currencies = $currencyService->getAllAvailableCurrencies();

        return view('/admin/currencies', [
            'currencies' => $currencies
        ]);
    }

    /**
     * 添加货币
     */
    public function addCurrency(Request $request): Json
    {
        $code = strtolower($request->param('code', ''));
        $name = $request->param('name', '');
        $nameEn = $request->param('name_en', '');
        $symbol = $request->param('symbol', '');
        $decimalPlaces = (int) $request->param('decimal_places', 2);

        if (empty($code) || empty($name) || empty($symbol)) {
            return json(['ret' => 0, 'msg' => '货币代码、名称和符号不能为空']);
        }

        // 验证货币代码格式
        if (! preg_match('/^[a-z]{3}$/', $code)) {
            return json(['ret' => 0, 'msg' => '货币代码必须是3位小写字母']);
        }

        try {
            // 检查货币代码是否已存在
            if (Currency::codeExists($code)) {
                return json(['ret' => 0, 'msg' => '货币代码已存在']);
            }

            // 创建新货币
            $currency = new Currency();
            $currency->code = $code;
            $currency->name = $name;
            $currency->name_en = $nameEn ? : $code;
            $currency->symbol = $symbol;
            $currency->decimal_places = $decimalPlaces;
            $currency->is_default = false;
            $currency->is_active = true;

            if ($currency->save()) {
                return json(['ret' => 1, 'msg' => '货币添加成功']);
            } else {
                return json(['ret' => 0, 'msg' => '保存失败']);
            }
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '添加失败：' . $e->getMessage()]);
        }
    }

    /**
     * 编辑货币
     */
    public function editCurrency(Request $request): Json
    {
        $code = strtolower($request->param('code', ''));
        $name = $request->param('name', '');
        $nameEn = $request->param('name_en', '');
        $symbol = $request->param('symbol', '');
        $decimalPlaces = (int) $request->param('decimal_places', 2);

        if (empty($code) || empty($name) || empty($symbol)) {
            return json(['ret' => 0, 'msg' => '货币代码、名称和符号不能为空']);
        }

        try {
            // 查找货币
            $currency = Currency::getByCode($code);
            if (! $currency) {
                return json(['ret' => 0, 'msg' => '货币代码不存在']);
            }

            // 更新货币信息
            $currency->name = $name;
            $currency->name_en = $nameEn ? : $code;
            $currency->symbol = $symbol;
            $currency->decimal_places = $decimalPlaces;

            if ($currency->save()) {
                return json(['ret' => 1, 'msg' => '货币更新成功'])->header(['HX-Refresh' => 'true']);
            } else {
                return json(['ret' => 0, 'msg' => '保存失败']);
            }
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '更新失败：' . $e->getMessage()]);
        }
    }

    /**
     * 删除货币
     */
    public function deleteCurrency(Request $request): Json
    {
        $code = strtolower($request->param('code', ''));

        if (empty($code)) {
            return json(['ret' => 0, 'msg' => '货币代码不能为空']);
        }

        try {
            // 查找货币
            $currency = Currency::getByCode($code);
            if (! $currency) {
                return json(['ret' => 0, 'msg' => '货币代码不存在']);
            }

            // 检查是否为默认货币
            if ($currency->is_default) {
                return json(['ret' => 0, 'msg' => '不能删除默认货币']);
            }

            // 检查是否有派对使用该货币作为基础货币
            $partyCount = Db::table('party')->where('base_currency', $code)->count();
            if ($partyCount > 0) {
                return json(['ret' => 0, 'msg' => "该货币正在被 {$partyCount} 个派对使用，无法删除"]);
            }

            // 检查是否有派对在支持货币中包含该货币
            $supportedPartyCount = Db::table('party')
                ->where('supported_currencies', 'like', '%"' . $code . '"%')
                ->count();
            if ($supportedPartyCount > 0) {
                return json(['ret' => 0, 'msg' => "该货币正在被 {$supportedPartyCount} 个派对支持，无法删除"]);
            }

            // 检查是否有项目通过派对使用该货币
            $itemCount = Db::table('item')
                ->join('party', 'item.party_id = party.id')
                ->where('party.base_currency', $code)
                ->count();
            if ($itemCount > 0) {
                return json(['ret' => 0, 'msg' => "该货币正在被 {$itemCount} 个项目使用，无法删除"]);
            }

            // 执行删除
            if ($currency->delete()) {
                return json(['ret' => 1, 'msg' => '货币删除成功'])->header(['HX-Refresh' => 'true']);
            } else {
                return json(['ret' => 0, 'msg' => '删除失败']);
            }
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '删除失败：' . $e->getMessage()]);
        }
    }

    /**
     * 显示添加货币表单
     */
    public function addCurrencyForm(): View
    {
        return view('/admin/currency/add_form');
    }

    /**
     * 显示编辑货币表单
     */
    public function editCurrencyForm(Request $request): View
    {
        $code = $request->param('code');
        if (empty($code)) {
            return view('/error', ['msg' => '货币代码不能为空']);
        }

        $currency = Currency::getByCode($code);
        if (! $currency) {
            return view('/error', ['msg' => '货币不存在']);
        }

        return view('/admin/currency/edit_form', [
            'currency' => $currency
        ]);
    }


}
