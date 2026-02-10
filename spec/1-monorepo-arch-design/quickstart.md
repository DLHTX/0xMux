# 快速开始：0xMux 开发指南

**日期**: 2026-02-09

---

## 前置要求

- Node.js >= 18 或 Bun
- Rust stable (rustup)
- cargo-watch (`cargo install cargo-watch`)
- tmux（可选，用于实际功能测试）

---

## 开发模式

### 1. 克隆并安装

```bash
git clone https://github.com/<user>/0xMux.git
cd 0xMux
cd web && bun install && cd ..
```

### 2. 启动开发服务器

```bash
npm run dev
```

这将同时启动：
- **WEB** (cyan): `vite build --watch` 持续编译到 `web/dist/`
- **API** (magenta): Rust/Axum server → `http://localhost:1234`（同时服务 API + 静态文件）

### 3. 打开浏览器

访问 `http://localhost:1234`

---

## 生产构建

### 1. 构建前端

```bash
cd web && bun run build && cd ..
```

产出 `web/dist/` 目录。

### 2. 构建后端（嵌入前端）

```bash
cd server && cargo build --release --features embed-frontend
```

产出单个二进制文件：`server/target/release/oxmux-server`

### 3. 运行

```bash
./server/target/release/oxmux-server
# 或带参数
./server/target/release/oxmux-server --port 8080 --host 0.0.0.0
```

---

## 项目结构

```
0xMux/
├── package.json              # Monorepo 编排入口
├── README.md
├── docs/
│   └── PRODUCT.md            # 产品设计文档
├── spec/                     # 功能规格与设计文档
│   └── 1-monorepo-arch-design/
├── server/                   # Rust 后端
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs           # Axum 服务器入口
│       ├── tmux.rs           # tmux CLI 交互层
│       ├── system/           # 系统管理（依赖检测、安装）
│       └── config.rs         # CLI 参数与配置
├── web/                      # React 前端
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── index.css          # Tailwind + 极客主题
│       ├── App.tsx
│       ├── components/        # UI 组件
│       ├── hooks/             # 自定义 hooks
│       └── lib/               # 工具函数
└── npm/                       # npm 分发包
    ├── 0xmux/                 # 主包（JS 启动器）
    └── @0xmux/               # 平台包
        ├── darwin-arm64/
        ├── darwin-x64/
        └── linux-x64/
```

---

## 关键技术约定

| 约定 | 说明 |
|------|------|
| REST API 前缀 | `/api/` |
| WebSocket 端点 | `/ws`, `/ws/install/:task_id` |
| 默认端口（生产） | 1234 |
| 默认端口（前端开发） | 3000 |
| 默认端口（后端开发） | 3001 |
| 默认绑定地址 | 127.0.0.1 |
| 前端构建输出 | `web/dist/` |
| 嵌入 Feature | `embed-frontend` |

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `bun run dev` | 同时启动 vite build --watch + Rust server |
| `bun run build` | 构建前端 + 后端（生产模式） |
| `bun run dev:web` | 仅启动前端持续编译 |
| `bun run dev:api` | 仅启动后端（含 hot reload） |
| `cargo test -p oxmux-server` | 运行后端测试 |
| `cd web && bun run lint` | 前端代码检查 |
