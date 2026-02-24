# REST API Contract: AI Agent Desktop Automation

**Feature ID**: 2-agent-desktop-automation
**Date**: 2026-02-15

---

所有 Agent API 需要认证（复用现有 Bearer token）。所有坐标使用逻辑坐标系。

## 1. Desktop - Screenshot API

### 1.1 POST /api/agent/desktop/screenshot

截取屏幕截图，自动附带 HiDPI 元数据。

**Request Body**:

```json
{
  "monitor_id": 0,
  "region": { "x": 0, "y": 0, "width": 800, "height": 600 },
  "window_title": "Safari",
  "format": "png",
  "quality": 80,
  "scale": 1.0
}
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| monitor_id | number | 否 | 0 | 显示器 ID |
| region | object | 否 | null | 截取区域（逻辑坐标），null=全屏 |
| window_title | string | 否 | null | 按窗口标题截图（子串匹配） |
| format | string | 否 | "png" | 图片格式: "png" \| "jpeg" |
| quality | number | 否 | 80 | JPEG 质量 1-100 |
| scale | number | 否 | 1.0 | 输出缩放因子 0.1-1.0 |

**Response 200**:

```json
{
  "image": "<base64 encoded>",
  "format": "png",
  "physical_width": 2880,
  "physical_height": 1800,
  "logical_width": 1440,
  "logical_height": 900,
  "scale_factor": 2.0,
  "monitor_id": 0
}
```

---

### 1.2 GET /api/agent/desktop/displays

枚举所有连接的显示器。

**Response 200**:

```json
{
  "displays": [
    {
      "id": 0,
      "name": "Built-in Retina Display",
      "logical_width": 1440,
      "logical_height": 900,
      "physical_width": 2880,
      "physical_height": 1800,
      "scale_factor": 2.0,
      "is_primary": true
    }
  ]
}
```

---

## 2. Desktop - Input API

### 2.1 POST /api/agent/desktop/click

模拟鼠标点击。

**Request Body**:

```json
{
  "x": 500,
  "y": 300,
  "button": "left",
  "double_click": false,
  "ref": "e5"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| x | number | 否* | 逻辑 X 坐标 |
| y | number | 否* | 逻辑 Y 坐标 |
| button | string | 否 | "left" \| "right" \| "middle"，默认 "left" |
| double_click | bool | 否 | 是否双击，默认 false |
| ref | string | 否* | UI 树元素引用 ID，与 x/y 二选一 |

*注: 必须提供 (x, y) 或 ref 之一。ref 优先。

**Response 200**: `{ "success": true }`
**Error 404**: `{ "error": "Element ref not found" }`

---

### 2.2 POST /api/agent/desktop/type

模拟键盘输入文字。

**Request Body**:

```json
{
  "text": "Hello World",
  "ref": "e3"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 要输入的文字（支持 Unicode） |
| ref | string | 否 | 先点击该元素再输入 |

**Response 200**: `{ "success": true }`

---

### 2.3 POST /api/agent/desktop/key

模拟按键或组合键。

**Request Body**:

```json
{
  "key": "ctrl+c",
  "repeat": 1
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | string | 是 | 按键描述: "enter", "ctrl+c", "cmd+shift+s", "f5" |
| repeat | number | 否 | 重复次数，默认 1 |

**Response 200**: `{ "success": true }`

---

### 2.4 POST /api/agent/desktop/drag

模拟拖拽。

**Request Body**:

```json
{
  "start_x": 100,
  "start_y": 200,
  "end_x": 500,
  "end_y": 400,
  "start_ref": "e1",
  "end_ref": "e2"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start_x / start_y | number | 否* | 起点逻辑坐标 |
| end_x / end_y | number | 否* | 终点逻辑坐标 |
| start_ref | string | 否* | 起点元素 ref |
| end_ref | string | 否* | 终点元素 ref |

**Response 200**: `{ "success": true }`

---

## 3. Desktop - UI Tree API

### 3.1 GET /api/agent/desktop/ui-tree

读取无障碍树。

**Query Parameters**:

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| window_title | string | 否 | null | 目标窗口（子串匹配），null=前台窗口 |
| filter | string | 否 | "all" | "all" \| "interactive"（仅按钮/输入框等） |
| depth | number | 否 | 10 | 最大树深度 |
| max_elements | number | 否 | 1000 | 最大元素数 |

**Response 200**:

```json
{
  "app_name": "Safari",
  "window_title": "Google - Safari",
  "elements": [
    {
      "ref_id": "e1",
      "role": "button",
      "name": "Back",
      "value": null,
      "bounds": { "x": 12, "y": 52, "width": 28, "height": 28 },
      "children_count": 0
    },
    {
      "ref_id": "e2",
      "role": "textbox",
      "name": "Address and search bar",
      "value": "https://google.com",
      "bounds": { "x": 120, "y": 52, "width": 600, "height": 28 },
      "children_count": 0
    }
  ],
  "total_elements": 42,
  "truncated": false
}
```

**Error 503**: `{ "error": "Accessibility permission not granted" }`

---

### 3.2 GET /api/agent/desktop/ui-find

搜索 UI 元素。

**Query Parameters**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 搜索关键词（匹配 name、role、value） |
| window_title | string | 否 | 目标窗口 |

**Response 200**:

```json
{
  "matches": [
    {
      "ref_id": "e5",
      "role": "button",
      "name": "Submit",
      "value": null,
      "bounds": { "x": 300, "y": 400, "width": 120, "height": 36 }
    }
  ]
}
```

---

## 4. Desktop - Window API

### 4.1 GET /api/agent/desktop/windows

列出所有打开的窗口。

**Response 200**:

```json
{
  "windows": [
    {
      "id": 12345,
      "title": "main.rs - 0xMux",
      "app_name": "Code",
      "x": 0,
      "y": 25,
      "width": 1440,
      "height": 875,
      "monitor_id": 0,
      "is_focused": true
    }
  ]
}
```

---

### 4.2 POST /api/agent/desktop/window/focus

聚焦指定窗口。

**Request Body**:

```json
{
  "title": "Safari"
}
```

**Response 200**: `{ "success": true }`
**Error 404**: `{ "error": "No window matching title" }`

---

### 4.3 POST /api/agent/desktop/launch

启动应用。

**Request Body**:

```json
{
  "app_name": "Safari"
}
```

**Response 200**: `{ "success": true, "pid": 12345 }`
**Error 404**: `{ "error": "Application not found" }`

---

### 4.4 POST /api/agent/desktop/quit

关闭应用。

**Request Body**:

```json
{
  "app_name": "Safari"
}
```

**Response 200**: `{ "success": true }`

---

### 4.5 GET /api/agent/desktop/app-status

检查应用是否在运行。

**Query Parameters**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| app_name | string | 是 | 应用名称 |

**Response 200**:

```json
{
  "app_name": "Safari",
  "is_running": true,
  "pid": 12345
}
```

---

## 5. Desktop - Command Execution API

### 5.1 POST /api/agent/desktop/run

执行系统命令。

**Request Body**:

```json
{
  "command": "ls",
  "args": ["-la", "/tmp"],
  "timeout_ms": 120000,
  "env": { "LANG": "en_US.UTF-8" },
  "cwd": "/Users/koray"
}
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| command | string | 是 | - | 命令名 |
| args | string[] | 否 | [] | 参数 |
| timeout_ms | number | 否 | 120000 | 超时（ms），最大 600000 |
| env | object | 否 | {} | 额外环境变量 |
| cwd | string | 否 | null | 工作目录 |

**Response 200**:

```json
{
  "exit_code": 0,
  "stdout": "total 16\ndrwxr-xr-x ...",
  "stderr": "",
  "duration_ms": 45,
  "truncated": false
}
```

**Error 408**: `{ "error": "Command timed out" }`

---

## 6. Cron Scheduler API

### 6.1 GET /api/agent/cron

列出所有定时任务。

**Response 200**:

```json
{
  "jobs": [
    {
      "id": "job_abc123",
      "name": "Screenshot monitor",
      "schedule": {
        "type": "cron",
        "expr": "0 */30 * * * *",
        "tz": "Asia/Shanghai"
      },
      "action": {
        "type": "screenshot",
        "save_to": "monitor"
      },
      "enabled": true,
      "last_run": "2026-02-15T10:30:00+08:00",
      "last_status": "ok",
      "next_run": "2026-02-15T11:00:00+08:00",
      "consecutive_failures": 0,
      "created_at": "2026-02-15T08:00:00+08:00"
    }
  ]
}
```

---

### 6.2 POST /api/agent/cron

创建定时任务。

**Request Body**:

```json
{
  "name": "Check website",
  "schedule": {
    "type": "every",
    "interval_ms": 3600000
  },
  "action": {
    "type": "run_command",
    "command": "curl",
    "args": ["-s", "https://example.com"]
  },
  "enabled": true
}
```

**Schedule 类型**:

| type | 必填参数 | 说明 |
|------|---------|------|
| "at" | at: ISO 8601 时间 | 一次性任务 |
| "every" | interval_ms: number | 固定间隔（毫秒） |
| "cron" | expr: cron 表达式, tz?: 时区 | 标准 cron |

**Action 类型**:

| type | 必填参数 | 说明 |
|------|---------|------|
| "run_command" | command, args? | 执行命令 |
| "open_app" | app_name | 启动应用 |
| "open_url" | url | 打开网页 |
| "screenshot" | save_to? | 截图并通知 |
| "custom" | script_path | 执行脚本 |

**Response 201**:

```json
{
  "id": "job_def456",
  "name": "Check website",
  "next_run": "2026-02-15T12:00:00+08:00"
}
```

---

### 6.3 GET /api/agent/cron/:id

获取单个任务详情。

**Response 200**: 完整 CronJob 对象（同 6.1 中的数组元素格式）

---

### 6.4 PUT /api/agent/cron/:id

更新任务。

**Request Body**: 与 POST 相同，全量更新。

**Response 200**: 更新后的完整 CronJob 对象

---

### 6.5 DELETE /api/agent/cron/:id

删除任务。

**Response 200**: `{ "success": true }`

---

### 6.6 POST /api/agent/cron/:id/run

立即执行任务（不影响正常调度）。

**Response 200**:

```json
{
  "result": {
    "status": "ok",
    "output": "...",
    "duration_ms": 1200,
    "executed_at": "2026-02-15T10:45:30+08:00"
  }
}
```

---

### 6.7 POST /api/agent/cron/:id/toggle

切换任务启用/禁用状态。

**Response 200**:

```json
{
  "id": "job_abc123",
  "enabled": false
}
```

---

## 7. Browser Automation API (Optional)

需要编译时启用 `browser` feature flag。

### 7.1 POST /api/agent/browser/navigate

导航到 URL。

**Request Body**:

```json
{
  "url": "https://twitter.com"
}
```

**Response 200**: `{ "success": true, "title": "X" }`

---

### 7.2 GET /api/agent/browser/snapshot

获取页面无障碍快照。

**Response 200**:

```json
{
  "url": "https://twitter.com",
  "title": "X",
  "elements": [
    {
      "ref_id": "r1",
      "role": "link",
      "name": "Home",
      "value": null
    },
    {
      "ref_id": "r2",
      "role": "textbox",
      "name": "Search",
      "value": ""
    }
  ]
}
```

---

### 7.3 POST /api/agent/browser/click

点击页面元素。

**Request Body**:

```json
{
  "ref": "r2",
  "button": "left",
  "double_click": false
}
```

**Response 200**: `{ "success": true }`

---

### 7.4 POST /api/agent/browser/type

在页面元素中输入文字。

**Request Body**:

```json
{
  "ref": "r2",
  "text": "0xMux",
  "submit": true
}
```

**Response 200**: `{ "success": true }`

---

### 7.5 POST /api/agent/browser/screenshot

页面截图。

**Request Body**:

```json
{
  "full_page": false,
  "format": "png"
}
```

**Response 200**:

```json
{
  "image": "<base64>",
  "width": 1280,
  "height": 720
}
```

---

### 7.6 POST /api/agent/browser/evaluate

执行 JavaScript。

**Request Body**:

```json
{
  "function": "() => document.title"
}
```

**Response 200**:

```json
{
  "result": "X"
}
```

---

### 7.7 GET /api/agent/browser/tabs

列出浏览器标签页。

**Response 200**:

```json
{
  "tabs": [
    { "index": 0, "title": "X", "url": "https://twitter.com", "active": true },
    { "index": 1, "title": "Google", "url": "https://google.com", "active": false }
  ]
}
```

---

### 7.8 POST /api/agent/browser/tabs

标签页操作。

**Request Body**:

```json
{
  "action": "new",
  "index": 0,
  "url": "https://example.com"
}
```

| action | 参数 | 说明 |
|--------|------|------|
| "new" | url? | 创建新标签 |
| "close" | index? | 关闭标签，默认当前 |
| "select" | index | 切换到指定标签 |

**Response 200**: `{ "success": true }`

---

## 8. 通用错误格式

所有 API 错误统一格式:

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | INVALID_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 未认证 |
| 404 | NOT_FOUND | 资源不存在（窗口/元素/任务） |
| 408 | TIMEOUT | 命令执行超时 |
| 503 | PERMISSION_DENIED | 系统权限未授予（Accessibility等） |
| 503 | FEATURE_DISABLED | 功能未启用（browser feature flag） |
| 500 | INTERNAL_ERROR | 内部错误 |
