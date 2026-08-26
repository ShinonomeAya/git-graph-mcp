# git-graph-mcp MCP 调试记录

本文保留连接问题的排查背景，并区分历史假设与当前已验证结论。

## 原始现象

早期 Windows 客户端连接持续超时。手动管道测试可以启动服务，但客户
端没有完成初始化握手。

## 历史排查

2026-05-27 曾尝试更换 Node 路径、使用 `cmd /c` 包装、直接启动 Node、
增加临时诊断、调整 stdout 写入方式，以及批处理启动。那些步骤只能证
明服务进程启动，并不能证明协议兼容；当时关于 stdout 缓冲、管道句柄和
客户端限制的判断均属于未证实假设。

## 已验证结论（2026-08-26）

- 旧实现使用自定义 stdio 传输并发送 `Content-Length` 响应头。
- 官方 MCP stdio 客户端按换行分隔的 JSON-RPC 消息读取，因此旧分帧与官
  方客户端约定不兼容。
- 当前实现使用 `@modelcontextprotocol/sdk` 的
  `StdioServerTransport`，不再维护第二套 parser/writer。
- Windows 官方 SDK 集成测试可以完成 initialize、列出七个工具、调用代
  表性工具并正常关闭；stdout 只包含协议消息。

## 当前诊断行为

- 默认运行不创建日志文件，也不向 MCP stdout 写诊断文本。
- 只有设置 `GIT_GRAPH_MCP_DEBUG=1` 时，才会把带时间戳的简短生命周期、
  工具名和耗时事件写入 stderr。
- 诊断不记录仓库路径、请求参数、补丁内容、环境转储或敏感信息。

## 建议排查顺序

1. 确认 Node.js 22+ 与 Git 均能从 `PATH` 运行。
2. 在源代码 checkout 执行 `npm ci` 与 `npm run check`。
3. 使用仓库内的便携 `.mcp.json`，或用 `npx git-graph-mcp mcp` 配置已安
   装包。
4. 在 Claude Code 中运行 `/mcp`，确认 `git-graph` 已连接。
5. 需要进一步定位时临时设置 `GIT_GRAPH_MCP_DEBUG=1`，只查看 stderr。
