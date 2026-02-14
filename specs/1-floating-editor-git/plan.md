# Implementation Plan: Floating Code Editor + Git Panel

**Feature ID**: 1-floating-editor-git
**Date**: 2026-02-13
**Status**: Draft

---

## 技术栈决策

| 层 | 技术 | 说明 |
|----|------|------|
| 编辑器 | @monaco-editor/react v4.7 + monaco-editor v0.52 | 多 tab、diff、主题自定义 |
| Worker 本地化 | @tomjs/vite-plugin-monaco-editor | local: true，无 CDN |
| 浮动窗口 | react-rnd v10.4 | 拖拽 + 缩放 + bounds |
| 文件树 | react-arborist | 虚拟滚动，自定义渲染 |
| 后端 Git | git CLI (std::process::Command) | 复用 tmux.rs 模式 |
| 后端搜索 | rg CLI (tokio::process::Command) | 回退: walkdir + regex |
| 路径安全 | canonicalize + starts_with | 三步验证模式 |

---

## 实施阶段

### Phase 1: 后端文件系统 API (foundation)

**目标**: 建立安全的文件读写和搜索基础设施

**新增文件**:
```
server/src/services/fs.rs       — 文件操作 + 路径验证
server/src/services/search.rs   — rg/walkdir 搜索封装
server/src/handlers/files.rs    — Axum handler 层
server/src/models/files.rs      — FileNode, FileContent, SearchMatch 等
```

**修改文件**:
```
server/src/router.rs            — 注册新路由
server/src/error.rs             — 添加 Forbidden, PayloadTooLarge 变体
```

**关键实现**:
1. `validate_path(root, user_path) -> Result<PathBuf>` — 路径遍历防护核心
2. `GET /api/files/tree` — 目录列表，懒加载（depth=1）
3. `GET /api/files/read` — 文件读取，二进制检测 + 大小限制 (5MB)
4. `PUT /api/files/write` — 文件写入，认证 + 路径验证
5. `GET /api/files/search` — rg CLI 调用，JSON 输出解析，max 200 结果

**验收标准**:
- curl 能正确读写文件
- 路径遍历攻击被拒绝 (../../etc/passwd)
- 二进制文件返回 400
- 超大文件返回 400

---

### Phase 2: 后端 Git API

**目标**: 提供只读 Git 信息接口

**新增文件**:
```
server/src/services/git.rs      — git CLI 封装 + 输出解析
server/src/handlers/git.rs      — Axum handler 层
server/src/models/git.rs        — GitStatus, GitLogEntry 等
```

**修改文件**:
```
server/src/router.rs            — 注册 /api/git/* 路由
```

**关键实现**:
1. `git_cmd(repo_path) -> Command` — 工厂函数，env 隔离
2. `GET /api/git/status` — 解析 `git status --porcelain=v2 --branch`
3. `GET /api/git/diff` — 获取 HEAD 版本 + 工作区版本（给 DiffEditor）
4. `GET /api/git/log` — 解析结构化 log 输出
5. `GET /api/git/branches` — 解析 branch --format 输出

**验收标准**:
- 在 0xMux 项目自身上运行，返回正确的 git 状态
- 非 git 仓库返回适当错误

---

### Phase 3: 前端 Activity Bar + 文件浏览器

**目标**: 替换当前侧边栏，实现多面板切换 + 文件树

**新增文件**:
```
web/src/components/sidebar/ActivityBar.tsx       — 图标条
web/src/components/sidebar/FileExplorer.tsx      — 文件树面板
web/src/components/sidebar/SidebarContainer.tsx  — 面板容器（切换不同视图）
web/src/hooks/useFileTree.ts                     — 文件树数据 + 懒加载 hook
```

**修改文件**:
```
web/src/App.tsx                                  — 布局结构调整
web/src/components/session/SessionSidebar.tsx    — 作为 ActivityView='sessions' 的子视图
web/src/lib/types.ts                             — ActivityView 等类型
web/src/lib/icons.ts                             — 新增 File, Search, GitBranch 图标
web/src/lib/api.ts                               — 新增文件 API 调用
web/src/lib/i18n.ts                              — 新增中文翻译
```

**布局变更**:
```
Before: [ Header ]
        [ SessionSidebar (48/260px) | SplitWorkspace ]

After:  [ Header ]
        [ ActivityBar (48px) | SidebarPanel (0/260px) | SplitWorkspace ]
```

- ActivityBar 始终可见（4 个图标：终端、文件、搜索、Git）
- 点击图标展开对应的 SidebarPanel
- 再次点击或 `Ctrl+B` 折叠面板（ActivityBar 保留）

**验收标准**:
- 4 个 Activity Bar 图标可点击切换
- 文件树正确显示项目目录结构
- 双击文件能触发事件（Phase 5 连接编辑器）
- 现有 Sessions 面板功能不受影响

---

### Phase 4: 浮动编辑器窗口 + Monaco 集成

**目标**: 实现可拖拽的浮动编辑器窗口

**新增文件**:
```
web/src/components/editor/FloatingWindow.tsx     — react-rnd 窗口容器
web/src/components/editor/EditorPane.tsx         — Monaco Editor 包装
web/src/components/editor/EditorTabs.tsx         — 标签栏
web/src/components/editor/EditorStatusBar.tsx    — 底部状态栏
web/src/hooks/useFloatingEditor.ts               — 浮动窗口状态管理
web/src/hooks/useMonacoTheme.ts                  — Monaco 主题与 0xMux 主题同步
```

