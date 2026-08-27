# Release Candidate Readiness

状态：`v0.2.2` 已正式发布并完成上线后核验；npm 未发布。

## 当前基线

- 发布包版本和当前公开稳定版均为 `0.2.2`；
- 运行时基线为 Node.js 22+、Git on `PATH`；Node.js 20 仅作迁移检查；
- MCP 为本地 stdio，当前 12 个工具和 2 个只读 resources；
- action plan receipt 绑定 repo/head/index/status/ref 指纹，过期或漂移时 fail closed；
- 默认 Git 读取保持只读，reset 只生成计划，分支创建需要显式调用；
- `v0.2.0`、`v0.2.1` 和 `v0.2.2` 均保持不可变；本次版本包含 T28–T33 之后的
  双语 README、固定包安装说明、MCP 工具目录和社区入口补齐；
- Release asset `git-graph-mcp-0.2.1.tgz` 已上传并完成 SHA256 校验；
  [`v0.2.2` Release](https://github.com/ShinonomeAya/git-graph-mcp/releases/tag/v0.2.2)
  asset 已上传并完成下载摘要复核。

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
- 历史 GitHub Actions run `32957109919`：Windows/Ubuntu × Node 22/24 的 package install、
  check 和官方 registry audit 全部通过，且 checkout/setup-node 已切换到维护中的
  action runtime。
- 当前 `master` CI run `33057318621` 和 `v0.2.2` tag CI run `33057337752`：
  Windows/Ubuntu × Node 22/24 全部通过，包含 package install、check 和官方 registry audit。
- Release 下载资产的 SHA-256/SHA-512 与本地构建值完全一致，GitHub asset 状态为 `uploaded`。
- 本地 `v0.2.2` 候选 tarball：`git-graph-mcp-0.2.2.tgz`，SHA-256 为
  `F9D70A394E847AC6EC9C8CBA90188D7B0F8A829B53A32E6E638B937B47914A11`，
  SHA-512 为
  `5F357D86472FAE7636D3E994E0141CA93C695AA8C7030C3287C52D0C98B39A33D6C985704191AC06AC63187E32F5A45793F5E4770A0BED450B5FF9ED1A8062AE`，
  包含 14 个 allowlist 文件；Release 上传后必须重新核对下载资产摘要。

## v0.2.1 历史放行清单

1. [x] 本地实现、测试、打包 allowlist 和安全边界审查；
2. [x] `SECURITY.md`、`CONTRIBUTING.md`、README 和 capability map 与实现一致；
3. [x] 用户批准以 `0.2.1` 作为包含后续修复的公开版本；
4. [x] `0.2.1` 版本、tag 和 GitHub Release 创建完成；
5. [x] 用户批准并已执行仓库公开；
6. [ ] 用户批准 npm publish（当前默认不发布）。

## v0.2.2 放行清单

1. [x] 中英文 README 已补齐源码、固定包、MCP、TUI 和支持范围说明；
2. [x] MCP specification 已与实现中的 12 个工具和 2 个 resources 对齐；
3. [x] Code of Conduct、bug report 和 feature request 入口已加入；
4. [x] 本地语法、测试、smoke、package allowlist 和 clean-install 门禁通过；
5. [x] tarball SHA-256/SHA-512 已记录并通过下载资产复核；
6. [x] 用户批准推送、创建 `v0.2.2` tag、GitHub Release 和 Release asset；
7. [ ] 用户另行批准 npm publish（默认不发布）。

## 回滚与禁止自动执行

公开代码版本 tag 为 `v0.2.1`（commit `0ac0b4d`），CI run 为
`32957109919`。`v0.2.2` 必须使用新的不可变 tag，不得移动已有 tag。
首小时监控负责人为仓库维护者 `ShinonomeAya`，回滚决策由同一维护者执行。若
匿名 smoke、Release 下载或安装检查失败，先保留失败证据并撤下对应 Release；
公开稳定版本为已验证且不可变的 `v0.2.2`；如需回滚，回退目标为同样不可变的
`v0.2.1`。
