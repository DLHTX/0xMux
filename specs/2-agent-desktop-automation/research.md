# Technical Research: AI Agent Desktop Automation (oxmux-agent)

**Feature ID**: 2-agent-desktop-automation
**Date**: 2026-02-15

---

## 1. enigo crate -- 跨平台键盘/鼠标模拟

### 决策

使用 `enigo 0.5+`（当前最新 0.6.1）作为键盘鼠标模拟库。注意：spec 中写的 0.3 版本已过时，应使用最新稳定版。

### 基本原理

- 唯一成熟的跨平台纯 Rust 输入模拟库，月下载 35k+
- 同时支持 macOS、Windows、Linux (X11)，Wayland 支持进行中
- 实现了 `Mouse` 和 `Keyboard` trait，API 设计清晰
- 支持 `serde` feature 使命令可序列化，适合 REST API 场景

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| simulate_key | 仅封装 enigo，没有直接用 enigo 灵活 |
| autopilot-rs | 已不维护，最后更新 2021 |
| 直接调用系统 API (CGEvent / SendInput) | 平台隔离代码量大，重复造轮子 |

### API 表面

#### Mouse trait

```rust
// 移动鼠标到指定位置
fn move_mouse(&mut self, x: i32, y: i32, coordinate: Coordinate) -> InputResult<()>;

// 鼠标按键操作 (按下/释放/点击)
fn button(&mut self, button: Button, direction: Direction) -> InputResult<()>;

// 滚轮滚动
fn scroll(&mut self, length: i32, axis: Axis) -> InputResult<()>;

// 获取当前鼠标位置
fn location(&self) -> InputResult<(i32, i32)>;

// 获取主显示器尺寸
fn main_display(&self) -> InputResult<(i32, i32)>;
```

#### Keyboard trait

```rust
// 按键操作 (按下/释放/点击)
fn key(&mut self, key: Key, direction: Direction) -> InputResult<()>;

// 直接输入文本（支持完整 Unicode）
fn text(&mut self, text: &str) -> InputResult<()>;

// 发送原始键码（布局无关）
fn raw(&mut self, keycode: u16, direction: Direction) -> InputResult<()>;
```

#### 关键枚举

```rust
enum Coordinate {
    Abs,  // 绝对坐标，原点在屏幕左上角
    Rel,  // 相对坐标，相对于当前鼠标位置
}

enum Button { Left, Right, Middle, ScrollUp, ScrollDown, ScrollLeft, ScrollRight }
enum Direction { Press, Release, Click }
enum Axis { Horizontal, Vertical }
enum Key { Unicode(char), Alt, Control, Meta, Shift, Return, Tab, Space, ... }
```

### 坐标系统

**关键发现**: enigo 使用笛卡尔坐标系，原点在屏幕左上角，正方向向右向下。

**HiDPI 行为**: enigo 文档未明确区分逻辑/物理像素。但在 macOS 上，底层 CGEvent API 使用**逻辑坐标（points）**。在 Windows 上，SendInput 使用的坐标取决于 DPI 感知设置。enigo 不做 DPI 转换 -- 传入什么坐标就发送什么坐标。

**结论**: enigo 在 macOS 上使用逻辑坐标，在 Windows 上取决于进程 DPI 感知模式。我们需要在 `oxmux-agent` 层确保统一使用逻辑坐标。

### Settings 配置

```rust
let settings = Settings {
    // macOS: 是否弹出权限请求对话框
    open_prompt_to_get_permissions: true,
    // macOS: 模拟输入是否独立于物理键盘状态
    independent_of_keyboard_state: true,
    // Windows: 额外信息字段，可区分 enigo 产生的事件
    windows_dw_extra_info: None,
    // 通用: Drop 时是否释放所有按住的键
    release_keys_when_dropped: true,
    ..Default::default()
};
let mut enigo = Enigo::new(&settings).unwrap();
```

### 平台限制

| 平台 | 限制 |
|------|------|
| macOS | 需要「辅助功能」权限，首次使用弹出系统授权对话框 |
| Windows | 无法对 UAC 提升窗口发送输入（除非自身也以管理员运行） |
| Linux | 仅支持 X11，Wayland 支持有 bug（需 libei） |

### 关键代码模式

```rust
use enigo::{Enigo, Keyboard, Mouse, Settings, Coordinate, Button, Direction, Key};

let mut enigo = Enigo::new(&Settings::default()).unwrap();

// 鼠标点击 (逻辑坐标)
enigo.move_mouse(500, 300, Coordinate::Abs).unwrap();
enigo.button(Button::Left, Direction::Click).unwrap();

// 双击
enigo.button(Button::Left, Direction::Click).unwrap();
enigo.button(Button::Left, Direction::Click).unwrap();

// 拖拽
enigo.move_mouse(100, 100, Coordinate::Abs).unwrap();
enigo.button(Button::Left, Direction::Press).unwrap();
enigo.move_mouse(300, 300, Coordinate::Abs).unwrap();
enigo.button(Button::Left, Direction::Release).unwrap();

// 输入文本
enigo.text("Hello, World!").unwrap();

// 组合键 Cmd+C (macOS) / Ctrl+C (Windows)
#[cfg(target_os = "macos")]
enigo.key(Key::Meta, Direction::Press).unwrap();
#[cfg(target_os = "windows")]
enigo.key(Key::Control, Direction::Press).unwrap();
enigo.key(Key::Unicode('c'), Direction::Click).unwrap();
#[cfg(target_os = "macos")]
enigo.key(Key::Meta, Direction::Release).unwrap();
#[cfg(target_os = "windows")]
enigo.key(Key::Control, Direction::Release).unwrap();
```

