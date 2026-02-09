# 数据模型：Tmux Session UI

**日期**: 2026-02-09
**分支**: `2-tmux-session-ui`

---

## 继承实体（来自 spec 1）

以下实体在 spec 1 中已定义，本 spec 直接复用：

- **TmuxSession** — 会话基础信息（name, windows, created, attached）
- **ServerConfig** — 服务运行配置（port, host）

---

## 新增实体

### 1. TmuxWindow

表示一个 tmux session 内的 window。

| 字段 | 类型 | 说明 | 来源 |
|------|------|------|------|
| index | u32 | 窗口索引（0-based） | `tmux list-windows` |
| name | String | 窗口名称 | `tmux list-windows` |
| active | bool | 是否为当前活动窗口 | `tmux list-windows` |
| panes | u32 | 该窗口中的 pane 数量 | `tmux list-windows` |

**来源**: `tmux list-windows -t <session> -F '#{window_index}:#{window_name}:#{window_active}:#{window_panes}'`

---

### 2. PtySession（后端）

表示一个活跃的 PTY 连接（服务端维护）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | UUID v4，唯一标识此 PTY 连接 |
| session_name | String | 关联的 tmux session 名称 |
| cols | u16 | 当前终端列数 |
| rows | u16 | 当前终端行数 |
| pid | u32 | PTY 子进程 PID |
| created_at | DateTime | 创建时间 |

**生命周期**: WebSocket 连接建立时创建，连接断开时销毁（kill 子进程）
**状态转换**: `Created → Active → Closed`

---

### 3. TerminalInstance（前端）

表示浏览器中的一个终端实例。

| 字段 | 类型 | 说明 |
|------|------|------|
| instanceId | string | 客户端生成的 UUID |
| sessionName | string | 关联的 tmux session 名称 |
| windowIndex | number | 关联的 tmux window 索引 |
| cols | number | 终端列数 |
| rows | number | 终端行数 |
| wsUrl | string | WebSocket 连接 URL |
| connected | boolean | WebSocket 是否已连接 |

---

### 4. SplitLayout（前端）

表示分屏布局的递归树结构。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 节点 UUID |
| type | 'leaf' \| 'branch' | 节点类型 |
| direction | 'horizontal' \| 'vertical' | 分屏方向（仅 branch） |
| sizes | number[] | 子节点比例数组（仅 branch） |
| children | SplitLayout[] | 子节点（仅 branch） |
| terminal | TerminalInstance | 终端实例（仅 leaf） |

**树结构示例**（水平分两栏，右栏再垂直分两行）:
```
Branch(horizontal, [50, 50])
├── Leaf(terminal: { session: "dev", window: 0 })
└── Branch(vertical, [60, 40])
    ├── Leaf(terminal: { session: "logs", window: 0 })
    └── Leaf(terminal: { session: "debug", window: 0 })
```

---

### 5. UserSettings（前端 localStorage）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| fontSize | number | 14 | 终端字体大小（12~24） |
| accentColor | string | "#00ff41" | 强调色 |
| defaultSplitDirection | 'horizontal' \| 'vertical' | 'horizontal' | 默认分屏方向 |
| sidebarCollapsed | boolean | false | 侧边栏折叠状态 |
| sidebarWidth | number | 260 | 侧边栏宽度（px） |

**存储 key**: `0xmux-settings`
**序列化**: JSON

---

## 实体关系

```
ServerConfig (1)
    │
    ├── TmuxSession (0..N) ── 已有（spec 1）
    │       │
    │       └── TmuxWindow (1..N) ── 新增
    │
    └── PtySession (0..N) ── 新增（服务端活跃 PTY 连接）
            │
            └── 1:1 WebSocket 连接


前端状态:

SplitLayout (1) ── 根布局树
    │
    └── TerminalInstance (1..N) ── 叶子节点
            │
            └── 1:1 WebSocket → PtySession

UserSettings (1) ── localStorage
```

---

## 数据流

### 终端连接流
```
用户点击 Session → 前端创建 TerminalInstance
→ 建立 WebSocket 连接 WS /ws/pty?session=<name>&cols=80&rows=24
→ 后端创建 PtySession，spawn PTY + `tmux attach -t <name>`
→ PTY stdout → Binary WS 帧 → xterm.js write
→ xterm.js onData → Binary WS 帧 → PTY stdin
```

### 终端 Resize 流
```
容器尺寸变化 → ResizeObserver → fitAddon.fit()
→ xterm.js onResize(cols, rows)
→ Text WS 帧: { type: "resize", cols, rows }
→ 后端 pty.resize(cols, rows)
→ tmux 自动检测 SIGWINCH 并重绘
```

### Window 列表流
```
GET /api/sessions/:name/windows
→ 后端执行 tmux list-windows -t <name>
→ 返回 TmuxWindow[]
```

### 分屏操作流（纯前端）
```
用户点击「水平分屏」→ 当前 Leaf 节点转为 Branch
→ 创建两个新 Leaf 子节点
→ 原 TerminalInstance 保留在第一个子节点
→ 第二个子节点创建新 TerminalInstance（默认同一 session）
→ react-resizable-panels 重新渲染布局
→ 所有终端调用 fitAddon.fit()
```
