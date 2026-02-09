# WebSocket API 契约：Tmux Session UI（增量）

**日期**: 2026-02-09

> 本文档定义 spec 2 新增的 PTY WebSocket 端点。spec 1 已有端点（`/ws` session 推送、`/ws/install/:task_id`）保持不变。

---

## PTY 终端连接

### `WS /ws/pty`

建立与 tmux session 的终端连接。每个 WebSocket 连接对应一个独立的 PTY 进程。

**连接**: `ws://localhost:1234/ws/pty?session=<name>&cols=<n>&rows=<n>`

**查询参数**:

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| session | string | 是 | — | tmux session 名称 |
| cols | u16 | 否 | 80 | 初始终端列数 |
| rows | u16 | 否 | 24 | 初始终端行数 |

**连接失败响应**:
- `400 Bad Request` — 缺少 session 参数
- `404 Not Found` — 指定 session 不存在
- `500 Internal Server Error` — PTY 创建失败

---

## 消息格式

PTY WebSocket 使用**混合帧模式**：

- **Binary 帧**: 终端 I/O 原始字节流（高频）
- **Text 帧**: JSON 控制消息（低频）

---

### 客户端 → 服务端

#### 终端输入（Binary 帧）

用户键盘输入的原始字节流。xterm.js `onData` 回调的输出直接作为 Binary 帧发送。

```
[Binary Frame] 0x6C 0x73 0x0A  // "ls\n"
```

#### 终端 Resize（Text 帧）

通知后端调整 PTY 窗口大小。

```json
{
  "type": "resize",
  "cols": 120,
  "rows": 40
}
```

**触发时机**: xterm.js `fitAddon.fit()` 检测到 cols/rows 变化时。

#### 心跳 Ping（Text 帧）

```json
{
  "type": "ping"
}
```

---

### 服务端 → 客户端

#### 终端输出（Binary 帧）

PTY 进程的原始输出字节流。包含 ANSI 转义序列、颜色代码等。直接传给 `xterm.write()`。

```
[Binary Frame] <raw terminal output bytes>
```

#### 心跳 Pong（Text 帧）

```json
{
  "type": "pong"
}
```

#### PTY 退出（Text 帧）

PTY 子进程退出时通知客户端。

```json
{
  "type": "exit",
  "code": 0
}
```

**客户端行为**: 收到后在终端显示退出信息，提示用户关闭或重新连接。

#### 错误通知（Text 帧）

```json
{
  "type": "error",
  "message": "PTY process crashed unexpectedly"
}
```

---

## 连接生命周期

```
1. 客户端发起 WebSocket 握手: WS /ws/pty?session=dev&cols=80&rows=24
2. 服务端验证 session 存在
3. 服务端创建 PTY，执行 `tmux attach-session -t dev`
4. 服务端注册 PtySession 到全局状态
5. 双向数据流开始:
   - PTY stdout → Binary WS 帧 → 客户端
   - 客户端 → Binary WS 帧 → PTY stdin
6. Resize 控制消息随时可发送
7. 连接结束（任一条件触发）:
   a. 客户端主动关闭 WebSocket
   b. PTY 进程退出（发送 exit 帧后关闭）
   c. 服务端检测心跳超时（60s 无消息）
8. 服务端清理: kill PTY 子进程, 移除 PtySession
```

---

## 连接管理

### 重连策略

与 spec 1 一致：指数退避重连。

1. 连接断开后等待 1 秒重试
2. 每次失败后等待时间翻倍
3. 最大等待时间 30 秒
4. 重连时重新建立 PTY 连接（新的 `tmux attach`）

**注意**: 重连会创建新的 PTY attach，tmux 终端状态不会丢失（tmux 本身保持 session 活跃）。

### 心跳

- 客户端每 30 秒发送 `ping`
- 服务端 60 秒内未收到消息则关闭连接并清理 PTY
- 客户端 10 秒内未收到 `pong` 则认为连接断开，触发重连

### 并发连接

- 同一 session 允许多个同时连接（多个终端窗格打开同一 session）
- 每个连接独立的 PTY 进程（独立的 `tmux attach`）
- tmux 自身处理多客户端 attach 的同步

---

## 缓冲区策略

### 服务端
- PTY 读取缓冲区: 4096 bytes
- 每次 PTY 输出立即转发为 Binary WS 帧，不做合并
- 如果 WebSocket 发送缓慢（背压），PTY 读取自然阻塞

### 客户端
- xterm.js 自身管理渲染缓冲区
- WebSocket 消息直接传给 `terminal.write(data)`
- 无需额外缓冲
