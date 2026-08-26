# Release Candidate Readiness

状态：技术发布门禁正在收口。GitHub 仓库当前仍为私有；`v0.2.0` tag 和
Release 已存在且保持不变，npm 未发布。T28/T29/T31 的修复位于其后的
`master` 提交，若公开最新代码，应单独准备 `v0.2.1` 补丁版本。

## 当前基线

- 包版本为 `0.2.0`；
- 运行时基线为 Node.js 22+、Git on `PATH`；Node.js 20 仅作迁移检查；
- MCP 为本地 stdio，当前 12 个工具和 2 个只读 resources；
- action plan receipt 绑定 repo/head/index/status/ref 指纹，过期或漂移时 fail closed；
- 默认 Git 读取保持只读，reset 只生成计划，分支创建需要显式调用；
- 当前维护分支最新技术修复提交为 `258315f`，不移动已发布的 `v0.2.0`。

## 已验证证据

- `npm test`：72 项测试全部通过；
- `npm run check`：语法、72 个单元/集成测试、smoke、package allowlist 全部通过；
- `npm run test:package-install`：clean packed artifact 已验证 CLI 的 graph、select、
  selected、MCP handshake 和 doctor；
- `npm audit --omit=dev --audit-level=high`：使用官方 `registry.npmjs.org`，
  结果为 `0 vulnerabilities`；
- `node .\bin\git-graph-mcp.js doctor --json --repo <repo>`：健康、无效仓库、失效配置、
  握手失败分别有稳定状态码，且不回显路径或配置值；
- `test/integration/mcp-stdio.test.js`：官方 MCP SDK initialize、tool/resource list/read
  与调用契约通过；
- `test/integration/safe-actions.test.js`、`test/unit/actions.test.js`：分支动作在计划
  过期、脏状态、HEAD 或 ref 漂移时拒绝且不改变 refs/index/worktree；
- GitHub Actions run `32952666371`：Windows/Ubuntu × Node 22/24 的 package install、
  check 和官方 registry audit 全部通过；后续提交需重新取得对应 run 证据。

## 放行清单（分别批准）

1. [x] 本地实现、测试、打包 allowlist 和安全边界审查；
2. [x] `SECURITY.md`、`CONTRIBUTING.md`、README 和 capability map 与实现一致；
3. [x] `0.2.0` 版本、CHANGELOG、tag 和 GitHub Release 已完成；
4. [ ] 用户批准将仓库公开；
5. [ ] 若公开最新 `master`，用户批准创建 `v0.2.1` 补丁版本、tag 和 Release；
6. [ ] 用户批准 npm publish（当前默认不发布）。

## 回滚与禁止自动执行

在外部放行前保持当前提交可回溯；失败时停止发布评审并修复，不覆盖已发布版本。
公开前应确认目标 commit、CI run、包清单和回滚 tag；公开后若匿名 smoke 失败，
先恢复 GitHub 私有可见性，再撤下对应 Release，最后保留失败证据。除非用户在
技术门禁通过后明确确认，本项目不会自动修改可见性、版本、tag、Release、remote
或 npm。
