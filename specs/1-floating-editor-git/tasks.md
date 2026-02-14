# Tasks: Floating Code Editor + Git Panel

**Feature ID**: 1-floating-editor-git
**Generated**: 2026-02-13

---

## Phase 1: 后端文件系统 API

- [x] **T-1.1** `[backend]` `[foundation]` 创建路径验证工具函数 `validate_path(root, user_path)`
  - canonicalize + starts_with 三步验证
  - 拒绝 `..`、绝对路径、符号链接逃逸
  - 单元测试覆盖常见攻击向量
  - `server/src/services/fs.rs`

- [x] **T-1.2** `[backend]` `[foundation]` 创建文件操作服务
  - 目录列表 (depth=1 懒加载)
  - 文件读取 (二进制检测 + 5MB 限制)
  - 文件写入 (路径验证 + 认证)
  - 语言检测 (扩展名 → Monaco language id 映射)
  - `server/src/services/fs.rs`, `server/src/models/files.rs`
  - **blockedBy**: T-1.1

- [x] **T-1.3** `[backend]` 创建搜索服务 (rg CLI 封装)
  - 异步调用 `rg --json`
  - 解析 JSON Lines 输出
  - 支持 regex、case、glob 参数
  - 200 结果上限截断
  - rg 不可用时降级 fallback
  - `server/src/services/search.rs`

- [x] **T-1.4** `[backend]` 创建文件系统 API handlers
  - `GET /api/files/tree`
  - `GET /api/files/read`
  - `PUT /api/files/write`
  - `GET /api/files/search`
  - `server/src/handlers/files.rs`
  - **blockedBy**: T-1.2, T-1.3

- [x] **T-1.5** `[backend]` 注册文件 API 路由 + 错误扩展
  - 在 router.rs 注册 `/api/files/*` 路由
  - 在 error.rs 添加 `Forbidden`, `PayloadTooLarge` 变体
  - `server/src/router.rs`, `server/src/error.rs`

---

## Phase 2: 后端 Git API (可与 Phase 1 并行)

- [x] **T-2.1** `[backend]` `[foundation]` 创建 git CLI 服务
  - `git_cmd(repo_path)` 工厂函数
  - `GIT_TERMINAL_PROMPT=0` + `GIT_OPTIONAL_LOCKS=0`
  - `parse_status()` — 解析 porcelain=v2 输出
  - `parse_log()` — 解析 NUL 分隔的 log 输出
  - `parse_branches()` — 解析 --format 输出
  - `get_diff_content()` — 获取 HEAD + 工作区版本
  - `server/src/services/git.rs`, `server/src/models/git.rs`

- [x] **T-2.2** `[backend]` 创建 Git API handlers
  - `GET /api/git/status`
  - `GET /api/git/diff?path=&staged=`
  - `GET /api/git/log?limit=`
  - `GET /api/git/branches`
  - `server/src/handlers/git.rs`

- [x] **T-2.3** `[backend]` 注册 Git API 路由
  - 在 router.rs 注册 `/api/git/*` 路由
  - 所有端点需认证
  - `server/src/router.rs`

---

## Phase 3: 前端 Activity Bar + 文件浏览器

- [x] **T-3.1** `[frontend]` `[foundation]` 创建 Activity Bar 组件
  - 固定 48px 宽图标条 (Sessions / Files / Search / Git)
  - 激活状态高亮
  - 点击切换、再次点击折叠
  - 全局快捷键: `Ctrl+E` 切换文件面板, `Ctrl+Shift+F` 切换搜索面板
  - 匹配 brutalist 风格 (CSS 变量)
  - `web/src/components/sidebar/ActivityBar.tsx`
  - **blocks**: T-3.3

- [x] **T-3.2** `[frontend]` 创建 SidebarContainer 面板容器
  - 根据 activeView 渲染不同面板
  - 宽度 0px (折叠) / 220px (展开)，动画过渡
  - `web/src/components/sidebar/SidebarContainer.tsx`
  - **blocks**: T-3.3

- [x] **T-3.3** `[frontend]` 重构 App.tsx 布局 — 集成 Activity Bar
  - 替换当前 sidebar 为 ActivityBar + SidebarContainer
  - Sessions 面板作为 ActivityView='sessions' 子视图
  - 保持 Ctrl+B 快捷键
  - 更新移动端布局（Activity Bar 隐藏）
  - `web/src/App.tsx`, `web/src/components/session/SessionSidebar.tsx`
  - **blockedBy**: T-3.1, T-3.2

- [x] **T-3.4** `[frontend]` 创建 FileExplorer 文件树面板
  - 使用 react-arborist 渲染文件树
  - 懒加载子目录（展开时请求 API）
  - 文件类型图标 + dotfile 淡化
  - 双击文件触发 onFileOpen 事件
  - .git, node_modules, target 默认折叠
  - 展开全部 / 折叠全部 工具按钮 (FR-4.7)
  - `web/src/components/sidebar/FileExplorer.tsx`, `web/src/hooks/useFileTree.ts`
  - **blockedBy**: T-1.4

