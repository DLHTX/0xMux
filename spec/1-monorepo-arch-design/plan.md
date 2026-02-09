# 实施计划：0xMux Monorepo 架构设计与分发体系

**版本**: 1.0
**日期**: 2026-02-09
**分支**: `1-monorepo-arch-design`
**关联规格**: [spec.md](./spec.md)

---

## 技术上下文

### 当前状态

项目已有基础骨架代码：

| 组件 | 状态 | 说明 |
|------|------|------|
| Rust 后端 | 基础骨架 | Axum 0.8，已有 `/api/sessions`、`/api/health`、`/ws` 路由 |
| tmux 交互 | 基础实现 | `tmux.rs` 已实现 list/kill/new/rename 四个操作 |
| React 前端 | 基础骨架 | React 19 + Tailwind 4 + Vite 7，已有 session 列表展示 |
| Vite Proxy | 已配置 | `/api` → 3001, `/ws` → ws://3001 |
| UI 主题 | 基础实现 | 暗色背景 + 霓虹绿 + JetBrains Mono |

### 技术栈确认

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | stable | 后端 |
| Axum | 0.8 | HTTP + WebSocket 框架 |
| Tokio | 1.x | 异步运行时 |
| rust-embed | 8.5+ | 生产模式静态文件嵌入 |
| which | 6.0 | 依赖检测 |
| clap | 4.x | CLI 参数解析 |
| React | 19 | 前端框架 |
| TypeScript | 5.9 | 前端类型系统 |
| Tailwind CSS | 4.x | 样式 |
| Vite | 7.x | 前端构建 |
| concurrently | latest | 多进程编排 |
| cargo-watch | latest | Rust 热重载 |

### 依赖需新增

**Rust (Cargo.toml)**:
- `rust-embed` 8.5+ (features: axum, mime-guess) — 静态文件嵌入
- `mime_guess` 2.0 — MIME 类型检测
- `which` 6.0 — PATH 工具检测
- `clap` 4.x (features: derive) — CLI 参数
- `uuid` 1.x — 安装任务 ID
- `tokio-stream` 0.1 — 流式读取进程输出

**Node (root package.json)**:
- `concurrently` — 多进程管理

---

## 实施阶段

### Phase 1：Monorepo 基础设施（FR-1, FR-3）

**目标**：根目录 `package.json` 编排，一条命令启动前后端

#### Task 1.1：创建根目录 package.json

**文件**：`/package.json`

