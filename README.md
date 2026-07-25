<div align="center">

<img src="apps/extension/public/icons/icon-128.png" width="96" alt="LeetCodeDaily" />

# LeetCodeDaily

![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)

记录 LeetCode 的每一次 Accepted 提交，把题解整理到 GitHub。

自动保存题目与代码、恢复失败的同步任务，并生成可以嵌入 GitHub Profile README 的刷题热力图。

</div>

---

## 这是什么

LeetCodeDaily 是一个只面向 [力扣中国站](https://leetcode.cn/) 的 Chrome 扩展。它监听当前登录账号的 Accepted，向力扣中国站补全权威提交详情，将题目 README 和题解代码直接写入你指定的 GitHub 仓库，同时按你的时区统计每日刷题活动。

它由两部分组成：

- **Chrome 扩展**：负责页面事件、提交详情、本地 IndexedDB 账本、同步队列和设置界面。
- **Cloudflare Worker + D1**：负责 GitHub 授权与令牌刷新、每日活动聚合和公开 SVG 热力图。

题目正文和代码不会经过 LeetCodeDaily Worker，而是由扩展直接发送到 GitHub API。

## 功能概览

### 自动记录 Accepted

- 只读取 `leetcode.cn`，不会回退到 `leetcode.com`。
- 监听页面中的 Accepted 候选，再通过官方 submission detail 校验，避免把普通页面文本当成提交事实。
- 在本地保存提交、题目、活动和同步任务，浏览器重启后可以继续处理。

### 同步题解到 GitHub

- 手动选择目标仓库、分支和根目录。
- 同题同语言覆盖同一路径，不同语言可以并存；失败任务支持重试。

默认目录结构如下：

```text
1-two-sum/
├── README.md
└── two-sum.cpp
```

### 活动统计与热力图

- Popup 展示已解决题数、难度分布、近 60 天活动和同步状态。
- 按用户设置的 IANA 时区聚合自然日。
- 颜色强度依据当天通过的不同题目数，同时保留 Accepted 总次数。
- 生成无脚本、无交互的纯 SVG，可用 `<picture>` 自动适配 GitHub 深浅主题。
- [热力图样式参考](https://github.com/yuhhhy)

## 使用流程

1. 安装扩展，并登录 [leetcode.cn](https://leetcode.cn/)。
2. 打开扩展设置，连接 GitHub，填写已经创建好的 `owner/repository`。
3. 读取并选择目标分支，按需设置根目录、时区和热力图公开开关。
4. 在力扣提交并通过；扩展会自动补全提交详情并创建 GitHub  commit。
5. 可以在设置页主动进行历史题解导入。


## 本地安装

### 通过 Releases 安装

1. 前往 [Releases](https://github.com/yuhhhy/LeetCodeDaily/releases)，打开最新版本
2. 在 Assets 中下载 `LeetCodeDaily-<版本>.zip`
3. 将 ZIP 文件解压到本地目录
4. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`
5. 开启“开发者模式”
6. 点击“加载已解压的扩展程序”，选择解压后的目录

发布包通过 manifest 公钥固定扩展 ID 为 `lelfpkchpoacfjmdkadkodnjddddpkfj`。新用户应直接安装包含该公钥的版本；旧安装若已能正常使用可以继续保留，遇到 `invalid_redirect_uri` 的旧安装需要移除后重新加载新版目录，并重新填写本地设置。

### 从源码构建安装

1. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 运行 `npm run build`，然后选择本项目生成的 `dist` 目录


## 开发

环境要求：Node.js 和 pnpm。

```bash
pnpm install
pnpm typecheck
pnpm test:run
pnpm build
```

构建完成后，打开 `chrome://extensions`，开启“开发者模式”，选择 `apps/extension/dist` 加载扩展。

## 隐私与数据删除

完整说明见：[隐私政策](docs/store/privacy-policy.md) · [权限用途](docs/store/permissions.md) · [数据删除](docs/store/data-deletion.md)

## 免责声明

- 本项目只用于管理用户有权访问和保存的刷题记录，不提供题目破解、绕过授权或其他违规能力。
- 用户需要自行确认题目正文、代码和第三方服务的使用符合适用的服务条款与法律要求。
- LeetCodeDaily 与力扣、GitHub、Chrome 或 Cloudflare 没有官方隶属关系。
