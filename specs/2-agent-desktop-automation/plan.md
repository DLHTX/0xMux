# Implementation Plan: AI Agent Desktop Automation (oxmux-agent)

**Feature ID**: 2-agent-desktop-automation
**Date**: 2026-02-15
**Status**: Draft

---

## 技术栈决策

| 层 | 技术 | 说明 |
|----|------|------|
| 截图 | xcap 0.8 | 跨平台截图 + scale_factor + 多显示器 |
| 键鼠模拟 | enigo 0.6 | 跨平台键鼠输入，支持 serde |
| UI 树 (macOS) | accessibility-sys + 自行封装 | AXUIElement FFI，高级 crate 不完整 |
| UI 树 (Windows) | uiautomation 0.24 | UIAutomation 完整封装 |
| 窗口管理 (macOS) | core-graphics + osascript | CGWindowListCopyWindowInfo + AppleScript |
| 窗口管理 (Windows) | windows-rs 0.58 | EnumWindows + SetForegroundWindow |
| 定时调度 | tokio-cron-scheduler 0.15 | 异步 cron + 自行 JSON 持久化 |
| 浏览器自动化 | Playwright MCP subprocess | stdio JSON-RPC 协议，可选模块 |
| 坐标映射 | 自行实现 CoordinateMapper | xcap scale_factor 驱动 |

---

## 实施阶段

### Phase 1: Crate 初始化 + 截图 + 坐标映射 (foundation)

**目标**: 建立独立 crate 骨架，实现截图和坐标映射核心

**新增文件**:
```
Cargo.toml                          — workspace 配置
agent/Cargo.toml                    — oxmux-agent crate 定义
agent/src/lib.rs                    — crate 入口，pub mod 声明
agent/src/desktop/mod.rs            — desktop 模块入口
agent/src/desktop/screenshot.rs     — AnnotatedScreenshot + 截图实现
agent/src/desktop/coordinate.rs     — CoordinateMapper + 物理/逻辑转换
agent/src/desktop/display.rs        — 显示器枚举
agent/src/types.rs                  — 公共类型: Point, Rect, Dimensions
```

**修改文件**:
```
Cargo.toml                          — 添加 workspace members
server/Cargo.toml                   — 添加 oxmux-agent 可选依赖
```

**关键实现**:
1. Cargo workspace 配置: `members = ["server", "agent"]`
2. `AnnotatedScreenshot` 结构体: 截图数据 + physical_size + logical_size + scale_factor
3. `screenshot()` — xcap Monitor/Window capture + 自动附加 scale_factor
4. `CoordinateMapper::physical_to_logical(x, y, scale) -> (i32, i32)`
5. `list_displays()` — 枚举所有显示器及其 scale_factor

**验收标准**:
- `cargo build -p oxmux-agent` 独立编译成功
- `cargo build -p oxmux-server` 不带 agent feature 仍正常
- 截图 API 返回正确的 scale_factor（Retina 上为 2.0）
- CoordinateMapper 测试通过

---

### Phase 2: 键鼠输入 + 命令执行

**目标**: 实现跨平台的键鼠模拟和安全命令执行

**新增文件**:
```
agent/src/desktop/input.rs          — 键鼠模拟 (enigo 封装)
agent/src/desktop/command.rs        — 命令执行 + 安全过滤
agent/src/desktop/keys.rs           — 按键字符串解析 ("ctrl+c" → Key::Control + Key::C)
```

**关键实现**:
1. `click(x, y, button)` — enigo Mouse::move_to + click，坐标均为逻辑值
2. `type_text(text)` — enigo Keyboard::text，支持 Unicode
3. `press_key(key_combo)` — 解析 "ctrl+shift+s" 格式，按序 press/release
4. `drag(from, to)` — mouse_down → move → mouse_up 序列
5. `run_command(cmd, args, timeout)` — tokio::process::Command + 环境变量过滤 + 输出截断

**安全措施**:
- 过滤危险环境变量: `NODE_OPTIONS`, `DYLD_*`, `LD_PRELOAD`, `LD_LIBRARY_PATH`
- 输出限制 200KB
- 默认超时 120s，最大 600s

**验收标准**:
- 能模拟点击、输入、快捷键
- 命令执行返回正确的 stdout/stderr/exit_code
- 超时命令正确被 kill

---

### Phase 3: UI 树读取 (跨平台)

**目标**: 实现 macOS 和 Windows 的无障碍树读取

**新增文件**:
```
agent/src/desktop/ui_tree/mod.rs            — UITreeReader trait + UIElement 类型
agent/src/desktop/ui_tree/macos.rs          — macOS AXUIElement 实现
agent/src/desktop/ui_tree/windows.rs        — Windows UIAutomation 实现
agent/src/desktop/ui_tree/ref_manager.rs    — ref ID 分配 + 缓存（请求级生命周期）
```

