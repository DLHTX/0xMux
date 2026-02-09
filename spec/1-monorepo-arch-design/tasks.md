# 任务清单：0xMux Monorepo 架构设计与分发体系

**版本**: 1.1
**日期**: 2026-02-09
**分支**: `1-monorepo-arch-design`
**关联计划**: [plan.md](./plan.md)
**关联规格**: [spec.md](./spec.md)

**规则**: 每个任务完成后必须执行其 `自测` 步骤，确认通过后才能标记为完成。

---

## 用户场景映射

| 用户场景 | 优先级 | 关联 FR | 说明 |
|----------|--------|---------|------|
| US1: 开发者贡献代码 | P1 | FR-1, FR-3 | Monorepo 结构 + 统一开发命令 |
| US2: 日常 Session 管理 | P1 | FR-2, FR-7, FR-8 | 完整 CRUD + 极客 UI + 配置 |
| US3: 首次启动（缺少依赖） | P2 | FR-6 | 依赖检测 + 安装引导 |
| US4: 首次安装与分发 | P2 | FR-4, FR-5 | 构建打包 + npm/Homebrew 分发 |

---

## Phase 1: Setup — 项目初始化

**目标**: 搭建 monorepo 基础设施，确保开发环境可用

- [X] T001 创建根目录 `package.json`，包含 `dev`/`build`/`start` 脚本及 `concurrently` 依赖，路径 `/Users/koray/Documents/GitHub/0xMux/package.json`
  - 自测: 运行 `cat package.json | python3 -m json.tool` 确认 JSON 格式有效，确认包含 `dev`、`build`、`start` 三个 scripts

- [X] T002 [P] 更新 `/Users/koray/Documents/GitHub/0xMux/server/Cargo.toml`，添加所有新增依赖：`clap` 4.x (derive)、`which` 6.0、`uuid` 1.x、`rust-embed` 8.5+ (optional)、`mime_guess` 2.0 (optional)、`tokio-stream` 0.1，定义 `embed-frontend` feature
  - 自测: 运行 `cd server && cargo check` 确认所有依赖解析成功无编译错误

- [X] T003 [P] 更新 `/Users/koray/Documents/GitHub/0xMux/.gitignore`，添加 `npm/` 构建产物和 `*.tgz` 排除规则
  - 自测: 运行 `git status` 确认 npm/ 和 .tgz 文件不会被追踪

- [X] T004 在根目录执行 `npm install` 安装 concurrently，验证 `npm run dev` 可同时启动前后端（前端 Vite:3000 + 后端 cargo-watch:3001）
  - 自测: 运行 `npm run dev`，等待 5 秒确认终端同时出现 `[WEB]` 和 `[SERVER]` 前缀日志，然后 Ctrl+C 确认两个进程都正常退出

---

## Phase 2: Foundational — 后端核心基础设施

**目标**: 建立统一错误处理、CLI 配置、共享类型，为所有用户场景提供基础

- [X] T005 创建统一错误处理模块 `/Users/koray/Documents/GitHub/0xMux/server/src/error.rs`：定义 `AppError` 枚举（`NotFound`/`BadRequest`/`Conflict`/`ServiceUnavailable`/`Internal`），实现 `IntoResponse` trait，统一返回 `{"error":"code","message":"..."}` JSON 格式
  - 自测: 运行 `cd server && cargo check` 编译通过，确认 `AppError` 各变体可序列化为预期 JSON 格式

- [X] T006 [P] 创建 CLI 配置模块 `/Users/koray/Documents/GitHub/0xMux/server/src/config.rs`：使用 `clap` derive 定义 `ServerConfig` struct，支持 `--port`（默认 1234）、`--host`（默认 127.0.0.1）、`--version`，支持 `PORT`/`HOST` 环境变量回退
  - 自测: 运行 `cd server && cargo check` 编译通过，运行 `cargo run -- --help` 确认显示 port/host 参数说明，运行 `cargo run -- --version` 确认输出版本号

- [X] T007 [P] 创建前端共享类型文件 `/Users/koray/Documents/GitHub/0xMux/web/src/lib/types.ts`：定义 `TmuxSession`、`DependencyStatus`、`SystemDepsResponse`、`InstallTaskResponse`、`WsMessage`、`AppError` 等 TypeScript 接口，与 REST/WebSocket 契约对齐
  - 自测: 运行 `cd web && npx tsc --noEmit` 确认类型定义无编译错误

