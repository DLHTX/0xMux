# REST API 契约：Tmux Session UI（增量）

**日期**: 2026-02-09
**基础路径**: `/api`
**内容类型**: `application/json`

> 本文档仅定义 spec 2 新增的端点。spec 1 已有端点（sessions CRUD、health、config、system）保持不变。

---

## Window 管理

### `GET /api/sessions/:name/windows`

获取指定 session 的所有 window 列表。

**路径参数**:
- `name` — session 名称

**响应** `200 OK`:
```json
[
  {
    "index": 0,
    "name": "bash",
    "active": true,
    "panes": 1
  },
  {
    "index": 1,
    "name": "vim",
    "active": false,
    "panes": 2
  }
]
```

**响应** `404 Not Found`:
```json
{
  "error": "not_found",
  "message": "Session 'xxx' not found"
}
```

---

### `POST /api/sessions/:name/windows`

在指定 session 中创建新 window。

**路径参数**:
- `name` — session 名称

**请求体**（可选）:
```json
{
  "window_name": "my-window"
}
```

| 字段 | 类型 | 必需 | 验证规则 |
|------|------|------|----------|
| window_name | string | 否 | `^[a-zA-Z0-9_.-]*$`，0-50 字符，空则使用默认 shell 名称 |

**响应** `201 Created`:
```json
{
  "index": 2,
  "name": "my-window",
  "active": true,
  "panes": 1
}
```

**响应** `404 Not Found`:
```json
{
  "error": "not_found",
  "message": "Session 'xxx' not found"
}
```

---

### `DELETE /api/sessions/:name/windows/:index`

关闭指定 session 的指定 window。

**路径参数**:
- `name` — session 名称
- `index` — window 索引

**响应** `204 No Content`

**响应** `404 Not Found`:
```json
{
  "error": "not_found",
  "message": "Window index 5 not found in session 'xxx'"
}
```

**响应** `409 Conflict`:
```json
{
  "error": "last_window",
  "message": "Cannot close the last window of a session. Delete the session instead."
}
```

---

## PTY 连接（信息端点）

### `GET /api/pty/sessions`

获取当前所有活跃的 PTY 连接列表（调试用途）。

**响应** `200 OK`:
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "session_name": "dev",
    "cols": 120,
    "rows": 40,
    "pid": 12345,
    "created_at": "2026-02-09T10:30:00Z"
  }
]
```

---

## 错误格式

延用 spec 1 统一错误格式:

```json
{
  "error": "error_code",
  "message": "Human-readable error description"
}
```

新增错误码:

| HTTP 状态码 | error 码 | 使用场景 |
|------------|----------|----------|
| 404 | `not_found` | Window 不存在 |
| 409 | `last_window` | 尝试关闭 session 的最后一个 window |
