# git-graph-mcp 同类项目调研与后续落地路线

调研日期：2026-08-26

## 1. 结论

`git-graph-mcp` 不应与 Lazygit、GitUI 正面竞争“完整 Git 客户端”，也不应照搬
通用 Git MCP 项目一次暴露二十多个写操作。最可行的定位是：

> 面向 AI 编码工具的、本地优先且由人确认的 Git 上下文控制面。

核心闭环应保持为：人通过终端图选择提交、范围或引用，工具生成有边界的结构化
上下文，AI 读取同一份上下文并只执行已批准的低风险动作。该组合在本次样本中
没有成熟项目完整覆盖，是当前项目最清晰的差异化。

后续优先级应是：

1. 从“单提交选择”升级到“提交范围 / 引用选择”；
2. 用一个受预算约束的上下文包减少 AI 多次拼装 Git 信息；
3. 增强搜索、提交差异和文件演进等只读能力；
4. 在基准证明需要后再做异步、缓存或索引；
5. 继续限制写操作，不在近期加入 reset、checkout、rebase、push 的自动执行。

## 2. 当前项目基线

当前仓库采用 Node.js 22+、CommonJS JavaScript、系统 Git CLI、定制 ANSI TUI 和
官方 MCP TypeScript SDK。运行时仅有 MCP SDK 一个直接依赖。

已具备：

- 终端交互图和确定性的纯文本图；
- 工作树、空仓库、detached HEAD、分叉关系和 linked worktree 处理；
- Git 路径内的原子化选择状态；
- 7 个结构化 MCP 工具；
- 安全、幂等的“在选中提交创建分支”；
- 只生成计划、不执行的 reset 影响预览；
- 44 项测试和 Windows/Ubuntu × Node 22/24 CI。

当前主要缺口：

- 只能选一个提交，不能表达提交范围或稳定引用；
- 提交详情仍浅，缺少可分页搜索、结构化 diff 和文件历史；
- AI 需要组合 graph、status、selected、compare 等多个调用；
- MCP 只暴露 tools，没有 selection/status resources 或更新通知；
- Git 读取以同步子进程为主，尚未建立大仓库性能预算；
- 当前包版本仍为 0.1.0，v0.2 的版本、tag 和 npm 发布仍待人工决定。

## 3. GitHub 样本

Stars 和活跃时间是 2026-08-26 的检索快照，只用于衡量生态成熟度，不代表质量
评分。