### serde Feature

启用 `serde` feature 后，`Key`、`Button`、`Direction`、`Coordinate` 等枚举均可序列化/反序列化，适合 JSON API 传输：

```toml
[dependencies]
enigo = { version = "0.6", features = ["serde"] }
```

```rust
// 可序列化为 JSON
#[derive(Serialize, Deserialize)]
struct ClickCommand {
    x: i32,
    y: i32,
    button: Button,
    coordinate: Coordinate,
}
```

---

## 2. xcap crate -- 截图捕获

### 决策

使用 `xcap 0.8`（当前 0.8.2）作为截图库。

### 基本原理

- 跨平台支持最好的 Rust 截图库（macOS、Windows、Linux X11）
- 提供 `Monitor` 和 `Window` 两个核心抽象
- 返回标准 `image::RgbaImage`，方便 PNG/JPEG 编码
- 提供 `scale_factor()` API，是 HiDPI 元数据的关键来源

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| screenshots crate | 类似功能但维护不如 xcap 活跃 |
| scap (CapSoftware) | 偏向视频录制，截图 API 不完善 |
| 直接调用 CGDisplayCreateImage / BitBlt | 平台隔离代码量大 |

### API 表面

#### Monitor

```rust
impl Monitor {
    // 枚举所有显示器
    pub fn all() -> XCapResult<Vec<Monitor>>;

    // 属性访问
    pub fn id(&self) -> u32;
    pub fn name(&self) -> String;
    pub fn x(&self) -> i32;           // 显示器位置 (逻辑坐标)
    pub fn y(&self) -> i32;
    pub fn width(&self) -> u32;       // 显示器宽度 (逻辑像素)
    pub fn height(&self) -> u32;      // 显示器高度 (逻辑像素)
    pub fn is_primary(&self) -> bool;
    pub fn scale_factor(&self) -> f32; // HiDPI 缩放因子 (1.0, 2.0 等)

    // 截图
    pub fn capture_image(&self) -> XCapResult<RgbaImage>;
    pub fn capture_region(&self, x: u32, y: u32, w: u32, h: u32) -> XCapResult<RgbaImage>;
}
```

#### Window

```rust
impl Window {
    // 枚举所有窗口
    pub fn all() -> XCapResult<Vec<Window>>;

    // 属性访问
    pub fn id(&self) -> u32;
    pub fn title(&self) -> String;
    pub fn app_name(&self) -> String;
    pub fn x(&self) -> i32;
    pub fn y(&self) -> i32;
    pub fn width(&self) -> u32;
    pub fn height(&self) -> u32;
    pub fn is_minimized(&self) -> bool;
    pub fn is_maximized(&self) -> bool;

    // 截图
    pub fn capture_image(&self) -> XCapResult<RgbaImage>;
}
```

### 坐标系统与 HiDPI

**关键发现**:
- `Monitor::width()` / `height()` 返回**逻辑像素**尺寸
- `capture_image()` 返回的 `RgbaImage` 尺寸是**物理像素**
- `scale_factor()` 是两者之间的转换系数

**示例**: Retina MacBook Pro
- `width() = 1440`, `height() = 900` (逻辑)
- `capture_image().dimensions() = (2880, 1800)` (物理)
- `scale_factor() = 2.0`

**关系**: `物理宽度 = 逻辑宽度 * scale_factor`

这是 oxmux-agent HiDPI 元数据的**核心数据来源**。

### 性能特征

| 操作 | 典型耗时 |
|------|----------|
| 全屏截图 (1440p) | 30-80ms |
| 全屏截图 (4K) | 50-150ms |
| 窗口截图 | 20-60ms |
| PNG 编码 | 50-200ms (取决于尺寸) |
| JPEG 编码 | 10-50ms |

**优化建议**: 返回 JPEG 作为默认格式（质量 80），PNG 作为可选高质量格式。

### 关键代码模式

```rust
use xcap::Monitor;

// 获取所有显示器并截图
let monitors = Monitor::all().unwrap();
for monitor in &monitors {
    let scale = monitor.scale_factor();
    let logical_w = monitor.width();
    let logical_h = monitor.height();
    let image = monitor.capture_image().unwrap();
    let physical_w = image.width();
    let physical_h = image.height();

    // 构建 AnnotatedScreenshot 元数据
    let metadata = ScreenshotMeta {
        physical_width: physical_w,
        physical_height: physical_h,
        logical_width: logical_w,
        logical_height: logical_h,
        scale_factor: scale,
        monitor_id: monitor.id(),
        monitor_name: monitor.name(),
    };
}

// 区域截图
let region_img = monitors[0].capture_region(100, 100, 400, 300).unwrap();

// 窗口截图
use xcap::Window;
let windows = Window::all().unwrap();
for win in windows {
    if win.title().contains("Firefox") && !win.is_minimized() {
        let img = win.capture_image().unwrap();
        // ...
    }
}
```

---

## 3. accessibility crate (macOS) -- AXUIElement 绑定

### 决策

使用 `accessibility` + `accessibility-sys` crate 作为 macOS 辅助功能 API 的绑定。辅以 `core-foundation` crate 处理 CF 类型。

### 基本原理

- 提供了 macOS AXUIElement C API 的完整 FFI 绑定
- `accessibility-sys` 是低级绑定，`accessibility` 是高级安全封装（部分完成）
- 社区中唯一专注于 macOS 辅助功能的 Rust crate
- 81 stars，持续维护

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| macos-accessibility-client | 仅 50% 文档覆盖，API 更有限 |
| objc2-accessibility | Apple 框架绑定，过于底层 |
| 直接 FFI 调用 | 完全控制但工作量大 |