- [X] T008 [P] 创建前端 API 客户端 `/Users/koray/Documents/GitHub/0xMux/web/src/lib/api.ts`：封装所有 REST API 调用（`getSessions`、`createSession`、`deleteSession`、`renameSession`、`getSystemDeps`、`installPackage`、`restartServer`、`getConfig`），统一错误处理
  - 自测: 运行 `cd web && npx tsc --noEmit` 确认类型检查通过，确认每个函数的请求路径和方法与 contracts/rest-api.md 一致

- [X] T009 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs`：引入 `config` 模块，使用 `clap` 解析 CLI 参数替换硬编码的 `0.0.0.0:3001`，启动时打印 ASCII Art logo + 绑定地址信息，引入 `error` 模块
  - 自测: 运行 `cd server && cargo run -- --port 5555 --host 127.0.0.1`，确认终端输出绑定地址为 `127.0.0.1:5555`；运行 `PORT=6666 cargo run`，确认绑定 6666 端口；运行 `curl http://127.0.0.1:5555/api/health`（用实际端口）确认返回 200

---

## Phase 3: US1 — 开发者贡献代码（Monorepo + 统一开发命令）

**场景目标**: 开源贡献者 clone 仓库后，一条命令即可进入开发模式
**独立测试标准**: `npm run dev` 同时启动前后端，修改前端代码触发热更新，修改后端代码触发自动重编译

- [X] T010 [US1] 更新 `/Users/koray/Documents/GitHub/0xMux/web/vite.config.ts`：确认 proxy 配置 `/api` → `http://localhost:3001`、`/ws` → `ws://localhost:3001`，添加开发服务器 HMR 配置
  - 自测: 运行 `npm run dev`，打开 `http://localhost:3000`，在浏览器 DevTools Network 面板确认 `/api/sessions` 请求被代理到 3001 端口并返回数据

- [X] T011 [US1] 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs` 中 dev 模式端口处理：当 `PORT` 环境变量未设置时，检查是否存在 `--port` 参数，否则使用默认 1234；根目录 `dev:server` 脚本通过 `PORT=3001` 控制开发端口
  - 自测: 运行 `PORT=3001 cargo run`（在 server/ 下）确认绑定 3001；不设 PORT 直接 `cargo run` 确认绑定默认 1234

- [X] T012 [US1] 更新根 `/Users/koray/Documents/GitHub/0xMux/package.json` 中 `dev:server` 脚本为 `cd server && PORT=3001 cargo watch -q -c -w src -x run`，确保开发模式下后端绑定 3001 端口
  - 自测: 运行 `npm run dev`，等待前后端都启动后，打开 `http://localhost:3000` 确认页面正常显示；修改 `web/src/App.tsx` 添加一行注释后保存，确认浏览器 2 秒内自动更新；修改 `server/src/main.rs` 添加一行注释后保存，确认终端显示 cargo 重编译日志

---

## Phase 4: US2 — 日常 Session 管理（核心功能）

**场景目标**: 用户通过浏览器完成 tmux session 的查看、创建、删除、重命名，状态实时同步
**独立测试标准**: 前端可 CRUD session，WebSocket 推送状态变化，PC 三列 / 手机单列响应式

### 后端 — Session CRUD 路由