- [x] **T-3.5** `[frontend]` 添加前端文件 API 客户端
  - getFileTree(path, depth)
  - readFile(path)
  - writeFile(path, content)
  - searchFiles(query, options)
  - `web/src/lib/api.ts`
  - **blockedBy**: T-1.4

- [x] **T-3.6** `[frontend]` 新增图标 + i18n 翻译
  - icons.ts: folder, file, search, git-branch, git-commit 等
  - i18n.ts: 文件浏览器、搜索、Git 面板相关中文
  - `web/src/lib/icons.ts`, `web/src/lib/i18n.ts`

- [x] **T-3.7** `[frontend]` 新增 TypeScript 类型定义
  - ActivityView, FileTreeNode, SearchOptions, SearchMatch
  - GitStatus, GitChangedFile, GitCommit, GitBranch
  - FloatingWindowState, EditorTab
  - `web/src/lib/types.ts`

---

## Phase 4: 浮动编辑器窗口 + Monaco 集成 (可与 Phase 3 并行)

- [x] **T-4.1** `[frontend]` `[foundation]` 安装依赖 + 配置 Vite Monaco plugin
  - `npm i monaco-editor @monaco-editor/react react-rnd react-arborist`
  - `npm i -D @tomjs/vite-plugin-monaco-editor`
  - vite.config.ts 添加 monaco({ local: true })
  - 验证 `npm run build` 成功，dist/ 包含 worker 文件
  - `web/vite.config.ts`, `web/package.json`

- [x] **T-4.2** `[frontend]` 创建 Monaco 主题同步 hook
  - 读取 CSS 变量映射到 monaco editor.defineTheme
  - 监听主题变化动态更新
  - 'brutalist-dark' 主题（黑底、绿光标、像素风）
  - `web/src/hooks/useMonacoTheme.ts`

- [x] **T-4.3** `[frontend]` 创建 FloatingWindow 组件
  - react-rnd 包装: 拖拽(标题栏)、缩放(边角)、bounds="parent"
  - 标题栏: 文件名 + 透明度 slider + 最小化 + 关闭按钮
  - 双击标题栏切换最小化/恢复 (FR-1.8)
  - z-index 管理 (z-50 ~ z-100)
  - 位置/大小持久化 (localStorage)
  - 最小化：折叠为标题栏
  - `web/src/components/editor/FloatingWindow.tsx`

- [x] **T-4.4** `[frontend]` 创建 EditorPane 组件 (Monaco 懒加载包装)
  - React.lazy + Suspense 包装 @monaco-editor/react
  - loader.config({ monaco }) 本地实例
  - 支持 edit 模式和 diff 模式切换
  - automaticLayout: true（跟随窗口缩放）
  - `web/src/components/editor/EditorPane.tsx`
  - **blockedBy**: T-4.1, T-4.2

- [x] **T-4.5** `[frontend]` 创建 EditorTabs 标签栏
  - 多标签显示（文件名 + 语言图标）
  - Dirty 指示器（未保存点）
  - 关闭单个标签 / 关闭其他
  - 点击切换标签（path prop 自动切换 model）
  - `web/src/components/editor/EditorTabs.tsx`

- [x] **T-4.6** `[frontend]` 创建 EditorStatusBar 底部状态栏
  - 显示: 语言 | 行:列 | 编码(UTF-8) | 文件大小
  - 匹配 brutalist 风格
  - `web/src/components/editor/EditorStatusBar.tsx`

- [x] **T-4.7** `[frontend]` 创建 useFloatingEditor hook
  - 浮动窗口状态管理 (open/close/minimize/restore)
  - Tab 管理 (openFile, closeTab, setActiveTab)
  - Ctrl+S 保存 (调用 writeFile API)
  - 从文件树、搜索结果、Git diff 打开文件
  - `web/src/hooks/useFloatingEditor.ts`
  - **blockedBy**: T-3.5

- [x] **T-4.8** `[frontend]` 在 App.tsx 中渲染浮动窗口层
  - 在 Modal 之前、SplitWorkspace 之后渲染
  - 连接 useFloatingEditor hook
  - `web/src/App.tsx`
  - **blockedBy**: T-4.3, T-4.4, T-4.5, T-4.6, T-4.7

---

## Phase 5: 搜索面板 + Git 面板

- [x] **T-5.1** `[frontend]` 创建 SearchPanel 搜索面板
  - 输入框 + regex 切换 + case 切换 + glob 过滤
  - 结果按文件分组，显示行号 + 匹配行
  - 搜索 debounce 300ms
  - 点击结果 → 调用 useFloatingEditor.openFile(path, line)
  - `web/src/components/sidebar/SearchPanel.tsx`, `web/src/hooks/useSearch.ts`
  - **blockedBy**: T-3.5, T-4.7

- [x] **T-5.2** `[frontend]` 添加前端 Git API 客户端
  - getGitStatus()
  - getGitDiff(path, staged)
  - getGitLog(limit)
  - getGitBranches()
  - `web/src/lib/api.ts`
  - **blockedBy**: T-2.2

