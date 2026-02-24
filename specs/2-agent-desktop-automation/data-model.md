# Data Model: AI Agent Desktop Automation (oxmux-agent)

**Feature ID**: 2-agent-desktop-automation
**Date**: 2026-02-15

---

## 1. 核心数据模型 (Rust)

### 1.1 坐标系统与显示器

所有坐标均使用**逻辑坐标**（logical points），除非显式标注为物理像素。
坐标原点为主显示器左上角 `(0, 0)`，多显示器环境中坐标可能为负值。

```rust
use serde::{Deserialize, Serialize};

/// 逻辑坐标点
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// 逻辑坐标矩形区域
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,       // 左上角 X
    pub y: f64,       // 左上角 Y
    pub width: f64,   // 宽度（逻辑点）
    pub height: f64,  // 高度（逻辑点）
}

impl Rect {
    /// 计算矩形中心点
    pub fn center(&self) -> Point {
        Point {
            x: self.x + self.width / 2.0,
            y: self.y + self.height / 2.0,
        }
    }
}

/// 尺寸（同时包含物理和逻辑维度）
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub struct Dimensions {
    pub physical_width: u32,   // 物理像素宽度
    pub physical_height: u32,  // 物理像素高度
    pub logical_width: f64,    // 逻辑点宽度
    pub logical_height: f64,   // 逻辑点高度
    pub scale_factor: f64,     // 缩放因子 (e.g., 2.0 for Retina)
}

/// 显示器信息
#[derive(Serialize, Clone, Debug)]
pub struct MonitorInfo {
    /// 显示器唯一 ID（系统分配）
    pub id: u32,
    /// 显示器名称 (e.g., "Built-in Retina Display")
    pub name: String,
    /// 是否为主显示器
    pub is_primary: bool,
    /// 显示器在全局坐标系中的位置（逻辑坐标）
    pub position: Point,
    /// 物理与逻辑尺寸
    pub dimensions: Dimensions,
}
```

### 1.2 截图

```rust
/// 带标注的截图（核心数据结构）
///
/// 所有截图操作必须返回此结构，确保 scale_factor 始终与图像数据绑定。
/// 这是解决 HiDPI 坐标偏移问题的关键设计：消费方无需额外查询缩放因子。
#[derive(Serialize, Clone, Debug)]
pub struct AnnotatedScreenshot {
    /// Base64 编码的图像数据
    pub image_data: String,
    /// 图像格式 ("png" | "jpeg")
    pub format: ImageFormat,
    /// 物理与逻辑尺寸 + 缩放因子
    pub dimensions: Dimensions,
    /// 截图来源（全屏、窗口、区域）
    pub source: ScreenshotSource,
    /// 截图时间戳 (ISO 8601)
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Jpeg,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ScreenshotSource {
    /// 全屏截图
    FullScreen { monitor_id: u32 },
    /// 窗口截图
    Window { window_title: String },
    /// 区域截图
    Region { bounds: Rect },
}
```

### 1.3 UI 元素与无障碍树

```rust
/// UI 元素（无障碍树节点）
///
/// ref_id 在每次 UI 树读取时重新分配，生命周期仅限于单次请求-响应周期。
/// AI agent 应在获取 UI 树后立即使用 ref_id 进行交互，不应缓存。
#[derive(Serialize, Clone, Debug)]
pub struct UIElement {
    /// 引用 ID，用于后续交互 (e.g., "e1", "e2", ...)
    pub ref_id: String,
    /// 元素角色 (e.g., "button", "textField", "staticText", "window")
    pub role: String,
    /// 元素名称/标签 (e.g., "Submit", "Search")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// 元素当前值 (e.g., 输入框文本、滑块数值)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    /// 逻辑坐标边界框
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<Rect>,
    /// 是否可交互 (button, textField, checkbox 等)
    pub interactive: bool,
    /// 是否被聚焦
    pub focused: bool,
    /// 子元素
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<UIElement>,
}

/// UI 树（完整或过滤后的无障碍树）
#[derive(Serialize, Clone, Debug)]
pub struct UITree {
    /// 目标应用名称
    pub app_name: String,
    /// 窗口标题
    pub window_title: String,
    /// 根元素列表
    pub elements: Vec<UIElement>,
    /// 元素总数（递归计算）
    pub total_elements: usize,
    /// 是否因深度/数量限制被截断
    pub truncated: bool,
    /// 应用的最大深度限制
    pub max_depth: u32,
}
```

### 1.4 窗口管理

```rust
/// 窗口信息
#[derive(Serialize, Clone, Debug)]
pub struct WindowInfo {
    /// 平台窗口 ID
    pub window_id: u64,
    /// 窗口标题
    pub title: String,
    /// 所属应用名称
    pub app_name: String,
    /// 应用进程 ID
    pub pid: u32,
    /// 窗口位置与大小（逻辑坐标）
    pub bounds: Rect,
    /// 所在显示器 ID
    pub monitor_id: u32,
    /// 是否为最前面的窗口
    pub is_frontmost: bool,
    /// 是否最小化
    pub is_minimized: bool,
    /// 是否全屏
    pub is_fullscreen: bool,
}
```