| 项目 | 定位 | 主要技术栈 | 快照 |
|---|---|---|---:|
| [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit) | 完整 Git TUI | Go、tcell/gocui、Git CLI、异步任务 | 81,640 stars |
| [gitui-org/gitui](https://github.com/gitui-org/gitui) | 高性能 Git TUI | Rust、Ratatui、Crossterm、git2/gix、crossbeam | 22,433 stars |
| [lusingander/serie](https://github.com/lusingander/serie) | 图谱优先的 Git 日志 TUI | Rust、Ratatui、Git CLI、终端图片协议 | 2,053 stars |
| [mhutchie/vscode-git-graph](https://github.com/mhutchie/vscode-git-graph) | VS Code Git 图形扩展 | TypeScript、VS Code Extension Host、Webview、Git CLI | 2,496 stars；最后代码推送 2023-07 |
| [cyanheads/git-mcp-server](https://github.com/cyanheads/git-mcp-server) | 通用 Git MCP 服务 | TypeScript/ESM、Bun/Node、stdio/HTTP、DI、Zod、OTel | 235 stars，28 tools |
| [aflsolutions/shadowgit-mcp](https://github.com/aflsolutions/shadowgit-mcp) | ShadowGit 的历史与 AI 会话 MCP | TypeScript、Node、stdio、Git CLI、Session API | 49 stars |
| [IvyYang1999/swob](https://github.com/IvyYang1999/swob) | AI 编码会话图与调试器（邻近品类） | Electron、React、TypeScript、Zustand、SQLite FTS5 | 38 stars |

补充边界参考：[github/github-mcp-server](https://github.com/github/github-mcp-server)
面向远端 GitHub API、PR、Issue、Actions 和安全告警，不解决本地工作树中的人工图形
选择，因此不是直接竞品。

## 4. 功能与架构对比

### 4.1 Lazygit

功能覆盖 staging、commit、push/pull、rebase、stash、worktree、冲突处理、自定义命令
和 undo。架构上把 Git 二进制调用集中在 `pkg/commands/git_commands`，UI 逐步拆成
view、context、controller、helper，并通过 worker 保持界面响应。

优点：

- 交互发现性、安全确认、快捷键一致性和错误恢复经过大量用户验证；
- Git 行为覆盖面广，跨平台分发成熟；
- “Git 命令层唯一出口”和异步刷新机制值得借鉴。

相对当前项目的不足：

- 没有 MCP 或稳定的 AI 上下文合同；
- 功能与配置规模很大，架构中仍存在历史 God Struct；
- 若当前项目追随其完整功能面，会迅速失去小而安全的优势。

可借鉴：上下文帮助、禁用动作时显示原因、操作结果可见、复杂动作默认确认，以及
性能慢任务不阻塞 UI。

### 4.2 GitUI

GitUI 使用 Rust workspace，将 UI 与 `asyncgit` 分离；`asyncgit` 使用 git2/gix、
crossbeam 和并行执行实现流畅操作。它支持文件/行级 stage、stash、分支、远端和
提交日志搜索，但 README 仍把“可视化分支结构”列为 1.0 前目标。

优点：

- 二进制性能、内存和大仓库处理能力强；
- UI 与异步 Git 层边界清晰；
- 单文件分发和多平台包管理成熟。

相对当前项目的不足：

- 没有 MCP、机器可读选择状态或 AI 安全合同；
- libgit2/gix 双栈和 Rust workspace 的维护成本明显高于当前项目；
- 完整 Git 客户端目标与本项目的 AI 上下文目标不同。

可借鉴：先建立性能指标，再决定是否更换 Git 实现；不要仅因 Rust 项目更快就迁移
语言。

### 4.3 Serie

Serie 明确把“丰富的提交图浏览”作为目标，把完整 Git 客户端和复杂 UI 列为非目标。
其模块分为 Git 数据、图计算/几何、图片协议、事件、view/widget 和用户外部命令。
它通过 iTerm/Kitty 图片协议渲染高质量图形。

优点：

- 产品边界极其清晰，图、详情、引用、搜索和 diff 围绕同一主流程；
- Git 数据、图形计算、终端协议分层清楚；
- 自定义命令提供扩展性而不内置所有 Git 动作。

相对当前项目的不足：

- 依赖特定终端图片协议，Windows 未正式支持；
- 没有 MCP 和 AI 可读上下文；
- 外部自定义命令可以绕过统一的安全策略。

可借鉴：保持 graph-centric，先补搜索、refs、详情和 diff；不采用图片协议作为默认
渲染路径，以保住 Windows 和普通终端兼容性。

### 4.4 VS Code Git Graph

该扩展提供分支/标签/stash 图、双提交比较、文件 diff、持久化 code review、筛选、
搜索以及大量 Git 操作。架构由 VS Code 扩展主进程负责仓库和 Git 数据，Webview
负责图和交互。

优点：

- “选择两个提交后比较”是非常成熟的交互范式；
- 提交详情、文件树、review 状态和 refs 筛选信息密度高；
- VS Code 原生 diff 能力减少了重复实现。

相对当前项目的不足：

- 绑定 VS Code，无法成为多个 AI CLI 的共享上下文；
- 写操作面很宽，安全更多依赖对话框而不是机器合同；
- 最后代码推送时间较早，且许可证不是标准 MIT/Apache 表述。

可借鉴：双锚点比较、详情面板、refs 筛选和文件 review 状态；不复制 Webview 架构。

### 4.5 cyanheads/git-mcp-server

该项目提供 28 个 Git tools、1 个 resource 和 1 个 prompt，覆盖从 init、clone、
commit 到 rebase、reset、push。它支持 stdio/Streamable HTTP、JWT/OAuth、存储后端、
DI、日志和 OpenTelemetry，并用 provider 抽象 Git CLI。

优点：

- MCP 产品化、配置验证、错误结构、响应格式和可观测性完整；
- 有 base-directory 限制、参数数组执行和破坏动作确认标志；
- tool/resource/prompt 三种 MCP 原语都得到使用。

相对当前项目的不足：

- 没有人类图形选择闭环；
- 28 个 tools 和远程部署能力带来较大的攻击面、配置面和维护成本；
- 确认 flag 仍由 AI 调用参数表达，不等同于人类在独立界面完成授权。

可借鉴：上下文 resource、统一响应预算、base-dir policy 和 tool 分类；不复制其完整
服务模板或远程部署栈。

### 4.6 ShadowGit MCP

ShadowGit MCP 通过 stdio 提供受 allowlist 限制的只读 Git 命令，并通过单独的
ShadowGit Session API 实现 start session、checkpoint、end session 工作流。Git
执行使用参数数组并阻断危险参数。

优点：

- 把 AI 工作组织为可审计的 session/checkpoint；
- 对任意 Git 命令、危险 flag、路径穿越和超时做边界控制；
- 明确区分只读历史访问与有状态会话动作。

相对当前项目的不足：

- 依赖 ShadowGit 应用和本地 API，不是独立 Git 工具；
- 通用 `git_command` 即使有 allowlist，也比类型化工具更难形成稳定合同；
- 使用较旧的 MCP SDK 版本，且没有终端图选择。

可借鉴：将未来动作绑定到会话/计划标识和仓库快照，保留类型化工具而不是开放任意
Git 子命令。

### 4.7 Swob（邻近品类）

Swob 处理的是 AI 编码会话历史而非 Git 提交。它通过多适配器归一化不同客户端的
JSON/SQLite 历史，用 SQLite FTS5 搜索，并提供 lineage graph、执行树、上下文压力
和 provenance 标记。

优点：

- 证明“本地优先的 AI 开发历史图”存在产品价值；
- 对来源能力做矩阵化声明，对 reported/estimated/unavailable 做证据区分；
- CLI 输出 JSON，桌面 UI 与机器接口并存。

相对当前项目的不足：

- Electron、数据库、适配器和安装包使工程体量很重；
- 不是 Git 操作工具，也没有提交选择到 MCP 动作的闭环。

可借鉴：上下文来源/provenance、能力矩阵和结构化 CLI；当前阶段不引入 Electron 或
SQLite。

## 5. 差异化能力矩阵

| 能力 | 当前项目 | 成熟 Git TUI | 图形扩展 | 通用 Git MCP | AI 历史工具 |
|---|---:|---:|---:|---:|---:|
| 人类可视 Git 提交图 | 已有 | 强 | 强 | 无 | 非 Git 图 |
| AI/MCP 结构化访问 | 已有 | 无 | 无 | 强 | 部分 |
| 人类选择与 AI 读取同一上下文 | 已有，单提交 | 无 | 仅编辑器内部 | 无 | 部分 |
| 提交范围/双锚点 | 缺失 | 部分 | 强 | 可通过参数表达 | 不适用 |
| 类型化安全动作预览 | 已有 reset plan | UI 对话框 | UI 对话框 | confirmation flag | session API |
| 写操作面 | 极窄 | 很宽 | 很宽 | 很宽 | 窄 |
| 搜索、diff、文件历史 | 初级 | 强 | 强 | 中到强 | 强 |
| 本地优先、跨 AI 客户端 | 强 | 非 AI | 绑定编辑器 | 强 | 部分 |

## 6. 推荐架构方向

### 6.1 保留的决定

- 继续使用 Node.js + CommonJS 到 v0.3 完成，不做语言或模块系统迁移；
- 继续使用系统 Git CLI 和参数数组调用；
- `git-domain` 保持唯一 Git 命令出口；
- TUI、CLI、MCP 共享纯数据合同；
- 继续 stdio、本地优先、默认只读；
- 新字段保持可加性，旧的 7 个 tool 名称不变。

### 6.2 新增的核心边界

```text
Git CLI
   |
git-domain ---- history query / diff budget
   |
selection-context v2 ---- single / range / ref + stale validation
   |                 \
   |                  context-bundle ---- truncation / provenance / warnings
   |                         |                         |
Terminal TUI / CLI           +---- MCP tool ---------+---- MCP resource
```

`selection-context` 是稳定事实；TUI 中的“lane”只是交互概念，应解析为 ref + oid，
不能把屏幕 lane 编号写入持久状态。`context-bundle` 是 AI 消费层，必须带上数量/
字节预算、`truncated` 标记和仓库状态指纹。

### 6.3 selection schema v2 建议

```json
{
  "schemaVersion": 2,
  "repoRoot": "...",
  "selection": {
    "kind": "range",
    "baseOid": "...",
    "headOid": "..."
  },
  "resolvedAt": "...",
  "repoFingerprint": {
    "headOid": "...",
    "indexTreeOid": "..."
  }
}
```

可选 kind：

- `commit`：一个不可变 oid；
- `range`：base/head 两个不可变 oid；
- `ref`：完整 ref 名称、选择时 oid，以及读取时是否已移动。

继续读取 schema v1；只有新的显式选择写入 v2。任何低风险写动作都应重新解析 Git
状态，不能只相信持久文件。

### 6.4 context bundle 建议

新增 `git_context_bundle`，一次返回：

- selection v2 与当前 HEAD/status 指纹；
- 选择附近的提交图；
- range 或 selected→HEAD 的关系、提交列表和 diff stat；
- 受限的 changed files 和可选 patch 摘要；
- stale、dirty、diverged、truncated 等警告；
- 每个字段的来源和生成时间。

首版不在服务端调用 LLM，不缓存代码内容，不自动读取整个 patch。默认仅返回元数据
和统计；patch 必须由调用方显式请求并受字节上限约束。

## 7. 分阶段落地方案

### Phase 7：v0.3 人工确认的上下文包

1. T17：selection schema v2 与 v1 兼容读取；
2. T18：Git 域与 CLI 支持 commit/range/ref 选择；
3. T19：TUI 支持设置起点、终点和 ref 选择；
4. T20：新增受预算约束的 `git_context_bundle`（已完成，含 MCP stdio 验收）。

Checkpoint：同一选择在 TUI、CLI 和 MCP 中 oid 完全一致；旧 v1 文件仍可读；所有
读取保持 Git 状态不变；上下文包不能超过声明的数量和字节预算。

### Phase 8：v0.4 只读历史探索

1. T21：为默认仓库增加 selection/status MCP resources，保留 tool 等价路径（已完成，含官方 SDK list/read 验收）；
2. T22：增加 refs/author/message 过滤和可分页提交搜索（已完成，含 CLI/MCP 游标与只读快照验收）；
3. T23：增加结构化 commit diff 与 file history（已完成，含特殊文件类型、路径边界与补丁预算验收）；
4. T24：建立大仓库基准、超时、取消和输出上限，只有指标不达标时才异步重构或缓存（已完成，当前预算达标，未引入额外复杂度）。

Checkpoint：大型 fixture 中首屏和搜索满足预算；所有结果可截断且显式报告；没有
SQLite、守护进程或网络端口依赖。

### Phase 9：v0.5 安全产品化

1. T25：统一 action plan receipt，将 repo/head/index/status 指纹绑定到动作计划（已完成，含过期、脏状态、HEAD 与 ref 移动拒绝）；
2. T26：增加 `doctor` 命令，诊断 Node、Git、仓库、MCP 配置和客户端连接（已完成，含健康、无效仓库、过期配置与握手失败夹具）；
3. T27：完善演示、能力矩阵、SECURITY/CONTRIBUTING 和条件式公开发布清单。

Checkpoint：计划过期时动作拒绝；安装后五分钟内可完成 graph→select→MCP read；
是否公开仓库、升版本、打 tag 和 npm publish 仍由用户分别决定。

## 8. 明确暂缓

- 完整 staging/commit/rebase/merge/push 客户端；
- reset、checkout、rebase、push 的 MCP 自动执行；
- Streamable HTTP、OAuth、多用户部署；
- Electron/Web UI、终端图片协议；
- SQLite 索引或后台常驻进程；
- Rust/Go/TypeScript 全量迁移；
- 为追求 tool 数量而增加通用 `git_command`。

这些能力并非永远禁止，而是必须由真实用户场景、性能数据或客户端能力证明后再进入
计划。

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| schema v2 破坏现有 selection | 高 | v1 兼容读取、fixture migration、仅显式写入 v2 |
| context bundle 产生过多 token | 高 | 默认元数据、数量/字节预算、truncated/provenance |
| ref 在选择后移动 | 高 | 保存 ref+oid，读取时重新解析并报告 stale/moved |
| TUI 功能增长导致维护困难 | 中 | 纯状态机与渲染函数分离，每个交互有无 TTY 测试 |
| 大仓库同步 Git 调用阻塞 | 中 | 先建基准与超时，再决定异步/缓存，不提前重构 |
| MCP resource 客户端支持不一致 | 中 | resource 与 tool 同合同、tool 始终保留 |
| 写能力扩张稀释安全定位 | 高 | action receipt、状态指纹、人工放行、保持默认只读 |

## 10. 推荐决策

建议批准 Phase 7 作为下一开发阶段，并把 v0.3 的唯一产品目标定义为：

> 用户可以在终端选择一个提交范围，AI 通过一次 MCP 调用获得同一范围的、受预算
> 约束且带安全警告的 Git 上下文包。

这是当前架构能够低风险落地、同时最能形成产品差异的下一步。Phase 8、Phase 9
必须在 Phase 7 验收和真实使用反馈后再启动。