- [X] T013 [US2] 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/tmux.rs`：为 `list_sessions` 增加返回 `Result<Vec<TmuxSession>, AppError>` 错误处理（区分 tmux 未安装 vs 无 session），为 `kill_session`/`new_session`/`rename_session` 增加错误返回（session 不存在、名称冲突、无效名称），添加 session 名称正则验证 `^[a-zA-Z0-9_.-]+$`
  - 自测: 运行 `cargo check` 编译通过；手动调用 `tmux::new_session("test_valid")` 确认成功，调用 `tmux::new_session("invalid name!")` 确认返回 BadRequest 错误

- [X] T014 [US2] 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs`：添加 `POST /api/sessions` 路由（`Json<CreateSessionRequest>` → 调用 `tmux::new_session` → 返回 201 + session 信息），添加 `DELETE /api/sessions/:name` 路由（`Path<String>` → 调用 `tmux::kill_session` → 返回 204），添加 `PUT /api/sessions/:name` 路由（`Path<String>` + `Json<RenameRequest>` → 调用 `tmux::rename_session` → 返回 200），更新 `GET /api/sessions` 使用新的错误处理
  - 自测: 启动服务后用 curl 逐一测试：`curl -X POST -H 'Content-Type: application/json' -d '{"name":"test1"}' http://localhost:1234/api/sessions` 返回 201；`curl http://localhost:1234/api/sessions` 列表中包含 test1；`curl -X PUT -H 'Content-Type: application/json' -d '{"name":"test2"}' http://localhost:1234/api/sessions/test1` 返回 200；`curl -X DELETE http://localhost:1234/api/sessions/test2` 返回 204；再次 GET 确认列表中无 test2

- [X] T015 [US2] 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs`：添加 `GET /api/health` 返回 `{"status":"ok","version":"0.1.0"}` JSON 格式（替换当前纯文本），添加 `GET /api/config` 返回当前 ServerConfig
  - 自测: `curl http://localhost:1234/api/health` 返回 `{"status":"ok","version":"0.1.0"}`；`curl http://localhost:1234/api/config` 返回含 port/host/version 的 JSON

### 后端 — WebSocket 实时推送

- [X] T016 [US2] 重构 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs` 中 WebSocket 处理：使用 `tokio::sync::broadcast` channel 管理多客户端连接，后台 spawned task 每 3 秒调用 `tmux::list_sessions()`，检测到变化时广播 `{"type":"sessions_update","data":{"sessions":[...]}}` JSON 消息，实现 `ping`/`pong` 心跳处理
  - 自测: 启动服务，使用 `websocat ws://127.0.0.1:1234/ws`（或浏览器 DevTools Console: `new WebSocket('ws://127.0.0.1:1234/ws')` + onmessage 监听），然后在终端 `tmux new -d -s wstest`，3 秒内应收到 `sessions_update` JSON 消息；发送 `{"type":"ping"}` 应收到 `{"type":"pong"}`

### 前端 — Session 管理 UI

- [X] T017 [P] [US2] 创建 WebSocket hook `/Users/koray/Documents/GitHub/0xMux/web/src/hooks/useWebSocket.ts`：自动连接 `/ws`，处理 JSON 消息解析，实现指数退避重连（1s→2s→4s...→30s max），30 秒心跳 ping，连接状态暴露（connected/connecting/disconnected）
  - 自测: `cd web && npx tsc --noEmit` 类型检查通过；在 App.tsx 中临时使用该 hook，打开浏览器 DevTools Network → WS 面板确认连接建立、心跳发送、收到消息；停止后端后确认控制台输出重连日志

- [X] T018 [P] [US2] 创建 Session 数据 hook `/Users/koray/Documents/GitHub/0xMux/web/src/hooks/useSessions.ts`：组合 REST 初始获取 + WebSocket 实时更新，暴露 `sessions`/`loading`/`error` 状态，暴露 `createSession`/`deleteSession`/`renameSession` mutation 方法
  - 自测: `cd web && npx tsc --noEmit` 类型检查通过；在 App.tsx 中临时使用该 hook 并 `console.log(sessions)`，确认页面加载后控制台输出 session 数组

- [X] T019 [P] [US2] 创建 Header 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/Header.tsx`：显示 0xMux logo + 版本号 + session 数量 + 连接状态指示灯（绿色=connected，橙色=connecting，红色=disconnected）
  - 自测: `cd web && npx tsc --noEmit` 通过；在 App.tsx 中渲染 `<Header sessionCount={3} connectionStatus="connected" />`，浏览器中确认 logo、版本号、数量、绿色指示灯均正确显示

- [X] T020 [P] [US2] 创建 SessionCard 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/SessionCard.tsx`：显示 session 名称、窗口数、attached/detached 状态，霓虹绿边框（attached）/ 灰色边框（detached），悬停显示删除按钮（右上角 x），双击名称进入内联编辑模式（失焦或回车保存），删除需二次确认（按住 Shift 跳过确认）
  - 自测: `cd web && npx tsc --noEmit` 通过；在 App.tsx 中渲染两个 SessionCard（一个 attached 一个 detached），确认：1) 边框颜色不同 2) 悬停出现 x 按钮 3) 双击名称进入编辑 4) 回车或失焦退出编辑 5) 点击 x 弹出确认