### macOS AXUIElement API 核心概念

macOS 辅助功能 API 基于 `AXUIElement` 对象，每个 UI 元素都是一个 `AXUIElement`，通过属性名获取属性值。

#### 核心函数 (accessibility-sys)

```rust
// 为指定进程创建 AXUIElement
extern "C" fn AXUIElementCreateApplication(pid: pid_t) -> AXUIElementRef;

// 创建系统级 AXUIElement（全局操作）
extern "C" fn AXUIElementCreateSystemWide() -> AXUIElementRef;

// 获取元素的某个属性值
extern "C" fn AXUIElementCopyAttributeValue(
    element: AXUIElementRef,
    attribute: CFStringRef,
    value: *mut CFTypeRef
) -> AXError;

// 获取元素所有属性名
extern "C" fn AXUIElementCopyAttributeNames(
    element: AXUIElementRef,
    names: *mut CFArrayRef
) -> AXError;

// 检查当前进程是否有辅助功能权限
extern "C" fn AXIsProcessTrusted() -> bool;

// 带选项检查（可弹出授权对话框）
extern "C" fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
```

### 关键属性名

| 属性常量 | 类型 | 描述 |
|----------|------|------|
| kAXRoleAttribute | CFString | 元素角色 (AXButton, AXTextField, ...) |
| kAXTitleAttribute | CFString | 标题/标签 |
| kAXValueAttribute | CFType | 当前值 |
| kAXDescriptionAttribute | CFString | 描述文本 |
| kAXChildrenAttribute | CFArray | 子元素列表 |
| kAXParentAttribute | AXUIElementRef | 父元素 |
| kAXPositionAttribute | AXValue (CGPoint) | 位置（逻辑坐标） |
| kAXSizeAttribute | AXValue (CGSize) | 尺寸（逻辑坐标） |
| kAXEnabledAttribute | CFBoolean | 是否启用 |
| kAXFocusedAttribute | CFBoolean | 是否聚焦 |
| kAXWindowAttribute | AXUIElementRef | 所属窗口 |
| kAXSubroleAttribute | CFString | 子角色 |

### 树遍历模式

```rust
use accessibility_sys::*;
use core_foundation::base::*;
use core_foundation::string::*;
use core_foundation::array::*;

unsafe fn enumerate_ui_tree(
    element: AXUIElementRef,
    depth: usize,
    max_depth: usize,
    results: &mut Vec<UIElement>,
    ref_counter: &mut u32,
) {
    if depth >= max_depth { return; }

    // 获取角色
    let role = get_string_attr(element, kAXRoleAttribute);
    // 获取名称
    let name = get_string_attr(element, kAXTitleAttribute);
    // 获取值
    let value = get_string_attr(element, kAXValueAttribute);
    // 获取边界矩形 (逻辑坐标)
    let bounds = get_bounds(element); // -> Option<(f64, f64, f64, f64)>

    *ref_counter += 1;
    results.push(UIElement {
        ref_id: format!("e{}", ref_counter),
        role,
        name,
        value,
        bounds,
        depth,
    });

    // 获取子元素
    let mut children_ref: CFTypeRef = std::ptr::null();
    let children_attr = CFString::new("AXChildren");
    let err = AXUIElementCopyAttributeValue(
        element,
        children_attr.as_concrete_TypeRef(),
        &mut children_ref,
    );

    if err == kAXErrorSuccess && !children_ref.is_null() {
        let children = CFArray::wrap_under_get_rule(children_ref as CFArrayRef);
        for i in 0..children.len() {
            let child = children.get(i).unwrap() as AXUIElementRef;
            enumerate_ui_tree(child, depth + 1, max_depth, results, ref_counter);
        }
    }
}
```

### 权限处理

```rust
use accessibility_sys::*;
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::CFString;
use core_foundation::boolean::CFBoolean;

fn check_accessibility_permission() -> bool {
    unsafe { AXIsProcessTrusted() }
}

fn request_accessibility_permission() -> bool {
    unsafe {
        let key = CFString::new("AXTrustedCheckOptionPrompt");
        let value = CFBoolean::true_value();
        let options = CFDictionary::from_CFType_pairs(&[(key, value)]);
        AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef())
    }
}
```

### 深度控制

UI 树可能非常深（某些应用有 10+ 层嵌套），元素数量可达数千。必须实现：

- **max_depth**: 默认 10，防止无限递归
- **max_elements**: 默认 1000，防止内存爆炸
- **interactive_only 过滤**: 仅返回 AXButton, AXTextField, AXCheckBox, AXComboBox, AXSlider 等可交互元素

### 坐标系统

AXUIElement 的 `kAXPositionAttribute` 和 `kAXSizeAttribute` 返回的是**逻辑坐标（points）**，与 enigo 和 xcap 的 `width()/height()` 一致。这意味着：

- 从 UI 树获取元素中心坐标
- 直接传给 enigo 的 `move_mouse(x, y, Coordinate::Abs)`
- 无需任何 DPI 转换

这是 spec 中 "UI tree first" 策略的核心优势。

---

## 4. uiautomation 0.24 crate (Windows) -- UIAutomation 绑定

### 决策

使用 `uiautomation 0.24` 作为 Windows UI 自动化绑定。

### 基本原理

- Windows UIAutomation API 的高质量 Rust 封装
- 185k+ 下载量，持续维护
- 提供流畅的 Matcher API 进行元素搜索
- 包含 TreeWalker 进行树遍历
- 内置键盘模拟支持

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| windows-rs 直接调用 IUIAutomation | 过于底层，大量 COM 样板代码 |
| winapi-ui-automation | 不如 uiautomation 完善 |
| 自行实现 COM 绑定 | 工作量巨大 |

