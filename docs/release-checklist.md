# LeetCodeDaily 正式发布检查清单

本文用于记录 LeetCodeDaily 在正式对外发布前必须完成的事项。目标是让其他用户可以安装同一个正式扩展，使用项目提供的 Worker 授权自己的 GitHub 账号，并把题解同步到自己有写权限的仓库。

当前项目仍处于发布前阶段。`[x]` 表示已有实现或文档基础，`[ ]` 表示发布前仍需人工确认、真实环境验证或部署操作。

## 一、发布阻塞项

以下事项未完成前，不应把扩展作为稳定产品公开分发。

### 1. 固定正式扩展身份

- [x] Releases 解压安装包通过 manifest 公钥固定扩展身份。
- [x] Releases 扩展 ID 固定为 `lelfpkchpoacfjmdkadkodnjddddpkfj`。
- [x] 将 Releases ID 写入 Worker 的 `ALLOWED_EXTENSION_ORIGIN`：

  ```text
  chrome-extension://lelfpkchpoacfjmdkadkodnjddddpkfj
  ```

- [x] 更新 [apps/api/wrangler.jsonc](../apps/api/wrangler.jsonc) 及其生成的 Worker 类型定义。
- [ ] 部署 Worker 后验证 OAuth 回调地址确实是：

  ```text
  https://lelfpkchpoacfjmdkadkodnjddddpkfj.chromiumapp.org/github
  ```

- [ ] Chrome Web Store 发布前，将商店分配的 ID 加入 allowlist 并完成独立回归。

> 当前 allowlist 同时保留旧开发 ID `ihmpbdgefkfolkohjccehkchlafmjfcc`，用于迁移已有安装；稳定发布后应按计划移除。

### 2. 部署生产 Worker 和 D1

- [ ] 确定生产 API 域名，并设置 `PUBLIC_BASE_URL`。
- [ ] 在生产 Worker Secrets 中配置：
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `TOKEN_ENCRYPTION_KEY`
  - 如使用密钥轮换，配置 `TOKEN_ENCRYPTION_KEY_RING`
- [ ] 确认 `TOKEN_ENCRYPTION_KEY` 是随机生成的 32 字节 Base64 密钥，不能提交到 Git。
- [ ] 在生产 D1 数据库应用全部 migration（当前为 `0001` 至 `0005`）。
- [ ] 部署 Worker 后检查：

  ```bash
  curl https://<production-api-domain>/health
  ```

  返回的服务名应为 `leetcode-daily-api`，且状态为成功。

- [ ] 确认生产 Worker 的 CORS 只允许正式扩展来源和本地开发地址，不允许任意网站来源。
- [ ] 确认生产 Worker 的定时清理任务已启用，并能清理过期 session、OAuth grant 和限流记录。

### 3. 配置 GitHub OAuth App

- [ ] 使用生产 API 域名配置 Callback URL：

  ```text
  https://<production-api-domain>/v1/auth/github/callback
  ```

- [ ] 确认授权请求使用 `repo` scope，并在产品说明中明确该 scope 的实际范围。
- [ ] 确认 GitHub OAuth App 的 Client Secret 只存在于 Worker Secrets，不进入扩展包。
- [ ] 用一个非项目维护者 GitHub 账号完成授权，确认授权用户是自己的账号。
- [ ] 用该账号填写自己的 `owner/repository`，确认题解写入自己的仓库，而不是维护者仓库。
- [ ] 验证没有 GitHub 写权限的仓库会明确失败，不会被静默覆盖或写入其他仓库。
- [ ] 验证断开 GitHub、session 过期、重新授权和删除账户数据流程。

### 4. 完成真实端到端验证

使用生产候选扩展和生产 Worker，至少完成以下测试：

- [ ] 在 `leetcode.cn` 登录真实测试账号，确认账号信息和题量读取正确。
- [ ] 提交一次新的 Accepted，确认扩展能识别正确的 submission detail。
- [ ] 确认目标仓库只产生一个原子 commit，且同时包含题目 `README.md` 和对应语言题解。
- [ ] 确认同题同语言覆盖同一路径，不同语言可以并存。
- [ ] 模拟网络失败或 GitHub 暂时不可用，确认任务进入失败状态并可以重试。
- [ ] 关闭浏览器后重新打开，确认待处理任务可以恢复。
- [ ] 启动历史活动回填，确认按用户时区计算日期且重复运行不会产生重复活动。
- [ ] 启动历史代码导入，确认暂停、继续、失败报告和浏览器重启恢复正常。
- [ ] 开启公开热力图，确认透明背景、深浅主题、`year` 和 `colors` 参数正常。
- [ ] 关闭公开热力图，确认热力图不再展示该用户的活动数据。
- [ ] 用第二个 GitHub 账号重复最小流程，确认用户之间的 session、仓库和热力图数据互不串联。