- [X] T021 [P] [US2] 创建 SessionGrid 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/SessionGrid.tsx`：使用 CSS Grid 布局 PC 三列 / 平板两列 / 手机单列，包含 "+" 创建卡片（点击弹出创建弹窗），空状态提示（"no tmux sessions found"），loading 状态动画
  - 自测: `cd web && npx tsc --noEmit` 通过；传入空数组确认显示空状态；传入 5 个 mock session 确认 PC 端三列展示；Chrome DevTools 切换到手机模式确认单列；点击 "+" 卡片确认 `onCreateClick` 回调触发

- [X] T022 [P] [US2] 创建 CreateSessionModal 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/CreateSessionModal.tsx`：终端风格输入框（`> session name: _` 带闪烁光标），名称验证（正则 + 实时反馈），Enter 提交 / Escape 取消
  - 自测: `cd web && npx tsc --noEmit` 通过；渲染该组件，确认：1) 输入框闪烁光标效果 2) 输入 "valid-name" 无错误提示 3) 输入 "bad name!" 显示红色错误 4) 回车触发 submit 回调 5) Escape 触发 close 回调

- [X] T023 [US2] 重构 `/Users/koray/Documents/GitHub/0xMux/web/src/App.tsx`：替换当前单文件实现，组合 Header + SessionGrid 组件，使用 useSessions hook 管理数据，移除旧的 fetch 轮询逻辑
  - 自测: `cd web && npx tsc --noEmit` 通过；`npm run dev` 启动后浏览器访问 `http://localhost:3000`，确认：1) Header 显示正确 2) Session 列表从后端加载 3) 创建/删除/重命名操作正常 4) 无 `setInterval` 轮询残留（全部由 WebSocket 驱动）

### 前端 — 极客 UI 增强

- [X] T024 [P] [US2] 更新 `/Users/koray/Documents/GitHub/0xMux/web/src/index.css`：修复 JetBrains Mono 字体加载（改用 `@import` Google Fonts 或本地字体文件），添加 `@keyframes neon-breathe` 呼吸灯动画，添加 `.neon-pulse` 状态指示灯 class，添加自定义 scrollbar 霓虹绿 hover 效果
  - 自测: 浏览器中打开页面，DevTools Elements 面板确认 `body` 的 `font-family` 已生效为 JetBrains Mono；找到使用 `.neon-pulse` 的元素确认动画在运行；滚动页面确认 scrollbar 样式为暗色+绿色 hover

- [X] T025 [US2] 更新 `/Users/koray/Documents/GitHub/0xMux/web/index.html`：添加 Google Fonts preconnect link，添加 meta viewport 确保移动端正确缩放，更新 title 为 "0xMux"
  - 自测: 浏览器查看页面标题为 "0xMux"；DevTools Elements 确认 `<head>` 中有 `preconnect` 和 `viewport` meta 标签；手机模式下确认不会出现横向滚动

---

## Phase 5: US3 — 首次启动/依赖检测与安装

**场景目标**: 用户在缺少 tmux 时启动 0xMux，通过 Web UI 完成依赖安装
**独立测试标准**: `/api/system/deps` 返回正确检测结果，安装日志通过 WebSocket 实时推送，前端展示引导页

### 后端 — 系统检测与安装

- [X] T026 [US3] 创建系统检测模块 `/Users/koray/Documents/GitHub/0xMux/server/src/system.rs`：实现 `detect_os()` 返回 OS + arch（使用 `std::env::consts`），实现 `detect_package_manager()` 检测 brew/apt/dnf（使用 `which` crate），实现 `check_dependency(name)` 检测单个依赖 + 版本解析，实现 `check_all_deps()` 返回完整依赖状态列表，定义 `ALLOWED_PACKAGES` 白名单常量
  - 自测: `cargo check` 编译通过；在 main.rs 中临时调用 `system::check_all_deps()` 并打印结果，运行后确认 tmux 检测结果正确（已安装显示版本号，未安装显示 None）

