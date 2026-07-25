# Chrome 权限用途说明

## `storage`

保存用户设置、短期产品会话、GitHub access token 的浏览器会话副本，以及可恢复的本地同步状态。GitHub access token 不写入持久化 local storage。

## `alarms`

唤醒 Manifest V3 Service Worker，恢复临时失败的提交、历史活动回填和用户主动启动的历史代码导入。

## `identity`

通过 `chrome.identity.launchWebAuthFlow` 完成 GitHub OAuth App 授权，并使用扩展专属的 `chromiumapp.org` 回调地址。授权请求使用经典 `repo` scope。

## `https://leetcode.cn/*`

在力扣中国站页面识别当前 Accepted，并由已登录页面向同站受限接口查询账号、题目和提交详情。Cookie 不离开 `leetcode.cn`。

## `https://api.github.com/*`

读取用户手动填写的目标仓库分支，并使用 Git Data API 原子写入题目 README 与题解代码。OAuth App 的 `repo` scope 覆盖用户全部仓库，插件只操作设置页指定的仓库。

## `https://leetcode-daily-api.deshengl331.workers.dev/*`

完成 GitHub OAuth token 交换/刷新、产品会话、每日聚合上传、热力图设置和账户数据删除。题目正文与代码不经过该服务。

扩展不申请浏览历史、下载、剪贴板、通知、定位、摄像头或麦克风权限。