**关键实现**:
1. `UITreeReader` trait:
   ```rust
   #[async_trait]
   pub trait UITreeReader: Send + Sync {
       async fn read_tree(&self, opts: UITreeOptions) -> Result<UITree>;
       async fn find_elements(&self, query: &str) -> Result<Vec<UIElement>>;
   }
   ```
2. macOS 实现: `AXUIElementCreateApplication` → 递归遍历 `kAXChildrenAttribute`
3. Windows 实现: `UIAutomation::new()` → `get_root_element()` → `TreeWalker` 遍历
4. ref_manager: 每次请求分配 `e1`, `e2`, `e3`...，缓存 bounds 供后续 click-by-ref
5. 权限检测: macOS `AXIsProcessTrusted()`, Windows 优雅降级

**平台条件编译**:
```rust
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub fn create_ui_tree_reader() -> Box<dyn UITreeReader> {
    #[cfg(target_os = "macos")]
    return Box::new(macos::MacOSUITreeReader::new());
    #[cfg(target_os = "windows")]
    return Box::new(windows::WindowsUITreeReader::new());
}
```

**验收标准**:
- macOS 上能读取前台窗口的 UI 元素列表
- 返回的 bounds 是逻辑坐标
- `click(ref: "e5")` 能正确点击对应元素中心
- 权限缺失时返回明确错误而非 panic

---

### Phase 4: 窗口管理

**目标**: 实现跨平台的窗口枚举、聚焦、应用管理

**新增文件**:
```
agent/src/desktop/window/mod.rs         — WindowManager trait
agent/src/desktop/window/macos.rs       — macOS 实现
agent/src/desktop/window/windows.rs     — Windows 实现
```

**关键实现**:
1. `WindowManager` trait:
   ```rust
   #[async_trait]
   pub trait WindowManager: Send + Sync {
       async fn list_windows(&self) -> Result<Vec<WindowInfo>>;
       async fn focus_window(&self, title: &str) -> Result<()>;
       async fn launch_app(&self, name: &str) -> Result<u32>; // pid
       async fn quit_app(&self, name: &str) -> Result<()>;
       async fn is_running(&self, name: &str) -> Result<bool>;
   }
   ```
2. macOS: `CGWindowListCopyWindowInfo` 枚举 + `osascript` 控制
3. Windows: `EnumWindows` + `SetForegroundWindow` + `ShellExecuteW`
4. 应用启动: macOS `open -a AppName` / Windows `cmd /c start AppName`

**验收标准**:
- 能列出所有窗口及其位置/大小
- 能按标题子串匹配聚焦窗口
- 能启动/退出应用

---

### Phase 5: Cron 调度器

**目标**: 实现完整的定时任务系统

**新增文件**:
```
agent/src/cron/mod.rs               — CronService 公共接口
agent/src/cron/service.rs           — 调度器核心逻辑
agent/src/cron/store.rs             — JSON 文件持久化
agent/src/cron/types.rs             — CronJob, CronSchedule, CronAction, JobResult
agent/src/cron/executor.rs          — 任务执行器（调用 desktop/command 等）
```

**关键实现**:
1. `CronService`:
   - `start()` — 加载 JSON 存储，清理 stale 状态，补执行错过的任务
   - `add(job)` / `update(id, job)` / `remove(id)` — CRUD
   - `run_now(id)` — 手动触发
   - `toggle(id)` — 启用/禁用
2. 调度引擎: tokio-cron-scheduler + 自行 JSON 持久化（不用内置持久化）
3. 容错: 连续失败指数退避，10 次后自动禁用 + 通知
4. 恢复: 重启后检查 missed window (5 分钟内补执行)
5. 执行器: 根据 CronAction 类型调用对应的 desktop 模块

**持久化路径**: `~/.config/0xmux/agent/cron-jobs.json`

**验收标准**:
- 能创建/查询/更新/删除定时任务
- Cron 表达式按预期触发
- 服务重启后任务不丢失
- 连续失败任务被自动禁用
- 执行结果通过通知系统推送

---

### Phase 6: REST API 集成

**目标**: 将 agent 功能暴露为 Axum REST API

**新增文件**:
```
server/src/handlers/agent.rs        — agent API handler 层
server/src/handlers/agent_cron.rs   — cron API handler 层
```

**修改文件**:
```
server/src/router.rs                — 注册 /api/agent/* 路由
server/src/state.rs                 — AppState 添加 AgentService
server/src/main.rs                  — feature 条件初始化
```

