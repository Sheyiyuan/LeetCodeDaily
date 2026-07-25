# LeetCodeDaily 隐私政策

最后更新：2026-07-24

LeetCodeDaily 是一个仅面向 `leetcode.cn` 的 Chrome 扩展，用于记录 Accepted 活动，并在用户明确授权后把题解同步到用户选择的 GitHub 仓库。

## 收集和处理的数据

- 力扣中国站：登录状态、用户名、头像、题量统计、题目内容、Accepted 提交 ID、语言、时间和代码。题目名称和描述会同步到目标 GitHub 仓库；Cookie 只由已登录的 `leetcode.cn` 页面向该站发起请求，不会发送到 LeetCodeDaily 服务端。
- GitHub：GitHub 数字用户 ID、登录名、用户填写的目标仓库和分支。OAuth App 的 `repo` scope 覆盖当前账号全部仓库；GitHub access token 仅保存在浏览器会话存储，OAuth credential 经 AES-GCM 加密后保存在服务端。
- 活动数据：日期、当天 Accepted 次数和不同题目数。服务端只接收每日聚合，不接收题目正文、代码、LeetCode Cookie、LeetCode 用户名或头像。
- 本地设置：时区、目标仓库、分支、根目录、热力图公开开关和同步任务状态。

## 使用目的

这些数据仅用于显示刷题统计、恢复同步任务、向用户授权的 GitHub 仓库写入 README/题解，以及生成用户主动开启的公开 SVG 热力图。不出售数据，不用于广告，不进行与产品单一用途无关的分析。

## 数据共享

题目和代码由扩展直接发送到 GitHub API。每日聚合与 GitHub 授权数据发送到 LeetCodeDaily Cloudflare Worker。除完成这些功能所需的 LeetCode、GitHub 和 Cloudflare 外，不向第三方披露数据，法律要求除外。

## 保存与安全

- 本地数据保存在 Chrome storage 和 IndexedDB，直至用户删除扩展数据或使用删除账户功能。
- 产品会话最长 30 天；过期 OAuth 尝试、一次性 grant、会话和限流记录会定期清理。
- 服务端不记录 OAuth code、token、题解代码、题目正文或请求体。
- 公开热力图默认关闭，用户开启后 GitHub 登录名、年份和每日聚合会通过固定 SVG URL 公开。

## 用户权利与删除

用户可在扩展设置页关闭公开热力图、断开 GitHub，或点击“删除账户数据”。删除账户会删除服务端账户、凭证、会话、每日活动和热力图设置，并清理本地同步账本与凭证。卸载扩展会由 Chrome 删除扩展本地存储。

## 联系与变更

发布前需在 Chrome Web Store 支持页面填写可接收邮件或问题反馈的公开联系方式。本政策发生实质变化时会更新日期，并在商店发布说明中告知用户。
