# 实施计划：Tmux Session UI

**版本**: 1.0
**日期**: 2026-02-09
**分支**: `2-tmux-session-ui`
**关联规格**: [spec.md](./spec.md)

---

## 技术上下文

### 当前状态

项目已完成 spec 1（Monorepo 架构）的基础实现：

| 组件 | 状态 | 说明 |
|------|------|------|
| Rust 后端 | 已实现 | Axum 0.8，Session CRUD、WebSocket、系统检测 |
| React 前端 | 已实现 | React 19 + Tailwind 4，Session 卡片列表、创建弹窗 |
| Vite 代理 | 已配置 | `/api` → 3001, `/ws` → ws://3001 |
| UI 主题 | 已实现 | 暗色背景 + 霓虹绿 + JetBrains Mono |

### 技术栈确认

延用 spec 1 技术栈，新增以下依赖：

| 技术 | 版本 | 用途 |
|------|------|------|
| @xterm/xterm | 5.5.0 | 终端渲染 |
| @xterm/addon-fit | ^0.10.0 | 终端自适应 |
| @xterm/addon-webgl | ^0.18.0 | GPU 加速渲染 |
| @xterm/addon-web-links | ^0.11.0 | 可点击链接 |
| react-resizable-panels | 4.6.2 | 分屏布局 |
| @iconify/react | 5.x | 图标组件 |
| @iconify-icons/lucide | ^1.2.0 | 图标数据 |
| portable-pty | 0.9 | Rust PTY 管理 |
| futures | 0.3 | Stream 工具 |

---

## 实施阶段

### Phase 1：Header + Logo + 图标基础（FR-1）

**目标**: 重构 Header 组件，实现像素风 Logo，集成 Iconify 图标

**任务**:

- **T001**: 安装 `@iconify/react` 和 `@iconify-icons/lucide`，创建 `web/src/lib/icons.ts` 集中管理图标导入
- **T002**: 设计并实现 0xMux 像素风格 Logo（纯 CSS/SVG），支持点击回到首页
- **T003**: 重构 `Header.tsx`，使用 Iconify 图标替换现有图标，右侧添加连接状态指示器和设置按钮

**自测**:
- Logo 在 Header 中正确渲染，点击跳转首页
- 所有图标使用 Iconify 渲染，无外部图标依赖

---

### Phase 2：空状态页面（FR-2）

**目标**: 实现终端风格的空状态页面

**任务**:

- **T004**: 创建 `EmptyState.tsx` 组件，终端命令行风格布局，带闪烁光标动画
- **T005**: 集成创建 Session 按钮，点击弹出创建对话框（复用已有 `CreateSessionModal`）
- **T006**: 在 `App.tsx` 中添加条件渲染逻辑：无 session 时显示空状态，有 session 时显示主布局

**自测**:
- 无 session 时显示空状态页，光标闪烁动画正常
- 创建 session 后自动切换到主布局

---

### Phase 3：Session 列表面板（FR-3）

**目标**: 实现左侧 Session 管理面板

**任务**:

- **T007**: 创建 `SessionSidebar.tsx` 面板组件，固定宽度（260px），支持折叠/展开
- **T008**: 创建 `SessionItem.tsx` 列表项组件：名称、状态灯（呼吸动画）、窗口数、删除按钮
- **T009**: 实现行内重命名功能：双击名称进入编辑模式，Enter 确认，Esc 取消
- **T010**: 实现搜索/过滤功能：顶部搜索框实时过滤 session 列表
- **T011**: 实现创建 session 按钮（「+」），弹出命名对话框
- **T012**: 实现删除 session 功能，带确认对话框
- **T013**: 实现选中高亮：点击 session 高亮显示并通知右侧工作区

**自测**:
- 列表显示所有 session，状态灯颜色正确（attached=绿/detached=灰）
- CRUD 操作均可正常执行，实时更新
- 搜索框输入可即时过滤
- 面板折叠/展开动画流畅

**可并行**: T007 + T008 可与 T009~T013 并行开发

---

### Phase 4：后端 PTY WebSocket（FR-9）

**目标**: 实现 PTY 管理和 WebSocket 终端数据中继

**任务**:

- **T014**: 在 `Cargo.toml` 添加 `portable-pty` 和 `futures` 依赖
- **T015**: 创建 `server/src/models/pty.rs` — PtySession 模型
- **T016**: 创建 `server/src/models/window.rs` — TmuxWindow 模型
- **T017**: 更新 `server/src/state.rs` — 添加 PtySession 全局状态管理（HashMap<String, PtySession>）
- **T018**: 创建 `server/src/ws/pty.rs` — PTY WebSocket 处理器：
  - 解析查询参数（session, cols, rows）
  - 使用 portable-pty 创建 PTY，执行 `tmux attach-session -t <name>`
  - 双向数据中继：PTY ↔ WebSocket（Binary 帧）
  - 处理 resize 控制消息（Text JSON 帧）
  - 连接清理：关闭 PTY 子进程
- **T019**: 创建 `server/src/handlers/window.rs` — Window CRUD HTTP 处理器
- **T020**: 创建 `server/src/services/tmux.rs` 扩展 — 添加 list_windows、new_window、kill_window
- **T021**: 更新 `server/src/router.rs` — 注册 `/ws/pty` 和 `/api/sessions/:name/windows` 路由

**自测**:
- `websocat ws://localhost:3001/ws/pty?session=test` 可连接并交互
- Window API 返回正确数据
- PTY 进程在 WebSocket 断开时正确清理

**关键路径**: T014 → T15~T17 → T018 → T021

---

### Phase 5：终端视图集成（FR-4）

**目标**: 前端 xterm.js 集成，浏览器内渲染真实终端

**任务**:

- **T022**: 安装 xterm.js 及 addons（`@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-webgl`、`@xterm/addon-web-links`）
- **T023**: 创建 `hooks/useTerminal.ts` — xterm.js 封装 Hook：
  - 初始化 Terminal + Fit + WebGL（Canvas 回退）+ WebLinks
  - ResizeObserver 自动 fit
  - onData / onResize 回调
  - dispose 清理
- **T024**: 创建 `hooks/usePtySocket.ts` — PTY WebSocket 连接 Hook：
  - 建立 WebSocket 连接到 `/ws/pty`
  - Binary 帧 ↔ xterm.js write/onData
  - resize 消息发送
  - 指数退避重连
  - 连接状态管理
- **T025**: 创建 `TerminalPane.tsx` 组件：
  - 组合 useTerminal + usePtySocket
  - 容器 div + ref 绑定
  - 焦点边框高亮
  - 加载/断线/错误状态显示

**自测**:
- 点击 session 后终端渲染正常，可输入命令并看到输出
- 颜色、光标正确显示
- 调整窗口大小时终端自动适应
- 断开后自动重连

**依赖**: Phase 4（后端 PTY 端点必须可用）

---

### Phase 6：分屏 + Tab + 多窗口（FR-5, FR-6）

**目标**: 实现分屏工作区和多窗口 Tab

**任务**:

- **T026**: 安装 `react-resizable-panels`
- **T027**: 创建 `hooks/useSplitLayout.ts` — 分屏布局状态管理：
  - 递归树结构（SplitLayout）
  - 添加/删除/重组节点操作
  - 分屏方向切换
- **T028**: 创建 `SplitWorkspace.tsx` — 分屏工作区容器：
  - 根据 SplitLayout 树递归渲染 PanelGroup/Panel
  - 每个叶子节点渲染 TerminalPane
  - PanelResizeHandle 样式（极客风分隔线）
- **T029**: 实现分屏操作入口：
  - 工具栏按钮（水平分屏 / 垂直分屏）
  - 右键菜单（ContextMenu 组件）
  - 关闭当前窗格
- **T030**: 创建 `WindowTabs.tsx` — Window Tab 栏：
  - 显示当前 session 的 windows（从 `/api/sessions/:name/windows` 获取）
  - 点击切换 Tab
  - 新建 / 关闭 Tab
  - 活动 Tab 高亮
  - 超出时横向滚动
- **T031**: 实现多 session 打开：不同分屏窗格可连接不同 session

**自测**:
- 水平/垂直分屏正常工作
- 拖拽分隔线调整大小流畅（≥30fps）
- Tab 切换正确
- 关闭窗格后剩余窗格自动填满
- 不同窗格可打开不同 session

---

### Phase 7：移动端适配（FR-7）

**目标**: 响应式布局 + 移动端交互

**任务**:

- **T032**: 创建 `hooks/useMobile.ts` — 移动端检测 Hook（`window.matchMedia('(max-width: 768px)')`)
- **T033**: 实现移动端 Session 列表全屏布局（隐藏左侧面板）
- **T034**: 实现移动端终端全屏视图 + 返回按钮
- **T035**: 创建 `MobileNav.tsx` — 底部导航栏（列表/终端切换）
- **T036**: 实现长按操作菜单（重命名、删除）
- **T037**: 处理虚拟键盘弹出时的视口调整（`visualViewport` API）