### 1.5 坐标映射

```rust
/// 坐标映射器
///
/// 处理物理像素与逻辑点之间的转换。
/// 每次操作前应重新获取 scale_factor，不缓存（应对显示器热插拔）。
pub struct CoordinateMapper;

impl CoordinateMapper {
    /// 物理像素 -> 逻辑点
    pub fn physical_to_logical(physical: Point, scale_factor: f64) -> Point {
        Point {
            x: physical.x / scale_factor,
            y: physical.y / scale_factor,
        }
    }

    /// 逻辑点 -> 物理像素
    pub fn logical_to_physical(logical: Point, scale_factor: f64) -> Point {
        Point {
            x: logical.x * scale_factor,
            y: logical.y * scale_factor,
        }
    }

    /// 根据 AnnotatedScreenshot 的元数据转换坐标
    pub fn from_screenshot(
        physical: Point,
        screenshot: &AnnotatedScreenshot,
    ) -> Point {
        Self::physical_to_logical(physical, screenshot.dimensions.scale_factor)
    }
}
```

---

## 2. Cron 调度数据模型

### 2.1 调度类型

```rust
/// Cron 调度方式（三选一）
///
/// 验证规则：
/// - At: 时间必须是未来时间点，ISO 8601 格式含时区
/// - Every: interval_secs 最小 10 秒，最大 86400 秒 (24h)
/// - Cron: 标准 6 字段格式（秒 分 时 日 月 周）
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CronSchedule {
    /// 一次性定时任务
    At {
        /// 执行时间 (ISO 8601，含时区，e.g., "2026-02-16T03:00:00+08:00")
        datetime: String,
    },
    /// 固定间隔重复
    Every {
        /// 间隔秒数 (最小 10，最大 86400)
        interval_secs: u64,
    },
    /// Cron 表达式
    Cron {
        /// 6 字段 cron 表达式 (e.g., "0 */30 * * * *" = 每 30 分钟)
        expression: String,
        /// 时区 (e.g., "Asia/Shanghai")，默认 "UTC"
        #[serde(default = "default_timezone")]
        timezone: String,
    },
}

fn default_timezone() -> String {
    "UTC".to_string()
}
```

### 2.2 任务动作

```rust
/// Cron 任务动作（五选一）
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CronAction {
    /// 执行 Shell 命令
    RunCommand {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        /// 超时秒数，默认 120，最大 600
        #[serde(default = "default_timeout")]
        timeout_secs: u64,
    },
    /// 启动应用程序
    OpenApp {
        app_name: String,
    },
    /// 在浏览器中打开 URL
    OpenUrl {
        url: String,
    },
    /// 截取屏幕截图
    Screenshot {
        /// 目标显示器 ID，None = 主显示器
        #[serde(skip_serializing_if = "Option::is_none")]
        monitor_id: Option<u32>,
        /// 图像格式
        #[serde(default)]
        format: ImageFormat,
    },
    /// 自定义脚本
    Custom {
        /// 脚本文件路径（相对或绝对）
        script_path: String,
        #[serde(default)]
        args: Vec<String>,
        /// 超时秒数
        #[serde(default = "default_timeout")]
        timeout_secs: u64,
    },
}

fn default_timeout() -> u64 {
    120
}

impl Default for ImageFormat {
    fn default() -> Self {
        ImageFormat::Png
    }
}
```

### 2.3 任务与执行结果

```rust
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Cron 任务
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CronJob {
    /// 唯一标识 (UUID v4)
    pub id: String,
    /// 任务名称（用户可读）
    pub name: String,
    /// 描述（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 调度配置
    pub schedule: CronSchedule,
    /// 执行动作
    pub action: CronAction,
    /// 是否启用
    pub enabled: bool,
    /// 创建时间
    pub created_at: String,
    /// 最后修改时间
    pub updated_at: String,
    /// 最后执行时间（None = 从未执行）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<String>,
    /// 下次预计执行时间（None = 一次性已完成或已禁用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<String>,
    /// 连续失败次数（成功后重置为 0）
    #[serde(default)]
    pub consecutive_failures: u32,
    /// 累计执行次数
    #[serde(default)]
    pub total_runs: u64,
    /// 最后执行结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_result: Option<JobResult>,
}

impl CronJob {
    pub fn new(name: String, schedule: CronSchedule, action: CronAction) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description: None,
            schedule,
            action,
            enabled: true,
            created_at: now.clone(),
            updated_at: now,
            last_run_at: None,
            next_run_at: None,
            consecutive_failures: 0,
            total_runs: 0,
            last_result: None,
        }
    }

    /// 是否因连续失败被自动禁用（阈值 10 次）
    pub fn is_auto_disabled(&self) -> bool {
        self.consecutive_failures >= 10
    }
}

/// 任务执行结果
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JobResult {
    /// 执行状态
    pub status: JobStatus,
    /// 执行输出（stdout/截图路径/结果摘要）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// 错误信息（stderr 或异常描述）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 退出码（仅 RunCommand/Custom）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    /// 执行耗时（毫秒）
    pub duration_ms: u64,
    /// 执行时间戳
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Ok,
    Error,
    Timeout,
    Skipped,
}
```

