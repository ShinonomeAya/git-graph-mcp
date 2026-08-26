# git-graph-mcp 测试计划

## 目标

确认 v0.2 在 Windows + Node.js 22/24 + Git 环境下具备三类可用性：

1. Git 域和选择状态结果正确；
2. CLI/TUI 在真实终端可操作且退出后不残留终端状态；
3. 官方 MCP 客户端可以完成握手、调用七个工具并获得稳定结果。

## 测试层级

### 1. 单元测试

- 图布局、空历史、窄宽度截断和导航边界；
- Git revision、limit、status、关系分类和错误码；
- 选择状态迁移、原子写入、过期选择和 linked worktree 隔离；
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

- CLI graph/status/inspect/selected/compare-selected 的 JSON 或纯文本契约；
- 官方 MCP SDK initialize、工具列表、成功结果和预期错误；
- 七个工具名称、schemaVersion、错误码和 reset 只预览不执行；
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

## 本轮结果

- 全量 `npm run check`：通过，44 项测试、smoke、package allowlist 通过；
- `npm run test:package-install`：通过，安装后 CLI/MCP 均可用；
- 真实 Windows TTY：通过，图形、选中行、详情和退出清理均正常；
- 官方 MCP SDK：通过，能列出七个工具并调用 reset 预览；
- 生产依赖安全审计：通过（官方 npm registry，`npm audit --omit=dev --audit-level=high` 返回 0 vulnerabilities）；
- MCP SDK 已从 1.29.0 升级到 1.30.0，并重新通过全量回归与打包安装测试；
- 临时 Node.js 22.23.2 与 24.19.0：Windows 本机均通过 44 项测试；
- 临时 Node.js 22.23.2 与 24.19.0：清洁打包安装测试也均通过；
- 终端截图：已保存为本轮 Codex 可视化产物，画面显示 TUI 正常可用。

## 待补证据

- GitHub Actions 的 Windows/Ubuntu × Node 22/24 四个矩阵结果；
- Ubuntu Node 22/24 仍需在 CI 中验证；
- 用户实际 Claude Code 版本下的 `/mcp` 连接确认；
- Node.js 22/24 本机验收（当前机器只有 Node 20.19.4，属于迁移检查环境）；
- 发布前由用户决定是否升级版本、提交、打 tag、推送或发布。