### 核心 API

#### UIAutomation -- 入口点

```rust
use uiautomation::UIAutomation;

let automation = UIAutomation::new().unwrap();

// 获取根元素（桌面）
let root = automation.get_root_element().unwrap();

// 获取聚焦元素
let focused = automation.get_focused_element().unwrap();
```

#### UIElement -- 元素操作

```rust
use uiautomation::UIElement;

// 属性访问
let name: String = element.get_name().unwrap();
let classname: String = element.get_classname().unwrap();
let control_type: ControlType = element.get_control_type().unwrap();
let rect: Rect = element.get_bounding_rectangle().unwrap();
let is_enabled: bool = element.get_is_enabled().unwrap();

// 通过 UIProperty 枚举获取任意属性
let value = element.get_property_value(UIProperty::Name).unwrap();
```

#### UIMatcher -- 条件搜索

```rust
use uiautomation::UIAutomation;

let automation = UIAutomation::new().unwrap();
let root = automation.get_root_element().unwrap();

// 流畅 API 查找元素
let notepad = automation.create_matcher()
    .from(root)
    .timeout(10_000)  // 10秒超时
    .classname("Notepad")
    .find_first()
    .unwrap();

// 按名称查找
let button = automation.create_matcher()
    .from(notepad)
    .name("Save")
    .control_type(ControlType::Button)
    .find_first()
    .unwrap();
```

#### UITreeWalker -- 树遍历

```rust
let walker = automation.get_control_view_walker().unwrap();

fn walk_tree(walker: &UITreeWalker, element: &UIElement, depth: usize, max_depth: usize) {
    if depth >= max_depth { return; }

    // 处理当前元素
    let name = element.get_name().unwrap_or_default();
    let control_type = element.get_control_type().unwrap();
    let rect = element.get_bounding_rectangle().unwrap();

    // 遍历子元素
    if let Ok(child) = walker.get_first_child(element) {
        walk_tree(walker, &child, depth + 1, max_depth);
        let mut sibling = child;
        while let Ok(next) = walker.get_next_sibling(&sibling) {
            walk_tree(walker, &next, depth + 1, max_depth);
            sibling = next;
        }
    }
}
```

#### 窗口管理

```rust
// 元素转换为窗口控件
let window: WindowControl = element.try_into().unwrap();
window.maximize().unwrap();
window.minimize().unwrap();
window.restore().unwrap();
window.close().unwrap();

// 键盘输入
element.send_keys("Hello{enter}", 10).unwrap(); // 10ms 间隔
// 特殊键: {Win}, {enter}, {tab}, {ctrl}, {shift}, {alt}
```

### 坐标系统

`get_bounding_rectangle()` 返回的 `Rect` 是**逻辑坐标**（受 Windows DPI 缩放影响的虚拟坐标），与 enigo 在 DPI-aware 模式下的坐标一致。

### 关键代码模式（oxmux-agent 集成）

```rust
#[cfg(target_os = "windows")]
mod windows_ui_tree {
    use uiautomation::{UIAutomation, UIElement, UITreeWalker};

    pub fn read_ui_tree(app_name: Option<&str>, max_depth: usize) -> Vec<UIElementInfo> {
        let automation = UIAutomation::new().unwrap();
        let root = match app_name {
            Some(name) => {
                automation.create_matcher()
                    .name_contains(name)
                    .find_first()
                    .unwrap()
            }
            None => automation.get_focused_element().unwrap(),
        };

        let walker = automation.get_control_view_walker().unwrap();
        let mut results = Vec::new();
        collect_elements(&walker, &root, 0, max_depth, &mut results);
        results
    }
}
```

---

## 5. tokio-cron-scheduler 0.15 -- 异步 Cron 调度

### 决策

使用 `tokio-cron-scheduler 0.15`（当前 0.15.1）作为异步任务调度器。

### 基本原理

- 原生 tokio 集成，无需额外运行时
- 支持三种任务类型：cron 表达式、一次性、固定间隔
- 提供任务生命周期回调（on_start, on_done, on_removed）
- 支持持久化（PostgreSQL、NATS）和内存存储
- 支持时区感知调度

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| tokio-cron | 功能更简单，不支持一次性任务 |
| cron (crate) | 仅解析 cron 表达式，无调度器 |
| scheduler | 功能类似但生态不如 tokio-cron-scheduler |
| tokio-task-scheduler | 较新，文档不足 |
| 自行实现 (tokio::time::interval) | 仅适合简单场景，cron 表达式解析需额外库 |

### 任务类型

```rust
use tokio_cron_scheduler::{Job, JobScheduler, JobSchedulerError};

// 1. Cron 表达式任务 (每5分钟执行)
let cron_job = Job::new_async("0 */5 * * * *", |uuid, mut lock| Box::pin(async move {
    println!("Cron job {} fired", uuid);
})).unwrap();

// 2. 一次性任务 (30秒后执行)
let one_shot = Job::new_one_shot_async(
    Duration::from_secs(30),
    |uuid, mut lock| Box::pin(async move {
        println!("One-shot job {} fired", uuid);
    })
).unwrap();

// 3. 固定间隔任务 (每10秒)
let repeated = Job::new_repeated_async(
    Duration::from_secs(10),
    |uuid, mut lock| Box::pin(async move {
        println!("Repeated job {} fired", uuid);
    })
).unwrap();

// 4. 时区感知 Cron 任务
use chrono_tz::Asia::Shanghai;
let tz_job = Job::new_async_tz("0 30 9 * * *", Shanghai, |uuid, mut lock| Box::pin(async move {
    println!("9:30 AM Shanghai time");
})).unwrap();
```

