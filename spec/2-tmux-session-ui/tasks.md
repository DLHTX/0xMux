# 任务清单：Tmux Session UI

**日期**: 2026-02-09
**分支**: `2-tmux-session-ui`
**关联文档**: [spec.md](./spec.md) | [plan.md](./plan.md) | [data-model.md](./data-model.md)

---

## 用户场景映射

| 场景 | 优先级 | 关联 FR | 说明 |
|------|--------|---------|------|
| US1: 空状态体验 | P1 | FR-1, FR-2 | Header/Logo + 空状态引导页 |
| US2: 日常会话管理 | P1 | FR-3, FR-10 | Session 列表面板 CRUD + 实时同步 |
| US3: 终端交互与分屏 | P1 | FR-4, FR-5, FR-6, FR-9 | xterm.js + PTY + 分屏 + Tab |
| US4: 移动端使用 | P2 | FR-7 | 响应式布局 + 触摸交互 |
| US5: 设置与偏好 | P3 | FR-8 | 设置面板 + localStorage |

---

## Phase 1: Setup — 依赖安装与项目配置

- [x] T001 安装前端新增依赖：`cd web && bun add @iconify/react @iconify-icons/lucide @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links react-resizable-panels`
- [x] T002 [P] 在 `server/Cargo.toml` 添加 `portable-pty = "0.9"` 和 `futures = "0.3"` 依赖，运行 `cargo check` 验证
- [x] T003 [P] 创建 `web/src/lib/icons.ts` — 集中管理所有 Iconify 图标导入（terminal, settings, plus, trash, edit, search, split-horizontal, split-vertical, x, chevron-left, chevron-right, menu, monitor 等）
- [x] T004 [P] 更新 `web/src/lib/types.ts` — 新增 TmuxWindow、TerminalInstance、SplitLayout、UserSettings 类型定义，参照 `data-model.md`

---

## Phase 2: Foundational — 阻塞性基础设施

### 后端 PTY 基础（FR-9，阻塞 US3）

- [x] T005 创建 `server/src/models/window.rs` — 定义 TmuxWindow struct（index, name, active, panes）+ Serialize/Deserialize 派生，参照 `data-model.md`
- [x] T006 创建 `server/src/models/pty.rs` — 定义 PtySession struct（id, session_name, cols, rows, pid, created_at），参照 `data-model.md`
- [x] T007 更新 `server/src/models/mod.rs` — 注册 window 和 pty 模块导出
- [x] T008 更新 `server/src/state.rs` — 添加 `pty_sessions: Arc<RwLock<HashMap<String, PtySession>>>` 到 AppState，提供 add/remove/list 方法
- [x] T009 扩展 `server/src/services/tmux.rs` — 添加 `list_windows(session: &str)`、`new_window(session: &str, name: Option<&str>)`、`kill_window(session: &str, index: u32)` 方法，使用 `tmux list-windows -t <session> -F` 解析输出
- [x] T010 创建 `server/src/handlers/window.rs` — 实现 `GET /api/sessions/:name/windows`、`POST /api/sessions/:name/windows`、`DELETE /api/sessions/:name/windows/:index` 三个端点，参照 `contracts/rest-api.md`
- [x] T011 创建 `server/src/ws/pty.rs` — PTY WebSocket 处理器：解析查询参数（session, cols, rows）→ 用 portable-pty 创建 PTY 执行 `tmux attach-session -t <name>` → spawn 双向中继任务（PTY stdout → Binary WS, WS Binary → PTY stdin）→ 处理 Text JSON resize 消息 → 连接清理时 kill 子进程并从 state 移除，参照 `contracts/websocket-api.md`
- [x] T012 更新 `server/src/ws/mod.rs` — 注册 pty 模块导出
- [x] T013 更新 `server/src/router.rs` — 注册路由：`/ws/pty` → pty_handler，`/api/sessions/:name/windows` → window 处理器，`/api/pty/sessions` → 列出活跃 PTY 连接

**自测**: `cargo build` 通过；`websocat ws://localhost:3001/ws/pty?session=test` 可连接并交互；`curl localhost:3001/api/sessions/test/windows` 返回 window 列表

---

## Phase 3: US1 — 空状态体验（P1）