```json
{
  "name": "0xmux",
  "version": "0.1.0",
  "private": true,
  "description": "Hacker-grade tmux session manager with web UI",
  "scripts": {
    "dev": "concurrently -n WEB,SERVER -c cyan.bold,magenta.bold --kill-others \"npm run dev:web\" \"npm run dev:server\"",
    "dev:web": "cd web && bun dev",
    "dev:server": "cd server && cargo watch -q -c -w src -x run",
    "build": "npm run build:web && npm run build:server",
    "build:web": "cd web && bun run build",
    "build:server": "cd server && cargo build --release --features embed-frontend",
    "start": "cd server && cargo run --release --features embed-frontend"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

**验收**：
- `npm run dev` 同时启动前端和后端
- 终端看到 `[WEB]` 和 `[SERVER]` 颜色区分的日志
- Ctrl+C 终止所有进程

#### Task 1.2：安装开发依赖

```bash
# 根目录
npm install
# cargo-watch（全局安装一次）
cargo install cargo-watch
```

---

### Phase 2：后端 API 完善（FR-2, FR-8）

**目标**：完善 REST API + WebSocket + CLI 参数

#### Task 2.1：添加 CLI 参数解析

**文件**：`server/src/config.rs`（新建）

使用 `clap` derive 实现：
- `--port <PORT>` 或 `PORT` 环境变量，默认 1234
- `--host <HOST>` 或 `HOST` 环境变量，默认 127.0.0.1
- `--version` 输出版本号

**修改**：`server/src/main.rs` — 使用 config 替换硬编码的 `0.0.0.0:3001`

**注意**：开发模式下端口保持 3001（通过 `dev:server` 脚本或环境变量控制）

#### Task 2.2：完善 Session CRUD 路由

**修改**：`server/src/main.rs`

添加缺失的路由：
- `POST /api/sessions` — 创建 session（已有 `tmux::new_session`）
- `DELETE /api/sessions/:name` — 删除 session（已有 `tmux::kill_session`）
- `PUT /api/sessions/:name` — 重命名 session（已有 `tmux::rename_session`）

请求体解析使用 `axum::extract::Json<T>` + `axum::extract::Path<String>`。

#### Task 2.3：统一错误处理

**文件**：`server/src/error.rs`（新建）

定义 `AppError` 枚举 + `IntoResponse` 实现，统一返回 `{ "error": "code", "message": "..." }` 格式。

#### Task 2.4：WebSocket 改进

**修改**：`server/src/main.rs` 中的 `handle_socket`

实现：
- JSON 消息格式 `{ "type": "...", "data": { ... } }`
- `sessions_update` 推送：后台 task 每 3 秒检测变化，有变化时广播
- `ping/pong` 心跳

---

### Phase 3：依赖检测与安装（FR-6）

**目标**：系统依赖检测 API + WebSocket 安装日志流

#### Task 3.1：系统检测模块

**文件**：`server/src/system.rs`（新建）

实现：
- `detect_os()` — 返回 OS 类型和架构
- `detect_package_manager()` — 检测 brew/apt/dnf
- `check_dependency(name)` — 用 `which` crate 检测 + 版本解析
- `check_all_deps()` — 检测所有预定义依赖

#### Task 3.2：依赖检测 API

**修改**：`server/src/main.rs`

添加路由 `GET /api/system/deps`，调用 `system::check_all_deps()`。

#### Task 3.3：安装执行与 WebSocket 流

**修改**：`server/src/system.rs` + `server/src/main.rs`

实现：
- `POST /api/system/install` — 验证白名单、启动异步安装进程、返回 task_id
- `WS /ws/install/:task_id` — 客户端连接后接收逐行日志
- 使用 `tokio::process::Command` + `BufReader::lines()` 逐行读取
- 通过 `tokio::sync::broadcast` channel 推送到 WebSocket

#### Task 3.4：服务重启端点

**修改**：`server/src/main.rs`

- `POST /api/system/restart` — 优雅关闭后退出码 42

---

### Phase 4：前端功能完善（FR-6, FR-7）

**目标**：Session CRUD UI + 依赖引导页 + 极客风格

#### Task 4.1：前端项目结构

```
web/src/
├── App.tsx                    # 路由入口
├── main.tsx
├── index.css
├── components/
│   ├── SessionCard.tsx        # Session 卡片组件
│   ├── SessionGrid.tsx        # Session 网格列表
│   ├── CreateSessionModal.tsx # 创建 session 弹窗
│   ├── SetupWizard.tsx        # 依赖引导页
│   ├── DependencyItem.tsx     # 单个依赖项展示
│   ├── InstallLog.tsx         # 安装日志终端
│   └── Header.tsx             # 顶部栏
├── hooks/
│   ├── useSessions.ts         # session 数据 hook
│   ├── useWebSocket.ts        # WebSocket 连接 hook
│   └── useDeps.ts             # 依赖检测 hook
└── lib/
    ├── api.ts                 # REST API 客户端
    └── types.ts               # TypeScript 类型定义
```

#### Task 4.2：Session CRUD 交互

- 创建 session：点击 "+" 卡片 → 弹出命名输入 → POST 创建
- 删除 session：卡片悬停显示 "x" 按钮 → 确认后 DELETE
- 重命名 session：双击名称 → 内联编辑 → 失焦后 PUT

#### Task 4.3：依赖引导页

- 首次加载调用 `GET /api/system/deps`
- 如果有必需依赖缺失 → 展示 SetupWizard
- 终端风格逐行展示：`[✓]`/`[✗]`/`[!]` + 安装按钮
- 点击安装 → POST + 连接 WebSocket → 实时展示日志
- 全部就绪 → 显示 "Restart 0xMux" 按钮

#### Task 4.4：极客 UI 增强

- ASCII Art logo 动画（首次加载）
- Session 卡片霓虹边框悬停效果
- 状态指示灯呼吸动画
- 响应式：PC 三列 / 平板两列 / 手机单列

---

### Phase 5：静态文件嵌入（FR-4）

**目标**：构建产出单个可执行文件

#### Task 5.1：配置 rust-embed

**修改**：`server/Cargo.toml`

```toml
[dependencies]
rust-embed = { version = "8.5", features = ["axum", "mime-guess"], optional = true }
mime_guess = { version = "2.0", optional = true }

[features]
embed-frontend = ["rust-embed", "mime_guess"]
```

#### Task 5.2：实现条件 static serving

**文件**：`server/src/static_files.rs`（新建）

- `#[cfg(feature = "embed-frontend")]`: 使用 `RustEmbed` 嵌入 `web/dist/`
- 非 API/WS 路由 fallback 到 `index.html`（SPA 路由支持）
- 排除 `.map` 文件

#### Task 5.3：构建脚本验证

