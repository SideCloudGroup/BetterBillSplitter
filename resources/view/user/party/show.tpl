{include file="/user/header"}
<title>{:getSetting('general_name')} - {$party.name}</title>

<div class="page">
    <div class="page-wrapper">
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            {$party.name}
                            {if $party.archived_at}
                                <span class="badge bg-secondary ms-2">已归档</span>
                            {/if}
                        </h2>
                        <div class="text-muted mt-1">
                            {if $party.description}{$party.description}{else}派对详情{/if}
                        </div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="btn-list">
                            {if $isOwner && !$party.archived_at}
                                <a href="/user/party/{$party.id}/edit" class="btn btn-warning">
                                    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                    </svg>
                                    编辑派对
                                </a>
                            {/if}
                            <a href="/user/party/{$party.id}/bestpay" class="btn btn-success">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                                </svg>
                                查看最优支付
                            </a>
                            {if $party.archived_at}
                                <a href="/user/party/{$party.id}/archive/download" class="btn btn-outline-primary" target="_blank">
                                    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                    </svg>
                                    下载归档快照
                                </a>
                            {elseif $isOwner}
                                <button type="button" class="btn btn-outline-secondary"
                                        onclick="archiveParty({$party.id})">
                                    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
                                    </svg>
                                    归档派对
                                </button>
                            {/if}
                            {if !$party.archived_at}
                            <a href="/user/item/add" class="btn btn-primary">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                </svg>
                                添加收款项
                            </a>
                            {/if}
                            <a href="/user/party" class="btn btn-secondary">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                                </svg>
                                返回列表
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row row-cards">
                <!-- 派对信息 -->
                <div class="col-lg-4">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">派对信息</h3>
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label">邀请码</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" value="{$party.invite_code}" readonly>
                                    <button class="btn btn-outline-secondary" type="button"
                                            onclick="copyInviteCode('{$party.invite_code}')">
                                        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                        </svg>
                                        复制
                                    </button>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">所有者</label>
                                <div class="form-control-plaintext">{$party.owner.username}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">时区设置</label>
                                <div class="form-control-plaintext">{:formatTimezone($party.timezone)}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">基础货币</label>
                                <div class="form-control-plaintext">{$party.base_currency|strtoupper}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">支持的货币</label>
                                <div class="form-control-plaintext">
                                    {if $party.supported_currencies}
                                        {php}
                                            $currencies = json_decode($party->supported_currencies, true);
                                            $currencyNames = [];
                                            foreach ($currencies as $currency) {
                                            if (isset($all_currencies[$currency])) {
                                            $currencyNames[] = $all_currencies[$currency]['name'] . ' (' . strtoupper($currency) . ')';
                                            } else {
                                            $currencyNames[] = strtoupper($currency);
                                            }
                                            }
                                            echo implode(', ', $currencyNames);
                                        {/php}
                                    {else}
                                        {$all_currencies[$party.base_currency].name} ({$party.base_currency|strtoupper})
                                    {/if}
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">创建时间</label>
                                <div class="form-control-plaintext">{$party.created_at}</div>
                            </div>

                            {if $party.archived_at}
                            <div class="mb-3">
                                <label class="form-label">归档时间</label>
                                <div class="form-control-plaintext">{$party.archived_at}</div>
                            </div>
                            {/if}

                            <div class="mb-3">
                                <label class="form-label">成员数量</label>
                                <div class="form-control-plaintext">{:count($members)} 人</div>
                            </div>
                        </div>
                    </div>

                    <!-- 成员列表 -->
                    <div class="card mt-3">
                        <div class="card-header">
                            <h3 class="card-title">成员列表</h3>
                        </div>
                        <div class="card-body">
                            <div class="list-group list-group-flush">
                                {foreach $members as $member}
                                    <div class="list-group-item">
                                        <div class="row align-items-center">
                                            <div class="col-auto">
                                            <span class="avatar rounded">
                                                {:strtoupper(substr($member.username, 0, 1))}
                                            </span>
                                            </div>
                                            <div class="col">
                                                <div class="font-weight-medium">{$member.username}</div>
                                                <div class="text-muted">加入时间：{$member.joined_at}</div>
                                            </div>
                                            {if $party.owner_id == $member.id}
                                                <div class="col-auto">
                                                    <span class="badge bg-primary text-primary-fg">所有者</span>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {/foreach}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 账目列表 -->
                <div class="col-lg-8">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">收款项列表</h3>
                        </div>
                        <div class="card-body">
                            {if $items}
                                <div class="table-responsive">
                                    <table class="table table-vcenter">
                                        <thead>
                                        <tr>
                                            <th>描述</th>
                                            <th>金额</th>
                                            <th>付款人</th>
                                            <th>发起人</th>
                                            <th>状态</th>
                                            <th>创建时间</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {foreach $items as $item}
                                            <tr>
                                                <td>{$item.description}</td>
                                                <td>{$currencySymbol}{$item.amount}</td>
                                                <td>{$item.payer_name}</td>
                                                <td>{$item.initiator_name}</td>
                                                <td>
                                                    {if $item.paid}
                                                        <span class="badge bg-success text-success-fg">已支付</span>
                                                    {else}
                                                        <span class="badge bg-warning text-warning-fg">未支付</span>
                                                    {/if}
                                                </td>
                                                <td>{$item.created_at}</td>
                                            </tr>
                                        {/foreach}
                                        </tbody>
                                    </table>
                                </div>
                            {else}
                                <div class="empty">
                                    <div class="empty-img">
                                        <svg class="icon icon-3xl" fill="none" stroke="currentColor"
                                             viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                        </svg>
                                    </div>
                                    <p class="empty-title">还没有收款项</p>
                                    <p class="empty-subtitle text-muted">添加第一个收款项来开始记账吧！</p>
                                    {if !$party.archived_at}
                                    <div class="empty-action">
                                        <a href="/user/item/add" class="btn btn-primary">
                                            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                            </svg>
                                            添加收款项
                                        </a>
                                    </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    function archiveParty(partyId) {
        Swal.fire({
            title: '确认归档',
            html: '归档后将：<ul class="text-start small"><li>将该派对所有未支付收款项标为已支付（结算）</li><li>无法再添加收款项或修改支付状态</li><li>无法编辑或删除派对、无法加入新成员</li></ul><p class="mb-0">确认后将打开新窗口下载归档 JSON 快照。</p>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '确认归档',
            cancelButtonText: '取消'
        }).then(function (result) {
            if (!result.isConfirmed) {
                return;
            }
            fetch('/user/party/' + partyId + '/archive', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.ret === 1 && data.download_url) {
                        window.open(data.download_url, '_blank');
                        Swal.fire({ title: '归档成功', text: data.msg, icon: 'success' }).then(function () {
                            location.reload();
                        });
                    } else {
                        Swal.fire('错误', data.msg || '归档失败', 'error');
                    }
                })
                .catch(function () {
                    Swal.fire('错误', '请求失败', 'error');
                });
        });
    }

    function copyInviteCode(code) {
        navigator.clipboard.writeText(code).then(function () {
            Swal.fire({
                title: '复制成功',
                text: '邀请码已复制到剪贴板',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        }).catch(function () {
            // 如果剪贴板API不可用，使用传统方法
            const textArea = document.createElement('textarea');
            textArea.value = code;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);

            Swal.fire({
                title: '复制成功',
                text: '邀请码已复制到剪贴板',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        });
    }
</script>

{include file="/footer"}
