# 研究报告：0xMux Monorepo 架构设计

**日期**: 2026-02-09
**分支**: `1-monorepo-arch-design`
**状态**: 已完成

---

## 1. 静态文件嵌入方案

### 决策：使用 `rust-embed` + 条件编译

**理由**：
- 业界标准方案，4.5k+ GitHub stars，活跃维护（最新版 8.5+）
- 内置 Axum 集成（`axum` feature）、自动 MIME 类型检测
- 支持条件编译（dev 直接代理、prod 嵌入文件）
- `include_dir` 更适合 CLI 工具读取文件，不适合 HTTP serving

**备选方案**：
- `include_dir` — 无 HTTP/MIME 支持，需要大量手动适配
- `include_bytes!` — 太底层，无 MIME 检测
- `tower-http::ServeDir` — 仅适合开发模式，不能嵌入二进制

**实现模式**：
- 使用 `#[cfg(feature = "embed-frontend")]` Cargo feature 区分 dev/prod
- Dev 模式：前端运行 Vite dev server，Rust 不 serve 静态文件
- Prod 模式：`rust-embed` 将 `web/dist/` 嵌入二进制，fallback 到 `index.html`（SPA 路由）

---

## 2. npm 二进制分发方案

### 决策：optionalDependencies 平台包模式

**理由**：
- 2025-2026 年 Rust 工具的行业标准（Biome、esbuild、SWC 均使用此模式）
- npm 自动根据 `os` + `cpu` 字段选择正确的平台包
- 原生支持 `npx` 无需额外配置

**备选方案**：
- postinstall 下载 — 不可靠（网络问题、CI 环境限制），作为 fallback
- napi-rs — 过于复杂，适用于 Node.js 绑定场景，不适用于 CLI 分发
- 单包多平台 — npm 包体积过大

**包结构**：
```
0xmux (主包，JS 启动器)
├── optionalDependencies:
│   ├── @0xmux/darwin-arm64   (macOS Apple Silicon)
│   ├── @0xmux/darwin-x64     (macOS Intel)
│   └── @0xmux/linux-x64      (Linux x86_64)
```

**启动器逻辑**：JS 脚本检测 `process.platform` + `process.arch`，resolve 对应平台包的二进制文件，`spawnSync` 执行。

---

## 3. Homebrew 分发方案

### 决策：自建 Tap + 预编译二进制分发

**理由**：
- ripgrep、bat、fd 等 Rust CLI 工具的标准做法
- 用户安装速度快（下载预编译 binary，不需要编译）
- 通过 GitHub Releases 托管二进制文件

**备选方案**：
- 提交到 homebrew-core — 门槛高，需要足够 star 和用户量，后期目标
- 源码编译 — 需要用户安装 Rust 工具链，安装时间长

**Tap 结构**：
```
homebrew-0xmux/
└── Formula/
    └── 0xmux.rb    # 按 os+cpu 下载对应二进制
```

**CI/CD**：GitHub Actions tag 触发 → 多平台交叉编译 → 上传 GitHub Release → 自动更新 Formula SHA256

---

## 4. Monorepo 统一开发命令

### 决策：concurrently + cargo-watch

**理由**：
- `concurrently` 是最成熟、零配置的 npm 多进程管理工具
- `cargo-watch` 是 Rust 热重载的事实标准
- 组合简单可靠，无需额外学习成本
- 支持颜色区分日志、`--kill-others` 统一退出

**备选方案**：
- `just` — 适合复杂任务编排，当前阶段过度
- `mprocs` — 需要 YAML 配置，增加复杂度
- `overmind` — 依赖 tmux（循环依赖问题）

**配置**：
```json
{
  "dev": "concurrently -n WEB,SERVER -c cyan.bold,magenta.bold --kill-others \"npm run dev:web\" \"npm run dev:server\"",
  "dev:web": "cd web && bun dev",
  "dev:server": "cd server && cargo watch -q -c -w src -x run"
}
```

---

## 5. 依赖检测与安装系统

### 决策：`which` crate 检测 + `tokio::process::Command` 异步安装 + WebSocket 流式输出

**理由**：
- `which` crate 是 Rust 中检测 PATH 工具的标准方式
- `tokio::process::Command` + `AsyncBufReadExt` 可逐行读取安装输出
- Axum 原生 WebSocket 支持，无需额外依赖

**安全措施**：
- 白名单验证：只允许预定义的包名（tmux、claude-code）
- 正则验证包名：`^[a-zA-Z0-9_-]+$`
- 不使用 shell 执行：直接 `Command::new(binary).arg(package)`

**OS 检测**：
- macOS → 使用 `brew install`
- Linux → 按优先级检测 `apt` > `dnf` > `yum` > `pacman`

**已知限制**：
- Linux 安装需要 sudo 权限 → 前端展示手动安装命令作为 fallback
- 包管理器输出格式不统一 → 逐行推送原始输出，不解析进度百分比

---

## 6. 服务重启机制

### 决策：前端轮询检测 + 后端进程优雅退出

**理由**：
- Rust 进程自重启复杂且不可靠
- 简单方案：后端退出 → 前端检测连接断开 → 提示用户重新执行 `0xmux`
- 或者：npm 启动器包装进程，检测退出码后自动重启

**实现**：
- 后端收到重启请求 → 优雅关闭连接 → `std::process::exit(0)`
- 前端检测 WebSocket 断开 → 显示 "Reconnecting..." 动画 → 轮询 `/api/health`
- npm 启动器：如果退出码为特定值（如 42），自动重启子进程
