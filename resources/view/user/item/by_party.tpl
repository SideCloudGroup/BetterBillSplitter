{include file="/user/header"}
<title>{:getSetting('general_name')} - {$party.name} - 我创建的收款</title>

<div class="page">
    <div class="page-wrapper">
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">{$party.name}</h2>
                        <div class="text-muted mt-1">您在该派对中创建的收款项目</div>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="btn-list">
                            <a href="/user/item" class="btn btn-secondary">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                                </svg>
                                返回列表
                            </a>
                            <a href="/user/party/{$party.id}" class="btn btn-primary">
                                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                                查看派对详情
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row row-cards mt-2">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">收款项目列表</h3>
                        </div>
                        <div class="card-body">
                            {if $items}
                                <div class="table-responsive">
                                    <table class="table table-vcenter">
                                        <thead>
                                        <tr>
                                            <th>描述</th>
                                            <th>付款人</th>
                                            <th>金额</th>
                                            <th>状态</th>
                                            <th>创建时间</th>
                                            {if !$party.is_archived}
                                            <th>操作</th>
                                            {/if}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {foreach $items as $item}
                                            <tr>
                                                <td>{$item.description}</td>
                                                <td>{$item.username}</td>
                                                <td class="text-success">{$party.currency_symbol|default='¥'}{$item.amount}</td>
                                                <td>
                                                    {if $item.paid}
                                                        <span class="badge bg-success text-success-fg">已支付</span>
                                                    {else}
                                                        <span class="badge bg-warning text-warning-fg">未支付</span>
                                                    {/if}
                                                </td>
                                                <td>{$item.created_at}</td>
                                                {if !$party.is_archived}
                                                <td>
                                                    {if $item.paid}
                                                        <button class="btn btn-sm btn-warning"
                                                                onclick="togglePaymentStatus({$item.id}, false)">
                                                            标记为未支付
                                                        </button>
                                                    {else}
                                                        <button class="btn btn-sm btn-success"
                                                                onclick="togglePaymentStatus({$item.id}, true)">
                                                            标记为已支付
                                                        </button>
                                                    {/if}
                                                </td>
                                                {/if}
                                            </tr>
                                        {/foreach}
                                        </tbody>
                                    </table>
                                </div>
                                <div class="mt-3 p-3 bg-light rounded">
                                    <div class="row align-items-center">
                                        <div class="col">
                                            <div class="text-muted">总计金额</div>
                                            <div class="h4 mb-0 text-success">
                                                {$party.currency_symbol|default='¥'}{$totalAmount|default=0}
                                            </div>
                                        </div>
                                        <div class="col">
                                            <div class="text-muted">已支付</div>
                                            <div class="h4 mb-0 text-success">
                                                {$party.currency_symbol|default='¥'}{$paidAmount|default=0}
                                            </div>
                                        </div>
                                        <div class="col">
                                            <div class="text-muted">未支付</div>
                                            <div class="h4 mb-0 text-warning">
                                                {$party.currency_symbol|default='¥'}{$unpaidAmount|default=0}
                                            </div>
                                        </div>
                                    </div>
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
                                    <p class="empty-title">还没有创建收款项目</p>
                                    <p class="empty-subtitle text-muted">您在该派对中还没有创建任何收款项目</p>
                                    {if !$party.is_archived}
                                    <div class="empty-action">
                                        <a href="/user/item/add" class="btn btn-primary">
                                            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                            </svg>
                                            创建第一个收款项目
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
    function togglePaymentStatus(itemId, newStatus) {
        const statusText = newStatus ? '已支付' : '未支付';
        const confirmText = `确定要将这笔款项标记为${statusText}吗？`;

        Swal.fire({
            title: '确认状态变更',
            text: confirmText,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: newStatus ? '#28a745' : '#ffc107',
            cancelButtonColor: '#6c757d',
            confirmButtonText: '确认',
            cancelButtonText: '取消'
        }).then((result) => {
            if (result.isConfirmed) {
                fetch(`/user/item/${itemId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        paid: newStatus ? 1 : 0
                    })
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.ret === 1) {
                            Swal.fire('成功', `已标记为${statusText}`, 'success').then(() => {
                                location.reload();
                            });
                        } else {
                            Swal.fire('错误', data.msg, 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        Swal.fire('错误', '操作失败', 'error');
                    });
            }
        });
    }
</script>

{include file="/footer"}