### 调度器生命周期

```rust
// 创建调度器
let sched = JobScheduler::new().await.unwrap();

// 添加任务，返回 UUID
let job_id = sched.add(cron_job).await.unwrap();

// 启动调度器
sched.start().await.unwrap();

// 手动触发任务
sched.run_job(&job_id).await.unwrap(); // 不等待完成
sched.run_job_and_wait(&job_id).await.unwrap(); // 等待完成

// 移除任务
sched.remove(&job_id).await.unwrap();

// 停止调度器
sched.shutdown().await.unwrap();
```

### 任务生命周期回调

```rust
let mut job = Job::new_async("0 */5 * * * *", |uuid, lock| Box::pin(async move {
    // 任务逻辑
})).unwrap();

// 任务开始执行时
job.on_start_notification_add(&sched, Box::new(|job_id, notification_id, type_of_notification| {
    Box::pin(async move {
        println!("Job {} started", job_id);
    })
})).await.unwrap();

// 任务执行完成时
job.on_done_notification_add(&sched, Box::new(|job_id, notification_id, type_of_notification| {
    Box::pin(async move {
        println!("Job {} done", job_id);
    })
})).await.unwrap();

// 任务被移除时
job.on_removed_notification_add(&sched, Box::new(|job_id, notification_id, type_of_notification| {
    Box::pin(async move {
        println!("Job {} removed", job_id);
    })
})).await.unwrap();
```

### 持久化方案

spec 要求 JSON 文件持久化，但 tokio-cron-scheduler 内置的持久化仅支持 PostgreSQL 和 NATS。

**推荐方案**: 不使用内置持久化，在 oxmux-agent 层自行实现 JSON 文件持久化：

```rust
// 自定义持久化层
struct CronStore {
    path: PathBuf,  // ~/.config/0xMux/cron-jobs.json
    jobs: HashMap<Uuid, CronJobConfig>,
}

impl CronStore {
    // 启动时加载所有任务
    async fn load_and_register(&self, scheduler: &JobScheduler) -> Result<()> {
        let data = tokio::fs::read_to_string(&self.path).await?;
        let configs: Vec<CronJobConfig> = serde_json::from_str(&data)?;
        for config in configs {
            let job = config.to_scheduler_job()?;
            scheduler.add(job).await?;
        }
        Ok(())
    }

    // 任务变更时保存
    async fn save(&self) -> Result<()> {
        let json = serde_json::to_string_pretty(&self.jobs)?;
        tokio::fs::write(&self.path, json).await?;
        Ok(())
    }
}
```

### 错误处理

```rust
enum JobSchedulerError {
    CantAdd,
    CantRemove,
    CantStart,
    CantStop,
    CantFindJob,
    // ...
}
```

任务闭包内的 panic 不会导致调度器崩溃（tokio::spawn 隔离）。

### 与 tokio 运行时集成

调度器完全基于 tokio，使用 `tokio::spawn` 执行任务。与 oxmux-server 的现有 tokio 运行时完美共存，无需额外线程池。

---

## 6. Playwright 子进程管理

### 决策

通过 `@playwright/mcp` 包以子进程形式管理 Playwright，使用 stdio 模式的 JSON-RPC 协议通信。

### 基本原理

- 官方 Playwright MCP 服务器提供 70+ 浏览器自动化工具
- stdio 模式无需网络端口，通过 stdin/stdout JSON-RPC 通信
- 进程隔离：Playwright 崩溃不影响主服务器
- 使用 accessibility snapshot 而非 screenshot，天然解决 HiDPI 坐标问题

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| chromiumoxide (Rust CDP) | 纯 Rust，但功能远不如 Playwright 完善 |
| headless-chrome | 仅 Chrome，不支持 Firefox/WebKit |
| fantoccini (WebDriver) | WebDriver 协议较慢，功能有限 |
| 直接 CDP WebSocket | 需自行管理浏览器生命周期 |
| Playwright HTTP/SSE 模式 | 需要额外端口管理 |

### 通信架构

```
oxmux-server (Rust)
    |
    |-- tokio::process::Command::new("npx")
    |       .args(["@playwright/mcp@latest"])
    |       .stdin(Stdio::piped())
    |       .stdout(Stdio::piped())
    |       .stderr(Stdio::piped())
    |       .spawn()
    |
    v
Playwright MCP Server (Node.js)
    |
    |-- stdin: JSON-RPC requests from Rust
    |-- stdout: JSON-RPC responses to Rust
    |-- stderr: logs (redirect to file)
    |
    v
Chromium Browser Instance
```

### JSON-RPC 通信协议

Playwright MCP 使用 Model Context Protocol (MCP) 规范，基于 JSON-RPC 2.0：

```json
// Request (Rust -> Playwright)
{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "browser_navigate",
        "arguments": {
            "url": "https://example.com"
        }
    }
}

// Response (Playwright -> Rust)
{
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
        "content": [
            {
                "type": "text",
                "text": "Navigated to https://example.com"
            }
        ]
    }
}
```

### 可用工具（核心）

| 工具 | 描述 |
|------|------|
| browser_navigate | 导航到 URL |
| browser_snapshot | 获取 ARIA 辅助功能快照 |
| browser_click | 通过 ref ID 点击元素 |
| browser_type | 在元素中输入文本 |
| browser_press_key | 按键 |
| browser_hover | 悬停 |
| browser_drag | 拖拽 |
| browser_select_option | 下拉选择 |
| browser_fill_form | 填充表单 |
| browser_take_screenshot | 截图 |
| browser_evaluate | 执行 JavaScript |
| browser_tabs | Tab 管理 |
| browser_wait_for | 等待条件 |