### 2.4 持久化存储结构

Cron 任务以 JSON 文件持久化存储于 `~/.config/oxmux/cron-jobs.json`。

```rust
/// 持久化文件根结构
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CronStorage {
    /// 存储格式版本（用于未来数据迁移）
    pub version: u32,
    /// 所有任务
    pub jobs: Vec<CronJob>,
    /// 最后持久化时间
    pub last_saved: String,
}

impl Default for CronStorage {
    fn default() -> Self {
        Self {
            version: 1,
            jobs: Vec::new(),
            last_saved: Utc::now().to_rfc3339(),
        }
    }
}
```

**持久化文件示例** (`cron-jobs.json`):

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "每日截图监控",
      "description": "每天上午 9 点截取主显示器",
      "schedule": {
        "type": "cron",
        "expression": "0 0 9 * * *",
        "timezone": "Asia/Shanghai"
      },
      "action": {
        "type": "screenshot",
        "format": "png"
      },
      "enabled": true,
      "created_at": "2026-02-15T10:00:00+08:00",
      "updated_at": "2026-02-15T10:00:00+08:00",
      "last_run_at": "2026-02-15T09:00:00+08:00",
      "next_run_at": "2026-02-16T09:00:00+08:00",
      "consecutive_failures": 0,
      "total_runs": 1,
      "last_result": {
        "status": "ok",
        "output": "screenshot saved: /tmp/oxmux/screenshots/2026-02-15T09-00-00.png",
        "duration_ms": 245,
        "timestamp": "2026-02-15T09:00:00+08:00"
      }
    },
    {
      "id": "f9e8d7c6-b5a4-3210-fedc-ba0987654321",
      "name": "延迟部署",
      "schedule": {
        "type": "at",
        "datetime": "2026-02-16T03:00:00+08:00"
      },
      "action": {
        "type": "run_command",
        "command": "deploy.sh",
        "args": ["production"],
        "timeout_secs": 300
      },
      "enabled": true,
      "created_at": "2026-02-15T18:00:00+08:00",
      "updated_at": "2026-02-15T18:00:00+08:00",
      "next_run_at": "2026-02-16T03:00:00+08:00",
      "consecutive_failures": 0,
      "total_runs": 0
    }
  ],
  "last_saved": "2026-02-15T18:00:00+08:00"
}
```

---

## 3. 浏览器自动化数据模型

### 3.1 浏览器会话

```rust
/// 浏览器会话（Playwright 管理的 Chromium 实例）
///
/// 每个 0xMux 服务实例最多维护一个浏览器会话。
/// 会话在首次 browser API 调用时懒初始化，idle 超时后自动关闭。
#[derive(Serialize, Clone, Debug)]
pub struct BrowserSession {
    /// 会话 ID
    pub session_id: String,
    /// 当前标签页列表
    pub tabs: Vec<BrowserTab>,
    /// 当前活跃标签页索引
    pub active_tab_index: usize,
    /// 会话创建时间
    pub created_at: String,
    /// 最后活跃时间（用于 idle 超时检测）
    pub last_active_at: String,
    /// 浏览器是否就绪
    pub ready: bool,
}

/// 浏览器标签页
#[derive(Serialize, Clone, Debug)]
pub struct BrowserTab {
    /// 标签页索引
    pub index: usize,
    /// 页面标题
    pub title: String,
    /// 当前 URL
    pub url: String,
}

/// 页面快照（ARIA 无障碍树）
///
/// 与桌面 UITree 类似，但面向网页元素。
/// ref_id 生命周期同桌面 UIElement——仅限单次请求-响应周期。
#[derive(Serialize, Clone, Debug)]
pub struct PageSnapshot {
    /// 页面标题
    pub title: String,
    /// 当前 URL
    pub url: String,
    /// ARIA 无障碍树根元素
    pub elements: Vec<PageElement>,
    /// 元素总数
    pub total_elements: usize,
    /// 是否被截断
    pub truncated: bool,
}

