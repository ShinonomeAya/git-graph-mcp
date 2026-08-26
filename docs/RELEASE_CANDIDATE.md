# Release Candidate Readiness

状态：Phase 9 本地候选已完成；尚未改变仓库可见性、版本、tag、release 或 npm 状态。

## 当前基线

- 包版本保持 `0.1.0`，下一版本号需人工批准；
- 运行时基线为 Node.js 22+、Git on `PATH`；Node.js 20 仅作迁移检查；
- MCP 为本地 stdio，当前 12 个工具和 2 个只读 resources；
- action plan receipt 绑定 repo/head/index/status/ref 指纹，过期或漂移时 fail closed；
- 当前工作树只应包含本阶段提交，未自动推送、打 tag 或发布。

## 已验证证据

- `npm run check`：语法、71 个单元/集成测试、smoke、package allowlist 全部通过；
- `npm run test:package-install`：clean packed artifact 的 CLI、`.bin` launcher、MCP
  handshake 和 `doctor` 全部通过；
- `node .\bin\git-graph-mcp.js doctor --json --repo <repo>`：健康、无效仓库、失效配置、
  握手失败分别有稳定状态码，且不回显路径或配置值；
- `test/integration/mcp-stdio.test.js`：官方 MCP SDK initialize、tool/resource list/read
  与调用契约通过；
- `test/integration/safe-actions.test.js`、`test/unit/actions.test.js`：分支动作在计划
  过期、脏状态、HEAD 或 ref 漂移时拒绝且不改变 refs/index/worktree；
- `.github/workflows/ci.yml` 保留 Windows/Ubuntu × Node 22/24 矩阵，需以最新提交重新运行
  后才能作为远端证据。

## 放行清单（分别批准）

1. [x] 本地实现、测试、打包 allowlist 和安全边界审查；
2. [x] SECURITY.md、CONTRIBUTING.md、README 和 capability map 与实现一致；
3. [ ] 用户批准仓库公开或保持私有；
4. [ ] 用户批准版本号和 CHANGELOG 发布内容；
5. [ ] 用户批准创建 tag；
6. [ ] 用户批准 GitHub release；
7. [ ] 用户批准 npm publish。

## 回滚与禁止自动执行

在外部放行前保持当前提交可回溯；失败时停止发布评审并修复，不覆盖已发布版本。除非
用户逐项明确批准，本项目不会自动修改可见性、版本、tag、release、remote 或 npm。