### 浏览器生命周期管理

```rust
use tokio::process::{Command, Child};
use tokio::io::{AsyncWriteExt, AsyncBufReadExt, BufReader};

struct PlaywrightManager {
    child: Option<Child>,
    stdin: Option<tokio::process::ChildStdin>,
    stdout_reader: Option<BufReader<tokio::process::ChildStdout>>,
    request_id: AtomicU64,
}

impl PlaywrightManager {
    async fn start(&mut self) -> Result<()> {
        let mut child = Command::new("npx")
            .args(["@playwright/mcp@latest"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)  // 关键：Rust 进程退出时杀死 Playwright
            .spawn()?;

        self.stdin = child.stdin.take();
        self.stdout_reader = child.stdout.take().map(BufReader::new);
        self.child = Some(child);
        Ok(())
    }

    async fn send_request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        let stdin = self.stdin.as_mut().unwrap();
        let msg = serde_json::to_string(&request)?;
        stdin.write_all(msg.as_bytes()).await?;
        stdin.write_all(b"\n").await?;
        stdin.flush().await?;

        // 读取响应
        let reader = self.stdout_reader.as_mut().unwrap();
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        let response: Value = serde_json::from_str(&line)?;
        Ok(response)
    }

    async fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            child.kill().await?;
        }
        Ok(())
    }
}
```

### 配置选项

```bash
# 基本启动
npx @playwright/mcp@latest

# 指定浏览器
npx @playwright/mcp@latest --browser firefox

# 无头模式
npx @playwright/mcp@latest --headless

# 隔离模式（不保存状态）
npx @playwright/mcp@latest --isolated

# 启用视觉模式（坐标点击）
npx @playwright/mcp@latest --caps core,vision

# HTTP/SSE 模式（备选）
npx @playwright/mcp@latest --port 3100
```

### 故障恢复

```rust
impl PlaywrightManager {
    async fn ensure_running(&mut self) -> Result<()> {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    // 进程已退出，重启
                    self.start().await?;
                }
                Ok(None) => { /* 正在运行 */ }
                Err(_) => {
                    self.start().await?;
                }
            }
        } else {
            self.start().await?;
        }
        Ok(())
    }
}
```

---

## 7. 跨平台窗口管理

### 决策

使用平台原生 API + `#[cfg(target_os)]` 条件编译，macOS 用 `core-graphics` + `open -a`，Windows 用 `windows-rs` + `cmd /c start`。

### 基本原理

- 窗口管理是高度平台特定的操作，没有合适的跨平台抽象
- 直接调用系统 API 提供最大控制力和最小延迟
- xcap 已提供窗口枚举，窗口管理只需补充焦点/启动/关闭操作

### 替代方案

| 方案 | 优缺点 |
|------|--------|
| active-win-pos-rs | 仅获取活动窗口信息，功能有限 |
| winit | 用于创建窗口，不适合管理其他应用窗口 |
| app_window | 跨平台但 API 过于简化 |

### macOS 实现

#### 窗口枚举 (CGWindowListCopyWindowInfo)

```rust
#[cfg(target_os = "macos")]
mod macos_windows {
    use core_graphics::display::*;
    use core_foundation::array::*;
    use core_foundation::dictionary::*;
    use core_foundation::string::*;
    use core_foundation::number::*;

    pub fn list_windows() -> Vec<WindowInfo> {
        unsafe {
            let window_list = CGWindowListCopyWindowInfo(
                kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
                kCGNullWindowID,
            );

            let count = CFArrayGetCount(window_list);
            let mut windows = Vec::new();

            for i in 0..count {
                let dict = CFArrayGetValueAtIndex(window_list, i) as CFDictionaryRef;

                // 提取窗口属性
                let title = get_dict_string(dict, "kCGWindowName");
                let owner = get_dict_string(dict, "kCGWindowOwnerName");
                let window_id = get_dict_number(dict, "kCGWindowNumber");
                let pid = get_dict_number(dict, "kCGWindowOwnerPID");

                // 提取边界矩形 (逻辑坐标)
                let bounds_dict = get_dict_value(dict, "kCGWindowBounds");
                let (x, y, w, h) = parse_bounds(bounds_dict);

                windows.push(WindowInfo {
                    id: window_id as u32,
                    title,
                    app_name: owner,
                    pid: pid as u32,
                    x, y,
                    width: w as u32,
                    height: h as u32,
                });
            }

            CFRelease(window_list as _);
            windows
        }
    }
}
```

#### 应用启动与管理

```rust
#[cfg(target_os = "macos")]
mod macos_app {
    use std::process::Command;

    /// 启动应用 (macOS)
    pub fn launch_app(app_name: &str) -> Result<()> {
        Command::new("open")
            .arg("-a")
            .arg(app_name)
            .spawn()?;
        Ok(())
    }

    /// 关闭应用 (macOS - 优雅退出)
    pub fn quit_app(app_name: &str) -> Result<()> {
        Command::new("osascript")
            .args(["-e", &format!("tell application \"{}\" to quit", app_name)])
            .output()?;
        Ok(())
    }

    /// 聚焦窗口 (macOS)
    pub fn focus_app(app_name: &str) -> Result<()> {
        Command::new("osascript")
            .args(["-e", &format!(
                "tell application \"{}\" to activate", app_name
            )])
            .output()?;
        Ok(())
    }

    /// 检查应用是否运行
    pub fn is_running(app_name: &str) -> bool {
        let output = Command::new("pgrep")
            .args(["-f", app_name])
            .output();
        output.map(|o| o.status.success()).unwrap_or(false)
    }
}
```

### Windows 实现