/// 页面元素（ARIA 节点）
#[derive(Serialize, Clone, Debug)]
pub struct PageElement {
    /// 引用 ID (e.g., "r1", "r2")，用于后续交互
    pub ref_id: String,
    /// ARIA 角色 (e.g., "button", "textbox", "link", "heading")
    pub role: String,
    /// 元素名称/文本
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// 当前值
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    /// 元素描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 是否可交互
    pub interactive: bool,
    /// 子元素
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<PageElement>,
}
```

---

## 4. API 请求/响应类型

### 4.1 截图 API

```rust
/// POST /api/agent/desktop/screenshot - 请求
#[derive(Deserialize, Debug)]
pub struct ScreenshotRequest {
    /// 目标显示器 ID，None = 主显示器
    #[serde(default)]
    pub monitor_id: Option<u32>,
    /// 按窗口标题捕获（子串匹配）
    #[serde(default)]
    pub window_title: Option<String>,
    /// 捕获区域（逻辑坐标），None = 全屏/全窗口
    #[serde(default)]
    pub region: Option<Rect>,
    /// 图像格式，默认 PNG
    #[serde(default)]
    pub format: ImageFormat,
    /// JPEG 质量 (1-100)，仅 JPEG 格式有效，默认 80
    #[serde(default = "default_jpeg_quality")]
    pub quality: u8,
    /// 缩放因子 (0.1-1.0)，用于缩小图像减少传输大小
    #[serde(default = "default_scale")]
    pub scale: f64,
}

fn default_jpeg_quality() -> u8 { 80 }
fn default_scale() -> f64 { 1.0 }

/// POST /api/agent/desktop/screenshot - 响应
/// 直接返回 AnnotatedScreenshot
```

### 4.2 显示器 API

```rust
/// GET /api/agent/desktop/displays - 响应
#[derive(Serialize, Debug)]
pub struct DisplaysResponse {
    pub displays: Vec<MonitorInfo>,
}
```

### 4.3 输入模拟 API

```rust
/// 鼠标按键类型
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl Default for MouseButton {
    fn default() -> Self {
        MouseButton::Left
    }
}

/// POST /api/agent/desktop/click - 请求
#[derive(Deserialize, Debug)]
pub struct ClickRequest {
    /// 点击坐标（逻辑），与 ref 二选一
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    /// UI 元素引用 ID（从 ui-tree 获取），与 x/y 二选一
    #[serde(default)]
    pub ref_id: Option<String>,
    /// 鼠标按键，默认 left
    #[serde(default)]
    pub button: MouseButton,
    /// 是否双击
    #[serde(default)]
    pub double_click: bool,
}

/// POST /api/agent/desktop/type - 请求
#[derive(Deserialize, Debug)]
pub struct TypeRequest {
    /// 目标元素引用 ID（可选，指定后先点击该元素再输入）
    #[serde(default)]
    pub ref_id: Option<String>,
    /// 要输入的文本
    pub text: String,
    /// 逐字符输入（触发各 key handler），默认 false（一次性填入）
    #[serde(default)]
    pub slowly: bool,
}

/// POST /api/agent/desktop/key - 请求
#[derive(Deserialize, Debug)]
pub struct KeyRequest {
    /// 按键或组合键 (e.g., "enter", "ctrl+c", "cmd+tab", "f5")
    pub key: String,
    /// 重复次数，默认 1，最大 100
    #[serde(default = "default_repeat")]
    pub repeat: u32,
}

fn default_repeat() -> u32 { 1 }

/// POST /api/agent/desktop/drag - 请求
#[derive(Deserialize, Debug)]
pub struct DragRequest {
    /// 起点坐标或引用
    #[serde(default)]
    pub start_x: Option<f64>,
    #[serde(default)]
    pub start_y: Option<f64>,
    #[serde(default)]
    pub start_ref: Option<String>,
    /// 终点坐标或引用
    #[serde(default)]
    pub end_x: Option<f64>,
    #[serde(default)]
    pub end_y: Option<f64>,
    #[serde(default)]
    pub end_ref: Option<String>,
}

/// 通用操作成功响应
#[derive(Serialize, Debug)]
pub struct ActionResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
```

### 4.4 UI 树 API

```rust
/// GET /api/agent/desktop/ui-tree - 查询参数
#[derive(Deserialize, Debug)]
pub struct UITreeQuery {
    /// 目标窗口标题（子串匹配），None = 最前面的窗口
    #[serde(default)]
    pub window_title: Option<String>,
    /// 过滤模式："all" | "interactive"（仅按钮/输入框等）
    #[serde(default = "default_filter")]
    pub filter: String,
    /// 最大树深度，默认 10，最大 20
    #[serde(default = "default_depth")]
    pub depth: u32,
}

fn default_filter() -> String { "all".to_string() }
fn default_depth() -> u32 { 10 }

/// GET /api/agent/desktop/ui-tree - 响应
/// 直接返回 UITree

/// GET /api/agent/desktop/ui-find - 查询参数
#[derive(Deserialize, Debug)]
pub struct UIFindQuery {
    /// 搜索关键词（匹配 name、role 或 value）
    pub query: String,
    /// 目标窗口标题
    #[serde(default)]
    pub window_title: Option<String>,
}

/// GET /api/agent/desktop/ui-find - 响应
#[derive(Serialize, Debug)]
pub struct UIFindResponse {
    /// 匹配的元素列表（扁平化，不含子元素）
    pub elements: Vec<UIElement>,
    pub total: usize,
}
```

### 4.5 窗口管理 API

```rust
/// GET /api/agent/desktop/windows - 响应
#[derive(Serialize, Debug)]
pub struct WindowsResponse {
    pub windows: Vec<WindowInfo>,
}

