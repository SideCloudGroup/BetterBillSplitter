<?php
declare (strict_types=1);

namespace app\controller;

use app\BaseController;
use app\model\Currency;
use app\model\Party;
use app\model\PartyMember;
use DateTime;
use DateTimeZone;
use Exception;
use think\facade\Db;
use think\facade\Session;
use think\Request;
use think\response\Json;
use think\response\View;

class PartyController extends BaseController
{
    /**
     * 显示Party列表页面
     */
    public function index(Request $request): View
    {
        $userId = Session::get('userid');

        // 获取用户创建的Party
        $ownedParties = Party::where('owner_id', $userId)
            ->with(['members'])
            ->select();

        // 获取用户加入的Party
        $joinedParties = Party::join('party_member', 'party.id = party_member.party_id')
            ->where('party_member.user_id', $userId)
            ->where('party.owner_id', '<>', $userId)
            ->field('party.*')
            ->select();

        return view('/user/party/index', [
            'ownedParties' => $ownedParties,
            'joinedParties' => $joinedParties
        ]);
    }

    /**
     * 显示加入Party页面
     */
    public function join(Request $request): View
    {
        return view('/user/party/join');
    }

    /**
     * 显示创建Party页面
     */
    public function create(Request $request): View
    {
        $currencyService = app()->currencyService;
        $currencies = $currencyService->getAllAvailableCurrencies();

        return view('/user/party/create', [
            'currencies' => $currencies
        ]);
    }

    /**
     * 处理创建Party请求
     */
    public function store(Request $request): Json
    {
        $name = $request->param('name');
        $description = $request->param('description', '');
        $timezone = $request->param('timezone', 'Asia/Shanghai');
        $baseCurrency = $request->param('base_currency', 'cny');
        $supportedCurrencies = $request->param('supported_currencies', []);

        if (empty($name)) {
            return json(['ret' => 0, 'msg' => '派对名称不能为空']);
        }

        // 验证时区
        $timezone = trim($timezone);
        if (! in_array($timezone, timezone_identifiers_list())) {
            return json(['ret' => 0, 'msg' => '无效的时区标识符：' . $timezone]);
        }

        // 验证基础货币
        $availableCurrencies = app()->currencyService->getAllAvailableCurrencies();
        if (! array_key_exists($baseCurrency, $availableCurrencies)) {
            return json(['ret' => 0, 'msg' => '无效的基础货币']);
        }

        // 处理支持的货币
        if (! is_array($supportedCurrencies)) {
            $supportedCurrencies = [];
        }

        // 确保基础货币包含在支持的货币中
        if (! in_array($baseCurrency, $supportedCurrencies)) {
            $supportedCurrencies[] = $baseCurrency;
        }

        // 过滤掉空值
        $supportedCurrencies = array_filter($supportedCurrencies);

        // 验证所有支持的货币
        foreach ($supportedCurrencies as $currency) {
            if (! array_key_exists($currency, $availableCurrencies)) {
                return json(['ret' => 0, 'msg' => "无效的货币：{$currency}"]);
            }
        }

        try {
            Db::startTrans();

            // 创建Party
            $party = new Party();
            $party->name = $name;
            $party->description = $description;
            $party->timezone = $timezone;
            $party->base_currency = $baseCurrency;
            $party->supported_currencies = json_encode($supportedCurrencies);
            $party->invite_code = Party::generateInviteCode();
            $party->owner_id = Session::get('userid');
            $party->save();

            // 将创建者添加为成员
            $member = new PartyMember();
            $member->party_id = $party->id;
            $member->user_id = Session::get('userid');
            $member->save();

            Db::commit();

            return json(['ret' => 1, 'msg' => '派对创建成功', 'party_id' => $party->id])
                ->header(['HX-Redirect' => '/user/party']);

        } catch (Exception $e) {
            Db::rollback();
            return json(['ret' => 0, 'msg' => '创建失败：' . $e->getMessage()]);
        }
    }