- [X] T027 [US3] 实现安装执行逻辑，追加到 `/Users/koray/Documents/GitHub/0xMux/server/src/system.rs`：`start_install(package)` 函数验证白名单 → 检测包管理器 → 使用 `tokio::process::Command` 启动安装进程（stdout+stderr piped）→ 返回 `(task_id, broadcast::Receiver)`，使用 `tokio::sync::broadcast` channel 逐行推送安装日志，安装完成后发送 `install_complete` 消息（含 exit_code），使用 `tokio::sync::Mutex` 确保同一时间只有一个安装任务
  - 自测: `cargo check` 编译通过；写一个临时测试用 `start_install("tmux")` 触发安装（如果已安装则用一个无害命令如 `echo test` 替代），确认 broadcast channel 逐行输出日志，最终发送 complete 消息

- [X] T028 [US3] 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs`：引入 `system` 模块，添加 `GET /api/system/deps` 路由，添加 `POST /api/system/install` 路由（验证白名单 → 启动安装 → 返回 202 + task_id），添加 `WS /ws/install/:task_id` 路由（连接后订阅对应 task 的 broadcast channel），添加 `POST /api/system/restart` 路由（响应 202 后延迟 500ms 调用 `std::process::exit(42)`）
  - 自测: 启动服务后：1) `curl http://localhost:1234/api/system/deps` 返回含 os/arch/package_manager/dependencies 的 JSON 2) `curl -X POST -H 'Content-Type: application/json' -d '{"package":"invalid"}' http://localhost:1234/api/system/install` 返回 400 3) `curl -X POST http://localhost:1234/api/system/restart` 返回 202 且服务随后退出（检查退出码为 42）

### 前端 — 依赖引导页

- [X] T029 [P] [US3] 创建依赖检测 hook `/Users/koray/Documents/GitHub/0xMux/web/src/hooks/useDeps.ts`：调用 `GET /api/system/deps`，暴露 `deps`/`loading`/`allReady` 状态，暴露 `installPackage(name)` 方法（调用 REST + 连接安装 WebSocket），暴露 `restartServer()` 方法
  - 自测: `cd web && npx tsc --noEmit` 通过；在 App.tsx 中临时使用该 hook 并 `console.log(deps, allReady)`，确认控制台输出依赖状态列表和 allReady 布尔值

- [X] T030 [P] [US3] 创建 DependencyItem 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/DependencyItem.tsx`：终端风格显示 `[✓] tmux 3.4` (绿色) / `[✗] tmux — not found` (红色+Install 按钮) / `[!] claude-code — optional` (黄色+Install+Skip 按钮），安装中显示旋转动画，安装完成自动刷新状态
  - 自测: `cd web && npx tsc --noEmit` 通过；渲染三种状态的 DependencyItem（installed/missing-required/missing-optional），确认：1) 颜色正确（绿/红/黄）2) 按钮文案正确（Install / Install+Skip）3) 模拟 installing 状态时旋转动画显示

- [X] T031 [P] [US3] 创建 InstallLog 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/InstallLog.tsx`：终端风格滚动日志区域（黑色背景、绿色等宽文字），自动滚动到最新行，区分 stdout（白色）/ stderr（黄色），完成后显示成功（绿色）或失败（红色）状态行，失败时展示手动安装命令（可复制）
  - 自测: `cd web && npx tsc --noEmit` 通过；传入 mock 日志数组（含 stdout 和 stderr 行），确认：1) 黑色背景终端风格 2) stdout 白色 stderr 黄色 3) 内容超出容器时自动滚动到底部 4) 传入 failed 状态时红色状态行+可复制命令

- [X] T032 [US3] 创建 SetupWizard 组件 `/Users/koray/Documents/GitHub/0xMux/web/src/components/SetupWizard.tsx`：组合 DependencyItem 列表 + InstallLog，顶部显示 "Environment Setup" 标题（终端风格：`$ 0xmux --check-deps`），底部在所有必需依赖就绪后显示 "Restart 0xMux" 按钮，点击重启后显示 "Reconnecting..." 动画 + 轮询 `/api/health`
  - 自测: `cd web && npx tsc --noEmit` 通过；传入 mock 依赖数据（1 个缺失必需 + 1 个已安装），确认：1) 标题显示 2) 缺失项有 Install 按钮 3) Restart 按钮隐藏（因有缺失项）；改为全部就绪后确认 Restart 按钮出现