#### 窗口枚举 (EnumWindows)

```rust
#[cfg(target_os = "windows")]
mod windows_windows {
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::Foundation::*;
    use windows::core::*;

    pub fn list_windows() -> Vec<WindowInfo> {
        let mut windows = Vec::new();

        unsafe {
            EnumWindows(
                Some(enum_window_proc),
                LPARAM(&mut windows as *mut Vec<WindowInfo> as isize),
            ).unwrap();
        }

        windows
    }

    unsafe extern "system" fn enum_window_proc(
        hwnd: HWND,
        lparam: LPARAM,
    ) -> BOOL {
        let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);

        // 跳过不可见窗口
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        // 获取窗口标题
        let mut title = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut title);
        if len == 0 { return BOOL(1); }
        let title = String::from_utf16_lossy(&title[..len as usize]);

        // 获取窗口位置和大小
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).unwrap();

        windows.push(WindowInfo {
            id: hwnd.0 as u32,
            title,
            x: rect.left,
            y: rect.top,
            width: (rect.right - rect.left) as u32,
            height: (rect.bottom - rect.top) as u32,
            ..Default::default()
        });

        BOOL(1) // 继续枚举
    }

    /// 聚焦窗口
    pub fn focus_window(hwnd: HWND) -> Result<()> {
        unsafe {
            SetForegroundWindow(hwnd);
            Ok(())
        }
    }

    /// 启动应用 (Windows)
    pub fn launch_app(app_name: &str) -> Result<()> {
        Command::new("cmd")
            .args(["/c", "start", "", app_name])
            .spawn()?;
        Ok(())
    }
}
```

### 统一抽象层

```rust
pub trait WindowManager {
    fn list_windows(&self) -> Result<Vec<WindowInfo>>;
    fn focus_window(&self, title: &str) -> Result<()>;
    fn launch_app(&self, name: &str) -> Result<()>;
    fn quit_app(&self, name: &str) -> Result<()>;
    fn is_running(&self, name: &str) -> Result<bool>;
}

// 编译时选择实现
#[cfg(target_os = "macos")]
pub type PlatformWindowManager = macos_windows::MacOSWindowManager;

#[cfg(target_os = "windows")]
pub type PlatformWindowManager = windows_windows::WindowsWindowManager;
```

---

## 8. HiDPI 坐标映射

### 决策

在 `oxmux-agent` 层实现统一坐标映射，所有外部 API 使用逻辑坐标，内部按需转换。

### 基本原理

HiDPI 坐标不匹配是现有 MCP 桌面自动化方案的**最大痛点**。screenshots 返回物理像素，但点击 API 使用逻辑坐标，导致 2x 偏移。oxmux-agent 通过始终携带 scale_factor 元数据并在正确的层进行转换来彻底解决此问题。

### 各平台坐标行为总结

| 组件 | macOS | Windows |
|------|-------|---------|
| 屏幕坐标系 | 逻辑 (points) | 取决于 DPI 感知 |
| CGWindowListCopyWindowInfo bounds | 逻辑 | N/A |
| EnumWindows GetWindowRect | N/A | 逻辑 (DPI-aware) |
| AXUIElement position/size | 逻辑 | N/A |
| UIAutomation bounding_rectangle | N/A | 逻辑 |
| enigo move_mouse | 逻辑 | 取决于 DPI 感知 |
| xcap Monitor::width/height | 逻辑 | 逻辑 |
| xcap capture_image dimensions | **物理** | **物理** |
| xcap scale_factor | 2.0 (Retina) | 1.25/1.5/2.0 |

### macOS 坐标映射

```rust
#[cfg(target_os = "macos")]
mod macos_dpi {
    use core_graphics::display::*;

    /// 获取显示器缩放因子
    pub fn get_scale_factor(display_id: CGDirectDisplayID) -> f64 {
        unsafe {
            let mode = CGDisplayCopyDisplayMode(display_id);
            let pixel_width = CGDisplayModeGetPixelWidth(mode) as f64;
            let logical_width = CGDisplayPixelsWide(display_id) as f64;
            pixel_width / logical_width  // 通常为 1.0 或 2.0
        }
    }

    /// 逻辑坐标 -> 物理坐标
    pub fn logical_to_physical(x: f64, y: f64, scale: f64) -> (f64, f64) {
        (x * scale, y * scale)
    }

    /// 物理坐标 -> 逻辑坐标
    pub fn physical_to_logical(x: f64, y: f64, scale: f64) -> (f64, f64) {
        (x / scale, y / scale)
    }
}
```

macOS 的关键特征：
- backing scale factor 只有 1.0 或 2.0，没有小数缩放
- 所有系统 API（CGEvent、AXUIElement、NSWindow）统一使用逻辑坐标
- 鼠标事件坐标是浮点数，支持亚像素精度

### Windows 坐标映射

```rust
#[cfg(target_os = "windows")]
mod windows_dpi {
    use windows::Win32::UI::HiDpi::*;
    use windows::Win32::Graphics::Gdi::*;

    /// 设置进程为 Per-Monitor DPI Aware V2
    pub fn set_dpi_awareness() {
        unsafe {
            // 优先尝试 V2
            let result = SetProcessDpiAwarenessContext(
                DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
            );
            if !result.as_bool() {
                // 回退到 V1
                SetProcessDpiAwarenessContext(
                    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE
                );
            }
        }
    }

    /// 获取显示器 DPI 缩放因子
    pub fn get_scale_factor(hmonitor: HMONITOR) -> f32 {
        unsafe {
            let mut dpi_x: u32 = 0;
            let mut dpi_y: u32 = 0;
            GetDpiForMonitor(
                hmonitor,
                MDT_EFFECTIVE_DPI,
                &mut dpi_x,
                &mut dpi_y,
            ).unwrap();
            dpi_x as f32 / 96.0  // 96 DPI = 100% = scale 1.0
        }
    }
}
```

