{include file="/user/header"}
<title>{:getSetting('general_name')} - 我的派对</title>

<div class="page">
    <div class="page-wrapper">
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">我的派对</h2>
                        <div class="text-muted mt-1">管理您创建和加入的派对</div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="btn-list">
                            <a href="/user/party/create" class="btn btn-primary">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                </svg>
                                创建派对
                            </a>
                            <a href="/user/party/join" class="btn btn-success">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                                </svg>
                                加入派对
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {if $ownedParties}
                <div class="row row-cards mt-2">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">我创建的派对</h3>
                            </div>
                            <div class="card-body">
                                <div class="row row-cards">
                                    {foreach $ownedParties as $party}
                                        <div class="col-md-6 col-lg-4">
                                            <div class="card card-sm">
                                                <div class="card-body">
                                                    <div class="d-flex align-items-center">
                                                        <span class="avatar me-3 rounded bg-blue-lt">
                                                            <svg class="icon" fill="none" stroke="currentColor"
                                                                 viewBox="0 0 24 24">
                                                                <path stroke-linecap="round" stroke-linejoin="round"
                                                                      stroke-width="2"
                                                                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                                                            </svg>
                                                        </span>
                                                        <div class="flex-fill">
                                                            <div class="font-weight-medium">
                                                                {$party.name}
                                                                {if $party.archived_at}
                                                                    <span class="badge bg-secondary ms-1">已归档</span>
                                                                {/if}
                                                            </div>
                                                            {if $party.description}
                                                                <div class="text-muted">{$party.description}</div>
                                                            {/if}
                                                        </div>
                                                        <div class="btn-group">
                                                            <a href="/user/party/{$party.id}"
                                                               class="btn btn-sm btn-outline-primary">
                                                                查看详情
                                                            </a>
                                                            {if !$party.archived_at}
                                                            <button class="btn btn-sm btn-outline-danger"
                                                                    hx-delete="/user/party/{$party.id}"
                                                                    hx-confirm="确定要删除这个派对吗？删除后所有数据将无法恢复。"
                                                                    hx-target="body"
                                                                    hx-swap="none">
                                                                删除派对
                                                            </button>
                                                            {/if}
                                                        </div>
                                                    </div>
                                                    <div class="mt-3">
                                                        <div class="row text-center">
                                                            <div class="col">
                                                                <div class="text-muted">邀请码</div>
                                                                <div class="font-weight-medium">
                                                                    <code class="bg-light px-2 py-1 rounded">{$party.invite_code}</code>
                                                                </div>
                                                            </div>
                                                            <div class="col">
                                                                <div class="text-muted">成员数</div>
                                                                <div class="font-weight-medium">{$party.members|count}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    {/foreach}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            {if $joinedParties}
                <div class="row row-cards mt-2">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">我加入的派对</h3>
                            </div>
                            <div class="card-body">
                                <div class="row row-cards">
                                    {foreach $joinedParties as $party}
                                        <div class="col-md-6 col-lg-4">
                                            <div class="card card-sm">
                                                <div class="card-body">
                                                    <div class="d-flex align-items-center">
                                                        <span class="avatar me-3 rounded bg-green-lt">
                                                            <svg class="icon" fill="none" stroke="currentColor"
                                                                 viewBox="0 0 24 24">
                                                                <path stroke-linecap="round" stroke-linejoin="round"
                                                                      stroke-width="2"
                                                                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                                            </svg>
                                                        </span>
                                                        <div class="flex-fill">
                                                            <div class="font-weight-medium">
                                                                {$party.name}
                                                                {if $party.archived_at}
                                                                    <span class="badge bg-secondary ms-1">已归档</span>
                                                                {/if}
                                                            </div>
                                                            {if $party.description}
                                                                <div class="text-muted">{$party.description}</div>
                                                            {/if}
                                                            <div class="text-muted">所有者：{$party.owner.username}</div>
                                                        </div>
                                                        <div class="btn-group">
                                                            <a href="/user/party/{$party.id}"
                                                               class="btn btn-sm btn-outline-primary">
                                                                查看详情
                                                            </a>
                                                            <button class="btn btn-sm btn-outline-warning"
                                                                    hx-post="/user/party/{$party.id}/leave"
                                                                    hx-confirm="确定要退出这个派对吗？"
                                                                    hx-target="body"
                                                                    hx-swap="none">
                                                                退出派对
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    {/foreach}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            {if !$ownedParties && !$joinedParties}
                <div class="row row-cards">
                    <div class="col-12">
                        <div class="card card-body text-center">
                            <div class="empty">
                                <div class="empty-img">
                                    <svg class="icon icon-3xl" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                                    </svg>
                                </div>
                                <p class="empty-title">还没有派对</p>
                                <p class="empty-subtitle text-muted">创建一个派对或加入现有的派对来开始记账吧！</p>
                                <div class="empty-action">
                                    <a href="/user/party/create" class="btn btn-primary">
                                        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                        </svg>
                                        创建第一个派对
                                    </a>
                                    <a href="/user/party/join" class="btn btn-success">
                                        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                                        </svg>
                                        加入派对
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

{include file="/footer"}
