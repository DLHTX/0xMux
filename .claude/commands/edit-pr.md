# PR Code Review 修复提示词

请帮我修复 PR 的 code review 问题。

**使用步骤：**
1. 提供一个 GitHub PR 链接（格式：`https://github.com/owner/repo/pull/123` 或 PR 编号）
2. 使用 `gh` CLI 工具获取该 PR 的所有 code review 评论和问题
3. 分析所有评论，识别需要修复的问题类型（Critical/Major/Minor）
5. 修复完成后提供修复总结

**注意：**
- 优先修复 Critical 和 Major 级别的问题
- 确保所有修改遵循项目代码风格
- 修复后检查是否有 lint 错误