# REST API 契约：密码鉴权与公网安全访问

**日期**: 2026-02-09
**分支**: `3-password-auth`

---

## 鉴权端点

### GET /api/auth/status

查询当前鉴权状态。**无需鉴权**。

**响应 200**:
```json
{
  "initialized": false
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `initialized` | boolean | 是否已设置密码 |

---

### POST /api/auth/setup

首次设置密码。**无需鉴权**。仅在未初始化时可用。

**请求体**:
```json
{
  "password": "my-strong-password",
  "confirm": "my-strong-password"
}
```

**响应 200**（设置成功，自动签发 token）:
```json
{
  "token": "1738800000.a1b2c3d4...32hex.signature...64hex"
}
```

**响应 400**（验证失败）:
```json
{
  "error": "bad_request",
  "message": "密码不一致"
}
```

```json
{
  "error": "bad_request",
  "message": "密码长度不能少于 6 个字符"
}
```

**响应 409**（已初始化）:
```json
{
  "error": "conflict",
  "message": "密码已设置，请使用登录接口"
}
```

---

### POST /api/auth/login

登录验证。**无需鉴权**。受速率限制。

**请求体**:
```json
{
  "password": "my-strong-password"
}
```

**响应 200**:
```json
{
  "token": "1738800000.a1b2c3d4...32hex.signature...64hex"
}
```

**响应 401**:
```json
{
  "error": "unauthorized",
  "message": "密码错误"
}
```

**响应 403**（未初始化时尝试登录）:
```json
{
  "error": "forbidden",
  "message": "请先设置密码"
}
```

**响应 429**（速率限制）:
```json
{
  "error": "too_many_requests",
  "message": "操作过于频繁",
  "retry_after": 845
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `retry_after` | number | 剩余锁定秒数 |

---

### PUT /api/auth/password

修改密码。**需要鉴权**。

**请求头**: `Authorization: Bearer <token>`

**请求体**:
```json
{
  "current": "old-password",
  "password": "new-password",
  "confirm": "new-password"
}
```

**响应 200**:
```json
{
  "message": "密码已更新"
}
```

**响应 400**（验证失败）:
```json
{
  "error": "bad_request",
  "message": "新密码不一致"
}
```

**响应 401**（当前密码错误）:
```json
{
  "error": "unauthorized",
  "message": "当前密码错误"
}
```

---

## 外部访问端点

### GET /api/access/config

获取外部访问配置。**需要鉴权**。

**响应 200**:
```json
{
  "external_access": false,
  "allow_remote_install": false,
  "allow_remote_restart": false,
  "listen_address": "127.0.0.1:1234",
  "lan_ip": null,
  "restart_required": false
}
```

---

### PUT /api/access/config

更新外部访问配置。**需要鉴权**。

**请求体**:
```json
{
  "external_access": true,
  "allow_remote_install": false,
  "allow_remote_restart": false
}
```

**响应 200**:
```json
{
  "external_access": true,
  "allow_remote_install": false,
  "allow_remote_restart": false,
  "listen_address": "127.0.0.1:1234",
  "lan_ip": "192.168.1.100",
  "restart_required": true
}
```

---

## 鉴权中间件行为

### 受保护端点

除以下白名单外，所有 `/api/*` 端点和 `/ws*` 端点均需鉴权：

**白名单**（无需 token）:
- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- 所有静态文件请求（非 `/api/` 和 `/ws` 前缀）

### Token 提取优先级

1. `Authorization: Bearer <token>` 请求头
2. `?token=<token>` URL 查询参数
3. `mux_token=<token>` Cookie

### 鉴权失败响应

**未提供 token**:
```
HTTP 401
{
  "error": "unauthorized",
  "message": "未登录"
}
```

**Token 无效或过期**:
```
HTTP 401
{
  "error": "unauthorized",
  "message": "登录已过期，请重新登录"
}
```

### WebSocket 鉴权

WebSocket 端点在 HTTP 升级前验证 token：
- `/ws?token=<token>`
- `/ws/pty?session=xxx&cols=80&rows=24&token=<token>`
- `/ws/install/{task_id}?token=<token>`

鉴权失败返回 HTTP 401（不升级为 WebSocket）。

---

## 公网模式端点限制

当 `external_access = true` 且对应开关关闭时：

**POST /api/system/install** 返回:
```
HTTP 403
{
  "error": "forbidden",
  "message": "远程安装已禁用"
}
```

**POST /api/system/restart** 返回:
```
HTTP 403
{
  "error": "forbidden",
  "message": "远程重启已禁用"
}
```

**GET /api/dirs** 路径限制:
- `path` 参数必须在 `$HOME` 目录范围内
- 超出范围返回 403: `{ "error": "forbidden", "message": "路径超出允许范围" }`