/// POST /api/agent/desktop/window/focus - 请求
#[derive(Deserialize, Debug)]
pub struct FocusWindowRequest {
    /// 窗口标题（子串匹配）
    pub title: String,
}

/// POST /api/agent/desktop/launch - 请求
#[derive(Deserialize, Debug)]
pub struct LaunchAppRequest {
    /// 应用名称 (e.g., "Safari", "Visual Studio Code")
    pub app_name: String,
}

/// POST /api/agent/desktop/quit - 请求
#[derive(Deserialize, Debug)]
pub struct QuitAppRequest {
    /// 应用名称
    pub app_name: String,
}

/// GET /api/agent/desktop/app-status - 查询参数
#[derive(Deserialize, Debug)]
pub struct AppStatusQuery {
    pub app_name: String,
}

/// GET /api/agent/desktop/app-status - 响应
#[derive(Serialize, Debug)]
pub struct AppStatusResponse {
    pub app_name: String,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}
```

### 4.6 命令执行 API

```rust
/// POST /api/agent/desktop/exec - 请求
#[derive(Deserialize, Debug)]
pub struct ExecRequest {
    /// Shell 命令
    pub command: String,
    /// 命令参数
    #[serde(default)]
    pub args: Vec<String>,
    /// 超时秒数，默认 120，最大 600
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// 是否后台执行
    #[serde(default)]
    pub background: bool,
}

/// POST /api/agent/desktop/exec - 响应（同步模式）
#[derive(Serialize, Debug)]
pub struct ExecResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    /// 输出是否被截断（超过 200KB）
    pub truncated: bool,
}

/// POST /api/agent/desktop/exec - 响应（后台模式）
#[derive(Serialize, Debug)]
pub struct ExecBackgroundResponse {
    /// 任务 ID，用于后续查询
    pub task_id: String,
    pub message: String,
}
```

### 4.7 Cron 调度 API

```rust
/// POST /api/agent/cron - 创建任务请求
#[derive(Deserialize, Debug)]
pub struct CreateCronRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub schedule: CronSchedule,
    pub action: CronAction,
    /// 创建后是否立即启用，默认 true
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool { true }

/// PUT /api/agent/cron/:id - 更新任务请求
#[derive(Deserialize, Debug)]
pub struct UpdateCronRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub schedule: Option<CronSchedule>,
    #[serde(default)]
    pub action: Option<CronAction>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

/// GET /api/agent/cron - 响应
#[derive(Serialize, Debug)]
pub struct CronListResponse {
    pub jobs: Vec<CronJob>,
    pub total: usize,
}

/// POST /api/agent/cron/:id/trigger - 手动触发响应
#[derive(Serialize, Debug)]
pub struct CronTriggerResponse {
    pub job_id: String,
    pub result: JobResult,
}
```

### 4.8 浏览器自动化 API

```rust
/// POST /api/agent/browser/navigate - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserNavigateRequest {
    pub url: String,
}

/// POST /api/agent/browser/click - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserClickRequest {
    /// 页面元素引用 ID（从 snapshot 获取）
    pub ref_id: String,
    /// 鼠标按键
    #[serde(default)]
    pub button: MouseButton,
    /// 是否双击
    #[serde(default)]
    pub double_click: bool,
    /// 修饰键 (e.g., ["Shift", "Control"])
    #[serde(default)]
    pub modifiers: Vec<String>,
}

/// POST /api/agent/browser/type - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserTypeRequest {
    /// 目标元素引用 ID
    pub ref_id: String,
    /// 输入文本
    pub text: String,
    /// 逐字符输入
    #[serde(default)]
    pub slowly: bool,
    /// 输入后按 Enter
    #[serde(default)]
    pub submit: bool,
}

/// POST /api/agent/browser/evaluate - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserEvalRequest {
    /// JavaScript 代码
    pub function: String,
    /// 目标元素引用 ID（可选，注入 element 参数）
    #[serde(default)]
    pub ref_id: Option<String>,
}

/// POST /api/agent/browser/evaluate - 响应
#[derive(Serialize, Debug)]
pub struct BrowserEvalResponse {
    pub result: serde_json::Value,
}

/// POST /api/agent/browser/screenshot - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserScreenshotRequest {
    /// 是否全页截图（而非仅可视区域）
    #[serde(default)]
    pub full_page: bool,
    /// 目标元素引用（可选，截取单个元素）
    #[serde(default)]
    pub ref_id: Option<String>,
    /// 图像格式
    #[serde(default)]
    pub format: ImageFormat,
}

/// POST /api/agent/browser/fill-form - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserFillFormRequest {
    pub fields: Vec<FormField>,
}

