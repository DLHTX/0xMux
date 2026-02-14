---
name: 0xMux API
description: 0xMux 终端复用器的完整 HTTP API 参考，包括会话管理、窗口/分屏操作、终端 I/O、文件系统、Git 查询和通知推送。
version: "0.5.0"
recommended: true
official: true
---

# 0xMux API Skill

0xMux 是一个基于 tmux 的 Web 终端复用器。所有操作通过 HTTP REST API 完成。
基地址：`http://localhost:{port}`（默认端口见启动配置）。

---

## 1. 会话管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 列出所有 tmux 会话 |
| POST | `/api/sessions` | 创建新会话 |
| DELETE | `/api/sessions/{name}` | 删除会话 |
| PUT | `/api/sessions/{name}` | 重命名会话 |
| GET | `/api/cwd` | 获取当前工作目录 |
| GET | `/api/sessions/next-name` | 获取下一个可用会话名 |

### 创建会话

```
POST /api/sessions
Content-Type: application/json

{
  "name": "my-session",       // 可选，不填则自动命名
  "cwd": "/path/to/dir"       // 可选，工作目录
}
```

---

## 2. 窗口管理

每个窗口对应 tmux 的一个 window。在 0xMux 前端中，每个窗口可以作为独立的分屏面板显示。

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/sessions/{name}/windows` | 列出会话中的所有窗口 |
| POST | `/api/sessions/{name}/windows` | 创建新窗口 |
| DELETE | `/api/sessions/{name}/windows/{index}` | 关闭窗口 |
| PUT | `/api/sessions/{name}/windows/{index}/select` | 激活窗口 |
| GET | `/api/sessions/{name}/windows/{index}/info` | 查询窗口信息 |

### 创建窗口

```
POST /api/sessions/{name}/windows
Content-Type: application/json

{
  "window_name": "worker-1"   // 可选，窗口名称
}
```

**响应**（201 Created）：

```json
{
  "index": 2,
  "name": "worker-1",
  "active": false,
  "panes": 1
}
```

### 窗口信息

```
GET /api/sessions/{name}/windows/{index}/info
```

**响应**：

```json
{
  "index": 2,
  "name": "worker-1",
  "pane_pid": "12345",
  "pane_current_path": "/home/user/project",
  "pane_current_command": "bash"
}
```

---

## 3. 终端 I/O

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/sessions/{name}/windows/{index}/input` | 向窗口发送输入 |
| GET | `/api/sessions/{name}/windows/{index}/capture?lines=N` | 捕获窗口输出 |

### 发送输入

```
POST /api/sessions/{name}/windows/{index}/input
Content-Type: application/json

{
  "data": "ls -la\n"
}
```

> 注意：命令末尾需要 `\n` 来模拟回车键。

### 捕获输出

```
GET /api/sessions/{name}/windows/{index}/capture?lines=50
```

**响应**：

```json
{
  "output": "total 42\ndrwxr-xr-x  5 user ..."
}
```

`lines` 参数可选，控制捕获的行数。

---

## 4. 通知推送

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/notifications` | 创建通知（同时广播到 WebSocket） |
| GET | `/api/notifications?limit=50` | 列出通知 |
| PUT | `/api/notifications/read-all` | 标记全部已读 |
| PUT | `/api/notifications/{id}/read` | 标记单条已读 |
| DELETE | `/api/notifications/{id}` | 删除通知 |

### 创建通知

```
POST /api/notifications
Content-Type: application/json

{
  "title": "构建完成",
  "body": "项目编译成功",
  "level": "info"
}
```

---

## 5. 文件操作

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/files/tree?path=&session=&window=` | 获取目录树 |
| GET | `/api/files/read?path=` | 读取文件内容 |
| GET | `/api/files/raw?path=` | 获取文件原始内容 |
| PUT | `/api/files/write` | 写入文件 |
| POST | `/api/files/create` | 创建文件或目录 |
| POST | `/api/files/delete` | 删除文件或目录 |
| POST | `/api/files/rename` | 重命名/移动文件 |
| GET | `/api/files/absolute?path=&session=&window=` | 获取绝对路径 |
| GET | `/api/files/resolve?path=` | 解析相对路径 |
| GET | `/api/files/search?q=&session=&window=` | 搜索文件 |
| POST | `/api/files/reveal` | 在系统文件管理器中打开 |

