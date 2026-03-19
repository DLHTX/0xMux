# Research: 底部状态栏 + 分支切换 + Worktree

**Feature**: 5-statusbar-worktree
**Created**: 2026-03-19

---

## 1. Git Worktree 命令参考

```bash
# 列出所有 worktree
git worktree list --porcelain
# 输出格式:
# worktree /path/to/main
# HEAD abc1234
# branch refs/heads/main
#
# worktree /path/to/feature
# HEAD def5678
# branch refs/heads/feature

# 创建 worktree（新分支）
git worktree add ../project-feature feature-branch
# 基于指定分支创建:
git worktree add -b new-branch ../project-new base-branch

# 删除 worktree
git worktree remove ../project-feature
# 强制删除（有未提交修改时）:
git worktree remove --force ../project-feature

# 清理过期的 worktree 引用
git worktree prune
```

## 2. 现有后端 API 可复用部分

| 现有 API | 复用于 |
|---------|--------|
| `git::get_status()` | 状态栏 branch/ahead/behind/changes |
| `git::get_branches()` | 分支切换弹窗的分支列表 |
| `git::checkout()` | 分支切换弹窗的切换操作 |
| `workspace::resolve_workspace_root()` | 确定 worktree 的父目录 |
| `tmux::create_session()` | worktree 创建后自动创建 session |

## 3. 需要新增的后端 API

| API | 方法 | 路径 | 说明 |
|-----|------|------|------|
| Worktree List | GET | `/api/git/worktrees` | 列出所有 worktree |
| Worktree Create | POST | `/api/git/worktrees` | 创建新 worktree + session |
| Worktree Remove | DELETE | `/api/git/worktrees` | 删除 worktree + 可选删 session |

## 4. 前端组件规划

| 组件 | 类型 | 说明 |
|------|------|------|
| `StatusBar.tsx` | 新增 | 底部状态栏 |
| `BranchSwitcher.tsx` | 新增 | 分支切换弹窗 |
| `WorktreeCreateModal.tsx` | 新增 | Worktree 创建表单 |
| `App.tsx` | 修改 | 集成状态栏到布局 |
| `SessionSidebar.tsx` | 修改 | Worktree session badge |

## 5. 状态栏数据来源

状态栏需要定期刷新 git 状态。策略：
- 初始加载：从 `/api/git/status` 获取
- 自动刷新：监听 `file_change` WebSocket 事件后重新获取
- 分支切换后：立即重新获取
