<div class="card mb-3">
    <div class="card-header">
        <h3 class="card-title">添加货币</h3>
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
        <form hx-post="/admin/currency/add" hx-target="body" hx-swap="none"
              hx-on::after-request="if(event.detail.xhr.status === 200) { location.reload(); }">
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label required">货币代码</label>
                        <input type="text" class="form-control" name="code" placeholder="如：usd" required
                               pattern="[a-z]{3}" title="请输入3位小写字母">
                        <div class="form-hint">3位小写字母，如：usd, eur, gbp</div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label required">货币符号</label>
                        <input type="text" class="form-control" name="symbol" placeholder="如：$" required>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label required">中文名称</label>
                        <input type="text" class="form-control" name="name" placeholder="如：美元" required>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">英文名称</label>
                        <input type="text" class="form-control" name="name_en" placeholder="如：US Dollar">
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="mb-3">
                        <label class="form-label">小数位数</label>
                        <select class="form-select" name="decimal_places">
                            <option value="0">0位小数</option>
                            <option value="2" selected>2位小数</option>
                            <option value="3">3位小数</option>
                            <option value="4">4位小数</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="form-footer">
                <button type="submit" class="btn btn-primary">添加货币</button>
                <button type="button" class="btn btn-secondary"
                        onclick="document.getElementById('currencyFormContainer').innerHTML = ''">
                    取消
                </button>
            </div>
        </form>
    </div>
</div>