**修改文件**:
```
web/src/App.tsx                                  — 渲染浮动窗口层
web/src/lib/types.ts                             — FloatingWindowState, EditorTab 类型
web/vite.config.ts                               — 添加 monaco plugin
web/package.json                                 — 新增依赖
```

**关键实现**:
1. `FloatingWindow` — react-rnd 包装，标题栏拖拽、边角缩放、透明度 slider
2. `EditorPane` — `React.lazy(() => import(...))` 懒加载 Monaco
3. `EditorTabs` — 多文件标签，dirty 指示器，关闭按钮
4. 主题同步 — 监听 CSS 变量变化，动态更新 Monaco 主题
5. `loader.config({ monaco })` — 本地 Monaco 实例

**验收标准**:
- 浮动窗口可拖拽、可缩放、可调透明度
- Monaco 编辑器正确渲染代码，语法高亮
- 多标签切换保留各 tab 状态
- Ctrl+S 保存文件
- 懒加载：初次打开编辑器前不加载 Monaco bundle

---

### Phase 5: 搜索面板 + Git 面板

**目标**: 完成侧边栏剩余两个面板

**新增文件**:
```
web/src/components/sidebar/SearchPanel.tsx       — 搜索面板
web/src/components/sidebar/GitPanel.tsx          — Git 状态面板
web/src/components/sidebar/GitFileList.tsx       — 变更文件列表
web/src/components/sidebar/GitCommitList.tsx     — 提交历史列表
web/src/hooks/useSearch.ts                       — 搜索状态 + debounce
web/src/hooks/useGitStatus.ts                    — Git 状态 + 自动刷新
```

**修改文件**:
```
web/src/components/sidebar/SidebarContainer.tsx  — 注册新面板
web/src/lib/api.ts                               — 新增搜索和 Git API 调用
web/src/lib/i18n.ts                              — 新增翻译
```

**关键实现**:
1. SearchPanel — 输入框 + regex/case 切换 + glob 过滤 + 结果列表（按文件分组）
2. GitPanel — 分支显示 + ahead/behind + 文件变更列表 + 提交历史
3. 搜索结果点击 → 打开浮动编辑器并跳转到匹配行
4. Git 文件点击 → 打开浮动编辑器 DiffEditor 模式
5. 搜索 debounce 300ms

**验收标准**:
- 搜索返回正确结果，支持 regex
- Git 面板显示正确的分支和文件状态
- 点击搜索结果打开编辑器
- 点击 Git 变更文件打开 diff 视图

---

### Phase 6: @ 快捷触发 + 集成测试

**目标**: 终端内 @ 触发文件快搜 + 全功能端到端测试

**新增文件**:
```
web/src/components/editor/QuickFileSearch.tsx    — @ 触发的快速搜索弹窗
```

**修改文件**:
```
web/src/components/terminal/TerminalPane.tsx     — 拦截 @ 输入
web/src/hooks/useSettings.ts                     — 新增 @ 触发开关
web/src/lib/i18n.ts                              — 新增翻译
```

**关键实现**:
1. 在 TerminalPane 的 `onData` 中检测 `@` 输入
2. 弹出 QuickFileSearch 弹窗（fuzzy 文件名搜索）
3. 选择文件 → 打开编辑器
4. Escape → 关闭弹窗 + 将 `@` 传递给终端
5. Settings 中可禁用此功能

**验收标准**:
- @ 触发弹窗，选择文件后打开编辑器
- Escape 正确取消
- 可在设置中禁用
- 全流程端到端测试通过

---

## 依赖安装

### 前端 (web/)

```bash
npm i monaco-editor @monaco-editor/react react-rnd react-arborist
npm i -D @tomjs/vite-plugin-monaco-editor
```

### 后端 (server/)

无需新增 crate。可选: `soft-canonicalize = "0.1"`.

---

## 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| Monaco bundle 大 (~2MB gzip) | React.lazy 懒加载，不影响初始加载 |
| Monaco worker 与 rust-embed | 构建后验证 dist/ 包含 worker 文件 |
| @ 触发误触 | 默认开启但可在设置中关闭 |
| 大仓库搜索慢 | rg + 200 结果上限 + glob 过滤 |
| 路径遍历攻击 | canonicalize 三步验证 |
| Git 仓库检测 | `git rev-parse --show-toplevel` 优雅失败 |

---

## 里程碑

| Phase | 预期产出 | 依赖 |
|-------|----------|------|
| Phase 1 | 文件系统 API 可用 | 无 |
| Phase 2 | Git API 可用 | 无（可与 Phase 1 并行） |
| Phase 3 | Activity Bar + 文件浏览器 | Phase 1 |
| Phase 4 | 浮动编辑器窗口 | Phase 1 |
| Phase 5 | 搜索 + Git 面板 | Phase 1, 2, 4 |
| Phase 6 | @ 触发 + 集成测试 | Phase 4, 5 |

**并行建议**: Phase 1 和 Phase 2 可以并行开发（后端无前端依赖）。Phase 3 和 Phase 4 也可以并行（侧边栏和编辑器独立）。
