# git-graph-mcp 测试计划

## 目标

确认 v0.2.0 在 Windows + Node.js 22/24 + Git 环境下具备三类可用性：

1. Git 域、选择状态和只读历史结果正确；
2. CLI/TUI 在真实终端可操作且退出后不残留终端状态；
3. 官方 MCP 客户端可以完成握手、读取两个资源、调用十二个工具并获得稳定结果。

## 测试层级

### 1. 单元测试

- 图布局、空历史、窄宽度截断和导航边界；
- Git revision、limit、status、关系分类和错误码；
- 选择状态迁移、原子写入、过期选择和 linked worktree 隔离；
- bounded context、提交搜索、结构化 diff 和文件历史的预算、游标、特殊文件类型与错误码；
- 分支名称校验、分支幂等性决策和三种 reset 预览影响。

命令：

```powershell
npm run test:unit
```

### 2. 临时仓库集成测试

每个用例创建并清理独立临时仓库，覆盖空仓库、线性历史、分支、合并、
分叉、detached HEAD、脏工作区和 linked worktree。断言 refs、HEAD、index、
工作区状态及选择文件变化。

命令：

```powershell
npm run test:integration
```

### 3. 公共 CLI/MCP 测试

- CLI graph/status/search/inspect/selected/compare-selected 的 JSON 或纯文本契约；
- 官方 MCP SDK initialize、工具列表、成功结果和预期错误；
- 十二个工具、两个资源、schemaVersion、错误码和 reset 只预览不执行；
- 诊断关闭时 stderr 为空，开启时只输出带时间戳的安全生命周期信息。

### 4. 打包安装测试

```powershell
npm run test:package
npm run test:package-install
```

第一项校验 npm allowlist；第二项将 tarball 安装到临时目录，再从安装结果
运行 CLI 和官方 MCP 客户端。

### 5. 人工终端验收

在默认约 80 列终端检查：

- 图、当前行高亮、详情面板和快捷键提示是否清楚；
- `j`/`k` 或方向键能移动选中项；
- `s`/Enter 能保存选择；
- `q` 能退出并恢复光标；
- 空仓库显示明确的无提交状态。

窄终端约 60 列由固定宽度自动化测试覆盖，重点检查长 subject、路径和
refs 不造成横向溢出。

### 6. 大仓库预算与超时

benchmark 使用独立临时仓库，不读取开发仓库，也不纳入默认 `npm run check`：

```powershell
npm run test:benchmark
npm run benchmark:large
```

每个 Git 进程默认最多运行 5000ms；调用方可在 graph、context、search、diff
和 file history 上传入 `timeoutMs`（1–60000）。超时统一返回 `GIT_TIMEOUT`，
并通过后续 Git status 检查确认没有遗留阻塞进程。

### 7. Doctor 诊断

```powershell
node .\bin\git-graph-mcp.js doctor
node .\bin\git-graph-mcp.js doctor --json --repo <path>
```

诊断覆盖 Node.js、Git、仓库解析、包版本、MCP 配置和 stdio 握手。输出只含
状态、稳定错误码和摘要，不回显仓库路径、配置值或请求内容；命令不会修改
Git、选择文件或 MCP 配置。Node.js 20 在本机只作为迁移检查并显示
`RUNTIME_UNSUPPORTED` 警告，正式支持版本仍为 Node.js 22+。

## 本轮结果

- 全量 `npm run check`：通过，72 项测试、smoke、package allowlist 通过；
- `npm run test:benchmark`：通过，40 提交隔离临时仓库的 graph/search/diff/history 预算烟测；
- `npm run test:package-install`：通过，安装后 CLI/MCP 均可用；
- 真实 Windows TTY：通过，图形、选中行、详情和退出清理均正常；
- 官方 MCP SDK：通过，能列出十二个工具、读取两个资源并调用 reset 预览；
- `doctor`：通过，clean packed artifact 可完成 runtime/Git/repo/config/stdio 诊断；
- 生产依赖安全审计：通过（官方 npm registry，`npm audit --omit=dev --audit-level=high` 返回 0 vulnerabilities）；
- MCP SDK 已从 1.29.0 升级到 1.30.0，并重新通过全量回归与打包安装测试；
- 临时 Node.js 22.23.2 与 24.19.0：Windows 本机均通过 72 项测试；
- 临时 Node.js 22.23.2 与 24.19.0：清洁打包安装测试也均通过；
- 终端截图：已保存为本轮 Codex 可视化产物，画面显示 TUI 正常可用。

## 已完成的外部证据

- GitHub Actions run `32955420207` 已验证 Windows/Ubuntu × Node 22/24 四个矩阵，
  提交 `849bbab` 的四个 job 均通过 `check`、clean package install 和官方 registry audit；

## 仍待人工确认

- 用户实际 Claude Code 版本下的 `/mcp` 页面和一次只读调用截图；
- 若公开最新维护分支，是否创建包含 T28/T29/T31 修复的 `v0.2.1`；
- GitHub 仓库公开动作和 npm 是否发布；当前 `v0.2.0` tag/Release 保持不变。
