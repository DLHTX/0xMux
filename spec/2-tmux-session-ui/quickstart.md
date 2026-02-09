# 快速开始：Tmux Session UI

**分支**: `2-tmux-session-ui`

---

## 前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Rust | stable (1.80+) | 后端编译 |
| Node.js | 18+ | 前端构建 |
| Bun | latest | 推荐的前端包管理器 |
| tmux | 2.6+ | 终端复用器（必需） |
| cargo-watch | latest | Rust 热重载 |

---

## 新增依赖安装

### 后端

在 `server/Cargo.toml` 中新增:
```toml
portable-pty = "0.9"
futures = "0.3"
```

### 前端

```bash
cd web
bun add @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links
bun add react-resizable-panels
bun add @iconify/react @iconify-icons/lucide
```

---

## 开发模式启动

```bash
# 安装前端依赖
cd web && bun install && cd ..

# 启动开发服务器（前后端同时运行）
npm run dev
```

- 前端: `http://localhost:3000`
- 后端 API: `http://localhost:3001/api`
- PTY WebSocket: `ws://localhost:3001/ws/pty?session=<name>`

Vite 代理自动转发 `/api` 和 `/ws` 到后端。

---

## 新增文件结构

```
server/src/
├── handlers/
│   ├── window.rs          # 新增 — Window CRUD 路由
│   └── mod.rs             # 更新 — 注册 window 路由
├── services/
│   ├── tmux.rs            # 更新 — 新增 list_windows, new_window, kill_window
│   └── mod.rs
├── ws/
│   ├── pty.rs             # 新增 — PTY WebSocket 处理器
│   └── mod.rs             # 更新 — 注册 PTY 路由
├── models/
│   ├── window.rs          # 新增 — TmuxWindow 模型
│   ├── pty.rs             # 新增 — PtySession 模型
│   └── mod.rs             # 更新
├── state.rs               # 更新 — 添加 PtySession 管理
└── router.rs              # 更新 — 新增路由

web/src/
├── components/
│   ├── Header.tsx         # 更新 — Iconify 图标 + Logo 重设计
│   ├── EmptyState.tsx     # 新增 — 空状态页面
│   ├── SessionSidebar.tsx # 新增 — 左侧 Session 列表面板
│   ├── SessionItem.tsx    # 新增 — Session 列表项（行内编辑、状态灯）
│   ├── TerminalPane.tsx   # 新增 — 单个终端面板（xterm.js 实例）
│   ├── SplitWorkspace.tsx # 新增 — 分屏工作区容器
│   ├── WindowTabs.tsx     # 新增 — Window Tab 栏
│   ├── SettingsPanel.tsx  # 新增 — 设置侧滑面板
│   ├── MobileNav.tsx      # 新增 — 移动端底部导航
│   └── ContextMenu.tsx    # 新增 — 右键/长按菜单
├── hooks/
│   ├── useTerminal.ts     # 新增 — xterm.js 封装 Hook
│   ├── usePtySocket.ts    # 新增 — PTY WebSocket 连接 Hook
│   ├── useSplitLayout.ts  # 新增 — 分屏布局状态管理
│   ├── useSettings.ts     # 新增 — 用户设置 Hook（localStorage）
│   └── useMobile.ts       # 新增 — 移动端检测 Hook
├── lib/
│   ├── api.ts             # 更新 — 新增 Window API 方法
│   ├── types.ts           # 更新 — 新增类型定义
│   └── icons.ts           # 新增 — 集中管理 Iconify 图标导入
└── App.tsx                # 更新 — 新增路由/布局逻辑
```

---

## 关键技术约定

| 约定 | 说明 |
|------|------|
| 终端数据传输 | Binary WebSocket 帧 |
| 控制消息 | Text WebSocket 帧（JSON） |
| PTY 端点 | `WS /ws/pty?session=<name>&cols=<n>&rows=<n>` |
| Window API | `GET/POST/DELETE /api/sessions/:name/windows` |
| 图标库 | `@iconify/react` + `@iconify-icons/lucide`（离线模式） |
| 分屏库 | `react-resizable-panels`（嵌套 PanelGroup） |
| 终端渲染 | `@xterm/xterm` + WebGL addon（Canvas 回退） |
| 移动端断点 | 768px |
| 设置存储 | `localStorage` key: `0xmux-settings` |
| Logo | 纯 CSS/SVG 像素字，不使用外部图片 |

---

## 常用开发命令

```bash
# 运行前后端
npm run dev

# 仅前端
npm run dev:web

# 仅后端（cargo-watch 热重载）
npm run dev:server

# 类型检查
cd web && bun run tsc --noEmit

# Lint
cd web && bun run lint

# 后端编译检查
cd server && cargo check

# 创建测试 tmux session
tmux new-session -d -s test-session
tmux new-session -d -s another-session
```

---

## 测试 PTY WebSocket

使用 `websocat` 测试:
```bash
# 连接到 PTY（文本交互）
websocat ws://localhost:3001/ws/pty?session=test-session

# 或使用 wscat
npx wscat -c ws://localhost:3001/ws/pty?session=test-session
```

在浏览器中测试: 打开 `http://localhost:3000`，点击 session 应自动连接终端。