**场景目标**: 无 session 时显示终端风格空状态页，引导用户创建第一个 session

**独立测试标准**: 启动 0xMux，kill 所有 tmux session → 页面显示空状态 → 点击创建 → session 出现在列表中

- [x] T014 [US1] 设计并实现 0xMux 像素风格 Logo 组件 `web/src/components/Logo.tsx` — 纯 CSS/SVG 实现，使用等宽字体像素效果或 ASCII art 风格，尺寸约 120x28px，支持点击回到首页
- [x] T015 [US1] 重构 `web/src/components/Header.tsx` — 左侧放置 Logo 组件，右侧使用 Iconify 图标显示连接状态指示器（绿点/红点）和设置齿轮按钮，固定高度 48px，极客暗色风格，引入 `lib/icons.ts` 中的图标
- [x] T016 [US1] 创建 `web/src/components/EmptyState.tsx` — 终端命令行风格布局：上方显示模拟终端提示符 `> 创建你的第一个 tmux 会话...`，闪烁光标 CSS 动画（@keyframes blink），中央放置醒目的「+ 新建 Session」按钮（霓虹绿边框 + 悬停发光效果），整体暗色背景
- [x] T017 [US1] 更新 `web/src/App.tsx` — 添加条件渲染逻辑：sessions 数组为空时渲染 EmptyState 组件，有 session 时渲染主布局（SessionSidebar + 工作区），创建 session 后自动切换到主布局

**自测**: 无 session 时看到闪烁光标和创建按钮；点击创建后弹出对话框；创建成功后自动切换到主布局

---

## Phase 4: US2 — 日常会话管理（P1）

**场景目标**: 左侧面板完成所有 session CRUD，实时更新

**独立测试标准**: 创建/重命名/删除 session 均可通过左侧面板完成，列表实时反映 tmux 状态变化

- [x] T018 [US2] 创建 `web/src/components/SessionSidebar.tsx` — 左侧面板容器：固定宽度 260px，顶部搜索框 + 「+」新建按钮，中间 session 列表（滚动），底部折叠/展开切换按钮，折叠时仅显示图标栏（48px 宽），使用 CSS transition 动画
- [x] T019 [P] [US2] 创建 `web/src/components/SessionItem.tsx` — 单个 session 列表项：左侧状态灯（attached=绿色呼吸动画/detached=灰色）、名称文本、窗口数 badge，右侧删除图标按钮（hover 显示），选中态高亮（左边框 + 背景色变化）
- [x] T020 [US2] 实现行内重命名功能（集成到 `SessionItem.tsx`）— 双击名称文本切换为 input 输入框，Enter 调用 `PUT /api/sessions/:name` 确认，Esc 取消恢复原名，输入框获取焦点并全选文本，调用 `api.ts` 中已有的 rename 方法
- [x] T021 [US2] 实现删除确认功能（集成到 `SessionItem.tsx`）— 点击删除图标弹出确认对话框（"确定要删除 session '{name}' 吗？此操作不可撤销。"），确认后调用 `DELETE /api/sessions/:name`，取消关闭对话框
- [x] T022 [US2] 实现搜索/过滤功能（集成到 `SessionSidebar.tsx`）— 顶部搜索框监听 onChange，对 session 列表按名称模糊匹配过滤（case-insensitive），无匹配时显示空结果提示
- [x] T023 [US2] 实现创建 session 功能 — 点击「+」按钮弹出 CreateSessionModal（复用已有组件），创建成功后自动选中新 session 并滚动到可见位置
- [x] T024 [US2] 实现选中状态管理 — 在 App 层维护 `selectedSession` state，点击 SessionItem 设置选中，选中的 session 传给右侧工作区
- [x] T025 [US2] 集成 spec 1 现有 WebSocket 实时推送 — 复用 `hooks/useWebSocket.ts`，监听 `sessions_update` 消息自动更新 session 列表，确保外部 tmux 操作（命令行创建/删除 session）能实时反映在 UI 上

**自测**: 列表显示所有 session + 状态灯；双击可重命名；删除有确认；搜索实时过滤；命令行执行 `tmux new -s external` 后列表自动更新

---

## Phase 5: US3 — 终端交互与分屏（P1）

**场景目标**: 浏览器内渲染真实终端，支持分屏和多窗口 Tab