- [X] T033 [US3] 更新 `/Users/koray/Documents/GitHub/0xMux/web/src/App.tsx`：启动时先调用 `GET /api/system/deps`，如果有必需依赖缺失 → 渲染 SetupWizard 替代 SessionGrid，所有依赖就绪（或重启后重连成功）→ 切换到 SessionGrid 主面板
  - 自测: 启动前后端，浏览器访问：1) tmux 已安装时 → 直接显示 SessionGrid 主面板 2) 修改后端临时让 `check_all_deps` 返回 tmux 未安装 → 刷新后显示 SetupWizard 引导页 3) 恢复正常后刷新 → 回到主面板

---

## Phase 6: US4 — 构建、打包与分发

**场景目标**: 用户通过 `npx 0xmux`、`npm i -g 0xmux`、`brew install 0xmux` 安装并启动服务
**独立测试标准**: `npm run build` 产出可独立运行的二进制，npm 包结构正确，Homebrew formula 可安装

### 静态文件嵌入

- [X] T034 [US4] 创建静态文件服务模块 `/Users/koray/Documents/GitHub/0xMux/server/src/static_files.rs`：使用 `#[cfg(feature = "embed-frontend")]` 条件编译，定义 `#[derive(RustEmbed)] #[folder = "../web/dist/"] struct Assets`，实现 `serve_embedded(uri)` 函数处理嵌入文件请求（MIME 检测 + SPA fallback 到 index.html），排除 `*.map` 文件
  - 自测: `cargo check --features embed-frontend` 编译通过（需先 `cd web && bun run build` 产出 dist/）；`cargo check` 不带 feature 时也编译通过（条件编译不影响默认构建）

- [X] T035 [US4] 更新 `/Users/koray/Documents/GitHub/0xMux/server/src/main.rs`：在 `embed-frontend` feature 启用时，添加 `.fallback(serve_embedded)` 路由（在所有 `/api` 和 `/ws` 路由之后），未启用时不添加 fallback（开发模式由 Vite proxy 处理）
  - 自测: 先 `cd web && bun run build`，然后 `cd server && cargo run --features embed-frontend`，浏览器访问 `http://localhost:1234` 确认看到完整前端 UI（不需要 Vite dev server）；访问 `/api/health` 确认 API 仍正常；访问一个不存在的路径如 `/nonexist` 确认 fallback 到 index.html（SPA 路由）

- [X] T036 [US4] 验证完整构建流程：执行 `npm run build`（先 `build:web` 再 `build:server --features embed-frontend`），启动产出的二进制文件 `server/target/release/oxmux-server`，浏览器访问 `http://localhost:1234` 确认可看到完整 UI
  - 自测: 从根目录执行 `npm run build`，确认无报错；`./server/target/release/oxmux-server --version` 输出版本号；`./server/target/release/oxmux-server` 启动后浏览器访问确认 UI 正常且所有功能可用；`ls -lh server/target/release/oxmux-server` 确认文件大小

### npm 分发包

- [X] T037 [P] [US4] 创建 npm 主包结构 `/Users/koray/Documents/GitHub/0xMux/npm/0xmux/package.json`：定义 `name: "0xmux"`、`bin: {"0xmux": "bin/0xmux.js"}`、`optionalDependencies` 指向 `@0xmux/darwin-arm64`、`@0xmux/darwin-x64`、`@0xmux/linux-x64`
  - 自测: `cat npm/0xmux/package.json | python3 -m json.tool` JSON 格式有效；确认 `bin` 字段指向 `bin/0xmux.js`；确认 `optionalDependencies` 包含三个平台包

- [X] T038 [P] [US4] 创建 JS 启动器 `/Users/koray/Documents/GitHub/0xMux/npm/0xmux/bin/0xmux.js`：检测 `process.platform` + `process.arch` → 映射到 `@0xmux/<platform>` 包名 → `require.resolve` 定位二进制 → `spawnSync` 执行传递 `process.argv.slice(2)`，退出码 42 时自动重启子进程（循环），不支持的平台输出错误信息并退出
  - 自测: 将当前平台编译好的二进制手动放入对应的 mock 平台包目录，运行 `node npm/0xmux/bin/0xmux.js --version` 确认输出版本号；运行 `node npm/0xmux/bin/0xmux.js --help` 确认参数透传正常

