# 🎉 BetterBillSplitter - 智能团体开支管理系统

<div align="center" style="display: flex; align-items: center; justify-content: center;">
  <img src="public/static/imgs/taffynya_agadgqyaaofp2fq.png" width="64" style="margin-right: 20px;">
  <h2 style="margin: 0 20px;">派对费用管理专家</h2>
  <img src="public/static/imgs/taffynya_agadvgmaauwawfq.png" width="64" style="margin-left: 20px;">
</div>

一个现代化的团体开支管理程序，基于 ThinkPHP8 框架构建，支持**派对创建与管理**、多人协作记账，并智能计算最优支付方案。

## ✨ 核心功能特性

### 🎯 **派对系统 (Party System)**

- **创建派对**：用户可以创建专属派对，设置派对名称、描述和时区
- **邀请加入**：通过唯一邀请码邀请其他用户加入派对
- **派对管理**：派对所有者可以管理成员、查看统计、生成最优支付方案
- **时区支持**：支持全球时区设置，自动处理夏令时/冬令时

### 💰 **智能记账系统**

- **多货币支持**：支持多种货币类型
- **团体分摊**：支持多人分摊同一笔费用
- **实时统计**：实时显示每个人的收支情况
- **支付状态管理**：发起人可以标记项目为已支付
- **高精度计算**：基于 bcmath 提供的高精度数学计算，确保财务数据的准确性

### 🧮 **最优支付算法**

- **智能计算**：自动计算最优化的支付方案，减少转账次数
- **高精度计算**：使用 bcmath 进行精确的金额计算和汇率转换
- **数据导出**：支持导出最优支付数据
- **批量清空**：派对所有者可以批量标记项目为已支付

### 👥 **用户管理系统**

- **多级权限**：支持普通用户和管理员角色
- **安全认证**：支持多种MFA认证方式（TOTP、WebAuthn、FIDO）
- **密码管理**：管理员可以修改用户密码和权限

## 🎪 使用场景

### 🏖️ **旅行出游**

- 朋友聚会、家庭旅行、公司团建
- 记录住宿、餐饮、交通等各项费用
- 自动计算每个人应支付的金额

### 🏠 **合租生活**

- 室友间的日常开支分摊
- 水电费、网费、清洁费等费用管理
- 定期结算，避免费用纠纷

### 🎓 **学生群体**

- 班级活动、社团聚会费用管理
- 学习资料、活动门票等费用分摊
- 简单易用的界面，适合学生使用

### 💼 **商务合作**

- 项目团队的费用管理
- 出差、会议等商务活动费用
- 专业的费用统计和报表

### 🎉 **派对活动**

- 生日派对、节日聚会费用管理
- 活动策划、场地租赁等费用分摊
- 支持时区设置，适合国际化活动

## 🚀 快速开始

### 📋 环境要求

请确保服务器已安装 Docker 和 Docker Compose。

### 🐳 使用 Docker 部署

#### 1. 下载配置文件

```bash
mkdir expense && cd expense
wget https://github.com/SideCloudGroup/BetterBillSplitter/raw/refs/heads/main/.example.env -O .env
wget https://github.com/SideCloudGroup/BetterBillSplitter/raw/refs/heads/main/docker-compose.yml
wget https://github.com/SideCloudGroup/BetterBillSplitter/raw/refs/heads/main/nginx.conf
```

#### 2. 配置环境变量

根据项目需求修改 `.env` 文件中的变量，例如数据库连接信息、端口配置等。

### 3. 启动 Docker Compose

在 `.env` 文件配置完成后，执行以下命令启动 Docker Compose：

```bash
# 启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f
```

#### 4. 配置反向代理

您可以使用 Nginx 或 Cloudflare Tunnel 等工具配置反向代理，将服务暴露到公网。

#### 5. 创建管理员账户

```bash
docker compose exec php-fpm php think createAdmin <username> <password>
```

## 🎯 使用指南

### 👤 用户注册与登录

1. **注册账户**：访问注册页面创建新账户
2. **登录系统**：使用用户名和密码登录
3. **MFA认证**：支持TOTP、WebAuthn、FIDO等多种二次认证方式

### 🎉 创建和管理派对

#### 创建派对

1. 点击"创建派对"按钮
2. 填写派对名称、描述
3. 选择时区（支持全球时区）
4. 系统自动生成邀请码

#### 加入派对

1. 使用邀请码加入派对
2. 查看派对成员和费用统计
3. 参与费用分摊和支付

#### 派对管理

- **查看统计**：实时查看派对费用统计
- **成员管理**：查看和管理派对成员
- **最优支付**：生成最优化的支付方案
- **数据导出**：导出支付数据用于结算

### 💰 费用管理

#### 添加费用项目

1. 选择派对
2. 填写项目描述和金额
3. 选择分摊用户
4. 选择货币类型
5. 提交保存

#### 费用统计

- **个人统计**：查看个人收支情况
- **派对统计**：查看派对整体费用
- **支付状态**：跟踪已支付和未支付项目
- **高精度计算**：所有金额计算都基于 bcmath 高精度数学库，确保计算结果的准确性

### 🧮 最优支付计算

#### 查看最优方案

1. 在派对页面点击"查看最优支付"
2. 查看优化后的支付方案
3. 下载支付数据用于结算

**算法特点：**

- **高精度计算**：基于 bcmath 的精确数学运算，避免浮点数精度误差
- **智能优化**：自动计算最优化的支付方案，减少转账次数
- **多货币支持**：支持不同货币间的精确汇率转换

#### 批量操作

- **下载数据**：所有成员都可以下载支付数据
- **清空记录**：只有派对所有者可以清空已支付记录

## 📞 支持与反馈

如果您在使用过程中遇到问题，欢迎：

- 🐛 [提交 Issue](https://github.com/SideCloudGroup/BetterBillSplitter/issues)

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

---

<div align="center">
  <p>🎉 <strong>让每一次聚会都变得简单而快乐！</strong> 🎉</p>
  <p>💖 感谢使用 BetterBillSplitter 💖</p>
</div>
