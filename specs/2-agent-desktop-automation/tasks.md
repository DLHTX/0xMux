# Tasks: AI Agent Desktop Automation (oxmux-agent)

**Feature ID**: 2-agent-desktop-automation
**Date**: 2026-02-15
**Total Tasks**: 42

---

## User Story Mapping

| Story | Spec Scenario | Description | Priority |
|-------|--------------|-------------|----------|
| US1 | Scenario 1 | AI Agent 启动应用并交互 | P1 |
| US2 | Scenario 4 | AI Agent 读取 UI 元素并精确操作 | P1 |
| US3 | Scenario 3+5 | 定时任务调度与执行 | P2 |
| US4 | Scenario 2 | AI Agent 浏览网站 (浏览器自动化) | P3 |

---

## Phase 1: Setup (项目初始化)

- [X] T001 配置 Cargo workspace，在根 `Cargo.toml` 添加 `members = ["server", "agent"]`
- [X] T002 创建 `agent/Cargo.toml`，定义 oxmux-agent crate 及所有依赖（enigo, xcap, tokio-cron-scheduler, chrono, async-trait, thiserror, uuid, 平台特定依赖）
- [X] T003 创建 `agent/src/lib.rs`，声明 pub mod desktop, pub mod cron, pub mod browser
- [X] T004 创建 `agent/src/types.rs`，定义公共类型 Point, Rect, Dimensions, LogicalPoint, PhysicalPoint, MouseButton, Modifier
- [X] T005 修改 `server/Cargo.toml`，添加 `oxmux-agent = { path = "../agent", optional = true }` 和 `[features] agent = ["dep:oxmux-agent"]`
- [X] T006 验证 `cargo build -p oxmux-agent` 独立编译成功，且 `cargo build -p oxmux-server` 不带 agent feature 仍正常

---

## Phase 2: Foundational (基础能力 — 所有 User Story 的前置)

### 截图 + 坐标映射

- [X] T007 [P] 创建 `agent/src/desktop/mod.rs`，声明子模块 screenshot, coordinate, display, input, command, keys, ui_tree, window
- [X] T008 [P] 实现 `agent/src/desktop/coordinate.rs`，CoordinateMapper 工具：physical_to_logical(x, y, scale) -> (i32, i32)，logical_to_physical，element_center(bounds) -> Point
- [X] T009 实现 `agent/src/desktop/display.rs`，调用 xcap Monitor::all() 枚举显示器，返回 Vec<MonitorInfo>（id, name, logical_size, physical_size, scale_factor, is_primary）
- [X] T010 实现 `agent/src/desktop/screenshot.rs`，AnnotatedScreenshot 结构体（image + physical_size + logical_size + scale_factor + monitor_id），screenshot() 函数支持全屏/窗口/区域三种模式，自动附带 scale_factor 元数据

### 键鼠输入

- [X] T011 实现 `agent/src/desktop/keys.rs`，按键字符串解析器：将 "ctrl+shift+s" 格式解析为 enigo Key 序列，支持 modifier 组合和特殊键名（enter, tab, escape, f1-f12, arrow keys 等）
- [X] T012 实现 `agent/src/desktop/input.rs`，封装 enigo 提供统一接口：click(x, y, button), double_click(x, y), type_text(text), press_key(key_combo), drag(from, to), move_to(x, y)。所有坐标为逻辑坐标

### 命令执行

- [X] T013 实现 `agent/src/desktop/command.rs`，安全命令执行：tokio::process::Command 封装，环境变量过滤（NODE_OPTIONS, DYLD_*, LD_PRELOAD, LD_LIBRARY_PATH），输出截断 200KB，超时控制（默认 120s，最大 600s），返回 CommandOutput { exit_code, stdout, stderr, duration_ms, truncated }

---

## Phase 3: US1 — AI Agent 启动应用并交互

**Story Goal**: AI Agent 能通过 API 启动桌面应用、确认窗口出现、截图查看、模拟键鼠交互

**Independent Test**: `POST /api/agent/desktop/launch` 启动 Calculator → `GET /api/agent/desktop/windows` 确认窗口出现 → `POST /api/agent/desktop/screenshot` 截图验证 → `POST /api/agent/desktop/click` 点击按钮

### 窗口管理