- [X] T039 [P] [US4] 创建平台包模板 `/Users/koray/Documents/GitHub/0xMux/npm/platform-template/package.json`：包含 `os`、`cpu`、`bin` 字段模板，CI 脚本将根据此模板为每个平台生成对应的 package.json
  - 自测: 确认模板文件包含 `${OS}`、`${CPU}`、`${VERSION}` 等占位符；用 sed 手动替换一个平台的值，`python3 -m json.tool` 验证替换后 JSON 有效

- [X] T040 [US4] 创建 CI/CD 发布工作流 `/Users/koray/Documents/GitHub/0xMux/.github/workflows/release.yml`：tag `v*` 触发，矩阵策略构建 3 个目标（`aarch64-apple-darwin` on macos-14、`x86_64-apple-darwin` on macos-13、`x86_64-unknown-linux-gnu` on ubuntu-latest），每个 job：checkout → install Rust → `npm run build:web` → `cargo build --release --features embed-frontend --target <target>` → strip 二进制 → 创建 tarball → 上传 GitHub Release，发布 job：下载所有平台产物 → 为每个平台生成 npm 包（从模板填充）→ `npm publish` 每个平台包和主包
  - 自测: 运行 `actionlint .github/workflows/release.yml`（如已安装）或目视检查 YAML 语法正确；确认矩阵包含 3 个平台；确认 build 和 publish job 的依赖关系正确（publish needs build）

### Homebrew 分发

- [X] T041 [P] [US4] 创建 Homebrew formula 模板 `/Users/koray/Documents/GitHub/0xMux/homebrew/Formula/0xmux.rb`：使用 `on_macos do` 按 `Hardware::CPU.arm?` / `intel?` 选择对应 tarball URL（指向 GitHub Release），`def install` 安装二进制到 `bin/0xmux`，`test do` 运行 `0xmux --version`，SHA256 占位符由 CI 自动替换
  - 自测: `ruby -c homebrew/Formula/0xmux.rb` 确认 Ruby 语法正确；确认 URL 模式指向 `https://github.com/.../releases/download/...`；确认有 `on_macos` + `Hardware::CPU.arm?` 分支

- [X] T042 [US4] 更新 `/Users/koray/Documents/GitHub/0xMux/.github/workflows/release.yml`：添加 update-formula job，计算每个平台 tarball 的 SHA256，clone homebrew-0xmux tap 仓库 → 更新 Formula 中的版本号和 hash → 提交并推送
  - 自测: YAML 语法正确；update-formula job 的 `needs` 包含 build job；确认 SHA256 计算使用 `sha256sum` 或 `shasum -a 256`；确认 git commit + push 步骤存在

---

## Phase 7: Polish — 收尾与体验优化

**目标**: 终端启动体验、文档更新、配置优化

- [X] T043 创建终端 ASCII Art 常量文件 `/Users/koray/Documents/GitHub/0xMux/server/src/banner.rs`：定义 `print_banner(host, port, version)` 函数，输出霓虹绿 ASCII Art logo + 版本号 + 访问地址，在 `main.rs` 服务启动前调用
  - 自测: `cargo run` 启动时终端输出 ASCII Art logo + "0xMux v0.1.0" + "→ http://127.0.0.1:1234"；指定 `--port 8080` 后地址显示为 8080

- [X] T044 [P] 更新 `/Users/koray/Documents/GitHub/0xMux/server/Cargo.toml` 添加 release profile 优化：`[profile.release]` 设置 `opt-level = "z"`、`lto = true`、`strip = true`、`codegen-units = 1`，确保二进制体积最小化（目标 < 20MB）
  - 自测: `cargo build --release --features embed-frontend`（需先 build web），`ls -lh server/target/release/oxmux-server` 确认大小 < 20MB