#[derive(Deserialize, Debug)]
pub struct FormField {
    pub name: String,
    pub ref_id: String,
    #[serde(rename = "type")]
    pub field_type: FormFieldType,
    pub value: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum FormFieldType {
    Textbox,
    Checkbox,
    Radio,
    Combobox,
    Slider,
}

/// GET /api/agent/browser/tabs - 响应
#[derive(Serialize, Debug)]
pub struct BrowserTabsResponse {
    pub tabs: Vec<BrowserTab>,
    pub active_index: usize,
}

/// POST /api/agent/browser/tabs - 请求
#[derive(Deserialize, Debug)]
pub struct BrowserTabAction {
    /// "new" | "close" | "select"
    pub action: String,
    /// 标签页索引（close/select 时必填）
    #[serde(default)]
    pub index: Option<usize>,
}
```

---

## 5. 平台抽象 Trait

### 5.1 桌面自动化

```rust
use async_trait::async_trait;
use std::error::Error;

type AgentResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

/// 桌面自动化核心 trait
///
/// 平台实现通过 #[cfg(target_os)] 条件编译选择：
/// - macOS: CoreGraphics + AXUIElement + NSWorkspace
/// - Windows: Win32 API + UIAutomation
/// - Linux: stub（返回 Unsupported 错误，不中断编译）
#[async_trait]
pub trait DesktopAutomation: Send + Sync {
    // ---- 截图 ----

    /// 截取主显示器或指定显示器的全屏截图
    async fn capture_screen(&self, monitor_id: Option<u32>) -> AgentResult<AnnotatedScreenshot>;

    /// 截取指定窗口的截图
    async fn capture_window(&self, window_title: &str) -> AgentResult<AnnotatedScreenshot>;

    /// 截取指定区域的截图（逻辑坐标）
    async fn capture_region(&self, region: Rect) -> AgentResult<AnnotatedScreenshot>;

    // ---- 输入模拟 ----

    /// 鼠标点击（逻辑坐标）
    async fn click(&self, point: Point, button: MouseButton, double: bool) -> AgentResult<()>;

    /// 鼠标拖拽（逻辑坐标）
    async fn drag(&self, from: Point, to: Point) -> AgentResult<()>;

    /// 输入文本
    async fn type_text(&self, text: &str, slowly: bool) -> AgentResult<()>;

    /// 按键/组合键
    async fn press_key(&self, key: &str, repeat: u32) -> AgentResult<()>;

    // ---- 显示器 ----

    /// 枚举所有已连接的显示器
    async fn list_displays(&self) -> AgentResult<Vec<MonitorInfo>>;

    /// 获取指定显示器的缩放因子（不缓存，每次实时查询）
    async fn get_scale_factor(&self, monitor_id: u32) -> AgentResult<f64>;
}
```

### 5.2 窗口管理

```rust
/// 窗口管理 trait
#[async_trait]
pub trait WindowManager: Send + Sync {
    /// 列出所有打开的窗口
    async fn list_windows(&self) -> AgentResult<Vec<WindowInfo>>;

    /// 聚焦窗口（子串匹配标题）
    async fn focus_window(&self, title: &str) -> AgentResult<()>;

    /// 启动应用
    async fn launch_app(&self, app_name: &str) -> AgentResult<()>;

    /// 退出应用（优雅关闭）
    async fn quit_app(&self, app_name: &str) -> AgentResult<()>;

    /// 检查应用是否正在运行
    async fn is_app_running(&self, app_name: &str) -> AgentResult<bool>;

    /// 获取应用进程 ID（如正在运行）
    async fn get_app_pid(&self, app_name: &str) -> AgentResult<Option<u32>>;
}
```

### 5.3 UI 树读取

```rust
/// UI 树读取 trait（无障碍树）
#[async_trait]
pub trait UITreeReader: Send + Sync {
    /// 读取指定窗口的完整 UI 树
    ///
    /// # 参数
    /// - `window_title`: 目标窗口标题，None = 最前面的窗口
    /// - `max_depth`: 最大深度限制
    /// - `interactive_only`: 是否仅返回可交互元素
    async fn read_ui_tree(
        &self,
        window_title: Option<&str>,
        max_depth: u32,
        interactive_only: bool,
    ) -> AgentResult<UITree>;

    /// 通过引用 ID 查找元素（在最近一次读取结果中查找）
    async fn find_element_by_ref(&self, ref_id: &str) -> AgentResult<Option<UIElement>>;

    /// 搜索匹配的元素（name/role/value 子串匹配）
    async fn find_elements(&self, query: &str, window_title: Option<&str>) -> AgentResult<Vec<UIElement>>;

    /// 点击指定引用 ID 的元素（计算中心坐标并点击）
    async fn click_element(&self, ref_id: &str, button: MouseButton) -> AgentResult<()>;

