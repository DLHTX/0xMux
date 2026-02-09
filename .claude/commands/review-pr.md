# PR审核命令

自动审核GitHub Pull Request的代码更改，逐行分析diff并提供详细的审核意见。

## 功能

1. 解析PR链接获取PR信息
2. 通过GitHub CLI获取完整的diff
3. 逐行分析代码更改
4. 提供详细的审核意见和改进建议

## 执行步骤

1. 接收PR链接（GitHub URL或PR编号）
2. 使用 `gh pr view <PR> --json` 获取PR基本信息（标题、作者、状态、文件列表、headRefName等）
3. **分支切换询问（重要）**：
  - **必须先询问用户**：是否要切换到PR分支（`headRefName`）进行审核？
  - 如果用户选择**切换分支**：
    - **然后**检查当前工作区状态：`git status --porcelain`
    - 如果工作区有未提交的更改：
      - 先执行 `git stash` 保存当前工作区的更改
      - 然后使用 `gh pr checkout <PR>` 或 `git checkout <headRefName>` 切换到PR分支
    - 如果工作区干净（无未提交更改）：
      - 直接使用 `gh pr checkout <PR>` 或 `git checkout <headRefName>` 切换到PR分支
  - 如果用户选择**不切换分支**：
    - 跳过工作区检查和分支切换操作
    - 继续在当前分支进行审核（基于diff，不会修改工作区）
4. 使用 `gh pr diff <PR>` 获取完整的代码diff
5. 分析每个文件的更改：
  - 检查代码质量和最佳实践
  - 识别潜在的bug和安全问题
  - 评估性能影响
  - 检查代码风格和一致性
  - 验证测试覆盖
  - 检查向后兼容性
6. 生成详细的审核报告，包括：
  - 总体评价
  - 每个文件的具体问题
  - 建议的改进措施
  - 必须修复的问题（blocking issues）
  - 可选改进建议（non-blocking suggestions）

## 审核维度

### 1. 代码质量

- 逻辑正确性
- 错误处理
- 边界条件处理
- 代码可读性

### 2. 安全性

- 输入验证
- SQL注入/XSS风险
- 敏感信息泄露
- 权限检查

### 3. 性能

- 不必要的计算
- 数据库查询优化
- 内存泄漏风险
- 异步操作处理

### 4. 代码风格

- 命名规范
- 代码格式
- 注释完整性
- 类型定义

### 5. 架构设计

- 代码组织
- 依赖关系
- 可维护性
- 可扩展性

### 6. 测试

- 测试覆盖
- 测试质量
- 边界情况测试

## 审核输出格式

### 总体评价

- PR类型（feat/fix/refactor等）
- 更改规模（文件数、行数）
- 风险评估（低/中/高）
- 总体建议（approve/request changes/comment）

### 详细审核

对每个更改的文件，提供：

- 文件路径和更改统计
- 关键问题列表（按优先级）
- 具体代码位置和建议
- 代码示例（如果需要）

### 问题分类

- 🔴 **Critical**: 必须修复的问题，阻止合并
- 🟡 **Warning**: 建议修复的问题，影响代码质量
- 🔵 **Info**: 可选改进建议，提升代码质量
- ✅ **Good**: 做得好的地方

## 使用示例

用户输入：

```
review-pr https://github.com/owner/repo/pull/123
```

或

```
review-pr 123
```

执行流程：

```bash
# 1. 获取PR信息（包括分支名）
gh pr view 123 --json number,title,author,state,files,additions,deletions,headRefName

# 2. 询问用户是否要切换到PR分支进行审核（必须先询问）
# 提示：检测到PR分支为 <headRefName>，是否要切换到此分支进行审核？
# 
# 如果用户选择"是"：
#   3a. 检查工作区状态
git status --porcelain
#   3b. 如果工作区有未提交的更改：
git stash  # 保存当前更改
gh pr checkout 123  # 或 git checkout <headRefName>
#   3c. 如果工作区干净：
gh pr checkout 123  # 或 git checkout <headRefName>
#
# 如果用户选择"否"：
#   跳过步骤3，直接进入步骤4（基于diff审核，不修改工作区）

# 4. 获取diff
gh pr diff 123

# 5. 分析每个文件的更改
# 6. 生成审核报告
```

## 输出示例

```
📋 PR审核报告: #123 - feat(extension): add tab events tracking

📊 总体统计:
  • 文件数: 3
  • 新增行数: 156
  • 删除行数: 23
  • 更改类型: feat

🔍 详细审核:

📁 src/hooks/useTabStatus.ts
  ✅ 代码结构清晰，逻辑合理
  🟡 Line 45: 建议添加错误处理
  🔵 Line 67: 可以考虑提取为独立函数

📁 src/background/_feats/tabEvents.ts
  🔴 Line 23: 缺少空值检查，可能导致运行时错误
  🟡 Line 89: 性能优化建议 - 使用防抖处理高频事件
  ✅ 类型定义完整

📁 src/utils/tabUtils.ts
  ✅ 工具函数设计良好
  🔵 Line 12: 可以添加JSDoc注释

🎯 审核结论:
  • 总体评价: 代码质量良好，但需要修复1个关键问题
  • 建议: Request Changes
  • 必须修复: src/background/_feats/tabEvents.ts Line 23 的空值检查
```

## 注意事项

1. 确保已安装并配置GitHub CLI (`gh`)
2. 确保有权限访问目标仓库
3. **工作区管理（重要）**：
  - **必须先询问用户**是否要切换到PR分支进行审核
  - **只有在用户同意切换分支时**，才检查工作区状态：`git status --porcelain`
  - 如果用户选择切换分支：
    - 先检查工作区状态
    - 如果工作区有未提交的更改，会先执行 `git stash` 保存
    - 然后切换到PR分支（`gh pr checkout <PR>` 或 `git checkout <headRefName>`）
    - 审核完成后，用户可以使用 `git stash pop` 恢复之前的更改（如果有stash）
  - 如果用户选择不切换分支：
    - **跳过**工作区检查和所有git操作
    - 审核将基于diff进行，不会修改工作区
    - 不会执行任何git操作（除了读取diff）
4. 对于大型PR，可能需要较长时间分析
5. 审核意见应具体、可操作，避免泛泛而谈
6. 重点关注功能正确性、安全性和性能问题
7. 对于重构类PR，重点关注是否引入回归问题
8. 对于新功能PR，检查是否有相应的测试覆盖