**自测**:
- 768px 以下自动切换移动端布局
- session 列表 → 终端全屏切换流畅
- 长按菜单正常弹出
- 虚拟键盘弹出时终端不被遮挡
- 底部导航栏功能正常

---

### Phase 8：设置面板 + 状态同步（FR-8, FR-10）

**目标**: 实现设置功能和实时状态同步

**任务**:

- **T038**: 创建 `hooks/useSettings.ts` — 设置管理 Hook（localStorage 读写，默认值）
- **T039**: 创建 `SettingsPanel.tsx` — 设置侧滑面板：
  - 字体大小滑块（12~24px）
  - 强调色选择器（预设色彩 + 自定义输入）
  - 默认分屏方向切换
  - WebSocket 连接状态显示
- **T040**: 将设置应用到终端实例：字体大小和强调色实时生效
- **T041**: 集成 spec 1 现有 WebSocket 实时推送 — session 列表变更自动更新

**自测**:
- 设置变更即时生效
- 刷新页面后设置持久化
- 后端 session 变化时列表自动刷新

---

### Phase 9：整合与打磨

**目标**: 全局整合、过渡动画、键盘快捷键

**任务**:

- **T042**: 整合所有页面状态：空状态 ↔ 主布局 ↔ 移动端布局的无缝切换
- **T043**: 添加过渡动画：面板折叠/展开、页面切换、终端打开/关闭
- **T044**: 实现键盘快捷键：
  - `Ctrl+\` — 水平分屏
  - `Ctrl+-` — 垂直分屏
  - `Ctrl+W` — 关闭当前窗格
  - `Ctrl+Tab` — 切换 Tab
  - `Ctrl+B` — 切换侧边栏
- **T045**: 错误状态处理：网络断线重连提示、PTY 连接失败提示、session 操作失败 toast
- **T046**: 全局样式检查：确保所有组件符合暗色极客主题，无样式遗漏

**自测**:
- 所有页面状态切换流畅
- 快捷键功能正常
- 网络断线/重连有明确视觉反馈
- 无样式不一致或布局溢出

---

## 依赖关系

```
Phase 1 (Header/Logo) ─────────────────────────────┐
Phase 2 (空状态) ──────────────────────────────────┤
Phase 3 (Session 列表) ────────────────────────────┤
Phase 4 (后端 PTY) ──→ Phase 5 (终端集成) ──→ Phase 6 (分屏/Tab)
                                                    │
Phase 7 (移动端) ←──────────────────────────────────┤
Phase 8 (设置/同步) ←──────────────────────────────┤
                                                    │
Phase 9 (整合打磨) ←────────────────────────────────┘
```

**可并行执行**:
- Phase 1 + Phase 2 + Phase 3 可完全并行
- Phase 4（后端）与 Phase 1~3（前端 UI）可并行
- Phase 7 + Phase 8 可并行

**关键路径**: Phase 4 → Phase 5 → Phase 6 → Phase 9

---

## 建议执行顺序

| 轮次 | Phase | 说明 |
|------|-------|------|
| 1 | Phase 1 + 2 + 3 + 4 | 并行：前端 UI 骨架 + 后端 PTY |
| 2 | Phase 5 | 前后端连通：终端集成 |
| 3 | Phase 6 | 分屏 + Tab |
| 4 | Phase 7 + 8 | 并行：移动端 + 设置 |
| 5 | Phase 9 | 整合打磨 |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| WebGL 上下文限制（~16/页面） | 多终端窗格可能渲染失败 | 自动检测 WebGL 可用性，回退 Canvas 渲染 |
| portable-pty macOS 兼容性 | PTY 创建失败 | 早期在 macOS 上充分测试，准备 nix::pty 回退 |
| xterm.js 内存泄漏 | 多开终端后内存持续增长 | 严格的 dispose 清理 + 惰性初始化 |
| 移动端虚拟键盘高度检测 | 终端被键盘遮挡 | 使用 `visualViewport` API + 回退 CSS `env(safe-area-inset-bottom)` |
| 分屏深度嵌套性能 | 窗格过多时性能下降 | Portal 方案避免重挂载；上限 128 窗格，实际受浏览器性能限制 |
