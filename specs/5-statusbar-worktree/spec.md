# Feature Spec: 底部状态栏 + 分支切换 + Git Worktree 管理

**Feature ID**: 5-statusbar-worktree
**Status**: Draft
**Created**: 2026-03-19

---

## 1. Overview

0xMux 目前缺乏全局的 Git 状态展示和分支切换入口。用户需要点进右侧面板的「变更」tab 才能看到当前分支，切换分支也埋在 Git 面板深处。同时，Git worktree 作为多分支并行开发的利器，目前完全没有集成。

本 feature 在桌面端底部新增一个全局状态栏，一眼可见当前分支、ahead/behind、变更数等 Git 信息。点击分支名弹出分支切换弹窗，支持搜索、切换、以及从中创建新的 Worktree。Worktree 创建后自动生成对应的 tmux session，实现无缝的多分支并行开发体验。

### Target Users

- 需要频繁切换分支的开发者
- 同时在多个分支上并行开发的开发者
- 希望快速了解当前 Git 状态的用户

### Problem Statement

1. 当前分支信息藏在 Git 面板内，不够醒目
2. 切换分支需要多步操作（打开 Git 面板 → 展开分支列表 → 点击切换）
3. 没有 worktree 支持，多分支并行开发需要手动操作命令行
4. 无法一眼看到 ahead/behind 和变更文件数

---

## 2. User Scenarios

### Scenario 1: 快速查看 Git 状态

**As a** 正在开发的用户,
**I want to** 在界面底部始终看到当前分支名和 Git 状态,
**So that** 我不用打开任何面板就能了解当前工作状态。

**Flow:**
1. 用户打开 0xMux
2. 底部状态栏显示：`🔀 main ↑0 ↓0 │ 3 changed`
3. 用户提交代码后，状态栏自动更新为：`🔀 main ↑1 ↓0 │ 0 changed`

### Scenario 2: 快速切换分支

**As a** 需要切换到其他分支的开发者,
**I want to** 点击状态栏的分支名快速切换分支,
**So that** 我不需要在终端里手动输入 git checkout。

**Flow:**
1. 用户点击状态栏的分支名
2. 弹出分支切换弹窗，显示所有本地和远程分支
3. 用户在搜索框输入 `fix` 过滤分支
4. 用户点击 `fix-login` 分支
5. 系统执行 git checkout，切换完成
6. 状态栏更新为新分支名，文件树自动刷新

### Scenario 3: 创建 Worktree 并行开发

**As a** 正在开发 feature-A 的用户，突然需要修 hotfix,
**I want to** 快速创建一个新的 worktree 来修 bug，不影响当前工作,
**So that** 我不需要 stash 当前修改或手动操作 git worktree 命令。

**Flow:**
1. 用户点击状态栏分支名，弹出分支切换弹窗
2. 用户点击底部「新建 Worktree」
3. 弹出创建表单：基于 main 分支，新分支名 `fix-login`
4. 目录名自动生成为 `0xMux-fix-login`
5. 用户点击「创建」
6. 系统执行 git worktree add，创建新 session
7. 自动切换到新 session，终端工作目录在新 worktree 中
8. 左侧 session 列表显示新 session 带分支 badge

### Scenario 4: 清理已完成的 Worktree

**As a** PR 已合并的用户,
**I want to** 删除 worktree session 时自动清理 worktree 目录,
**So that** 不留下无用的目录占用磁盘空间。

**Flow:**
1. 用户在 session 列表删除一个 worktree session
2. 系统弹出确认框：「是否同时删除 worktree 目录 ../0xMux-fix-login？」
3. 用户确认
4. 系统执行 git worktree remove + 删除 session

### Scenario 5: 点击变更数跳转到变更面板

**As a** 看到状态栏有 3 个文件变更的用户,
**I want to** 点击变更数直接跳到右侧变更 tab,
**So that** 我能快速查看哪些文件被修改了。

