# git-graph-mcp Windows 连接问题调试记录

> 本文保留 2026-05-27 的原始排查过程。原文中的“可能的根因”和“当前状态”描述的是当时的实验状态，不代表 T02 完成后的实现。

## 问题描述

Claude Code 无法连接 git-graph MCP 服务器，状态持续显示为 `failed`。

## 调试时间线

### 2026-05-27

#### 尝试 1：更换 node 路径
- **原始配置**：使用 `F:\WeChatwork\微信web开发者工具\node.exe`（Node v16.13.1）
- **修改**：改为 `C:\Program Files\nodejs\node.exe`（Node v20.19.4）
- **结果**：仍然失败
- **原因分析**：问题不在 node 版本

#### 尝试 2：改为 cmd /c 包装
- **修改**：`command` 设为 `cmd`，`args` 使用 `/c` 调用 node
- **结果**：仍然失败
- **原因分析**：`cmd /c` 可能引入了 stdio 转发问题

#### 尝试 3：直接调用 node.exe
- **修改**：去掉 `cmd /c`，直接指定 node.exe 路径
- **结果**：连接超时（`connection timed out after 30000ms`）
- **原因分析**：进程启动了但通信失败，可能是 stdout 缓冲问题

#### 尝试 4：添加调试日志
- **修改**：在 `mcp.js` 中添加日志文件记录（`C:\Users\wenwen\AppData\Local\Temp\git-graph-mcp.log`）
- **发现**：
  - 服务器能正常启动
  - 能收到 Claude Code 的 `initialize` 请求
  - 能生成响应并尝试写入 stdout
  - 但 Claude Code 没有收到响应

#### 尝试 5：修复 stdout 写入方式
- **修改**：
  - `StdioJsonRpcTransport` 构造函数中设置 `input.setEncoding(null)` 确保 Buffer 模式
  - `write()` 方法中使用 `this.output.write()` 代替 `fs.writeSync`
  - 添加 `this.output._handle.setBlocking(true)` 设置阻塞模式
- **结果**：仍在测试中

#### 尝试 6：创建批处理文件
- **修改**：创建 `start-mcp.bat` 避免命令行参数解析问题
- **配置**：`cmd /c F:\sokusai\My project\git-graph-mcp\start-mcp.bat`
- **结果**：仍在测试中

## 当前状态

- 手动测试（通过 bash 管道）**始终正常**
- Claude Code 启动时 **无法建立通信**
- 日志显示服务器收到请求但响应未送达 Claude

## 可能的根因

1. **Windows stdout 缓冲**：通过 `cmd /c` 启动时，node 的 stdout 可能被缓冲，响应未及时刷新
2. **管道句柄问题**：Claude Code 重定向 stdio 时，句柄传递可能有问题
3. **JSON-RPC 格式兼容性**：Claude Code 发送的 `initialize` 协议版本是 `2025-11-25`，服务器已适配

## 下一步排查方向

1. 验证 `this.output._handle.setBlocking(true)` 是否解决了缓冲问题
2. 检查是否需要使用 `winpty` 或其他 Windows 控制台模拟
3. 尝试将 MCP 服务器改为使用 SSE（Server-Sent Events）传输而非 stdio
4. 检查 Claude Code 是否有 Windows 特定的 MCP 连接限制
5. 考虑使用 `@modelcontextprotocol/sdk` 官方库替代手写 JSON-RPC 传输层

## 相关文件

- `src/mcp.js` - MCP 服务器核心代码（已添加调试日志和缓冲修复）
- `start-mcp.bat` - Windows 启动批处理
- `C:\Users\wenwen\AppData\Local\Temp\git-graph-mcp.log` - 运行时日志

## 关键日志记录

```
[2026-05-27T17:33:18.164Z] Server starting, cwd: F:\CC switch node: v20.19.4
[2026-05-27T17:33:18.168Z] RECV {"jsonrpc":"2.0","id":1,"method":"initialize",...}
[2026-05-27T17:33:18.168Z] WRITE 1 result fd: 1
```

日志显示：服务器启动正常 -> 收到 initialize 请求 -> 尝试写入响应 -> 但 Claude Code 未收到。问题锁定在 **stdout 写入后未送达客户端**。

## T02 已验证结论（2026-08-26）

- 使用官方 `@modelcontextprotocol/sdk` 客户端连接当前服务时，旧实现稳定在 2 秒超时。
- 直接读取旧服务响应可见 `Content-Length: ...\r\n\r\n` 头；官方 MCP stdio 传输要求每条 JSON-RPC 消息使用换行分隔。
- 根因是服务端自定义的 Content-Length 响应分帧与官方 stdio 客户端读取约定不兼容，不是已被证明的 Claude Code Windows stdout 缓冲缺陷。
- `src/mcp.js` 已移除自定义传输和强制 blocking 写入，改用官方 `StdioServerTransport`。
- 回归测试 `test/integration/mcp-stdio.test.js` 已通过：真实 bin 进程可完成 initialize 并列出 5 个现有工具。
- 后续诊断日志必须写入 stderr 或显式开启的调试通道，不能污染 MCP stdout。

## 当前配置（~/.claude.json）

```json
"git-graph": {
  "type": "stdio",
  "command": "cmd",
  "args": [
    "/c",
    "F:\\sokusai\\My project\\git-graph-mcp\\start-mcp.bat"
  ]
}
```