**路由注册** (feature-gated):
```rust
#[cfg(feature = "agent")]
fn agent_routes() -> Router<AppState> {
    Router::new()
        // Desktop
        .route("/api/agent/desktop/screenshot", post(screenshot))
        .route("/api/agent/desktop/displays", get(displays))
        .route("/api/agent/desktop/click", post(click))
        .route("/api/agent/desktop/type", post(type_text))
        .route("/api/agent/desktop/key", post(press_key))
        .route("/api/agent/desktop/drag", post(drag))
        .route("/api/agent/desktop/ui-tree", get(ui_tree))
        .route("/api/agent/desktop/ui-find", get(ui_find))
        .route("/api/agent/desktop/windows", get(list_windows))
        .route("/api/agent/desktop/window/focus", post(focus_window))
        .route("/api/agent/desktop/launch", post(launch_app))
        .route("/api/agent/desktop/quit", post(quit_app))
        .route("/api/agent/desktop/app-status", get(app_status))
        .route("/api/agent/desktop/run", post(run_command))
        // Cron
        .route("/api/agent/cron", get(list_jobs).post(create_job))
        .route("/api/agent/cron/:id", get(get_job).put(update_job).delete(delete_job))
        .route("/api/agent/cron/:id/run", post(run_now))
        .route("/api/agent/cron/:id/toggle", post(toggle_job))
}
```

**验收标准**:
- 所有 agent API 可通过 curl 调用
- 认证中间件保护所有端点
- 不带 `agent` feature 编译时无任何 agent 代码

---

### Phase 7: 浏览器自动化 (可选)

**目标**: 通过 Playwright 子进程实现浏览器控制

**新增文件**:
```
agent/src/browser/mod.rs            — BrowserService 公共接口
agent/src/browser/playwright.rs     — Playwright 子进程管理
agent/src/browser/types.rs          — BrowserSession, PageSnapshot, PageElement
```

**修改文件**:
```
server/src/handlers/agent.rs        — 添加 browser API handlers
server/src/router.rs                — 注册 /api/agent/browser/* 路由
```

**关键实现**:
1. Playwright 子进程: `tokio::process::Command::new("npx")` + stdio JSON-RPC
2. 页面快照: ARIA accessibility tree → PageElement 列表 (ref_id 前缀 "r")
3. 元素交互: click/type/hover by ref
4. 标签页管理: list/new/close/select
5. 进程隔离: Playwright 崩溃不影响主进程，自动重启 + 退避

**验收标准**:
- 能导航到 URL 并获取页面快照
- 能通过 ref ID 点击/输入页面元素
- Playwright 崩溃后自动恢复

---

## 依赖安装

### agent crate (agent/)

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
enigo = { version = "0.6", features = ["serde"] }
xcap = "0.8"
tokio-cron-scheduler = "0.15"
chrono = { version = "0.4", features = ["serde"] }
async-trait = "0.1"
tracing = "0.1"
uuid = { version = "1", features = ["v4"] }
thiserror = "2"

[target.'cfg(target_os = "macos")'.dependencies]
accessibility-sys = "0.1"
core-graphics = "0.24"
core-foundation = "0.10"

[target.'cfg(target_os = "windows")'.dependencies]
uiautomation = "0.24"
windows = { version = "0.58", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_HiDpi",
    "Win32_System_Threading",
    "Win32_Graphics_Gdi",
] }
```

### server (server/)

```toml
[dependencies]
oxmux-agent = { path = "../agent", optional = true }

[features]
default = []
agent = ["dep:oxmux-agent"]
```

---

## 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| accessibility-sys FFI 不安全 | 自行封装 Safe Rust 层，充分测试 |
| macOS 权限未授予 | 启动时检测 AXIsProcessTrusted()，返回明确错误 |
| xcap 0.8 文档不全 | 研究发现 API 稳定，参考 0.4 文档 + 源码 |
| enigo 版本号 | spec 写 0.3 但实际用 0.6（0.3 已过时），研究已确认 |
| Playwright 子进程崩溃 | 隔离进程 + 自动重启 + 退避策略 |
| 大 UI 树内存 | 深度限制 + 元素数上限(1000) |
| HiDPI 动态变化 | 每次操作前重新查询 scale_factor |

---

## 里程碑

| Phase | 预期产出 | 依赖 |
|-------|----------|------|
| Phase 1 | crate 骨架 + 截图 + 坐标映射 | 无 |
| Phase 2 | 键鼠模拟 + 命令执行 | Phase 1 |
| Phase 3 | UI 树读取 (跨平台) | Phase 1 |
| Phase 4 | 窗口管理 (跨平台) | Phase 1 |
| Phase 5 | Cron 调度器 | Phase 1, 2 |
| Phase 6 | REST API 集成 | Phase 1-5 |
| Phase 7 | 浏览器自动化 (可选) | Phase 6 |

**并行建议**: Phase 2, 3, 4 可以并行开发（都只依赖 Phase 1 的 crate 骨架）。Phase 5 依赖 Phase 2 的命令执行模块。