    /// 向指定引用 ID 的元素输入文本（先聚焦再输入）
    async fn type_into_element(&self, ref_id: &str, text: &str) -> AgentResult<()>;
}
```

### 5.4 平台实现注册

```rust
/// 平台实现工厂
///
/// 根据编译目标自动选择正确的实现。
/// 不支持的平台返回 stub 实现（所有方法返回 Unsupported 错误）。
pub fn create_platform() -> (
    Box<dyn DesktopAutomation>,
    Box<dyn WindowManager>,
    Box<dyn UITreeReader>,
) {
    #[cfg(target_os = "macos")]
    {
        let desktop = macos::MacDesktopAutomation::new();
        let windows = macos::MacWindowManager::new();
        let ui_tree = macos::MacUITreeReader::new();
        (Box::new(desktop), Box::new(windows), Box::new(ui_tree))
    }

    #[cfg(target_os = "windows")]
    {
        let desktop = windows::WinDesktopAutomation::new();
        let windows = windows::WinWindowManager::new();
        let ui_tree = windows::WinUITreeReader::new();
        (Box::new(desktop), Box::new(windows), Box::new(ui_tree))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let stub = stub::StubPlatform::new();
        (Box::new(stub.clone()), Box::new(stub.clone()), Box::new(stub))
    }
}
```

---

## 6. 前端 TypeScript 类型

以下类型用于前端与 agent API 交互，字段与 Rust 后端 serde 输出一一对应。

### 6.1 坐标与基础类型

```typescript
/** 逻辑坐标点 */
interface Point {
  x: number
  y: number
}

/** 逻辑坐标矩形 */
interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 物理/逻辑双维度 + 缩放因子 */
interface Dimensions {
  physical_width: number
  physical_height: number
  logical_width: number
  logical_height: number
  scale_factor: number
}

/** 显示器信息 */
interface MonitorInfo {
  id: number
  name: string
  is_primary: boolean
  position: Point
  dimensions: Dimensions
}
```

### 6.2 截图

```typescript
type ImageFormat = 'png' | 'jpeg'

type ScreenshotSource =
  | { type: 'full_screen'; monitor_id: number }
  | { type: 'window'; window_title: string }
  | { type: 'region'; bounds: Rect }

/** 带标注的截图 */
interface AnnotatedScreenshot {
  image_data: string     // Base64
  format: ImageFormat
  dimensions: Dimensions
  source: ScreenshotSource
  timestamp: string      // ISO 8601
}
```

### 6.3 UI 元素

```typescript
/** 桌面 UI 元素（无障碍树节点） */
interface UIElement {
  ref_id: string
  role: string
  name?: string
  value?: string
  bounds?: Rect
  interactive: boolean
  focused: boolean
  children: UIElement[]
}

/** UI 树 */
interface UITree {
  app_name: string
  window_title: string
  elements: UIElement[]
  total_elements: number
  truncated: boolean
  max_depth: number
}
```

### 6.4 窗口

```typescript
interface WindowInfo {
  window_id: number
  title: string
  app_name: string
  pid: number
  bounds: Rect
  monitor_id: number
  is_frontmost: boolean
  is_minimized: boolean
  is_fullscreen: boolean
}
```

### 6.5 Cron 调度

```typescript
type CronSchedule =
  | { type: 'at'; datetime: string }
  | { type: 'every'; interval_secs: number }
  | { type: 'cron'; expression: string; timezone: string }

type CronAction =
  | { type: 'run_command'; command: string; args: string[]; timeout_secs: number }
  | { type: 'open_app'; app_name: string }
  | { type: 'open_url'; url: string }
  | { type: 'screenshot'; monitor_id?: number; format: ImageFormat }
  | { type: 'custom'; script_path: string; args: string[]; timeout_secs: number }

type JobStatus = 'ok' | 'error' | 'timeout' | 'skipped'

interface JobResult {
  status: JobStatus
  output?: string
  error?: string
  exit_code?: number
  duration_ms: number
  timestamp: string
}

interface CronJob {
  id: string
  name: string
  description?: string
  schedule: CronSchedule
  action: CronAction
  enabled: boolean
  created_at: string
  updated_at: string
  last_run_at?: string
  next_run_at?: string
  consecutive_failures: number
  total_runs: number
  last_result?: JobResult
}
```

### 6.6 浏览器自动化

```typescript
interface BrowserTab {
  index: number
  title: string
  url: string
}

interface BrowserSession {
  session_id: string
  tabs: BrowserTab[]
  active_tab_index: number
  created_at: string
  last_active_at: string
  ready: boolean
}

interface PageElement {
  ref_id: string
  role: string
  name?: string
  value?: string
  description?: string
  interactive: boolean
  children: PageElement[]
}

interface PageSnapshot {
  title: string
  url: string
  elements: PageElement[]
  total_elements: number
  truncated: boolean
}
```

---

## 7. 实体关系

```
                    +-----------------+
                    |  MonitorInfo    |
                    |  (id, scale)   |
                    +-------+---------+
                            |
                   captured_on
                            |
                    +-------v---------+
                    | Annotated       |     包含 Dimensions
                    | Screenshot      +-----(scale_factor 始终绑定)
                    +-----------------+
                            |
                   坐标来源  |   CoordinateMapper
                            |   physical <-> logical
                            v
                    +-----------------+
                    |    Point        |<--- 所有 API 统一使用逻辑坐标
                    +-----------------+