**Flow:**
1. 状态栏显示 `3 changed`
2. 用户点击该区域
3. 右侧面板自动展开并切换到「变更」tab

---

## 3. Functional Requirements

### FR-1: 底部状态栏

- 在桌面端布局最底部新增固定高度状态栏
- 左侧显示 Git 信息：
  - 分支图标 + 当前分支名（可点击）
  - ahead/behind 计数（`↑N ↓M`，仅有值时显示）
  - 变更文件数量（可点击，跳到变更 tab）
  - worktree 标识（仅在 worktree 中时显示）
- 右侧显示连接状态
- 状态栏响应 git 变更自动刷新（通过现有 WebSocket file_change 事件）

### FR-2: 分支切换弹窗

- 点击状态栏分支名弹出弹窗
- 弹窗包含搜索框，支持模糊过滤分支名
- 分为「本地分支」和「远程分支」两组
- 当前分支高亮标识
- 点击分支执行 git checkout 切换
- 切换成功后自动关闭弹窗，刷新文件树和 Git 状态
- 切换失败时显示错误提示（如有未提交的修改）

### FR-3: Worktree 创建

- 分支切换弹窗底部提供「新建 Worktree」按钮
- 创建表单包含：
  - 基于分支：下拉选择（默认当前分支）
  - 新分支名：用户输入
  - 目录名：自动生成 `项目名-分支名`，可编辑
- 创建流程：
  1. 后端执行 `git worktree add` 创建 worktree
  2. 自动创建新 tmux session，工作目录指向新 worktree
  3. 自动切换到新 session
- 创建失败时显示错误信息

### FR-4: Worktree 标识与管理

- Session 列表中的 worktree session 显示分支名 badge
- 删除 worktree session 时弹出确认框，询问是否同时删除 worktree 目录
- 确认删除时执行 `git worktree remove` 清理

### FR-5: 变更数点击跳转

- 点击状态栏的变更文件数，展开右侧面板并切换到「变更」tab

---

## 4. Scope

### In Scope

- 桌面端底部状态栏组件
- 分支切换弹窗 + 搜索
- Git worktree 创建（git worktree add）
- Worktree session 标识
- Worktree 删除与清理
- 后端 API：worktree list/create/remove、branch checkout
- 状态栏自动刷新

### Out of Scope

- 移动端状态栏（移动端空间不足）
- Worktree 之间的文件对比
- 自动依赖安装（仅提示用户，不自动执行）
- Git merge/rebase 操作
- 分支创建（不基于 worktree 的普通分支创建）

---

## 5. Success Criteria

1. 用户打开桌面端后，底部始终显示当前分支名和 Git 状态
2. 用户能在 3 次点击内完成分支切换
3. 用户能在 3 次点击内创建一个新的 worktree 并进入对应终端
4. 状态栏在 git 操作后 2 秒内自动刷新
5. Worktree session 在列表中可视化区分
6. 删除 worktree session 后，worktree 目录被正确清理

---

## 6. Dependencies

- 现有的 `git` 命令行工具（git worktree 需要 git 2.5+）
- 现有的 WebSocket file_change 事件机制
- 现有的 tmux session 创建 API
- 现有的 GitPanel 和 RightPanel 组件

---

## 7. Assumptions

- 用户的 git 版本支持 worktree（git 2.5+，2015 年发布，绝大多数系统已满足）
- Worktree 目录创建在项目同级目录（`../`），用户对该目录有写入权限
- 同一分支不能同时存在于两个 worktree 中（git 的限制）
- 状态栏高度固定，不影响终端区域的大小计算

---

## 8. Design Constraints

- **无圆形元素**: 所有 UI 元素不使用圆角、圆点、圆形按钮
- **Brutalist 风格**: 保持像素风、粗犷设计
- **状态栏高度**: 约 24px，紧凑但可读
- **图标**: 使用 @iconify/react + @iconify-icons/lucide
- **字体**: 状态栏使用 mono 字体，与终端风格一致
