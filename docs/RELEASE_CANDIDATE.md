# v0.2 Release Candidate Handoff

状态：候选四格 CI 已通过；尚未发布

## 当前基线

- 当前 Git 基线：`da6a594`（本地归档提交）
- 当前包版本：`0.1.0`
- 目标候选版本：`0.2.0`，需人工放行后才修改
- 当前状态：代码、测试和本地打包链路已完成；本次候选 commit/push 已获批准
- 私有远端：`https://github.com/ShinonomeAya/git-graph-mcp`，已配置为本地
  `origin`，候选 `master` 已推送至提交 `3224cd8`

## 已完成证据

- 全量测试：44 项通过；
- 临时 Node.js 22.23.2 与 24.19.0 的 Windows 运行时预检：均通过 44 项；
- 临时 Node.js 22.23.2 与 24.19.0 的清洁打包安装预检：均通过；
- 清洁临时安装：CLI 与官方 MCP 客户端通过；
- MCP 工具：7 个工具可见，结果包含 `schemaVersion: 1`；
- Claude Code 项目级连接：`git-graph` 为 `Connected`；
- 官方 npm registry 安全审计：0 vulnerabilities；
- npm 包 allowlist 和 Windows TTY 验收通过。
- GitHub Actions run `32940965021`：Windows/Ubuntu × Node 22/24 四格全部通过。

## 外部放行前置条件

1. [x] 将本次候选提交推送到私有 remote，运行 Windows/Ubuntu × Node 22/24 四格 CI；
2. [x] 四格 CI 全部通过并记录构建结果；
3. 用户确认 `0.2.0` 版本、变更记录和发布窗口；
4. [x] 用户已批准并完成候选 commit/push；tag 和 npm publish 仍需单独批准。

## 回滚方案

- 在任何外部发布前，保持当前工作树和 `da6a594` 本地归档不变；
- 若 CI 或人工验收失败，停止放行并修复，不修改已发布版本；
- 若用户批准后已推送但未发布，回退候选分支到上一提交；
- 若 npm 已发布，停止继续推广并按 npm 版本策略发布修复版本，不覆盖已有版本；
- 发布后首小时检查：CLI smoke、MCP handshake、工具列表、错误日志和用户反馈。

## 禁止自动执行

本阶段仅执行已获用户明确批准的候选 `git commit` 与 `git push`；不会自动执行
`git tag`、`npm publish` 或版本升级。其余外部状态变更仍需要用户明确批准。