## 二、安全、隐私与合规

- [ ] 发布 [隐私政策](store/privacy-policy.md)，并提供公开可访问的 URL。
- [ ] 发布 [数据删除说明](store/data-deletion.md)，明确删除云端数据不会删除 GitHub 已产生的 commit。
- [ ] 发布 [权限用途说明](store/permissions.md)，逐项说明 `storage`、`alarms`、`identity`、LeetCode、GitHub 和 Worker 权限。
- [ ] 提供公开的支持页面、问题反馈入口和可接收联系的邮箱。
- [ ] 确认隐私政策与实际行为一致：LeetCode Cookie 不发送到 Worker，题目正文和代码不经过 Worker。
- [ ] 检查日志中不包含 GitHub token、refresh token、OAuth code、LeetCode Cookie、题目正文或题解代码。
- [ ] 检查扩展包、source map、构建产物和 Git 历史中没有 secret、`.dev.vars` 或 `.env.local`。
- [ ] 评估 OAuth `repo` scope 的宽授权风险，并在连接 GitHub 前向用户清晰告知。
- [ ] 完成题目正文复制、传播和知识产权条款的法律或平台许可复核；未取得可靠授权时，应在发布前关闭或移除题目正文同步。
- [ ] 为账户删除、OAuth 撤销、密钥泄露、Worker 异常和 GitHub 权限错误准备处理流程。

## 三、Chrome Web Store 发布

- [ ] 准备商店名称、单一用途说明、详细介绍和分类。
- [ ] 准备至少覆盖以下流程的截图：Popup、GitHub/仓库设置、历史导入、公开热力图。
- [ ] 准备图标、宣传图和商店要求的其他尺寸素材。
- [ ] 在商店隐私实践问卷中如实填写数据收集、认证和第三方服务用途。
- [ ] 将隐私政策 URL、支持 URL 和联系邮箱填入商店后台。
- [ ] 用生产构建上传候选版本，检查 Manifest 权限、Host permissions、名称、版本号和图标。
- [ ] 确认商店审核安装后的扩展 ID 与 Worker `ALLOWED_EXTENSION_ORIGIN` 完全一致。
- [ ] 审核通过后，用全新浏览器配置文件完成一次安装和首次使用流程。

## 四、构建、版本与发布操作

`main` 分支提交通过 CI 后，`release` job 会读取扩展 `package.json` 的版本，自动创建或更新对应的 `vX.Y.Z` GitHub Release，并覆盖上传 `leetcode-daily-X.Y.Z.zip`。打包脚本会校验扩展版本号和 manifest 版本一致，发布新版本前必须同步更新两处。

发布候选版本前，在干净工作区执行：

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm extension:check
pnpm extension:package
```

- [ ] 更新扩展版本号、变更记录和商店发布说明。
- [ ] 确认扩展版本号与待发布的 Git tag 一致。
- [ ] 确认 `apps/extension/dist` 只包含生产资源，不包含 mock 预览数据、测试文件或本地配置。
- [ ] 在部署 Worker 前备份生产 D1，并记录当前 migration 版本。
- [ ] 先部署 Worker，再发布引用该 Worker 的扩展版本，避免扩展先上线后无法授权。
- [ ] 保存发布构建、Worker 部署版本、D1 migration 版本和配置变更记录。
- [ ] 为 Worker 和扩展准备回滚版本；回滚时不能误删用户 GitHub 仓库中的 commit。

## 五、上线后观察

- [ ] 观察授权成功率、授权失败原因、GitHub API 403/401、同步失败和 Worker 5xx。
- [ ] 观察 D1 写入量、限流命中率、Worker CPU/请求量和公开热力图访问量。
- [ ] 检查不同 GitHub 用户的活动数据没有串联。
- [ ] 定期轮换 `TOKEN_ENCRYPTION_KEY`，并按密钥环流程保留旧密钥至迁移完成。
- [ ] 收集不含 token、Cookie、题解代码和未公开题面内容的错误报告。
- [ ] 每次扩大权限、改变数据流、改变题目内容同步规则或变更第三方服务时，更新隐私政策和商店声明。

## 六、发布完成记录

正式发布后填写以下信息，便于后续维护：

| 项目 | 记录 |
| --- | --- |
| Chrome Web Store 扩展 ID | `<production-extension-id>` |
| 扩展版本 | `<version>` |
| Git tag | `<tag>` |
| Worker 域名 | `<production-api-domain>` |
| Worker 部署版本 | `<deployment-id-or-date>` |
| D1 migration 版本 | `<migration>` |
| GitHub OAuth App | `<app-name>` |
| 隐私政策 URL | `<public-url>` |
| 支持 URL | `<public-url>` |
| 发布日期 | `<YYYY-MM-DD>` |

发布前发现阻塞项时，应在本清单中保留未完成状态，并在发布记录中说明风险、临时措施和负责人。
