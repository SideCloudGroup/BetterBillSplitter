{__NOLAYOUT__}
<div class="mb-4">
    <h4 class="mb-3">选择用户</h4>
    <div class="mb-3">
        <label class="form-label">选择用户</label>
        <div class="mb-2">
            <span class="text-muted">已选人数：</span>
            <span id="selectedUserCount" class="badge bg-primary text-primary-fg fs-6">0</span>
        </div>
        <div class="form-selectgroup">
            {volist name="members" id="member"}
                <label class="form-selectgroup-item">
                    <input type="checkbox" name="users[]" value="{$member.id}"
                           class="form-selectgroup-input" onchange="updateAmount()">
                    <span class="form-selectgroup-label">{$member.username}</span>
                </label>
            {/volist}
        </div>
    </div>
</div>

<div class="mb-4">
    <h4 class="mb-3">填写收款项详情</h4>

    <div class="mb-3">
        <label class="form-label required">收款项名称</label>
        <input autocomplete="off" class="form-control" id="description"
               name="description" type="text"
               placeholder="例如：午餐费用、交通费等" required>
    </div>

    <div class="row">
        <div class="col-md-6">
            <div class="mb-3">
                <label class="form-label">人均金额</label>
                <input autocomplete="off" class="form-control" id="amount" name="amount"
                       type="number" step="0.01" placeholder="0.00" required>
            </div>
        </div>
        <div class="col-md-6">
            <div class="mb-3">
                <label class="form-label">或总金额</label>
                <input autocomplete="off" class="form-control" id="totalamount"
                       name="totalamount" type="number" step="0.01" placeholder="0.00">
            </div>
        </div>
    </div>

    <div class="mb-3">
        <label class="form-label required">货币单位</label>
        <select class="form-select" id="unit" name="unit" required>
            {foreach $supported_currencies as $currency_code}
                <option value="{$currency_code}" {if $currency_code == $base_currency}selected{/if}>
                    {$currency_code|strtoupper}
                </option>
            {/foreach}
        </select>
        <div class="form-hint">货币选项根据派对设置自动更新</div>
    </div>

    <div class="form-footer">
        <button class="btn btn-primary btn-save" type="submit">
            保存收款项
        </button>
    </div>
</div>

<script>
    document.getElementById('totalamount').addEventListener('input', updateAmount);
    document.getElementById('party_id').value = '{$party.id}';
    updateAmount();
</script>
