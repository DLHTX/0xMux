# Tasks: 底部状态栏 + 分支切换 + Git Worktree

**Feature**: 5-statusbar-worktree
**Created**: 2026-03-19

---

## Phase 1: 后端 — Worktree + Checkout API

- [ ] **T1.1** [backend] 新增 WorktreeInfo 模型和 git worktree 服务函数
  - `models/git.rs`: 添加 `WorktreeInfo { path, branch, head, is_main }`
  - `services/git.rs`: 添加 `list_worktrees()`, `create_worktree()`, `remove_worktree()`
  - 解析 `git worktree list --porcelain` 输出
  - **files**: `server/src/models/git.rs`, `server/src/services/git.rs`

- [ ] **T1.2** [backend] 新增 worktree HTTP handlers 和路由
  - `GET /api/git/worktrees` — 列出所有 worktree
  - `POST /api/git/worktrees` — 创建 worktree（+ 自动创建 tmux session）
  - `DELETE /api/git/worktrees` — 删除 worktree（+ 可选删除 session）
  - **files**: `server/src/handlers/git.rs`, `server/src/router.rs`
  - **depends**: T1.1

- [ ] **T1.3** [backend] 新增 git status 增强（返回 worktree 信息）
  - `GET /api/git/status` 响应中增加 `is_worktree: bool` 和 `worktree_path: Option<String>` 字段
  - **files**: `server/src/models/git.rs`, `server/src/services/git.rs`

## Phase 2: 前端 — 底部状态栏

- [ ] **T2.1** [frontend] 创建 StatusBar 组件
  - 新建 `web/src/components/layout/StatusBar.tsx`
  - 左侧：分支图标 + 分支名 + ahead/behind + 变更数 + worktree 标识
  - 右侧：连接状态
  - 固定高度 24px，mono 字体
  - **files**: `web/src/components/layout/StatusBar.tsx`

- [ ] **T2.2** [frontend] 集成 StatusBar 到 App.tsx 桌面布局
  - 在桌面布局底部添加 StatusBar
  - 新增 `gitBranchInfo` 状态（branch, ahead, behind, isWorktree）
  - 监听 file_change 事件自动刷新 git 状态
  - **files**: `web/src/App.tsx`
  - **depends**: T2.1

- [ ] **T2.3** [frontend] 点击变更数跳转到变更 tab
  - 点击状态栏变更区域 → 展开右侧面板 + 切换到 changes tab
  - **files**: `web/src/components/layout/StatusBar.tsx`, `web/src/App.tsx`
  - **depends**: T2.2

## Phase 3: 前端 — 分支切换弹窗

- [ ] **T3.1** [frontend] 创建 BranchSwitcher 弹窗组件
  - 新建 `web/src/components/layout/BranchSwitcher.tsx`
  - 搜索框 + 本地/远程分支分组列表
  - 当前分支高亮
  - 点击外部关闭
  - **files**: `web/src/components/layout/BranchSwitcher.tsx`

- [ ] **T3.2** [frontend] 分支切换功能实现
  - 点击分支调用 `gitCheckout` API
  - 切换成功后关闭弹窗、刷新文件树、刷新 git 状态
  - 切换失败显示 toast 错误
  - **files**: `web/src/components/layout/BranchSwitcher.tsx`, `web/src/App.tsx`
  - **depends**: T3.1

- [ ] **T3.3** [frontend] 添加前端 API 函数和 i18n
  - `lib/api.ts`: 添加 `listWorktrees()`, `createWorktree()`, `removeWorktree()`
  - `lib/i18n.ts`: 添加状态栏和分支切换相关翻译
  - `lib/types.ts`: 添加 `WorktreeInfo`, `GitBranchInfo` 等类型
  - **files**: `web/src/lib/api.ts`, `web/src/lib/i18n.ts`, `web/src/lib/types.ts`

## Phase 4: 前端 — Worktree 创建

- [ ] **T4.1** [frontend] 创建 WorktreeCreateModal 组件
  - 新建 `web/src/components/session/WorktreeCreateModal.tsx`
  - 基于分支下拉 + 新分支名 + 目录名（自动生成可编辑）
  - **files**: `web/src/components/session/WorktreeCreateModal.tsx`
  - **depends**: T3.3

- [ ] **T4.2** [frontend] Worktree 创建流程集成
  - 从 BranchSwitcher 底部打开 WorktreeCreateModal
  - 创建成功后自动切换到新 session
  - 创建失败显示 toast
  - **files**: `web/src/App.tsx`, `web/src/components/layout/BranchSwitcher.tsx`
  - **depends**: T4.1, T1.2

## Phase 5: Worktree 标识与清理

- [ ] **T5.1** [frontend] Session 列表 worktree 标识
  - SessionSidebar 中 worktree session 显示分支名 badge
  - **files**: `web/src/components/session/SessionSidebar.tsx`

- [ ] **T5.2** [frontend] Worktree session 删除确认
  - 删除 worktree session 时弹确认框
  - 确认后调用 worktree remove API + 删除 session
  - **files**: `web/src/App.tsx`, `web/src/components/session/SessionSidebar.tsx`
  - **depends**: T5.1, T1.2

- [ ] **T5.3** [testing] 验证全部功能
  - 状态栏显示正确的 git 信息
  - 分支切换功能正常
  - Worktree 创建、标识、删除正常
  - 状态栏自动刷新
  - **depends**: T5.2

---

## 任务依赖图

```
T1.1 ─→ T1.2 ─────────────────────────┐
T1.3                                    │
                                        │
T2.1 ─→ T2.2 ─→ T2.3                  │
                                        │
T3.1 ─→ T3.2                          │
T3.3 ───────→ T4.1 ─→ T4.2 ←──────────┘

T5.1 ─→ T5.2 ─→ T5.3
```

## 并行化建议

- **Phase 1 (T1.1-T1.3)** 后端可全部并行
- **Phase 2 (T2.1-T2.3)** 与 Phase 1 可并行
- **Phase 3 (T3.1-T3.3)** 与 Phase 2 可并行
- **Phase 4** 依赖 Phase 1 + Phase 3
- **Phase 5** 依赖 Phase 1 + Phase 4