- [X] T045 [P] 更新 `/Users/koray/Documents/GitHub/0xMux/README.md`：反映最终项目结构、安装方式（npx/npm/brew）、开发命令（`npm run dev`）、构建命令（`npm run build`），移除旧的 "cd server && cargo run" 手动启动方式
  - 自测: 通读 README，确认：1) Quick Start 使用 `npm run dev` 2) 安装方式列出 npx/npm/brew 3) 无残留旧内容 4) 项目结构图与实际一致

- [X] T046 更新 `/Users/koray/Documents/GitHub/0xMux/web/src/App.tsx`：添加 Footer 组件显示版本号 + 连接状态 + "Rust + React" 标签（已有基础，确保与新组件架构一致）
  - 自测: 浏览器中确认页面底部 Footer 显示：版本号、连接状态指示、"Rust + React" 文字；滚动页面确认 Footer 固定在底部

---

## 依赖关系图

```
Phase 1 (Setup: T001-T004)
    │
    ├──→ Phase 2 (Foundational: T005-T009) ──→ 所有后续 Phase
    │
    ├──→ Phase 3 (US1: T010-T012) ── 无后续依赖，可独立完成
    │
    ├──→ Phase 4 (US2: T013-T025)
    │        │
    │        └── T013-T016 (后端) ──→ T017-T025 (前端，可与后端并行部分任务)
    │
    ├──→ Phase 5 (US3: T026-T033)
    │        │
    │        └── 依赖 Phase 4 的 WebSocket 基础 (T016-T017)
    │
    ├──→ Phase 6 (US4: T034-T042)
    │        │
    │        └── 依赖 Phase 4+5 功能完成（需要完整前端才能嵌入）
    │
    └──→ Phase 7 (Polish: T043-T046) ── 依赖所有前序 Phase
```

---

## 并行执行机会

### Phase 2 内部并行
```
T005 (error.rs) ─┐
T006 (config.rs) ─┤── 独立文件，可并行
T007 (types.ts)  ─┤
T008 (api.ts)    ─┘
         │
         ▼
T009 (main.rs 整合) ── 依赖 T005+T006
```

### Phase 4 内部并行
```
后端组:
  T013 (tmux.rs) → T014 (routes) → T015 (health/config) → T016 (WebSocket)

前端组 (T013-T014 完成后可并行):
  T017 (useWebSocket) ─┐
  T018 (useSessions)  ─┤
  T019 (Header)       ─┤── 独立组件，可并行
  T020 (SessionCard)  ─┤
  T021 (SessionGrid)  ─┤
  T022 (CreateModal)  ─┤
  T024 (index.css)    ─┤
  T025 (index.html)   ─┘
           │
           ▼
  T023 (App.tsx 整合) ── 依赖所有前端组件
```

### Phase 5 内部并行
```
后端: T026 (system.rs) → T027 (install) → T028 (routes)
前端 (T028 完成后可并行):
  T029 (useDeps)        ─┐
  T030 (DependencyItem) ─┤── 独立组件，可并行
  T031 (InstallLog)     ─┘
           │
           ▼
  T032 (SetupWizard) → T033 (App.tsx 整合)
```

### Phase 6 内部并行
```
T034 (static_files.rs) → T035 (main.rs 整合) → T036 (验证)
T037 (npm package.json)  ─┐
T038 (JS launcher)       ─┤── 独立文件，可并行
T039 (platform template) ─┤
T041 (brew formula)      ─┘
           │
           ▼
T040 (CI workflow) → T042 (CI formula update)
```

---

## 实施策略

### MVP 范围（建议优先完成）

**Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2)**

这组成了可用的 MVP：
- 开发者可以 clone 并 `npm run dev` 进入开发模式 (US1)
- 浏览器可以完整管理 tmux session (US2)
- 极客风 UI 完整可用

MVP 完成后，US3 (依赖检测) 和 US4 (分发) 可独立迭代。

### 建议执行顺序

1. **第一轮**: T001-T004 (Setup) — 建立开发基础
2. **第二轮**: T005-T009 (Foundational) — 并行完成基础模块
3. **第三轮**: T010-T012 (US1) + T013-T016 (US2 后端) — 并行进行
4. **第四轮**: T017-T025 (US2 前端) — 大量并行机会
5. **第五轮**: T026-T033 (US3) — 依赖检测与安装
6. **第六轮**: T034-T042 (US4) — 构建与分发
7. **第七轮**: T043-T046 (Polish) — 收尾优化
