# REST API Contract: Floating Code Editor + Git Panel

**Feature ID**: 1-floating-editor-git
**Date**: 2026-02-13

---

## 1. File System API

所有文件 API 需要认证（复用现有 Bearer token），路径限制在项目根目录内。

### 1.1 GET /api/files/tree

列出目录内容（单层或指定深度）。

**Query Parameters**:

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| path | string | 否 | `.` | 相对路径 |
| depth | number | 否 | 1 | 展开深度 (1 = 仅子项) |

**Response 200**:
```json
{
  "path": "src",
  "children": [
    {
      "name": "main.rs",
      "path": "src/main.rs",
      "type": "file",
      "size": 4523,
      "modified": "2026-02-13T10:30:00Z"
    },
    {
      "name": "handlers",
      "path": "src/handlers",
      "type": "directory",
      "children": null
    }
  ]
}
```

**Error 400**: `{ "error": "Invalid path" }` — 路径遍历检测
**Error 404**: `{ "error": "Path not found" }`

---

### 1.2 GET /api/files/read

读取文件内容。

**Query Parameters**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 相对文件路径 |

**Response 200**:
```json
{
  "path": "src/main.rs",
  "content": "fn main() {\n    println!(\"Hello\");\n}\n",
  "language": "rust",
  "size": 42,
  "encoding": "utf-8"
}
```

**Error 400**: `{ "error": "Binary file not supported" }`
**Error 400**: `{ "error": "File too large (max 5MB)" }`
**Error 404**: `{ "error": "File not found" }`

---

### 1.3 PUT /api/files/write

写入文件内容。

**Request Body**:
```json
{
  "path": "src/main.rs",
  "content": "fn main() {\n    println!(\"Updated\");\n}\n"
}
```

**Response 200**:
```json
{
  "success": true,
  "size": 48
}
```

**Error 400**: `{ "error": "Invalid path" }`
**Error 400**: `{ "error": "Content too large (max 5MB)" }`
**Error 404**: `{ "error": "Parent directory not found" }`

---

### 1.4 GET /api/files/search

全文搜索文件内容。

**Query Parameters**:

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| query | string | 是 | — | 搜索词 |
| regex | boolean | 否 | false | 是否正则 |
| case | boolean | 否 | false | 是否区分大小写 |
| glob | string | 否 | — | 文件过滤 (e.g., `*.rs`) |
| max | number | 否 | 200 | 最大结果数 |

**Response 200**:
```json
{
  "results": [
    {
      "file_path": "src/main.rs",
      "matches": [
        {
          "line_number": 1,
          "line_content": "fn main() {",
          "match_start": 3,
          "match_end": 7
        }
      ]
    }
  ],
  "total_files": 1,
  "total_matches": 1,
  "truncated": false
}
```

**Error 400**: `{ "error": "Invalid regex pattern" }`

---

## 2. Git API

所有 Git API 需要认证。Git 仓库根目录通过 `git rev-parse --show-toplevel` 从会话 cwd 自动检测。

### 2.1 GET /api/git/status

获取 Git 仓库状态。

**Query Parameters**: 无（使用服务器启动目录）

**Response 200**:
```json
{
  "branch": "main",
  "upstream": "origin/main",
  "ahead": 2,
  "behind": 0,
  "files": [
    {
      "path": "src/main.rs",
      "status": "modified",
      "staged": false,
      "old_path": null
    },
    {
      "path": "src/new_file.rs",
      "status": "untracked",
      "staged": false,
      "old_path": null
    },
    {
      "path": "src/old.rs",
      "status": "renamed",
      "staged": true,
      "old_path": "src/legacy.rs"
    }
  ]
}
```

**Error 500**: `{ "error": "Not a git repository" }`

---

### 2.2 GET /api/git/diff

获取文件的 diff 内容（用于 Monaco DiffEditor）。

**Query Parameters**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 相对文件路径 |
| staged | boolean | 否 | true=暂存区 vs HEAD, false=工作区 vs HEAD |

**Response 200**:
```json
{
  "file_path": "src/main.rs",
  "original": "fn main() {\n    println!(\"Hello\");\n}\n",
  "modified": "fn main() {\n    println!(\"Updated\");\n}\n",
  "language": "rust"
}
```

**Error 404**: `{ "error": "File not found or not changed" }`

---

### 2.3 GET /api/git/log

获取提交历史。

**Query Parameters**:

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| limit | number | 否 | 20 | 最大返回条数 |

**Response 200**:
```json
{
  "commits": [
    {
      "hash": "722cfed566acd4efccaa92a94d8663d3d9af5c2c",
      "short_hash": "722cfed",
      "message": "release: v0.2.0",
      "author": "koray",
      "email": "koray@example.com",
      "date": "2026-02-13T08:00:00Z",
      "refs": "HEAD -> main, tag: v0.2.0, origin/main"
    }
  ]
}
```

---

### 2.4 GET /api/git/branches

获取所有分支。

**Response 200**:
```json
{
  "branches": [
    {
      "name": "main",
      "short_hash": "722cfed",
      "upstream": "origin/main",
      "is_current": true,
      "is_remote": false
    },
    {
      "name": "origin/main",
      "short_hash": "722cfed",
      "upstream": null,
      "is_current": false,
      "is_remote": true
    }
  ]
}
```

---

## 3. 通用约定

### 认证

所有新 API 端点复用现有认证中间件：
```
Authorization: Bearer <token>
```

### 错误格式

```json
{
  "error": "Human-readable error message"
}
```

HTTP 状态码:
- `400` — 请求参数错误、路径遍历、文件过大
- `401` — 未认证
- `404` — 资源不存在
- `500` — 服务器内部错误

### 路径安全

所有接受 `path` 参数的端点：
1. 拒绝包含 `..` 的路径
2. 拒绝绝对路径（以 `/` 开头）
3. canonicalize 后验证前缀在项目根目录内
4. 不跟踪符号链接到外部目录
