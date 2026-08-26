# v0.2 剩余验收测试计划

状态：T14 本机发布预检通过，候选 commit/push 已获批准，T15 外部 CI 证据待补

## 1. 验收目标

确认已经实现的 v0.2 功能在发布前满足以下条件：

- 本地完整测试、CLI、TUI、MCP 和 npm 安装链路全部通过；
- Windows/Ubuntu 与 Node.js 22/24 的 CI 矩阵配置正确并取得结果；
- Claude Code 实际 `/mcp` 连接可用，且七个工具可见；
- 包内容、Git 状态和安全边界没有未批准变更；
- 在用户决定前不升级版本、不提交、不打 tag、不推送、不发布。

## 2. 执行顺序

### 阶段 A：本地回归

执行：

```powershell
npm ci
npm run check
npm run test:package-install
```

通过标准：

- syntax、unit、integration、smoke、package allowlist 全部通过；
- 打包后的临时安装可以运行 CLI，并由官方 MCP 客户端列出七个工具；
- 临时仓库、临时安装目录和测试选择状态在结束后清理。

证据：命令退出码、测试总数、`npm pack --dry-run --json` 文件列表。

### 阶段 B：终端人工验收

在 Windows 真实 TTY 执行：

```powershell
node .\bin\git-graph-mcp.js graph --limit 8
```

逐项操作并记录：

1. 初始画面显示分支、HEAD、提交图、详情面板和快捷键；
2. `j`、`k`、方向键移动选中行，边界不越界；
3. `s` 或 Enter 保存选择；
4. `q` 退出，光标恢复，进程结束；
5. 空仓库和窄宽度输出不溢出。

通过标准：画面可读、操作有反馈、退出无残留进程或隐藏光标。

证据：终端截图、退出码、选择文件前后 oid 对比。

### 阶段 C：MCP 实际连接

#### 官方 SDK 自动验收

```powershell
node --test test/integration/mcp-stdio.test.js
```

通过标准：initialize、工具列表、七个工具调用、预期错误和关闭全部通过；
stdout 只包含协议消息。

#### Claude Code 人工验收

在目标项目打开便携 `.mcp.json`，执行：

```text
/mcp
```

记录：Claude Code 版本、Node 版本、连接状态、工具数量，以及一次
`git_graph` 或 `git_status` 只读调用。

通过标准：`git-graph` 显示 connected，七个工具可见，调用结果含
`schemaVersion: 1`。

### 阶段 D：CI 矩阵验收

工作流：[.github/workflows/ci.yml](../.github/workflows/ci.yml)

矩阵：

| 操作系统 | Node.js 22 | Node.js 24 |
|---|---:|---:|
| Windows | 待运行 | 待运行 |
| Ubuntu | 待运行 | 待运行 |

每个格子必须完成 `npm ci` 和 `npm run check`。任一格失败则停止发布评审，
记录失败日志后修复并重新运行。

### 阶段 E：发布候选审查

执行：

```powershell
git diff --check
git status --short
npm pack --dry-run --json
rg -n -i "[A-Za-z]:\\\\Users\\\\|[A-Za-z]:\\\\Program Files\\\\|AppData" README.md docs .mcp.json package.json LICENSE .github src bin
```

通过标准：

- 没有绝对本机路径进入公共配置、文档或包；
- 包只包含 `bin/`、`src/`、`README.md`、`LICENSE` 和 npm 生成的
  `package.json`；
- 源码没有 `git reset`、checkout、push、force-update 等未批准执行路径；
- 工作树变化均属于本轮开发，且没有新的提交、tag、push 或发布。

## 3. 验收记录模板

```text
执行日期：
执行环境：Windows / Ubuntu，Node，Git，npm
阶段 A：PASS / FAIL
阶段 B：PASS / FAIL，截图：
阶段 C SDK：PASS / FAIL
阶段 C Claude Code：PASS / FAIL / 未执行
阶段 D Windows Node 22：PASS / FAIL / 待运行
阶段 D Windows Node 24：PASS / FAIL / 待运行
阶段 D Ubuntu Node 22：PASS / FAIL / 待运行
阶段 D Ubuntu Node 24：PASS / FAIL / 待运行
阶段 E：PASS / FAIL
阻塞项：
是否允许提交或发布：否，需用户明确决定
```

## 4. 当前已知剩余项

- 2026-08-26 本机阶段 A：PASS；`npm ci`、完整 `npm run check` 和
  `npm run test:package-install` 均通过，共 44 项测试；当前 Node 20.19.4
  仅作为迁移检查环境，不能替代 Node 22/24 验收；
- T14 本地发布预检：PASS；重新执行锁定安装、44 项全量测试、清洁包安装、
  官方 registry 安全审计、`npm pack --dry-run --json`、`git diff --check`
  和公共路径扫描均通过；
- 为兼容 Node 22/24，测试脚本已改为显式测试文件列表；临时 Node 22.23.2
  和 Node 24.19.0 的 Windows 直接测试均通过 44 项，清洁打包安装也通过；
- 生产依赖安全审计：初次官方 registry 检查发现 3 个 high 与 1 个 moderate
  传递依赖问题；已将 MCP SDK 升级至 1.30.0 并刷新锁文件，复审结果为
  `0 vulnerabilities`，升级后全量测试和清洁安装仍通过；
- 阶段 B Windows TTY 和阶段 C 官方 SDK：此前已通过并有截图/测试证据；
- Claude Code 2.1.177 的只读 `claude mcp list/get git-graph` 检查：配置被正确
  识别，状态已为 `Connected`；项目级 `.mcp.json` 与 stdio 启动参数验收通过；
- Claude Code 的实际 `/mcp` 页面与一次只读工具调用仍建议由用户在客户端留存
  截图/结果，作为最终人工证据；
- GitHub Actions 四格 Node 22/24 结果尚未取得；
- 私有 GitHub 仓库 `ShinonomeAya/git-graph-mcp` 已创建，本地 `origin` 已配置；
  本次候选 commit/push 已获批准，推送后等待四格 CI 启动并回填结果；
- 版本仍为 0.1.0；本次只提交并推送候选代码，升至 0.2.0、打 tag 和发布仍需
  后续人工批准；
- Claude Code 实际 `/mcp` 连接需要在用户的 Claude Code 客户端中确认；
- 在上述两项完成前，Checkpoint E 不通过。