---

## 6. Git 查询

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/git/status?session=&window=` | 获取 git status |
| GET | `/api/git/diff?path=&staged=&session=&window=` | 获取文件 diff |
| GET | `/api/git/log?limit=20&session=&window=` | 获取提交日志 |
| GET | `/api/git/branches?session=&window=` | 列出分支 |
| POST | `/api/git/commit` | 提交更改 |
| POST | `/api/git/push` | 推送到远程 |
| POST | `/api/git/stage` | 暂存文件 |
| POST | `/api/git/unstage` | 取消暂存 |
| POST | `/api/git/stage-all` | 暂存所有 |
| POST | `/api/git/unstage-all` | 取消暂存所有 |

---

## 7. 系统信息

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/config` | 获取服务器配置 |
| GET | `/api/system/deps` | 检查系统依赖 |
| POST | `/api/system/install` | 安装系统依赖 |
| POST | `/api/check-update` | 检查更新 |
| POST | `/api/do-update` | 执行更新 |

---

## 8. 分屏工作模式

### 核心概念

0xMux 的 UI 分屏基于 tmux window（不是 tmux pane）。**每个分屏面板 = 一个独立的 tmux window**。

- 前端使用 `useSplitLayout` Hook 管理分屏布局
- 每个 UI 分屏通过 `paneWindowMap` 映射到一个 tmux window
- 当智能体创建新 window 时，前端会自动将其显示在分屏中

### 窗口命名规则

创建新窗口时，`window_name` 必须以功能命名，清晰表达该窗口的用途。禁止使用无意义的编号命名。

**正确命名**：
- `build` — 构建任务
- `test-unit` — 单元测试
- `search-logs` — 日志搜索
- `lint-check` — 代码检查
- `deploy-staging` — 部署到预发布环境
- `monitor-cpu` — CPU 监控

**错误命名**（禁止）：
- `worker-1`、`worker-2` — 无意义编号
- `task-a`、`task-b` — 没有描述功能
- `w1`、`w2` — 缩写无法辨识

### 分屏 API 工作流

智能体可以通过以下 API 组合实现多分屏并行工作：

#### 1. 创建分屏（新建 window）

```
POST /api/sessions/{name}/windows
Content-Type: application/json

{
  "window_name": "build"
}
```

创建后，前端会自动在分屏布局中显示该 window。

#### 2. 向分屏发送命令

```
POST /api/sessions/{name}/windows/{index}/input
Content-Type: application/json

{
  "data": "npm run build\n"
}
```

#### 3. 捕获分屏输出

```
GET /api/sessions/{name}/windows/{index}/capture?lines=100
```

#### 4. 查询分屏状态

```
GET /api/sessions/{name}/windows/{index}/info
```

可以通过 `pane_current_command` 判断命令是否执行完毕（回到 shell 时通常显示 `bash`/`zsh`）。

#### 5. 关闭分屏

```
DELETE /api/sessions/{name}/windows/{index}
```

### 智能体编排协议

利用分屏 API，智能体可以编排多个窗口并行执行任务：

```
场景：并行构建 + 测试

1. POST /api/sessions/dev/windows  {"window_name": "build-frontend"}
   → 返回 {"index": 1, ...}

2. POST /api/sessions/dev/windows  {"window_name": "test-unit"}
   → 返回 {"index": 2, ...}

3. POST /api/sessions/dev/windows/1/input  {"data": "npm run build\n"}
4. POST /api/sessions/dev/windows/2/input  {"data": "npm test\n"}

5. 轮询两个窗口的输出：
   GET /api/sessions/dev/windows/1/capture?lines=50
   GET /api/sessions/dev/windows/2/capture?lines=50

6. 任务完成后关闭窗口：
   DELETE /api/sessions/dev/windows/1
   DELETE /api/sessions/dev/windows/2
```

每个窗口在前端对应一个独立的终端分屏面板，用户可以实时看到所有窗口的运行状态。
