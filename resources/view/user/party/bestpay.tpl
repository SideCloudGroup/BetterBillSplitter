{include file="/user/header"}
<title>{:getSetting('general_name')} - {$party.name} - 最优支付</title>

<div class="page">
    <div class="page-wrapper">
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            {$party.name} - 最优支付方案
                            {if $party.archived_at}
                                <span class="badge bg-secondary ms-2">已归档</span>
                            {/if}
                        </h2>
                        <div class="text-muted mt-1">
                            {if $party.description}{$party.description}{else}派对最优支付方案{/if}
                        </div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="btn-list">
                            <a href="/user/party/{$party.id}/bestpay/download" class="btn btn-primary" target="_blank">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                </svg>
                                下载数据
                            </a>
                            {if $party.archived_at}
                                <a href="/user/party/{$party.id}/archive/download" class="btn btn-outline-primary" target="_blank">
                                    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                    </svg>
                                    下载归档快照
                                </a>
                            {/if}
                            {if $isOwner && !$party.archived_at}
                                <button class="btn btn-danger"
                                        hx-post="/user/party/{$party.id}/bestpay/clear"
                                        hx-confirm="此操作会将该派对中所有未支付项目标记为已支付，是否继续？"
                                        hx-swap="none">
                                    <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                    清空记录
                                </button>
                            {/if}
                            <a href="/user/party/{$party.id}" class="btn btn-secondary">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                                </svg>
                                返回派对
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row row-cards">
                <!-- 最优支付方案 -->
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">最优支付方案</h3>
                            <div class="card-actions">
                                <span class="badge bg-success text-success-fg">已优化</span>
                            </div>
                        </div>
                        <div class="card-body">
                            {if $bestPayFinal}
                                <div class="row">
                                    {foreach $bestPayFinal as $username1 => $user}
                                        <div class="col-md-4 mb-3">
                                            <div class="card">
                                                <div class="card-header">
                                                    <div class="row align-items-center">
                                                        <div class="col">
                                                            <div class="card-title">{$username1}</div>
                                                            <div class="card-subtitle">
                                                                合计支出：{$currencySymbol} {$userStat[$username1]['out']}
                                                                |
                                                                未结收入：{$currencySymbol} {$userStat[$username1]['in']}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="card-body">
                                                    {if $user}
                                                        <ul class="list-unstyled">
                                                            {foreach $user as $username2 => $amount}
                                                                <li class="mb-2">
                                                                    <div class="d-flex align-items-center">
                                                                        <span class="badge bg-primary me-2 text-primary-fg">支付</span>
                                                                        <span class="text-muted">向</span>
                                                                        <strong class="mx-1">{$username2}</strong>
                                                                        <span class="text-muted">支付</span>
                                                                        <span class="badge bg-success ms-2 text-success-fg">{$currencySymbol} {$amount}</span>
                                                                    </div>
                                                                </li>
                                                            {/foreach}
                                                        </ul>
                                                    {else}
                                                        <div class="text-muted">无需支付</div>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>
                                    {/foreach}
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
                                    <p class="empty-title">暂无最优支付方案</p>
                                    <p class="empty-subtitle text-muted">当前派对中没有未支付项目</p>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- 原始数据 -->
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">原始数据</h3>
                            <div class="card-actions">
                                <span class="badge bg-info text-info-fg">未优化</span>
                            </div>
                        </div>
                        <div class="card-body">
                            {if $bestPayAll}
                                <div class="row">
                                    {foreach $bestPayAll as $username1 => $user}
                                        <div class="col-md-4 mb-3">
                                            <div class="card">
                                                <div class="card-header">
                                                    <h3 class="card-title">{$username1}</h3>
                                                </div>
                                                <div class="card-body">
                                                    {if $user}
                                                        <ul class="list-unstyled">
                                                            {foreach $user as $username2 => $amount}
                                                                <li class="mb-2">
                                                                    <div class="d-flex align-items-center">
                                                                        <span class="badge bg-warning me-2 text-warning-fg">原始</span>
                                                                        <span class="text-muted">向</span>
                                                                        <strong class="mx-1">{$username2}</strong>
                                                                        <span class="text-muted">支付</span>
                                                                        <span class="badge bg-secondary ms-2 text-secondary-fg">{$currencySymbol} {$amount}</span>
                                                                    </div>
                                                                </li>
                                                            {/foreach}
                                                        </ul>
                                                    {else}
                                                        <div class="text-muted">无支付项目</div>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>
                                    {/foreach}
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
                                    <p class="empty-title">暂无原始数据</p>
                                    <p class="empty-subtitle text-muted">当前派对中没有未支付项目</p>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- 说明信息 -->
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">说明</h3>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>最优支付方案</h6>
                                    <ul class="text-muted">
                                        <li>系统自动计算的最优支付路径</li>
                                        <li>减少支付次数，提高效率</li>
                                        <li>基于当前未支付项目计算</li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <h6>原始数据</h6>
                                    <ul class="text-muted">
                                        <li>显示所有未支付项目的原始状态</li>
                                        <li>包含重复和冗余的支付路径</li>
                                        <li>用于对比优化效果</li>
                                    </ul>
                                </div>
                            </div>
                            {if $isOwner && !$party.archived_at}
                                <div class="alert alert-info mt-3">
                                    <h6>派对所有者权限</h6>
                                    <p class="mb-0">
                                        您可以清空该派对的待支付记录，此操作会将所有未支付项目标记为已支付。</p>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

{include file="/footer"}
