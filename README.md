# LeetCodeDaily

一个只面向 `leetcode.cn` 的 Chrome 扩展：记录 Accepted、把题目 README 与题解代码同步到 GitHub，并生成可嵌入 GitHub Profile README 的纯 SVG 年度热力图。

## 当前实现

- 读取力扣中国站登录状态、头像与难度题量，不回退到 `leetcode.com`
- 监听 Accepted，补全提交代码与题目信息并保存在 IndexedDB
- README 只保留中文题名和题目描述，不生成 Markdown 标题、链接或机器元数据
- 题解文件按题目 slug 命名，例如 `two-sum.ts`，只保留题目链接和可读提交时间注释
- 使用 GitHub Git Data API，在一次 commit 中原子更新 README 与题解
- GitHub App Web Flow、PKCE、一次性授权凭证和 access token 自动续期
- refresh token 仅在 Worker 端以 AES-GCM 加密保存
- 按用户时区聚合每日 Accepted，生成固定用户名地址的纯 SVG 热力图
- 工具栏绿色 `✓` 与同步失败红色 `!`

架构、领域模型、产品决策与风险记录见 [`docs/`](docs/)。

后续 Agent 接手前请先阅读 [`docs/agent-handoff.md`](docs/agent-handoff.md)，其中记录了线上资源、当前阻塞点和精确续接步骤。

## 项目结构

```text
apps/
  extension/          Chrome Manifest V3 扩展
  api/                Cloudflare Worker + D1
packages/
  domain/             领域模型、时区聚合和幂等键
  leetcode-cn/        力扣中国站 GraphQL client
  problem-markdown/   README 与题解文件生成
  github-sync/        GitHub 原子提交 client
```

## 本地开发

要求：Node.js、pnpm，以及一个 Cloudflare 账号。

```bash
pnpm install
pnpm typecheck
pnpm test:run
pnpm build
```

复制 `apps/api/.dev.vars.example` 为 `apps/api/.dev.vars`，填入 GitHub App 配置。复制 `apps/extension/.env.example` 为 `apps/extension/.env.local`，把 API 地址指向本地 Worker 或已部署域名。

先执行 D1 migrations，再启动 Worker 和扩展开发构建：

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply leetcode-daily --local
pnpm dev
```

```bash
cd apps/extension
pnpm dev
```

开发预览页（使用 mock 数据，不会写入真实账号或 GitHub）:

```text
http://127.0.0.1:5173/preview.html?view=popup
http://127.0.0.1:5173/preview.html?view=options
```

预览页只用于视觉、窄屏和键盘回归，生产构建不会包含 mock 数据。

生产构建位于 `apps/extension/dist`，可通过 Chrome 的“加载已解压的扩展程序”载入。

## 首次使用

下载发布包 `release/leetcode-daily-0.1.0.zip` 后解压，在 `chrome://extensions` 开启“开发者模式”，选择“加载已解压的扩展程序”并选中解压目录。正式商店发布后可直接从商店安装；两种安装方式使用相同的功能流程。

1. 打开 `https://leetcode.cn/` 并登录力扣中国站，至少保留一个力扣页面打开。
2. 点击扩展图标，打开“GitHub 与同步设置”，连接 GitHub。
3. 在 GitHub App 安装设置中只授权要写入的仓库，并确认 `Contents` 权限为 `Read and write`。回到设置页刷新仓库列表，选择仓库和分支后保存。
4. 在力扣题目页提交并通过。扩展会先校验官方 submission detail，再把 `README.md` 和对应语言题解作为一次原子 commit 写入目标仓库。
5. 若要显示历史活动，保持力扣页面打开，扩展会在后台逐题回填。历史代码不会自动写入；在设置页确认目标仓库后点击“开始导入”。
6. 在设置页开启“公开刷题热力图”，保存后复制 SVG 地址或 README `<picture>` 片段。公开开关默认关闭。

如果仓库列表为空，请先在 GitHub 的 App 安装设置中批准目标仓库和新增权限，再回到扩展刷新列表。同步失败时 Popup 会显示原因并提供“重试”；无需重新提交题目。

## GitHub App 配置

GitHub App 需要：

- Callback URL：`<PUBLIC_BASE_URL>/v1/auth/github/callback`
- Repository permission：`Contents: Read and write`
- 开启 expiring user access tokens
- 安装范围由用户选择目标仓库

题目目录默认直接放在仓库根目录（根目录设置可以留空），例如：

```text
1-two-sum/
  README.md
  two-sum.cpp
```

如果在 GitHub App 创建后才把 `Contents` 从只读改为 `Read and write`，还需要在
GitHub 的 App 安装设置中批准新增权限。批准后，在扩展设置页断开并重新连接
GitHub，再从 Popup 重试已有任务；不需要重新提交 LeetCode 题目。

将 Chrome 商店最终扩展 ID 写入：

- Worker 的 `ALLOWED_EXTENSION_ORIGIN`：`chrome-extension://<extension-id>`
- 扩展 manifest 的 API `host_permissions`

`TOKEN_ENCRYPTION_KEY` 必须是随机 32 字节密钥的 Base64。`GITHUB_CLIENT_SECRET` 和该密钥只能通过 Worker secrets / `.dev.vars` 配置，不能进入扩展包或提交到仓库。

密钥轮换时设置 `TOKEN_ENCRYPTION_KEY_RING`，例如 `{"activeVersion":2,"keys":{"1":"<old-base64>","2":"<new-base64>"}}`。保留旧 key，直到 D1 中 `key_version` 全部变为新版本，再删除旧 key。

## 热力图

用户连接 GitHub 并开启公开热力图后，地址固定为：

```text
https://<api-domain>/heatmap/github/<github-login>.svg
```

GitHub Profile README 示例（根据 GitHub 深浅主题自动选择）：

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://<api-domain>/heatmap/github/<github-login>.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://<api-domain>/heatmap/github/<github-login>.svg?theme=light">
  <img alt="LeetCode Activity" src="https://<api-domain>/heatmap/github/<github-login>.svg">
</picture>
```

可用查询参数：`theme=auto|light|dark`；`year=2026` 可固定展示自然年。省略年份时展示以用户时区今天为结束日的滚动 365 天窗口。

## 发布前仍需完成

- 用真实登录账号验证并固化 `leetcode.cn` 的账号题量、提交详情和历史分页响应 fixture
- 接入真实 GitHub App / D1 / Worker 域名做端到端授权与提交测试
- 应用 `0003_rate_limits.sql`、`0004_activity_snapshots.sql`、`0005_auth_grant_key_versions.sql` 并部署最新 Worker
- 公开隐私政策/支持页面，补充商店截图与可接收联系的邮箱
- 完成题目正文版权复核和 Chrome Web Store 后台配置

生成可上传商店的 zip：

```bash
pnpm extension:package
```