    +------------------+         +------------------+
    |   WindowInfo     |         |     UITree       |
    |  (window_id,     |-------->|  (app_name,      |
    |   app_name,      | 读取自  |   elements[])    |
    |   bounds)        |         +--------+---------+
    +------------------+                  |
                                  包含多个 |
                                          v
                                 +--------+---------+
                                 |   UIElement       |
                                 | (ref_id 用于交互) |
                                 | (递归子元素)       |
                                 +------------------+

    +------------------+         +------------------+
    |   CronJob        |-------->|  CronSchedule    |
    | (id, name,       | 定义    | At | Every | Cron |
    |  enabled)        |         +------------------+
    +--------+---------+
             |
         执行 | 触发
             v
    +--------+---------+         +------------------+
    |   CronAction     |-------->|  JobResult       |
    | RunCommand |     | 产生    | (status, output, |
    | OpenApp |        |         |  duration_ms)    |
    | OpenUrl |        |         +------------------+
    | Screenshot |     |
    | Custom           |
    +------------------+

    +------------------+         +------------------+
    | BrowserSession   |-------->|  BrowserTab      |
    | (session_id)     | 包含多个| (index, title,   |
    +--------+---------+         |  url)            |
             |                   +------------------+
         快照 |
             v
    +--------+---------+
    |  PageSnapshot    |
    | (title, url,     |
    |  elements[])     |
    +--------+---------+
             |
      包含多个 |
             v
    +--------+---------+
    |  PageElement     |
    | (ref_id 用于     |
    |  浏览器内交互)   |
    +------------------+
```

---

## 8. 验证规则汇总

| 字段 | 规则 | 错误码 |
|------|------|--------|
| `CronSchedule::At::datetime` | 必须为有效 ISO 8601 且含时区，必须是未来时间 | 400 |
| `CronSchedule::Every::interval_secs` | 最小 10，最大 86400 | 400 |
| `CronSchedule::Cron::expression` | 有效 6 字段 cron 表达式 | 400 |
| `CronSchedule::Cron::timezone` | 有效 IANA 时区名 (e.g., "Asia/Shanghai") | 400 |
| `CronAction::RunCommand::timeout_secs` | 最大 600 | 400 |
| `CronAction::Custom::script_path` | 路径存在且可执行 | 400 |
| `ScreenshotRequest::quality` | 1-100 | 400 |
| `ScreenshotRequest::scale` | 0.1-1.0 | 400 |
| `KeyRequest::repeat` | 1-100 | 400 |
| `ClickRequest` | `x/y` 与 `ref_id` 二选一，不能同时为空 | 400 |
| `DragRequest` | 起点和终点各自要么提供坐标要么提供引用 | 400 |
| `ExecRequest::timeout_secs` | 最大 600 | 400 |
| `ExecResponse::stdout/stderr` | 超过 200KB 截断，`truncated=true` | — |
| `UITreeQuery::depth` | 1-20 | 400 |
| `UIElement::ref_id` | 格式 "e{N}"，生命周期仅限单次请求 | — |
| `PageElement::ref_id` | 格式 "r{N}"，生命周期仅限单次请求 | — |
| `CronJob::consecutive_failures` | 达到 10 时自动禁用任务 | — |

---

## 9. Crate 目录结构

```
oxmux-agent/
  Cargo.toml
  src/
    lib.rs              # 公开 API，re-export 核心类型
    models/
      mod.rs
      coordinates.rs    # Point, Rect, Dimensions, CoordinateMapper
      screenshot.rs     # AnnotatedScreenshot, ImageFormat, ScreenshotSource
      ui_tree.rs        # UIElement, UITree
      window.rs         # WindowInfo, MonitorInfo
      cron.rs           # CronJob, CronSchedule, CronAction, JobResult, CronStorage
      browser.rs        # BrowserSession, BrowserTab, PageSnapshot, PageElement
    api/
      mod.rs
      requests.rs       # 所有 API 请求类型
      responses.rs      # 所有 API 响应类型
    traits/
      mod.rs
      desktop.rs        # DesktopAutomation trait
      window_mgr.rs     # WindowManager trait
      ui_reader.rs      # UITreeReader trait
    platform/
      mod.rs            # create_platform() 工厂函数
      macos/            # #[cfg(target_os = "macos")]
        mod.rs
        screenshot.rs
        input.rs
        accessibility.rs
        window.rs
      windows/          # #[cfg(target_os = "windows")]
        mod.rs
        screenshot.rs
        input.rs
        uiautomation.rs
        window.rs
      stub.rs           # 不支持平台的 stub 实现
    scheduler/
      mod.rs            # CronScheduler 主循环
      storage.rs        # JSON 持久化读写
      executor.rs       # CronAction 执行器
    browser/
      mod.rs            # BrowserManager（Playwright 子进程管理）
      session.rs        # BrowserSession 生命周期
      commands.rs       # 浏览器命令（navigate, click, type 等）
```