- [X] T014 [US1] 创建 `agent/src/desktop/window/mod.rs`，定义 WindowManager trait: list_windows, focus_window(title), launch_app(name) -> pid, quit_app(name), is_running(name)，以及 WindowInfo 结构体
- [X] T015 [US1] 实现 `agent/src/desktop/window/macos.rs`，macOS WindowManager: CGWindowListCopyWindowInfo 枚举窗口，osascript activate 聚焦，`open -a` 启动应用，`osascript quit` 退出应用
- [X] T016 [P] [US1] 实现 `agent/src/desktop/window/windows.rs`，Windows WindowManager: EnumWindows 枚举，SetForegroundWindow 聚焦，ShellExecuteW / `cmd /c start` 启动应用，PostMessage WM_CLOSE 退出
- [X] T017 [US1] 在 `agent/src/desktop/window/mod.rs` 添加 create_window_manager() 工厂函数，使用 `#[cfg(target_os)]` 条件编译返回平台实现

### REST API 集成 (US1 相关)

- [X] T018 [US1] 创建 `server/src/handlers/agent.rs`，实现 desktop API handlers: screenshot, displays, click, type_text, press_key, drag, list_windows, focus_window, launch_app, quit_app, app_status, run_command
- [X] T019 [US1] 修改 `server/src/handlers/mod.rs`，条件编译引入 agent 模块
- [X] T020 [US1] 修改 `server/src/router.rs`，注册 `/api/agent/desktop/*` 路由组，使用 `#[cfg(feature = "agent")]` 条件编译
- [X] T021 [US1] 验证 `cargo build -p oxmux-server --features agent` 编译成功

---

## Phase 4: US2 — AI Agent 读取 UI 元素并精确操作

**Story Goal**: AI Agent 能读取前台应用的无障碍树，获取结构化 UI 元素列表（ref ID + role + name + bounds），并通过 ref ID 精确点击元素

**Independent Test**: `GET /api/agent/desktop/ui-tree` 获取前台窗口 UI 树 → 找到目标按钮的 ref_id → `POST /api/agent/desktop/click` 使用 ref 点击 → 验证操作生效

### UI 树读取

- [X] T022 [US2] 创建 `agent/src/desktop/ui_tree/mod.rs`，定义 UITreeReader trait (read_tree, find_elements)，UIElement (ref_id, role, name, value, bounds)，UITree (app_name, window_title, elements, total_elements, truncated)，UITreeOptions (window_title, filter, depth, max_elements)
- [X] T023 [US2] 实现 `agent/src/desktop/ui_tree/ref_manager.rs`，RefManager: 请求级生命周期，分配 "e1", "e2"... ref ID，缓存元素 bounds 供 click-by-ref 使用，提供 get_element_center(ref_id) -> Option<Point>
- [X] T024 [US2] 实现 `agent/src/desktop/ui_tree/macos.rs`，macOS UITreeReader: System Events + osascript 递归遍历 UI 元素
- [X] T025 [P] [US2] 实现 `agent/src/desktop/ui_tree/windows_impl.rs`，Windows UITreeReader stub
- [X] T026 [US2] 在 `agent/src/desktop/ui_tree/mod.rs` 添加条件编译平台分发

### Click-by-Ref 集成

- [X] T027 [US2] 在 `server/src/handlers/agent.rs` 添加 click_or_ref_handler，支持 ref 和 x/y 两种模式
- [X] T028 [US2] 在 `server/src/handlers/agent.rs` 添加 ui_tree_handler 和 ui_find_handler
- [X] T029 [US2] 在 `server/src/router.rs` 注册 `/api/agent/desktop/ui-tree`、`/ui-find`、`/click-ref` 路由

---

## Phase 5: US3 — 定时任务调度与执行

**Story Goal**: 用户能创建/管理定时任务（一次性、周期性、Cron 表达式），任务按计划执行并通过通知系统推送结果，支持崩溃恢复和容错

**Independent Test**: `POST /api/agent/cron` 创建 "every 5s" 任务 → 等待触发 → 检查通知系统收到执行结果 → 重启服务 → 验证任务仍存在

### Cron 核心