    /**
     * 处理加入Party请求
     */
    public function joinParty(Request $request): Json
    {
        $inviteCode = $request->param('invite_code');

        if (empty($inviteCode)) {
            return json(['ret' => 0, 'msg' => '邀请码不能为空']);
        }

        // 查找派对
        $party = Party::where('invite_code', $inviteCode)->find();
        if (! $party) {
            return json(['ret' => 0, 'msg' => '邀请码无效']);
        }

        $userId = Session::get('userid');

        // 检查是否已经是成员
        $existingMember = PartyMember::where('party_id', $party->id)
            ->where('user_id', $userId)
            ->find();

        if ($existingMember) {
            return json(['ret' => 0, 'msg' => '您已经是该派对的成员']);
        }

        try {
            // 添加成员
            $member = new PartyMember();
            $member->party_id = $party->id;
            $member->user_id = $userId;
            $member->save();

            return json(['ret' => 1, 'msg' => '成功加入派对：' . $party->name])
                ->header(['HX-Redirect' => '/user/party']);

        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '加入失败：' . $e->getMessage()]);
        }
    }

    /**
     * 显示编辑Party页面
     */
    public function edit(Request $request, int $id): View
    {
        $userId = Session::get('userid');

        // 获取派对基本信息
        $party = (new Party)->findOrEmpty($id);
        if ($party->isEmpty()) {
            return view('/404');
        }

        // 检查用户是否为所有者
        if ($party->owner_id !== $userId) {
            return view('/404');
        }

        // 获取所有可用货币
        $availableCurrencies = app()->currencyService->getAllAvailableCurrencies();

        // 获取当前支持的货币
        $currentSupportedCurrencies = [];
        if ($party->supported_currencies) {
            try {
                $currentSupportedCurrencies = json_decode($party->supported_currencies, true);
            } catch (Exception $e) {
                $currentSupportedCurrencies = [$party->base_currency];
            }
        } else {
            $currentSupportedCurrencies = [$party->base_currency];
        }
        return view('/user/party/edit', [
            'party' => $party,
            'available_currencies' => $availableCurrencies,
            'current_supported_currencies' => $currentSupportedCurrencies
        ]);
    }

    /**
     * 更新Party信息
     */
    public function update(Request $request, int $id): Json
    {
        $userId = Session::get('userid');

        // 获取派对基本信息
        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        // 检查用户是否为所有者
        if ($party->owner_id !== $userId) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以编辑']);
        }

        $name = $request->param('name');
        $description = $request->param('description', '');
        $timezone = $request->param('timezone', 'Asia/Shanghai');
        $baseCurrency = $request->param('base_currency', 'cny');
        $supportedCurrencies = $request->param('supported_currencies', []);

        if (empty($name)) {
            return json(['ret' => 0, 'msg' => '派对名称不能为空']);
        }

        // 验证时区
        $timezone = trim($timezone);
        if (! in_array($timezone, timezone_identifiers_list())) {
            return json(['ret' => 0, 'msg' => '无效的时区标识符：' . $timezone]);
        }

        // 验证基础货币
        $availableCurrencies = app()->currencyService->getAllAvailableCurrencies();
        if (! array_key_exists($baseCurrency, $availableCurrencies)) {
            return json(['ret' => 0, 'msg' => '无效的基础货币']);
        }

        // 处理支持的货币
        if (! is_array($supportedCurrencies)) {
            $supportedCurrencies = [];
        }

        // 确保基础货币包含在支持的货币中
        if (! in_array($baseCurrency, $supportedCurrencies)) {
            $supportedCurrencies[] = $baseCurrency;
        }

        // 过滤掉空值
        $supportedCurrencies = array_filter($supportedCurrencies);

        // 验证所有支持的货币
        foreach ($supportedCurrencies as $currency) {
            if (! array_key_exists($currency, $availableCurrencies)) {
                return json(['ret' => 0, 'msg' => "无效的货币：{$currency}"]);
            }
        }

        try {
            // 更新派对信息
            $party->name = $name;
            $party->description = $description;
            $party->timezone = $timezone;
            $party->base_currency = $baseCurrency;
            $party->supported_currencies = json_encode($supportedCurrencies);
            $party->save();

            return json(['ret' => 1, 'msg' => '派对信息更新成功'])
                ->header(['HX-Redirect' => "/user/party/{$id}"]);

        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '更新失败：' . $e->getMessage()]);
        }
    }

    /**
     * 显示Party详情页面
     */
    public function show(Request $request, int $id): View
    {
        $userId = Session::get('userid');

        // 获取派对基本信息
        $party = (new Party)->findOrEmpty($id);
        if ($party->isEmpty()) {
            return view('/404');
        }

        // 检查用户是否为成员
        $isMember = Db::table('party_member')
                ->where('party_id', $id)
                ->where('user_id', $userId)
                ->count() > 0;

        if (! $isMember) {
            return view('/404');
        }

        $isOwner = $party->owner_id === $userId;

        // 获取派对成员（只返回必要信息）
        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->where('party_member.party_id', $id)
            ->field('user.id, user.username, party_member.joined_at')
            ->select();

        // 获取派对账目
        $items = Db::table('item')
            ->join('user payer', 'item.userid = payer.id')
            ->join('user initiator', 'item.initiator = initiator.id')
            ->where('item.party_id', $id)
            ->field('item.*, payer.username as payer_name, initiator.username as initiator_name')
            ->select();

        // 获取所有可用货币的详细信息
        $currencyService = app()->currencyService;
        $allCurrencies = $currencyService->getAllAvailableCurrencies();

        // 获取派对货币信息
        $currencySymbol = '¥';
        if ($party->base_currency) {
            $currency = Currency::getByCode($party->base_currency);
            $currencySymbol = $currency ? $currency->symbol : '¥';
        }

        return view('/user/party/show', [
            'party' => $party,
            'members' => $members,
            'items' => $items,
            'isOwner' => $isOwner,
            'all_currencies' => $allCurrencies,
            'currencySymbol' => $currencySymbol
        ]);
    }

    /**
     * 退出Party
     */
    public function leave(Request $request, int $id): Json
    {
        $userId = Session::get('userid');

        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        // 所有者不能退出，只能删除派对
        if ($party->isOwner($userId)) {
            return json(['ret' => 0, 'msg' => '派对所有者不能退出，请删除派对']);
        }

        // 检查是否为成员
        if (! $party->isMember($userId)) {
            return json(['ret' => 0, 'msg' => '您不是该派对的成员']);
        }

        // 检查派对中是否有未支付项目
        $unpaidItems = Db::table('item')
            ->where('party_id', $id)
            ->where('paid', false) // false表示未支付
            ->count();

        if ($unpaidItems > 0) {
            return json(['ret' => 0, 'msg' => '该派对中还有未支付项目，无法退出。请先处理完所有未支付项目后再退出。']);
        }

        try {
            PartyMember::where('party_id', $id)
                ->where('user_id', $userId)
                ->delete();

            return json(['ret' => 1, 'msg' => '已退出派对'])
                ->header(['HX-Redirect' => '/user/party']);

        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '退出失败：' . $e->getMessage()]);
        }
    }

    /**
     * 获取派对成员列表
     */
    public function getMembers(Request $request, int $id): Json
    {
        $userId = Session::get('userid');

        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        // 检查用户是否为成员
        if (! $party->isMember($userId)) {
            return json(['ret' => 0, 'msg' => '您不是该派对的成员']);
        }

        // 获取派对成员
        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->where('party_member.party_id', $id)
            ->field('user.id, user.username')
            ->select();

        return json(['ret' => 1, 'users' => $members]);
    }

    /**
     * 获取派对详细信息（包括货币和成员）
     */
    public function getPartyInfo(Request $request, int $id): View
    {
        $userId = Session::get('userid');

        $party = Party::find($id);
        if (! $party) {
            return view('/error', ['msg' => '派对不存在']);
        }

        if (! $party->isMember($userId)) {
            return view('/error', ['msg' => '您不是该派对的成员']);
        }

        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->where('party_member.party_id', $id)
            ->field('user.id, user.username')
            ->select();

        $supportedCurrencies = [];
        if ($party->supported_currencies) {
            try {
                $supportedCurrencies = json_decode($party->supported_currencies, true);
                if (! is_array($supportedCurrencies)) {
                    $supportedCurrencies = [$party->base_currency];
                }
            } catch (Exception $e) {
                $supportedCurrencies = [$party->base_currency];
            }
        } else {
            $supportedCurrencies = [$party->base_currency];
        }

        // 确保基础货币包含在支持的货币中
        if (! in_array($party->base_currency, $supportedCurrencies)) {
            $supportedCurrencies[] = $party->base_currency;
        }

        // 获取所有可用货币的详细信息
        $currencyService = app()->currencyService;
        $allCurrencies = $currencyService->getAllAvailableCurrencies();

        return view('/user/item/party_details', [
            'party' => $party,
            'members' => $members,
            'base_currency' => $party->base_currency,
            'supported_currencies' => $supportedCurrencies,
            'all_currencies' => $allCurrencies
        ]);
    }

    /**
     * 删除Party（仅所有者）
     */
    public function destroy(Request $request, int $id): Json
    {
        $userId = Session::get('userid');

        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        // 检查是否为所有者
        if (! $party->isOwner($userId)) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以删除']);
        }

        // 检查派对中是否有未支付项目
        $unpaidItems = Db::table('item')
            ->where('party_id', $id)
            ->where('paid', false) // false表示未支付
            ->count();

        if ($unpaidItems > 0) {
            return json(['ret' => 0, 'msg' => '该派对中还有未支付项目，无法删除。请先处理完所有未支付项目后再删除派对。']);
        }

        try {
            Db::startTrans();

            // 删除所有成员
            PartyMember::where('party_id', $id)->delete();

            // 删除所有账目
            Db::table('item')->where('party_id', $id)->delete();

            // 删除Party
            $party->delete();
            Db::commit();

            return json(['ret' => 1, 'msg' => '派对已删除'])
                ->header(['HX-Refresh' => 'true']);

        } catch (Exception $e) {
            Db::rollback();
            return json(['ret' => 0, 'msg' => '删除失败：' . $e->getMessage()]);
        }
    }

    /**
     * 验证时区标识符
     */
    public function validateTimezone(Request $request): Json
    {
        $timezone = $request->param('timezone');

        if (empty($timezone)) {
            return json(['ret' => 0, 'msg' => '时区不能为空']);
        }

        $timezone = trim($timezone);

        // 使用PHP内置函数验证时区
        if (! in_array($timezone, timezone_identifiers_list())) {
            return json(['ret' => 0, 'msg' => '无效的时区标识符']);
        }

        try {
            // 创建时区对象并获取当前偏移量
            $dateTimeZone = new DateTimeZone($timezone);
            $dateTime = new DateTime('now', $dateTimeZone);
            $offset = $dateTime->format('P');

            return json([
                'ret' => 1,
                'msg' => '时区有效',
                'timezone' => $timezone,
                'current_offset' => $offset,
                'is_dst' => $dateTime->format('I') == '1'
            ]);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '时区验证失败：' . $e->getMessage()]);
        }
    }

    /**
     * 搜索时区建议
     */
    public function searchTimezones(Request $request): Json
    {
        $query = $request->param('query', '');

        if (strlen($query) < 2) {
            return json(['ret' => 0, 'msg' => '搜索关键词至少2个字符']);
        }

        // 获取所有可用时区
        $allTimezones = timezone_identifiers_list();

        // 过滤匹配的时区
        $filtered = array_filter($allTimezones, function ($tz) use ($query) {
            return stripos($tz, $query) !== false;
        });

        // 限制返回数量
        $filtered = array_slice($filtered, 0, 20);

        return json([
            'ret' => 1,
            'timezones' => $filtered,
            'count' => count($filtered)
        ]);
    }

    /**
     * 获取货币名称映射
     */
    public function getCurrencyInfo(Request $request): Json
    {
        $currencies = $request->param('currencies', []);

        if (! is_array($currencies)) {
            $currencies = [];
        }

        $currencyService = app()->currencyService;

        $currencyInfo = [];
        foreach ($currencies as $currencyCode) {
            $currencyName = $currencyService->getCurrencyName($currencyCode);
            $currencyInfo[$currencyCode] = $currencyName . ' (' . strtoupper($currencyCode) . ')';
        }

        return json([
            'ret' => 1,
            'currency_info' => $currencyInfo
        ]);
    }
}
