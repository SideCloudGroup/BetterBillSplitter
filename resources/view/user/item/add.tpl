{include file="/user/header"}
<title>{:getSetting('general_name')} - 添加项目</title>

<div class="page">
    <div class="page-wrapper">
        <div class="container-xl">
            <div class="page-header d-print-none">
                <div class="row align-items-center">
                    <div class="col">
                        <h2 class="page-title">添加收款项</h2>
                        <div class="text-muted mt-1">在选定的派对中添加新的收款项</div>
                    </div>
                </div>
            </div>

            <div class="row row-cards">
                <div class="col-lg-8">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">收款项信息</h3>
                        </div>
                        <div class="card-body">
                            <form hx-post="/user/item/add" hx-trigger="submit" hx-swap="none">
                                <div class="mb-4">
                                    <h4 class="mb-3">选择派对</h4>
                                    <div class="mb-3">
                                        <label class="form-label required">选择派对</label>
                                        <div class="form-selectgroup">
                                            {volist name="parties" id="party"}
                                                <label class="form-selectgroup-item" style="cursor: pointer;">
                                                    <input type="radio" name="party_id" value="{$party.id}"
                                                           class="form-selectgroup-input" required
                                                           hx-get="/user/party/{$party.id}/info"
                                                           hx-target="#party-details"
                                                           hx-swap="innerHTML"
                                                           hx-indicator="#loading-indicator">
                                                    <span class="form-selectgroup-label">
                                                        <div class="font-weight-medium">{$party.name}</div>
                                                    </span>
                                                </label>
                                            {/volist}
                                        </div>
                                        {if empty($parties)}
                                            <div class="alert alert-warning mt-2">
                                                您还没有加入任何派对，请先
                                                <a href="/user/party/create" class="alert-link">创建派对</a>
                                                或
                                                <a href="/user/party/join" class="alert-link">加入派对</a>
                                            </div>
                                        {/if}
                                    </div>
                                </div>

                                <div id="party-details">
                                    <!-- 派对详情将通过HTMX动态加载 -->
                                </div>

                                <div id="loading-indicator" class="htmx-indicator">
                                    <div class="d-flex justify-content-center">
                                        <div class="spinner-border text-primary" role="status">
                                            <span class="visually-hidden">加载中...</span>
                                        </div>
                                    </div>
                                </div>

                                <input type="hidden" id="party_id" name="party_id" required>
                                <input type="hidden" id="users" name="users" required>
                            </form>
                        </div>
                    </div>
                </div>

                <div class="col-lg-4">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">操作步骤</h3>
                        </div>
                        <div class="card-body">
                            <div class="row g-3">
                                <div class="col-12">
                                    <div class="d-flex align-items-center p-3 bg-primary-lt rounded">
                                        <div class="flex-shrink-0">
                                            <span class="avatar bg-primary text-primary-fg rounded-circle">
                                                <span class="avatar-text">1</span>
                                            </span>
                                        </div>
                                        <div class="flex-fill ms-3">
                                            <div class="font-weight-medium">选择派对</div>
                                            <div class="text-muted small">选择要添加收款项的派对</div>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-12">
                                    <div class="d-flex align-items-center p-3 bg-success-lt rounded">
                                        <div class="flex-shrink-0">
                                            <span class="avatar bg-success text-success-fg rounded-circle">
                                                <span class="avatar-text">2</span>
                                            </span>
                                        </div>
                                        <div class="flex-fill ms-3">
                                            <div class="font-weight-medium">选择用户</div>
                                            <div class="text-muted small">选择需要分摊费用的用户</div>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-12">
                                    <div class="d-flex align-items-center p-3 bg-warning-lt rounded">
                                        <div class="flex-shrink-0">
                                            <span class="avatar bg-warning text-warning-fg rounded-circle">
                                                <span class="avatar-text">3</span>
                                            </span>
                                        </div>
                                        <div class="flex-fill ms-3">
                                            <div class="font-weight-medium">填写详情</div>
                                            <div class="text-muted small">填写收款项的详细信息</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="mt-4 p-3 bg-light rounded">
                                <div class="d-flex align-items-center">
                                    <svg class="icon text-info me-2" fill="none" stroke="currentColor"
                                         viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                    </svg>
                                    <div class="text-muted small">
                                        <strong>提示：</strong>选择派对后，系统会自动加载相关选项
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
    function updateAmount() {
        const totalAmountInput = document.getElementById('totalamount');
        const amountInput = document.getElementById('amount');
        const totalAmount = parseFloat(totalAmountInput.value);
        const selectedUsers = getSelectedUsers();
        const userCount = selectedUsers.length;

        if (userCount > 0 && totalAmount > 0) {
            const amount = totalAmount / userCount;
            amountInput.value = amount.toFixed(2);
        }

        updateSelectedUserCount(userCount);
        document.getElementById('users').value = JSON.stringify(selectedUsers);
    }

    function getSelectedUsers() {
        const users = [];
        const checkboxes = document.querySelectorAll('input[name="users[]"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                users.push(checkbox.value);
            }
        });
        return users;
    }

    function updateSelectedUserCount(count) {
        document.getElementById('selectedUserCount').textContent = count;
    }
</script>

{include file="/footer"}
