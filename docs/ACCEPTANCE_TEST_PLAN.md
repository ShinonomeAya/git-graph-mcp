# v0.2.1 发布前验收记录

状态：技术门禁已通过，`v0.2.1` tag/Release 已创建；仓库仍为私有，`v0.2.0`
tag/Release 保持不变，npm 仍不发布，下一步执行公开和匿名验收。

## 1. 验收目标

确认以下用户路径在 Windows/Ubuntu 与 Node.js 22/24 上可重复：

- Git 图、选择状态、只读历史结果正确；
- clean packed artifact 可以完成 `graph → select → selected → MCP read → doctor`；
- 官方 MCP SDK 能完成握手、读取两个 resources、调用 12 个工具；
- 包内容、安全边界、依赖审计和 CI 发布门禁没有未批准变更；
- Claude Code 的真实 `/mcp` 页面和一次只读调用保留为客户端人工证据。

## 2. 自动验收

### 阶段 A：本地回归

```powershell
npm ci
npm run check
npm run test:package-install
npm audit --omit=dev --audit-level=high
```

通过标准：72 项测试、smoke、package allowlist、clean install、MCP handshake、
选择读取、doctor 和官方 registry 审计全部通过；临时仓库与安装目录结束后清理。

### 阶段 B：官方 SDK MCP 验收

```powershell
node --test test/integration/mcp-stdio.test.js
```

通过标准：initialize、resource list/read、12 个工具列表、只读调用、预期错误、
安全分支动作和 reset 计划全部通过；stdout 只包含协议消息。

### 阶段 C：CI 维护矩阵

工作流：[.github/workflows/ci.yml](../.github/workflows/ci.yml)

| 操作系统 | Node.js 22 | Node.js 24 |
|---|---:|---:|
| Windows | PASS | PASS |
| Ubuntu | PASS | PASS |

已完成证据：GitHub Actions run `32955420207`（commit `849bbab`），四个矩阵 job 均
完成 `npm run check`、`npm run test:package-install` 和官方 registry audit，且工作流
使用维护中的 checkout/setup-node action runtime。

### 阶段 D：发布候选审查

```powershell
git diff --check
git status --short
npm pack --dry-run --json
```

同时扫描 README、docs、配置、源码和 bin，确认没有机器专属绝对路径、凭据或
未批准的 destructive Git executor。包内容只允许 `bin/`、`src/`、`README.md`、
`LICENSE` 和 npm 生成的 `package.json`。

## 3. 人工验收

### 终端 TUI

在真实 TTY 执行：

```powershell
node .\bin\git-graph-mcp.js graph --limit 8
```

检查图、HEAD、详情面板、`j`/`k` 或方向键、`s`/Enter 保存、`q` 退出、空仓库和
窄宽度输出。证据为终端截图、退出码和选择文件前后 oid 对比。

### Claude Code

在目标项目配置本地 stdio server，执行 `/mcp`，记录客户端版本、Node 版本、连接
状态、工具数量，并执行一次 `git_graph` 或 `git_status` 只读调用。通过标准为
`git-graph` 显示 connected、12 个工具可见、结果含 `schemaVersion: 1`。

当前仓库已有官方 SDK 和 `claude mcp list/get` 配置检查证据；实际 `/mcp` 页面截图
和调用结果仍应由用户在自己的客户端留存，不能由自动测试代替。

## 4. 当前验收记录

```text
执行日期：2026-08-26
本机：Windows，Node.js 20.19.4（仅迁移检查），Git，npm
阶段 A：PASS；npm test 72/72、check、clean install、official registry audit
阶段 B：PASS；官方 MCP SDK integration
阶段 C：PASS；GitHub Actions run 32955420207，Windows/Ubuntu × Node 22/24
阶段 D：PASS；包 allowlist、diff check、路径/秘密扫描
阶段 E：待用户；Claude Code 实际 /mcp 页面截图和一次只读调用
版本/tag/Release：v0.2.1 已创建；v0.2.0 保持不变
仓库可见性：仍为私有
阻塞项：公开动作已确认，待执行仓库可见性切换和匿名验收
```

## 5. 放行规则

- 技术门禁未全绿时停止发布评审，不修改可见性或已发布 tag；
- `v0.2.0` 不移动；包含后续代码修复的公开版本必须使用新的补丁版本；
- GitHub 公开、补丁 tag/Release 和 npm publish 是互相独立的外部动作；
- 公开前必须由用户明确确认最终目标 commit、版本和可见性；
- 公开后的匿名 smoke 失败时，按 [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md) 的
  回滚顺序处理并保留失败证据。
