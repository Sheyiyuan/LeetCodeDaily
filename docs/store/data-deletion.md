# 数据删除说明

## 在扩展中删除

1. 打开 LeetCodeDaily 设置页。
2. 在“账户数据”区域点击“删除账户数据”。
3. 确认删除。

该操作调用 `DELETE /v1/account`，通过数据库外键级联删除 GitHub 账户映射、加密 refresh token、产品会话、每日活动、热力图设置和一次性授权记录；随后清理本地 IndexedDB 同步账本与 GitHub 凭证。操作不可撤销，GitHub 仓库中已经创建的 commit 不会被删除。

“断开 GitHub”只撤销当前产品会话并删除本地凭证，不等同于删除全部服务端账户数据。用户还可在 GitHub 的 Applications 设置中撤销 LeetCodeDaily OAuth App 授权。

卸载扩展会删除 Chrome 管理的本地扩展数据，但不会自动改写 GitHub 仓库；需要同时删除服务端数据时，应先在设置页执行上述操作。