**独立测试标准**: 点击 session 打开终端 → 可输入命令看到输出 → 分屏后两个终端独立工作 → Tab 切换 window

**依赖**: Phase 2（后端 PTY 端点）

### 终端集成（FR-4）

- [x] T026 [US3] 创建 `web/src/hooks/useTerminal.ts` — xterm.js 封装 Hook：初始化 Terminal 实例（cursorBlink, fontSize from settings, fontFamily: JetBrains Mono, theme: { background: '#0a0a0a' }），加载 FitAddon + WebLinksAddon，尝试加载 WebglAddon（catch 回退 Canvas），绑定 ResizeObserver 自动 fit，暴露 ref/terminal/fit/write/dispose 接口，onData/onResize 回调参数
- [x] T027 [US3] 创建 `web/src/hooks/usePtySocket.ts` — PTY WebSocket Hook：建立连接到 `/ws/pty?session=<name>&cols=<n>&rows=<n>`，Binary 帧 → 回调 onOutput（传给 xterm.write），onInput 回调 → Binary 帧发送，resize 事件 → Text JSON `{ type: "resize", cols, rows }`，指数退避重连（1s→2s→4s→...→30s），连接状态（connecting/connected/disconnected/error）暴露，心跳 30s ping，处理 exit/error Text 帧
- [x] T028 [US3] 创建 `web/src/components/TerminalPane.tsx` — 组合 useTerminal + usePtySocket：容器 div 绑定 terminal ref，useTerminal.onData → usePtySocket.send，usePtySocket.onOutput → useTerminal.write，useTerminal.onResize → usePtySocket.resize，焦点态边框高亮（ring-1 ring-green-500），非焦点态边框暗淡，加载中显示 "Connecting..." 提示，断线显示 "Reconnecting..." + 旋转图标
- [x] T029 [US3] 更新 `web/src/lib/api.ts` — 新增 `getWindows(session: string): Promise<TmuxWindow[]>`、`createWindow(session: string, name?: string): Promise<TmuxWindow>`、`deleteWindow(session: string, index: number): Promise<void>` 方法

### 分屏功能（FR-5）

- [x] T030 [US3] 创建 `web/src/hooks/useSplitLayout.ts` — 分屏布局状态管理 Hook：维护 SplitLayout 递归树状态，提供 `splitPane(nodeId, direction)` 将叶子节点转为分支，`closePane(nodeId)` 关闭并重组树，`getPaneIds()` 返回所有叶子节点 ID，初始状态为单个叶子节点，最大 8 个叶子节点限制
- [x] T031 [US3] 创建 `web/src/components/SplitWorkspace.tsx` — 递归渲染分屏布局：根据 SplitLayout 树生成嵌套 PanelGroup/Panel/PanelResizeHandle，叶子节点渲染 TerminalPane，PanelResizeHandle 样式为 1px 宽极客绿线（hover 加粗高亮），Panel minSize=15%，顶部工具栏包含分屏按钮（水平/垂直）和关闭当前窗格按钮
- [x] T032 [US3] 创建 `web/src/components/ContextMenu.tsx` — 右键菜单组件：在终端区域右键弹出菜单（水平分屏、垂直分屏、关闭窗格、切换到其他 session），定位跟随鼠标，点击外部或执行后关闭

### 多窗口 Tab（FR-6）

- [x] T033 [US3] 创建 `web/src/components/WindowTabs.tsx` — Tab 栏组件：调用 `api.getWindows(session)` 获取 window 列表，每个 Tab 显示 window index + name，当前 Tab 高亮（底部绿色边框），支持点击切换 Tab，右侧「+」按钮新建 window（调用 api.createWindow），Tab 上「x」按钮关闭 window（调用 api.deleteWindow，最后一个 window 禁止关闭），Tab 数量超出容器时支持横向滚动（overflow-x-auto + 隐藏滚动条样式）
- [ ] T034 [US3] 实现多 session 打开 — 在 SplitWorkspace 中每个 TerminalPane 可独立选择连接的 session（右键菜单 → 切换 session → 弹出 session 选择器），分屏窗格可同时打开不同 session 的终端

**自测**: 选中 session 后右侧显示终端，输入 `ls` 看到输出；分屏后两个终端独立；拖拽分隔线调整大小流畅；Tab 切换 window 正常