Windows 的关键特征：
- DPI 缩放支持非整数值：1.0, 1.25, 1.5, 1.75, 2.0 等
- 必须在进程启动时声明 DPI 感知级别
- Per-Monitor Aware V2 是最佳选择，每个显示器独立处理
- 96 DPI 是基准（100%），144 DPI = 150%，192 DPI = 200%

### xcap scale_factor() 实现细节

xcap 内部在各平台的 scale_factor 实现：

| 平台 | 实现方式 |
|------|----------|
| macOS | `CGDisplayModeGetPixelWidth / CGDisplayPixelsWide` |
| Windows | `GetDpiForMonitor / 96` 或 `GetDeviceCaps` |
| Linux X11 | `Xft.dpi / 96` 或固定 1.0 |

### 统一坐标映射器

```rust
/// 坐标映射器 -- oxmux-agent 的核心组件
pub struct CoordinateMapper {
    scale_factor: f32,
}

impl CoordinateMapper {
    /// 从 xcap Monitor 创建
    pub fn from_monitor(monitor: &xcap::Monitor) -> Self {
        Self {
            scale_factor: monitor.scale_factor(),
        }
    }

    /// 物理像素 -> 逻辑坐标 (用于：screenshot 坐标转为 click 坐标)
    pub fn physical_to_logical(&self, px: i32, py: i32) -> (i32, i32) {
        (
            (px as f32 / self.scale_factor) as i32,
            (py as f32 / self.scale_factor) as i32,
        )
    }

    /// 逻辑坐标 -> 物理像素 (用于：在 screenshot 上标注 UI 元素位置)
    pub fn logical_to_physical(&self, lx: i32, ly: i32) -> (i32, i32) {
        (
            (lx as f32 * self.scale_factor) as i32,
            (ly as f32 * self.scale_factor) as i32,
        )
    }
}
```

### API 响应中的 HiDPI 元数据

```rust
/// 每个截图响应都必须包含此元数据
#[derive(Serialize)]
pub struct AnnotatedScreenshot {
    /// Base64 编码的图片数据
    pub image_data: String,
    /// 图片格式
    pub format: String,  // "png" | "jpeg"
    /// 物理像素尺寸 (图片实际像素)
    pub physical_width: u32,
    pub physical_height: u32,
    /// 逻辑坐标尺寸 (用于点击定位)
    pub logical_width: u32,
    pub logical_height: u32,
    /// 缩放因子
    pub scale_factor: f32,
    /// 显示器 ID
    pub monitor_id: u32,
}
```

### 多显示器场景

关键挑战：不同显示器可能有不同的 scale_factor。

```rust
/// 根据逻辑坐标确定所在显示器
pub fn find_monitor_at(x: i32, y: i32) -> Option<&Monitor> {
    let monitors = Monitor::all().unwrap();
    for monitor in &monitors {
        let mx = monitor.x();
        let my = monitor.y();
        let mw = monitor.width() as i32;
        let mh = monitor.height() as i32;
        if x >= mx && x < mx + mw && y >= my && y < my + mh {
            return Some(monitor);
        }
    }
    None
}
```

**每次操作前重新查询 scale_factor**，不缓存（spec 风险项要求：显示器可能中途插拔）。

---

## 9. 依赖清单总结

### 核心依赖 (oxmux-agent crate)

```toml
[dependencies]
# 输入模拟
enigo = { version = "0.6", features = ["serde"] }

# 截图
xcap = "0.8"
image = "0.25"  # xcap 依赖，用于 PNG/JPEG 编码

# Cron 调度
tokio-cron-scheduler = "0.15"
chrono = { version = "0.4", features = ["serde"] }
chrono-tz = "0.10"

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# 异步运行时 (由主 server 提供)
tokio = { version = "1", features = ["full"] }

# macOS 辅助功能
[target.'cfg(target_os = "macos")'.dependencies]
accessibility-sys = "0.1"
core-foundation = "0.10"
core-graphics = "0.24"

# Windows UIAutomation
[target.'cfg(target_os = "windows")'.dependencies]
uiautomation = "0.24"
windows = { version = "0.58", features = [
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_HiDpi",
    "Win32_Graphics_Gdi",
    "Win32_Foundation",
] }
```

### 外部依赖

| 依赖 | 类型 | 用途 |
|------|------|------|
| Node.js + npx | 系统 | 运行 Playwright MCP 服务器 |
| @playwright/mcp | npm | 浏览器自动化 (可选) |
| Chromium | 系统 | Playwright 管理的浏览器 (可选) |

---

## 10. 关键风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| xcap 0.8 docs.rs 构建失败 | 文档不完整，API 变更风险 | pin 具体版本，参考源码确认 API |
| enigo 版本从 0.3 升到 0.6 | spec 中版本号需更新 | API 基本兼容，trait 方法签名稳定 |
| accessibility crate 高级封装不完整 | 需要更多 unsafe 代码 | 使用 accessibility-sys FFI + 自行封装安全层 |
| Playwright 需要 Node.js 运行时 | 增加部署复杂度 | 标记为可选 feature，不影响核心功能 |
| Windows DPI 感知需要在进程启动时设置 | 错过设置窗口则坐标全部偏移 | 在 main() 最早期调用 SetProcessDpiAwarenessContext |
| 多显示器 scale_factor 不一致 | 跨屏操作坐标错误 | 每次操作前查询目标坐标所在显示器的 scale_factor |
