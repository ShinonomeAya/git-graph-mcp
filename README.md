# git-graph-mcp

[![CI](https://github.com/ShinonomeAya/git-graph-mcp/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ShinonomeAya/git-graph-mcp/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/ShinonomeAya/git-graph-mcp)](https://github.com/ShinonomeAya/git-graph-mcp/releases)
[![License](https://img.shields.io/github/license/ShinonomeAya/git-graph-mcp)](LICENSE)

**语言：** 简体中文 | [English](README.en.md)

一个本地优先的 Git 提交图终端工具，同时提供标准 MCP stdio 服务。它让你在终端选择提交或范围，再让 Claude Code、Codex、Cursor 等 MCP 客户端读取同一份受预算约束的 Git 上下文。

![终端预览](docs/assets/git-graph-preview.png)

> 当前稳定版本：`0.2.2` · [GitHub Release](https://github.com/ShinonomeAya/git-graph-mcp/releases/tag/v0.2.2)
>
> `v0.2.2` 是本次公开化修订版本；已有的 `v0.2.1` tag 保持不可变。

## 能做什么

- 在终端查看提交图、分支、提交详情和工作区状态；
- 保存 commit、range、ref 选择，并在 CLI、TUI、MCP 之间复用；
- 通过 MCP 读取 graph、status、context、search、diff、history 和 resources；
- 生成安全的分支动作与 reset 预览，不自动执行 reset、checkout 或 push；
- 用 `doctor` 检查 Node.js、Git、仓库、MCP 配置和 stdio 握手。

## 支持范围

- Node.js `22+`，Git 必须位于 `PATH` 中；
- GitHub Actions 自动验证 Windows 与 Ubuntu 上的 Node.js 22、24；
- Claude Code 的本地 stdio 配置已验证；其他遵循标准 MCP stdio 的客户端可使用同一配置模式；
- macOS 没有纳入当前 CI 矩阵，使用前请在目标环境运行 `doctor` 和只读 smoke。

## 安装并运行

### 从源码运行

适合贡献代码或需要查看最新主线内容的场景：

```powershell
git clone https://github.com/ShinonomeAya/git-graph-mcp.git
Set-Location git-graph-mcp
npm ci
node .\bin\git-graph-mcp.js graph --plain --limit 8
node .\bin\git-graph-mcp.js doctor
```

### 从 GitHub Release 固定包运行

当前 npm registry 没有发布 `git-graph-mcp`；从 [GitHub Releases](https://github.com/ShinonomeAya/git-graph-mcp/releases) 下载固定 `.tgz`，可以在一个独立目录中安装：

```powershell
New-Item -ItemType Directory git-graph-mcp-runtime -Force | Out-Null
Set-Location git-graph-mcp-runtime
npm init -y
$version = "0.2.2" # 替换为要使用的 Release 版本
npm install "https://github.com/ShinonomeAya/git-graph-mcp/releases/download/v$version/git-graph-mcp-$version.tgz"
npx --prefix . --no-install git-graph-mcp graph --plain --limit 8 --repo <path-to-git-repository>
npx --prefix . --no-install git-graph-mcp doctor --json --repo <path-to-git-repository>
```

发布新版本时，只需要把 `$version` 改为对应的 Release 版本，并按 Release notes 中的 SHA-256 校验值核对下载文件。

## 常用命令

以下命令从源码 checkout 运行；如果固定包安装在目标项目中，把入口替换为
`npx --no-install git-graph-mcp`；如果安装在独立 runtime 目录，则追加
`npx --prefix <path-to-git-graph-mcp-runtime> --no-install`：

```powershell
node .\bin\git-graph-mcp.js graph --plain --limit 8
node .\bin\git-graph-mcp.js status
node .\bin\git-graph-mcp.js search --limit 20
node .\bin\git-graph-mcp.js select commit <commit-oid>
node .\bin\git-graph-mcp.js selected
node .\bin\git-graph-mcp.js doctor --json
```

目标仓库不是当前目录时，为命令追加 `--repo <path>`。

## 使用交互式 TUI

运行 `node .\bin\git-graph-mcp.js graph` 后：

| 按键 | 操作 |
|---|---|
| `j` / `k` 或方向键 | 上下移动当前提交 |
| `Enter` / `s` | 保存当前 commit 选择 |
| `b` | 设置 range 起点 |
| `e` | 保存当前 range |
| `r` | 保存当前可见 ref |
| `q` / `Ctrl+C` | 退出 |

## 配置 MCP 客户端

### 源码 checkout

仓库根目录的 `.mcp.json` 使用相对路径，适用于从源码 checkout 打开项目：

```json
{
  "mcpServers": {
    "git-graph": {
      "type": "stdio",
      "command": "node",
      "args": ["./bin/git-graph-mcp.js", "mcp"]
    }
  }
}
```

### 已安装固定包

如果把固定包安装到目标项目本身，可以使用项目本地的可执行文件：

```json
{
  "mcpServers": {
    "git-graph": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no-install", "git-graph-mcp", "mcp"]
    }
  }
}
```

Claude Code 也可以运行：

```powershell
claude mcp add --transport stdio --scope local git-graph -- npx --prefix <path-to-git-graph-mcp-runtime> --no-install git-graph-mcp mcp
```

服务器提供 12 个有界工具：

| 类别 | 工具 |
|---|---|
| 读取与状态 | `git_graph`、`git_status`、`git_selected` |
| 上下文查询 | `git_context_bundle`、`git_search_commits`、`git_commit_diff`、`git_file_history` |
| 选择与安全动作 | `git_inspect_commit`、`git_compare_selected_with_head`、`git_revalidate_plan`、`git_create_branch_at_selected`、`git_reset_plan` |

同时提供两个只读 resources：`git-graph://default/selection` 和 `git-graph://default/status`。完整输入、输出和错误契约见 [MCP server specification](SPEC-mcp-server.md)。

## 安全边界

默认工作流是只读的。分支创建要求显式调用，不会移动已有分支；reset 只生成预览，`git_revalidate_plan` 会在动作前校验仓库状态指纹。项目不启动网络监听器，也不上传仓库内容。

## 排查连接问题

按顺序检查：

```powershell
node --version
git --version
node .\bin\git-graph-mcp.js doctor --json --repo <path-to-repository>
npm ci
npm run check
```

遇到 Claude Code 连接问题时，查看 [Claude Code setup](docs/CLAUDE_CODE.md)；需要诊断 stdio 时查看 [MCP debug log](docs/MCP_DEBUG_LOG.md)。

## 开发与发布

```powershell
npm run check
npm run test:package-install
npm audit --omit=dev --audit-level=high
```

更多内容：

- [五分钟 Demo](docs/DEMO.md)
- [能力与测试证据](CAPABILITY_MAP.md)
- [技术方案](docs/TECHNICAL_SOLUTION.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [发布验收清单](docs/RELEASE_CANDIDATE.md)