---

## Phase 6: US4 — 移动端使用（P2）

**场景目标**: 手机端可完成 session 管理和终端操作

**独立测试标准**: Chrome DevTools 切换手机视口 → session 列表全屏 → 点击 session 全屏终端 → 返回按钮回到列表

- [x] T035 [US4] 创建 `web/src/hooks/useMobile.ts` — 移动端检测 Hook：使用 `window.matchMedia('(max-width: 768px)')` 监听，返回 `isMobile` boolean，组件内实时响应断点变化
- [x] T036 [US4] 实现移动端 Session 列表全屏布局 — 在 App.tsx 中 `isMobile` 时隐藏 SessionSidebar 双栏布局，改为全屏 session 列表（复用 SessionItem），列表项增大触摸区域（min-height: 56px），添加 Header 标题
- [x] T037 [US4] 实现移动端终端全屏视图 — 选中 session 后全屏切换到 TerminalPane，顶部显示 session 名称 + 返回按钮（chevron-left 图标），整屏终端（无分屏），transition 动画（slide-in-right）
- [x] T038 [US4] 创建 `web/src/components/MobileNav.tsx` — 底部导航栏：两个 Tab（"Sessions" 列表图标 / "Terminal" 终端图标），当前页高亮，固定在视口底部，高度 56px，暗色背景 + 绿色高亮
- [x] T039 [US4] 实现长按操作菜单 — 在移动端 SessionItem 上添加 `onTouchStart` + `setTimeout(500ms)` 长按检测，弹出操作菜单（重命名、删除），菜单样式为底部弹出 sheet（slide-up 动画），背景半透明遮罩
- [x] T040 [US4] 处理虚拟键盘视口调整 — 在 TerminalPane 移动端模式下监听 `window.visualViewport.resize` 事件，动态设置终端容器高度为 `visualViewport.height - headerHeight - navHeight`，键盘弹出时终端自动缩小，收起时恢复

**自测**: 768px 以下自动切换移动布局；列表全屏显示；点击进入终端全屏；返回按钮/底部导航正常；长按弹出操作菜单

---

## Phase 7: US5 — 设置与偏好（P3）

**场景目标**: 用户可个性化终端显示偏好

**独立测试标准**: 打开设置 → 修改字体大小 → 终端实时变化 → 刷新页面设置保留

- [x] T041 [US5] 创建 `web/src/hooks/useSettings.ts` — 设置管理 Hook：从 localStorage key `0xmux-settings` 读取 UserSettings JSON，提供 getter/setter 接口，默认值 { fontSize: 14, accentColor: '#00ff41', defaultSplitDirection: 'horizontal', sidebarCollapsed: false }，setter 自动 JSON.stringify 写入 localStorage
- [x] T042 [US5] 创建 `web/src/components/SettingsPanel.tsx` — 设置侧滑面板：从 Header 设置按钮点击触发，右侧滑入（transform translateX 动画），背景半透明遮罩，内容区包含：字体大小滑块（range input 12-24），强调色选择器（6 个预设色彩圆点 + 自定义 hex 输入），默认分屏方向 toggle（水平/垂直），WebSocket 连接状态指示（绿/红点 + 文字）
- [x] T043 [US5] 将设置应用到终端实例 — 在 useTerminal Hook 中读取 useSettings 返回的 fontSize/accentColor，动态更新 Terminal 选项（`terminal.options.fontSize = newSize; fitAddon.fit()`），accentColor 通过 CSS variable `--accent` 控制全局强调色

**自测**: 字体大小滑块拖动后终端字体立即变化；切换强调色后 UI 主题色更新；刷新页面设置保持

---

## Phase 8: Polish — 整合与打磨

