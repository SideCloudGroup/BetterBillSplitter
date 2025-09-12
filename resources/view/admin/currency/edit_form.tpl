<div class="card mb-3">
    <div class="card-header">
        <h3 class="card-title">编辑货币</h3>
        <div class="card-actions">
            <button type="button" class="btn btn-ghost-secondary"
                    onclick="document.getElementById('currencyFormContainer').innerHTML = ''">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                关闭
            </button>
        </div>
    </div>
    <div class="card-body">
        <form hx-post="/admin/currency/edit" hx-target="body" hx-swap="none"
              hx-on::after-request="if(event.detail.xhr.status === 200) { location.reload(); }">
            <input type="hidden" name="code" value="{$currency.code}">
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">货币代码</label>
                        <input type="text" class="form-control" value="{$currency.code|strtoupper}" readonly>
                        <div class="form-hint">货币代码不可修改</div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label required">货币符号</label>
                        <input type="text" class="form-control" name="symbol" value="{$currency.symbol}" required>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label required">中文名称</label>
                        <input type="text" class="form-control" name="name" value="{$currency.name}" required>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">英文名称</label>
                        <input type="text" class="form-control" name="name_en" value="{$currency.name_en}">
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">小数位数</label>
                        <select class="form-select" name="decimal_places">
                            <option value="0" {if $currency.decimal_places == 0}selected{/if}>0位小数</option>
                            <option value="2" {if $currency.decimal_places == 2}selected{/if}>2位小数</option>
                            <option value="3" {if $currency.decimal_places == 3}selected{/if}>3位小数</option>
                            <option value="4" {if $currency.decimal_places == 4}selected{/if}>4位小数</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="form-footer">
                <button type="submit" class="btn btn-primary">保存修改</button>
                <button type="button" class="btn btn-secondary"
                        onclick="document.getElementById('currencyFormContainer').innerHTML = ''">
                    取消
                </button>
            </div>
        </form>
    </div>
</div>