- [x] **T-5.3** `[frontend]` 创建 GitPanel Git 面板
  - 当前分支 + ahead/behind 徽章
  - 本地和远程分支列表（可折叠区域）(FR-6.6)
  - 变更文件列表 (分 staged / unstaged / untracked 组)
  - 文件状态图标 (M/A/D/R/?)
  - 点击文件 → 打开 DiffEditor
  - 手动刷新按钮
  - `web/src/components/sidebar/GitPanel.tsx`, `web/src/components/sidebar/GitFileList.tsx`
  - **blockedBy**: T-5.2, T-5.5, T-4.7

- [x] **T-5.4** `[frontend]` 创建 GitCommitList 提交历史
  - 最近 20 条 commit
  - 显示 shortHash + message + author + 相对时间
  - refs 标签 (HEAD, tag, branch)
  - `web/src/components/sidebar/GitCommitList.tsx`
  - **blockedBy**: T-5.2

- [x] **T-5.5** `[frontend]` 创建 useGitStatus hook
  - 面板打开时自动获取状态
  - 手动刷新功能
  - 错误处理（非 git 仓库提示）
  - `web/src/hooks/useGitStatus.ts`
  - **blockedBy**: T-5.2

---

## Phase 6: @ 快捷触发 + 集成测试

- [x] **T-6.1** `[frontend]` 创建 QuickFileSearch 弹窗
  - 弹窗式文件名快搜（fuzzy match）
  - 输入即搜，键盘导航（↑↓ + Enter）
  - 选中文件 → 打开编辑器
  - Escape → 关闭弹窗 + 传递 @ 到终端
  - `web/src/components/editor/QuickFileSearch.tsx`
  - **blockedBy**: T-4.7

- [x] **T-6.2** `[frontend]` TerminalPane 中拦截 @ 输入
  - 在 onData 回调中检测 `@` 字符
  - 显示 QuickFileSearch 弹窗
  - 设置中可禁用此功能
  - `web/src/components/terminal/TerminalPane.tsx`, `web/src/hooks/useSettings.ts`
  - **blockedBy**: T-6.1

- [x] **T-6.3** `[integration]` 端到端测试 — 文件浏览 + 编辑
  - 打开文件树 → 双击文件 → 编辑器打开 → 编辑 → 保存 → 验证文件内容
  - 浮动窗口拖拽、缩放、透明度

- [x] **T-6.4** `[integration]` 端到端测试 — 搜索 + Git
  - 搜索 → 点击结果 → 编辑器跳转到匹配行
  - Git 面板 → 查看变更 → 点击文件 → diff 视图
  - @ 触发 → 选择文件 → 编辑器打开

- [x] **T-6.5** `[integration]` 构建验证
  - `cargo build --release` 成功
  - release 二进制包含 Monaco worker 文件
  - 首次加载性能不受影响（Monaco 懒加载）
  - 移动端功能不受影响

---

## 统计

| 类别 | 数量 |
|------|------|
| 总任务数 | 28 |
| 后端任务 | 8 (T-1.x + T-2.x) |
| 前端任务 | 17 (T-3.x + T-4.x + T-5.x + T-6.x) |
| 集成测试 | 3 (T-6.3 ~ T-6.5) |
| 可并行起步 | Phase 1 + Phase 2 (无依赖), Phase 3 + Phase 4 (部分并行) |

## 依赖图

```
T-1.1 ──→ T-1.2 ──→ T-1.4 ──→ T-3.4, T-3.5
T-1.3 ──→ T-1.4 ─────────────→ T-3.5
T-1.5 (路由注册)

T-2.1 ──→ T-2.2 ──→ T-2.3, T-5.2

T-3.1 ──→ T-3.3
T-3.2 ──→ T-3.3
T-3.5 ──→ T-4.7, T-5.1
T-3.6, T-3.7 (无依赖，可提前)

T-4.1 ──→ T-4.4
T-4.2 ──→ T-4.4
T-4.3, T-4.4, T-4.5, T-4.6, T-4.7 ──→ T-4.8

T-5.2 ──→ T-5.3, T-5.4, T-5.5
T-5.5 ──→ T-5.3

T-4.7 ──→ T-6.1 ──→ T-6.2
```

## MVP 建议范围

**核心 MVP** (Phase 1 + 3 + 4 的核心任务):
- 文件系统 API (T-1.1 ~ T-1.5)
- Activity Bar + 文件树 (T-3.1 ~ T-3.7)
- 浮动编辑器 + Monaco (T-4.1 ~ T-4.8)

共 20 个任务，用户可以浏览文件、打开编辑器查看/编辑代码。

**完整版** 在 MVP 基础上追加:
- Git API + Git 面板 (Phase 2 + T-5.2 ~ T-5.5)
- 搜索 (T-1.3 + T-5.1)
- @ 触发 (T-6.1 ~ T-6.2)
- 集成测试 (T-6.3 ~ T-6.5)
