# BetterBillSplitter

多人费用分摊应用。后端使用 Go、[gocraft](https://github.com/micoya/gocraft)、Gin 与 GORM，前端使用 React、Vite 和 Ant Design。

## 功能

- 派对创建、邀请、成员管理与归档快照
- 精确到分的多人记账、自定义分摊与多币种换算
- 债务抵消和最优支付方案、CSV 下载与批量结清
- Access Token + 可轮换 Refresh Token
- TOTP、Passkey/WebAuthn、FIDO2 二步验证
- 数字验证码、Cloudflare Turnstile、hCaptcha 与 Cap
- 管理员用户、派对、币种和系统设置管理

金额在 Go 中始终使用整数分计算，不经过浮点数。核心金额与结算算法包含确定性、边界和随机属性测试。

## Docker 部署

需要 Docker 与 Docker Compose。

```bash
# 先修改 config.yaml 中的数据库 DSN 和 JWT secret；如果修改数据库密码，
# 同步修改 docker-compose.yml 中 mariadb.environment。
docker compose up -d
```

默认访问地址是 `http://127.0.0.1:17985`。Compose 启动：

- `web`：Go API 与构建后的 SPA，容器端口 8000；
- `mariadb`：数据持久化在 `./data/mariadb`；
- 归档快照持久化在 `./data/archive`。

升级旧 PHP 版本时直接复用原 MariaDB 数据目录。Go 迁移器沿用 Phinx 的 `migrations` 表和原版本号，已执行的 PHP 迁移不会重复运行，后续 Go 迁移会接着写入同一张表。

创建管理员：

```bash
docker compose exec web better-bill-splitter createAdmin admin 'replace-with-a-strong-password'
```

反向代理或正式域名部署 Passkey 时，建议设置：

```yaml
app:
  webauthn:
    rp_id: bills.example.com
    rp_origins: ["https://bills.example.com"]
    display_name: BetterBillSplitter
  jwt:
    refresh_cookie_secure: true
```

## 本地开发

后端需要 Go 1.25.7 或更高版本及 MariaDB：

```bash
go test ./...
go run ./cmd/server
```

前端开发服务器会把 `/api` 与 `/captcha` 代理到 `127.0.0.1:8000`：

```bash
cd frontend
npm ci
npm run dev
```

生产构建：

```bash
npm --prefix frontend run build
go build -o better-bill-splitter ./cmd/server
```

所有应用配置集中在 `config.yaml`，不再读取 `.env`。数据库和 Redis 连接均使用 gocraft DAO 配置；DSN 中已经提供可直接修改的 MariaDB 样例。

## CI

所有分支 push 和所有 pull request 都运行 `go test ./...`。发布镜像的工作流也会先执行完整测试，测试成功后才构建并推送多架构镜像。