- `npm run build` 完成完整构建
- 产出二进制可独立运行
- 浏览器访问二进制启动的服务可看到完整 UI

---

### Phase 6：npm 分发包（FR-5）

**目标**：支持 `npx 0xmux` 和 `npm i -g 0xmux`

#### Task 6.1：创建 npm 包结构

```
npm/
├── 0xmux/                     # 主包
│   ├── package.json
│   ├── bin/0xmux.js           # JS 启动器
│   └── scripts/install.js     # postinstall fallback
└── platform/                  # 平台包模板
    └── package.json.template
```

#### Task 6.2：JS 启动器

`npm/0xmux/bin/0xmux.js`:
- 检测 `process.platform` + `process.arch`
- 尝试 resolve 对应的 `@0xmux/<platform>` 包
- Fallback 到同目录下的二进制
- `spawnSync` 执行，传递 `process.argv`
- 特殊退出码 42 → 自动重启

#### Task 6.3：CI/CD 构建流水线

`.github/workflows/release.yml`:
- Tag 触发
- 矩阵构建：macOS arm64 + macOS x64 + Linux x64
- 前端构建 → 后端带 embed-frontend 构建
- 产物上传 GitHub Release
- 自动生成平台 npm 包并发布

---

### Phase 7：Homebrew 分发（FR-5）

**目标**：支持 `brew install 0xmux`

#### Task 7.1：创建 Homebrew Tap

仓库 `homebrew-0xmux/Formula/0xmux.rb`:
- 按 macOS arch 选择对应二进制 tarball
- 从 GitHub Release 下载
- 安装到 `bin/0xmux`

#### Task 7.2：CI 自动更新 Formula

Release 工作流添加步骤：
- 计算每个 tarball 的 SHA256
- 更新 Formula 中的版本号和 hash
- 提交到 tap 仓库

---

### Phase 8：终端启动体验（FR-7）

**目标**：终端 ASCII Art + 启动信息

#### Task 8.1：ASCII Art Logo

服务启动时输出：
```
  ██████╗ ██╗  ██╗███╗   ███╗██╗   ██╗██╗  ██╗
 ██╔═████╗╚██╗██╔╝████╗ ████║██║   ██║╚██╗██╔╝
 ██║██╔██║ ╚███╔╝ ██╔████╔██║██║   ██║ ╚███╔╝
 ████╔╝██║ ██╔██╗ ██║╚██╔╝██║██║   ██║ ██╔██╗
 ╚██████╔╝██╔╝ ██╗██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗
  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝

 0xMux v0.1.0
 → http://localhost:1234
```

---

## 实施顺序与依赖关系

```
Phase 1 (Monorepo 基础)
    │
    ├──→ Phase 2 (后端 API)
    │        │
    │        ├──→ Phase 3 (依赖检测)
    │        │
    │        └──→ Phase 5 (静态文件嵌入)
    │                  │
    │                  └──→ Phase 6 (npm 分发)
    │                            │
    │                            └──→ Phase 7 (Homebrew)
    │
    └──→ Phase 4 (前端功能)
              │
              └──→ Phase 8 (启动体验)
```

**关键路径**：Phase 1 → Phase 2 → Phase 5 → Phase 6

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Rust 交叉编译失败 | Phase 6/7 延迟 | 使用 cross 或 GitHub Actions 原生 runner |
| npm 包大小过大 | 用户体验差 | strip 二进制 + opt-level=z + UPX 压缩 |
| Linux sudo 需求 | 安装功能受限 | 提供手动安装命令 fallback |
| WebSocket 重连不稳定 | 安装日志丢失 | 服务端缓存最近日志，重连后补发 |
| tmux 版本兼容性 | 解析失败 | 测试 tmux 2.6~3.4，使用稳定的 format 字符串 |

---

## 生成物清单

| 文件 | 路径 | 状态 |
|------|------|------|
| 功能规格 | `spec/1-monorepo-arch-design/spec.md` | 已有 |
| 需求检查表 | `spec/1-monorepo-arch-design/checklists/requirements.md` | 已有 |
| 研究报告 | `spec/1-monorepo-arch-design/research.md` | 本次生成 |
| 数据模型 | `spec/1-monorepo-arch-design/data-model.md` | 本次生成 |
| REST API 契约 | `spec/1-monorepo-arch-design/contracts/rest-api.md` | 本次生成 |
| WebSocket 契约 | `spec/1-monorepo-arch-design/contracts/websocket-api.md` | 本次生成 |
| 快速开始 | `spec/1-monorepo-arch-design/quickstart.md` | 本次生成 |
| 实施计划 | `spec/1-monorepo-arch-design/plan.md` | 本次生成 |
