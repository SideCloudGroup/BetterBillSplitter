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
use stdClass;
use think\facade\Db;
use think\Request;
use think\Response;
use think\response\Json;

class PartyController extends BaseController
{
    /**
     * 显示Party列表页面
     */
    public function index(Request $request): Json
    {
        $userId = $this->currentUserId();

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

        return json([
            'ret' => 1,
            'data' => [
                'ownedParties' => $ownedParties,
                'joinedParties' => $joinedParties,
            ],
        ]);
    }

    /**
     * 加入派对页（SPA 无需数据）
     */
    public function join(Request $request): Json
    {
        return json(['ret' => 1, 'data' => new stdClass()]);
    }

    /**
     * 创建派对页数据
     */
    public function create(Request $request): Json
    {
        $currencyService = app()->currencyService;
        $currencies = $currencyService->getAllAvailableCurrencies();

        return json(['ret' => 1, 'data' => ['currencies' => $currencies]]);
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
            $party->owner_id = $this->currentUserId();
            $party->save();

            // 将创建者添加为成员
            $member = new PartyMember();
            $member->party_id = $party->id;
            $member->user_id = $this->currentUserId();
            $member->save();

            Db::commit();

            return json(['ret' => 1, 'msg' => '派对创建成功', 'party_id' => $party->id]);
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

        if ($party->isArchived()) {
            return json(['ret' => 0, 'msg' => '该派对已归档，无法加入']);
        }

        $userId = $this->currentUserId();

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

            return json(['ret' => 1, 'msg' => '成功加入派对：' . $party->name]);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '加入失败：' . $e->getMessage()]);
        }
    }

    /**
     * 编辑派对页数据
     */
    public function edit(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

        $party = (new Party)->findOrEmpty($id);
        if ($party->isEmpty()) {
            return json(['ret' => 0, 'msg' => '派对不存在'], 404);
        }

        if ($party->owner_id !== $userId) {
            return json(['ret' => 0, 'msg' => '无权编辑'], 403);
        }

        if ($party->isArchived()) {
            return json(['ret' => 0, 'msg' => '已归档的派对无法编辑'], 400);
        }

        $availableCurrencies = app()->currencyService->getAllAvailableCurrencies();

        $currentSupportedCurrencies = [];
        if ($party->supported_currencies) {
            try {
                $currentSupportedCurrencies = json_decode(
                    $party->supported_currencies,
                    true
                ) ? : [$party->base_currency];
            } catch (Exception) {
                $currentSupportedCurrencies = [$party->base_currency];
            }
        } else {
            $currentSupportedCurrencies = [$party->base_currency];
        }

        return json([
            'ret' => 1,
            'data' => [
                'party' => $party,
                'available_currencies' => $availableCurrencies,
                'current_supported_currencies' => $currentSupportedCurrencies,
            ],
        ]);
    }

    /**
     * 派对详情
     */
    public function show(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

        $party = (new Party)->findOrEmpty($id);
        if ($party->isEmpty()) {
            return json(['ret' => 0, 'msg' => '派对不存在'], 404);
        }

        $isMember = Db::table('party_member')
                ->where('party_id', $id)
                ->where('user_id', $userId)
                ->count() > 0;

        if (! $isMember) {
            return json(['ret' => 0, 'msg' => '无权访问'], 403);
        }

        $isOwner = $party->owner_id === $userId;

        $members = Db::table('party_member')
            ->join('user', 'party_member.user_id = user.id')
            ->where('party_member.party_id', $id)
            ->field('user.id, user.username, party_member.joined_at')
            ->select();

        $items = Db::table('item')
            ->join('user payer', 'item.userid = payer.id')
            ->join('user initiator', 'item.initiator = initiator.id')
            ->where('item.party_id', $id)
            ->field('item.*, payer.username as payer_name, initiator.username as initiator_name')
            ->select();

        $currencyService = app()->currencyService;
        $allCurrencies = $currencyService->getAllAvailableCurrencies();

        $currencySymbol = '¥';
        if ($party->base_currency) {
            $currency = Currency::getByCode($party->base_currency);
            $currencySymbol = $currency ? $currency->symbol : '¥';
        }

        return json([
            'ret' => 1,
            'data' => [
                'party' => $party,
                'members' => $members,
                'items' => $items,
                'isOwner' => $isOwner,
                'all_currencies' => $allCurrencies,
                'currencySymbol' => $currencySymbol,
            ],
        ]);
    }

    /**
     * 退出Party
     */
    public function leave(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

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

            return json(['ret' => 1, 'msg' => '已退出派对']);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '退出失败：' . $e->getMessage()]);
        }
    }

    /**
     * 获取派对成员列表
     */
    public function getMembers(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

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
    public function getPartyInfo(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在'], 404);
        }

        if (! $party->isMember($userId)) {
            return json(['ret' => 0, 'msg' => '您不是该派对的成员'], 403);
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
            } catch (Exception) {
                $supportedCurrencies = [$party->base_currency];
            }
        } else {
            $supportedCurrencies = [$party->base_currency];
        }

        if (! in_array($party->base_currency, $supportedCurrencies)) {
            $supportedCurrencies[] = $party->base_currency;
        }

        $currencyService = app()->currencyService;
        $allCurrencies = $currencyService->getAllAvailableCurrencies();

        return json([
            'ret' => 1,
            'data' => [
                'party' => $party,
                'members' => $members,
                'base_currency' => $party->base_currency,
                'supported_currencies' => $supportedCurrencies,
                'all_currencies' => $allCurrencies,
            ],
        ]);
    }

    /**
     * 删除Party（仅所有者）
     */
    public function destroy(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        // 检查是否为所有者
        if (! $party->isOwner($userId)) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以删除']);
        }

        if ($party->isArchived()) {
            return json(['ret' => 0, 'msg' => '已归档的派对无法删除']);
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

            return json(['ret' => 1, 'msg' => '派对已删除']);
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

    /**
     * 归档派对（仅所有者）：结算、锁定，返回归档快照下载地址
     */
    public function archive(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();
        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }
        if (! $party->isOwner($userId)) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以归档']);
        }
        if ($party->isArchived()) {
            return json(['ret' => 0, 'msg' => '该派对已归档']);
        }

        if (! app()->userService->savePartyArchiveSnapshot($id)) {
            return json(['ret' => 0, 'msg' => '生成归档快照失败，请重试']);
        }

        try {
            Db::startTrans();
            $locked = Party::where('id', $id)->lock(true)->find();
            if (! $locked || $locked->isArchived()) {
                Db::rollback();

                return json(['ret' => 0, 'msg' => '该派对已归档或不存在']);
            }
            Db::table('item')
                ->where('party_id', $id)
                ->where('paid', 0)
                ->update(['paid' => 1]);
            $locked->archived_at = date('Y-m-d H:i:s');
            $locked->save();
            Db::commit();
        } catch (Exception $e) {
            Db::rollback();

            return json(['ret' => 0, 'msg' => '归档失败：' . $e->getMessage()]);
        }

        return json([
            'ret' => 1,
            'msg' => '归档成功，即将下载归档前快照（含最优支付）',
            'download_url' => '/api/user/party/' . $id . '/archive/download',
        ]);
    }

    /**
     * 更新Party信息
     */
    public function update(Request $request, int $id): Json
    {
        $userId = $this->currentUserId();

        // 获取派对基本信息
        $party = Party::find($id);
        if (! $party) {
            return json(['ret' => 0, 'msg' => '派对不存在']);
        }

        // 检查用户是否为所有者
        if ($party->owner_id !== $userId) {
            return json(['ret' => 0, 'msg' => '只有派对所有者可以编辑']);
        }

        if ($party->isArchived()) {
            return json(['ret' => 0, 'msg' => '已归档的派对无法编辑']);
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

            return json(['ret' => 1, 'msg' => '派对信息更新成功']);
        } catch (Exception $e) {
            return json(['ret' => 0, 'msg' => '更新失败：' . $e->getMessage()]);
        }
    }

    /**
     * 下载已归档派对的快照 JSON（成员可访问）
     */
    public function downloadArchiveExport(Request $request, int $partyId): Response
    {
        $userId = $this->currentUserId();
        $isMember = Db::table('party_member')
                ->where('party_id', $partyId)
                ->where('user_id', $userId)
                ->count() > 0;
        if (! $isMember) {
            return response('无权限访问', 403);
        }
        $party = Party::find($partyId);
        if (! $party || ! $party->isArchived()) {
            return response('仅已归档派对可下载归档快照', 404);
        }

        $snapshotPath = app()->userService->getPartyArchiveSnapshotPath($partyId);
        $archivedSuffix = $party->archived_at
            ? date('Ymd_His', strtotime((string)$party->archived_at))
            : date('Ymd_His');
        $filename = 'party_archive_' . $party->id . '_' . $archivedSuffix . '.json';

        if (is_readable($snapshotPath)) {
            return download($snapshotPath, $filename, false, 60);
        }

        $data = app()->userService->buildPartyExportData($partyId);
        if ($data === []) {
            return response('派对不存在', 404);
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $tempPath = runtime_path() . 'temp/' . uniqid('party_archive_', true) . '.json';
        file_put_contents($tempPath, $json);

        return download($tempPath, $filename, false, 60);
    }
}
