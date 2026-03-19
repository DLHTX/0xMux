# Implementation Plan: 底部状态栏 + 分支切换 + Git Worktree

**Feature**: 5-statusbar-worktree
**Created**: 2026-03-19

---

## Architecture Overview

### 目标布局

```
┌─ Header ─────────────────────────────────────────────┐
├─ Sessions ─┬─ Workspace ──────────────┬─ RightPanel ─┤
│            │                          │              │
│            │   Terminal               │              │
│            │                          │              │
├────────────┴──────────────────────────┴──────────────┤
│ 🔀 main ↑0↓0 │ 3 changed │ worktree      │ Connected │ ← StatusBar
└──────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: 后端 — Worktree API

1. 在 `services/git.rs` 新增：
   - `list_worktrees(repo_path)` — 解析 `git worktree list --porcelain`
   - `create_worktree(repo_path, path, branch, base_branch)` — `git worktree add`
   - `remove_worktree(repo_path, path, force)` — `git worktree remove`
2. 在 `models/git.rs` 新增 `WorktreeInfo` 结构体
3. 在 `handlers/git.rs` 新增对应的 HTTP handlers
4. 在 `router.rs` 注册路由

### Phase 2: 前端 — 底部状态栏

1. 创建 `StatusBar.tsx` 组件
   - 固定高度 24px，紧贴布局底部
   - 左侧：分支名（可点击）、ahead/behind、变更数（可点击）、worktree 标识
   - 右侧：连接状态（从 Header 迁移或复制）
2. 在 `App.tsx` 桌面布局中添加 StatusBar
3. 状态栏数据：复用现有 `gitChangeCount` + 新增 `gitBranchInfo` 状态
4. 监听 `file_change` 事件自动刷新 git 状态
5. 点击变更数 → 展开右侧面板切换到「变更」tab

### Phase 3: 前端 — 分支切换弹窗

1. 创建 `BranchSwitcher.tsx` 组件
   - 从状态栏分支名点击触发
   - 搜索框 + 本地分支列表 + 远程分支列表
   - 当前分支高亮
   - 点击分支调用 `git checkout` API
   - 底部「新建 Worktree」按钮
2. 切换成功后刷新文件树 + git 状态 + 状态栏

### Phase 4: 前端 — Worktree 创建弹窗

1. 创建 `WorktreeCreateModal.tsx` 组件
   - 基于分支下拉（默认当前分支）
   - 新分支名输入
   - 目录名自动生成（可编辑）
   - 创建按钮
2. 后端创建流程：worktree add → 创建 session → 返回 session 信息
3. 前端收到响应后自动切换到新 session

### Phase 5: Worktree 标识与清理

1. 修改 `SessionSidebar` 为 worktree session 显示分支 badge
2. 修改删除 session 流程：如果是 worktree session，弹出确认框
3. 确认删除时调用后端 worktree remove API

---

## Design Decisions

### D1: 状态栏位置
**选择**: 整个桌面布局最底部，横跨全宽
**原因**: 与 VS Code 一致的体验，始终可见

### D2: Git 状态刷新策略
**选择**: file_change 事件触发 + 分支切换后立即刷新
**原因**: 避免轮询，利用已有的文件监听系统

### D3: Worktree 创建自动创建 Session
**选择**: 后端一个 API 同时完成 worktree add + session 创建
**原因**: 减少前端调用次数，保证原子性
