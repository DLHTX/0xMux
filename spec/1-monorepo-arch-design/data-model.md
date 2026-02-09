# 数据模型：0xMux

**日期**: 2026-02-09
**分支**: `1-monorepo-arch-design`

---

## 实体定义

### 1. TmuxSession

表示一个 tmux 会话。

| 字段 | 类型 | 说明 | 验证规则 |
|------|------|------|----------|
| name | String | 会话名称 | 非空，匹配 `^[a-zA-Z0-9_.-]+$` |
| windows | u32 | 窗口数量 | >= 0 |
| created | String | 创建时间（Unix timestamp） | 有效时间戳 |
| attached | bool | 是否有客户端连接 | — |

**来源**：tmux CLI `list-sessions -F` 输出
**状态转换**：`detached` ↔ `attached`（由 tmux 管理，0xMux 只读取状态）

---

### 2. Dependency

表示一个系统依赖项。

| 字段 | 类型 | 说明 | 验证规则 |
|------|------|------|----------|
| name | String | 依赖名称 | 预定义白名单 |
| required | bool | 是否为必需依赖 | — |
| installed | bool | 是否已安装 | 运行时检测 |
| version | Option\<String\> | 已安装版本号 | 语义化版本 |
| min_version | Option\<String\> | 最低要求版本 | 语义化版本 |
| install_cmd | HashMap\<OS, String\> | 各平台安装命令 | — |

**预定义依赖列表**：

| name | required | min_version | macOS 安装命令 | Linux 安装命令 |
|------|----------|-------------|----------------|----------------|
| tmux | true | 2.6 | `brew install tmux` | `apt install tmux` |
| claude-code | false | — | `npm i -g @anthropic-ai/claude-code` | 同左 |

---

### 3. InstallTask

表示一次依赖安装任务。

| 字段 | 类型 | 说明 | 验证规则 |
|------|------|------|----------|
| id | String | 唯一标识 | UUID v4 |
| dependency | String | 依赖名称 | 白名单内 |
| status | InstallStatus | 安装状态 | 枚举值 |
| log | Vec\<String\> | 安装日志行 | — |
| started_at | DateTime | 开始时间 | — |
| finished_at | Option\<DateTime\> | 完成时间 | — |
| exit_code | Option\<i32\> | 进程退出码 | — |

**InstallStatus 枚举**：
- `Pending` — 等待执行
- `Running` — 正在安装
- `Success` — 安装成功
- `Failed` — 安装失败

**状态转换**：`Pending → Running → Success | Failed`

---

### 4. ServerConfig

表示服务运行时配置。

| 字段 | 类型 | 默认值 | 说明 | 来源 |
|------|------|--------|------|------|
| port | u16 | 1234 | 监听端口 | CLI `--port` 或 `PORT` 环境变量 |
| host | String | "127.0.0.1" | 绑定地址 | CLI `--host` 或 `HOST` 环境变量 |
| log_level | String | "info" | 日志级别 | `RUST_LOG` 环境变量 |

**优先级**：CLI 参数 > 环境变量 > 默认值

---

### 5. SystemInfo

表示系统环境信息（用于依赖检测）。

| 字段 | 类型 | 说明 |
|------|------|------|
| os | String | 操作系统类型 (`macos`, `linux`) |
| arch | String | CPU 架构 (`arm64`, `x86_64`) |
| package_manager | Option\<String\> | 检测到的包管理器 (`brew`, `apt`, `dnf`) |

---

## 实体关系

```
ServerConfig (1) ──── 服务启动配置
    │
    ├── TmuxSession (0..N) ──── tmux 会话列表
    │
    ├── SystemInfo (1) ──── 系统环境
    │       │
    │       └── Dependency (N) ──── 依赖检测结果
    │               │
    │               └── InstallTask (0..1) ──── 安装任务（进行中最多一个）
```

---

## 数据流

### Session 管理流
```
Browser → GET /api/sessions → Rust 调用 tmux CLI → 解析输出 → 返回 JSON
Browser → POST /api/sessions → Rust 调用 tmux new-session → 返回结果
Browser → DELETE /api/sessions/:name → Rust 调用 tmux kill-session → 返回结果
Browser → PUT /api/sessions/:name → Rust 调用 tmux rename-session → 返回结果
```

### 依赖检测流
```
Browser → GET /api/system/deps → Rust 逐项检测 → 返回依赖状态列表
```

### 依赖安装流
```
Browser → POST /api/system/install { package: "tmux" }
         → Rust 验证白名单
         → 启动异步安装进程
         → 返回 task_id

Browser → WS /ws/install/:task_id
         → 实时接收安装日志
         → 接收完成状态
```