- [x] T044 整合所有页面状态切换 — 在 `App.tsx` 中确保 空状态 ↔ 桌面主布局 ↔ 移动端布局 三种状态无缝切换，添加 CSS transition（opacity + transform），避免闪烁
- [x] T045 [P] 添加过渡动画 — 面板折叠/展开（width transition 200ms），终端打开（fade-in 150ms），页面切换（slide 200ms），确保动画不影响 xterm.js 渲染性能
- [x] T046 [P] 实现键盘快捷键 — 在 App 层添加 keydown 监听器：`Ctrl+\` 水平分屏，`Ctrl+-` 垂直分屏，`Ctrl+W` 关闭当前窗格，`Ctrl+Tab` 切换下一个 Tab，`Ctrl+B` 切换侧边栏折叠，确保快捷键不与终端内部快捷键冲突（仅在非终端焦点时生效或使用特定前缀）
- [x] T047 [P] 错误状态与反馈 — 实现全局 Toast 组件（3s 自动消失），session 操作失败时显示错误 toast，网络断线时 Header 连接指示变红并显示 "Reconnecting..."，PTY 连接失败时 TerminalPane 显示错误信息 + 重试按钮
- [x] T048 全局样式审查 — 检查所有组件是否符合暗色极客主题（#0a0a0a 背景, #00ff41 强调, JetBrains Mono），确保无白色背景泄漏、无默认浏览器样式残留、无内容溢出，验证 320px~2560px 视口范围内布局正常

---

## 依赖关系

```
Phase 1 (Setup) ──────────────────────────────────────────┐
    │                                                      │
Phase 2 (Foundational: 后端 PTY) ─────────────────────────┤
    │                                                      │
    ├─→ Phase 3 (US1: 空状态) [可与 Phase 2 并行]         │
    ├─→ Phase 4 (US2: 会话管理) [可与 Phase 2 并行]       │
    │                                                      │
    └─→ Phase 5 (US3: 终端+分屏) [依赖 Phase 2 完成]     │
           │                                               │
           ├─→ Phase 6 (US4: 移动端) [依赖 Phase 4+5]     │
           ├─→ Phase 7 (US5: 设置) [依赖 Phase 5]         │
           │                                               │
           └─→ Phase 8 (Polish) [依赖所有 Phase 完成] ←────┘
```

**关键路径**: Phase 1 → Phase 2 → Phase 5 → Phase 8

---

## 并行执行策略

### 轮次 1（最大并行度）
| Agent | 任务 | 说明 |
|-------|------|------|
| Agent A（前端） | T001, T003, T004, T014~T017 | Setup + US1 空状态 |
| Agent B（后端） | T002, T005~T013 | Setup + Foundational PTY |

### 轮次 2
| Agent | 任务 | 说明 |
|-------|------|------|
| Agent A（前端） | T018~T025 | US2 会话管理 |
| Agent B（前端） | T026~T029 | US3 终端集成（依赖 Phase 2） |

### 轮次 3
| Agent | 任务 | 说明 |
|-------|------|------|
| Agent A（前端） | T030~T034 | US3 分屏 + Tab |
| Agent B（前端） | T035~T040 | US4 移动端 |

### 轮次 4
| Agent | 任务 | 说明 |
|-------|------|------|
| Agent A | T041~T043 | US5 设置 |
| Agent B | T044~T048 | Polish 打磨 |

---

## 实施策略

### MVP 范围（建议）

**最小可行产品 = Phase 1 + 2 + 3 + 4 + 5（US1 + US2 + US3）**

包含：
- Header + Logo + 空状态引导
- Session 列表面板（CRUD + 搜索 + 实时同步）
- 终端视图（xterm.js + PTY WebSocket）
- 分屏 + 多窗口 Tab
- 桌面端完整体验

不包含（后续迭代）：
- 移动端适配（US4）
- 设置面板（US5）
- 过渡动画、快捷键等打磨项

### 增量交付

1. **里程碑 1**: Header + 空状态 + Session 列表（可用但无终端）
2. **里程碑 2**: 终端集成（核心功能完整）
3. **里程碑 3**: 分屏 + Tab（高级功能）
4. **里程碑 4**: 移动端 + 设置 + 打磨（体验完善）

---

## 统计

| 指标 | 数值 |
|------|------|
| 总任务数 | 48 |
| Setup 任务 | 4 |
| Foundational 任务 | 9 |
| US1 任务 | 4 |
| US2 任务 | 8 |
| US3 任务 | 9 |
| US4 任务 | 6 |
| US5 任务 | 3 |
| Polish 任务 | 5 |
| 可并行任务 | 标记 [P] 共 8 个 |
| MVP 任务数 | 34（T001~T034） |
