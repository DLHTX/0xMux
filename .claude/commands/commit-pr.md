---
model: haiku
---

# 提交PR命令

自动完成从当前更改到创建PR的完整流程。

## 功能

1. 根据当前更改创建新分支并命名
2. 提交代码更改
3. 推送分支到远程
4. 创建Pull Request

## 执行步骤

1. 检查当前git状态和更改
2. 分析更改内容生成合适的分支名
3. 创建新分支并切换
4. 添加所有更改到暂存区
5. 根据更改内容生成符合规范的commit message（包含type和emoji，不包含Claude相关标识）
6. 提交代码
7. 推送分支到远程仓库
8. 分析PR内容，按照项目PR格式模板创建PR,(先询问用户Linear的序号，例如用户回答414，那就在标题后面添加FRONT-414.如果用户不回复或者回复为空就不跳过这个条件)

## PR格式要求

PR标题应该：
- 使用 `fix(scope): description` 或 `feat(scope): description` 格式
- 使用动词开头描述更改目的
- 简洁明了，50字符以内

PR内容应该包含：
- ## Summary（变更摘要）
- 1-3个要点说明主要更改
- ## Test plan（测试计划用英文写）不包含Claude相关标识
- 简洁的测试场景和验证步骤（4-5条即可），包括：
  - 核心功能验证
  - 边界条件测试
  - UI/UX验证
  - 集成和回归测试

## Commit Message 格式要求

使用标准格式：`emoji type: description`

**Type类型：**
- `feat`: 🚀 新功能
- `fix`: 🐛 Bug修复
- `docs`: 📝 文档更新
- `style`: 💎 代码格式化
- `refactor`: ♻️ 代码重构
- `perf`: ⚡ 性能优化
- `test`: 🧪 测试相关
- `chore`: 🔧 构建工具或辅助工具的变动

**示例：**
- 🚀 feat: add user authentication
- 🐛 fix: resolve Windows path handling issue
- 📝 docs: update API documentation
- ♻️ refactor: optimize component structure

## 示例输出

```bash
✓ 创建分支: fix/windows-parcel-namer-path
✓ 提交更改: 🐛 fix: resolve Windows path handling in parcel-namer-esm-fix plugin
✓ 推送分支到远程
✓ 创建PR: #123 - fix(parcel-namer-esm-fix): resolve Windows path handling issue
```

## 重要
任何生成的结果中都不要包含claude相关的内容例如 Generated with [Claude Code]