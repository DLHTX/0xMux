# WebSocket API 契约：0xMux

**日期**: 2026-02-09

---

## 连接端点

### `WS /ws`

通用 WebSocket 连接，用于 session 状态实时推送。

**连接**: `ws://localhost:1234/ws`（生产）或 `ws://localhost:3001/ws`（开发）

---

### 消息格式

所有 WebSocket 消息使用 JSON 格式：

```json
{
  "type": "message_type",
  "data": { ... }
}
```

---

### 服务端 → 客户端消息

#### `sessions_update`

Session 列表状态变更通知。

```json
{
  "type": "sessions_update",
  "data": {
    "sessions": [
      {
        "name": "dev",
        "windows": 3,
        "created": "1707465600",
        "attached": true
      }
    ]
  }
}
```

**触发时机**：每 3 秒轮询 tmux 检测到变化时推送。

---

### 客户端 → 服务端消息

#### `ping`

心跳消息。

```json
{
  "type": "ping"
}
```

**响应**：
```json
{
  "type": "pong"
}
```

---

## 安装日志流

### `WS /ws/install/:task_id`

实时接收依赖安装日志。

**连接**: `ws://localhost:1234/ws/install/a1b2c3d4`

---

### 服务端 → 客户端消息

#### `install_log`

安装进程的单行输出。

```json
{
  "type": "install_log",
  "data": {
    "line": "==> Downloading https://ghcr.io/v2/homebrew/core/tmux/manifests/3.4",
    "stream": "stdout"
  }
}
```

| stream 值 | 说明 |
|-----------|------|
| `stdout` | 标准输出 |
| `stderr` | 标准错误 |

#### `install_complete`

安装任务完成。

```json
{
  "type": "install_complete",
  "data": {
    "success": true,
    "exit_code": 0,
    "duration_ms": 15234
  }
}
```

#### `install_error`

安装过程发生错误。

```json
{
  "type": "install_error",
  "data": {
    "message": "Package manager not found",
    "manual_command": "brew install tmux"
  }
}
```

---

## 连接管理

### 重连策略

客户端应实现指数退避重连：

1. 连接断开后等待 1 秒重试
2. 每次失败后等待时间翻倍
3. 最大等待时间 30 秒
4. 重连期间显示 "Reconnecting..." 动画

### 心跳

- 客户端每 30 秒发送 `ping`
- 服务端 60 秒内未收到消息则关闭连接
- 客户端 10 秒内未收到 `pong` 则认为连接断开