- [X] T030 [US3] 创建 `agent/src/cron/types.rs`，定义 CronJob, CronSchedule (At/Every/Cron enum), CronAction (RunCommand/OpenApp/OpenUrl/Screenshot/Custom enum), JobResult (status, output, duration_ms, executed_at), CronStorage (version, jobs)
- [X] T031 [US3] 实现 `agent/src/cron/store.rs`，JSON 文件持久化：load/save 到 `~/.config/0xmux/agent/cron-jobs.json`，原子写入（write tmp + rename），启动时自动创建目录
- [X] T032 [US3] 实现 `agent/src/cron/executor.rs`，任务执行器：根据 CronAction 类型分发执行（RunCommand 调用 command.rs，OpenApp 调用 window.rs，Screenshot 调用 screenshot.rs），捕获结果并包装为 JobResult
- [X] T033 [US3] 实现 `agent/src/cron/service.rs`，CronService 核心逻辑：start (加载存储+清理 stale+补执行错过任务)，add/update/remove CRUD，run_now 手动触发，toggle 启用/禁用，指数退避（连续失败延长间隔），10 次连续失败自动禁用+通知
- [X] T034 [US3] 创建 `agent/src/cron/mod.rs`，导出 CronService 公共接口

### Cron REST API

- [X] T035 [US3] 创建 `server/src/handlers/agent_cron.rs`，实现 cron API handlers: list_jobs, create_job, get_job, update_job, delete_job, run_now, toggle_job
- [X] T036 [US3] 修改 `server/src/router.rs`，注册 `/api/agent/cron` 和 `/api/agent/cron/{id}/*` 路由
- [X] T037 [US3] 修改 `server/src/state.rs` + `main.rs`，添加 CronService 并初始化

---

## Phase 6: US4 — AI Agent 浏览网站 (浏览器自动化，可选)

**Story Goal**: AI Agent 能通过 API 打开浏览器、导航到 URL、读取页面无障碍快照、通过 ref ID 交互页面元素

**Independent Test**: `POST /api/agent/browser/navigate` 打开 example.com → `GET /api/agent/browser/snapshot` 获取页面元素 → `POST /api/agent/browser/click` 点击链接 → 验证导航成功

- [X] T038 [US4] 创建 `agent/src/browser/types.rs`，定义 BrowserSession, BrowserTab, PageSnapshot, PageElement (ref_id 前缀 "r")
- [X] T039 [US4] 实现 `agent/src/browser/playwright.rs`，Playwright 子进程管理：tokio::process::Command spawn + stdio JSON-RPC 通信，navigate/snapshot/click/type/tabs 操作
- [X] T040 [US4] 创建 `agent/src/browser/mod.rs`，导出 BrowserService 公共接口
- [X] T041 [US4] 创建 `server/src/handlers/agent_browser.rs` + 注册 `/api/agent/browser/*` 路由

---

## Phase 7: Polish & Cross-Cutting

- [X] T042 验证完整功能：`cargo build -p oxmux-server --features agent` 编译成功，不带 agent feature 编译正常无残留

---

## Dependencies

```
T001 → T002 → T003,T004,T005 → T006
T006 → T007
T007 → T008,T009,T010 (parallel)
T007 → T011,T012,T013 (parallel with T008-T010)

US1: T014 → T015,T016 (parallel) → T017 → T018 → T019,T020,T021
US2: T022 → T023 → T024,T025 (parallel) → T026 → T027 → T028,T029
US3: T030 → T031 → T032 → T033 → T034 → T035 → T036,T037
US4: T038 → T039 → T040 → T041

T042 depends on all above
```

## Parallel Execution Opportunities

| 并行组 | 可并行任务 | 原因 |
|--------|-----------|------|
| Foundational | T008 / T009 / T010 | 不同文件，无依赖 |
| Foundational | T011+T012 / T013 | input vs command，独立模块 |
| US1 | T015 / T016 | macOS vs Windows 实现 |
| US2 | T024 / T025 | macOS vs Windows 实现 |
| Cross-Story | US1 / US2 / US3 | Phase 3-5 均只依赖 Phase 2，可并行 |

## Implementation Strategy

**MVP (最小可行产品)**: Phase 1 + Phase 2 + US1 (T001-T021)
- 完成后即可：截图（带 HiDPI 修正）+ 键鼠输入 + 窗口管理 + 命令执行 + REST API
- 覆盖 AI Agent 最基础的桌面控制需求

**增量交付**:
1. MVP → US2 (UI 树，精确操作) → US3 (Cron) → US4 (浏览器)
2. 每个 User Story 交付后都是独立可用的功能增量
