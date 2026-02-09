# REST API 契约：0xMux

**日期**: 2026-02-09
**基础路径**: `/api`
**内容类型**: `application/json`

---

## 健康检查

### `GET /api/health`

服务健康检查。

**响应** `200 OK`：
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

## Session 管理

### `GET /api/sessions`

获取所有 tmux 会话列表。

**响应** `200 OK`：
```json
[
  {
    "name": "dev",
    "windows": 3,
    "created": "1707465600",
    "attached": true
  },
  {
    "name": "server",
    "windows": 1,
    "created": "1707465700",
    "attached": false
  }
]
```

**响应** `200 OK`（无会话或 tmux 未安装）：
```json
[]
```

---

### `POST /api/sessions`

创建新的 tmux 会话。

**请求体**：
```json
{
  "name": "my-session"
}
```

| 字段 | 类型 | 必需 | 验证规则 |
|------|------|------|----------|
| name | string | 是 | `^[a-zA-Z0-9_.-]+$`，1-50 字符 |

**响应** `201 Created`：
```json
{
  "name": "my-session",
  "windows": 1,
  "created": "1707466000",
  "attached": false
}
```

**响应** `400 Bad Request`：
```json
{
  "error": "invalid_name",
  "message": "Session name contains invalid characters"
}
```

**响应** `409 Conflict`：
```json
{
  "error": "already_exists",
  "message": "Session 'my-session' already exists"
}
```

---

### `DELETE /api/sessions/:name`

关闭（kill）指定 tmux 会话。

**路径参数**：
- `name` — 会话名称

**响应** `204 No Content`

**响应** `404 Not Found`：
```json
{
  "error": "not_found",
  "message": "Session 'xxx' not found"
}
```

---

### `PUT /api/sessions/:name`

重命名指定 tmux 会话。

**路径参数**：
- `name` — 当前会话名称

**请求体**：
```json
{
  "name": "new-name"
}
```

**响应** `200 OK`：
```json
{
  "name": "new-name",
  "windows": 3,
  "created": "1707465600",
  "attached": true
}
```

**响应** `404 Not Found`：
```json
{
  "error": "not_found",
  "message": "Session 'xxx' not found"
}
```

---

## 系统管理

### `GET /api/system/deps`

检测系统依赖状态。

**响应** `200 OK`：
```json
{
  "os": "macos",
  "arch": "arm64",
  "package_manager": "brew",
  "dependencies": [
    {
      "name": "tmux",
      "required": true,
      "installed": true,
      "version": "3.4",
      "min_version": "2.6"
    },
    {
      "name": "claude-code",
      "required": false,
      "installed": false,
      "version": null,
      "min_version": null
    }
  ]
}
```

---

### `POST /api/system/install`

触发依赖安装任务。

**请求体**：
```json
{
  "package": "tmux"
}
```

| 字段 | 类型 | 必需 | 验证规则 |
|------|------|------|----------|
| package | string | 是 | 必须在预定义白名单内 |

**响应** `202 Accepted`：
```json
{
  "task_id": "a1b2c3d4",
  "package": "tmux",
  "status": "running",
  "ws_url": "/ws/install/a1b2c3d4"
}
```

**响应** `400 Bad Request`：
```json
{
  "error": "package_not_allowed",
  "message": "Package 'xxx' is not in the allowed list"
}
```

**响应** `409 Conflict`：
```json
{
  "error": "already_running",
  "message": "An installation task is already running"
}
```

**响应** `503 Service Unavailable`：
```json
{
  "error": "no_package_manager",
  "message": "No supported package manager found on this system"
}
```

---

### `POST /api/system/restart`

请求服务重启。

**响应** `202 Accepted`：
```json
{
  "message": "Server will restart shortly"
}
```

服务收到请求后优雅关闭，退出码 42。npm 启动器检测到此退出码后自动重启。

---

## 服务配置

### `GET /api/config`

获取当前服务配置。

**响应** `200 OK`：
```json
{
  "port": 1234,
  "host": "127.0.0.1",
  "version": "0.1.0"
}
```

---

## 错误格式

所有错误响应使用统一格式：

```json
{
  "error": "error_code",
  "message": "Human-readable error description"
}
```

| HTTP 状态码 | 使用场景 |
|------------|----------|
| 400 | 请求参数无效 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用（如包管理器缺失） |
