---
model: haiku
---

# 本地提交命令

自动完成本地代码的提交，不推送到远程或创建PR。

## 功能

1. 分析当前git状态和更改
2. 生成合适的commit message
3. 添加更改到暂存区
4. 提交代码到本地仓库

## 执行步骤

1. 检查当前git状态，显示未跟踪和修改的文件
2. 分析更改内容，生成符合规范的commit message(不包含Claude相关标识）)
3. 添加所有相关文件到暂存区
4. 使用生成的commit message提交代码

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

**Scope类型（常见）：**
- `extension`: 浏览器扩展相关
- `service`: 后端服务相关
- `utils`: 工具函数相关
- `component`: UI组件相关
- `config`: 配置文件相关

**示例：**
- 🚀 feat(extension): add tab events tracking system
- 🐛 fix(extension): resolve Windows path handling issue
- 📝 docs: update API documentation
- ♻️ refactor(utils): optimize tab route detection logic

## 自动分析规则

根据更改内容自动判断类型和scope：
- 包含`src/apps/extension` → scope: `extension`
- 包含`src/apps/service` → scope: `service`
- 包含`src/utils` 或 `src/background` → scope: `utils`
- 包含`src/components` → scope: `component`
- 包含`package.json`, `tsconfig.json`等 → scope: `config`

根据文件路径和内容判断类型：
- 新增功能文件 → `feat`
- 修复相关内容 → `fix`
- 文档文件 → `docs`
- 格式化相关 → `style`
- 重构相关 → `refactor`

## 示例输出

```bash
📊 检查Git状态：
  • 修改: src/hooks/useTabStatus.ts
  • 修改: src/background/_feats/tabEvents.ts
  • 新增: src/utils/tabUtils.ts

🎯 分析更改类型：feat(extension)
📝 生成Commit Message: 🚀 feat(extension): add tab events tracking system

✓ 添加文件到暂存区
✓ 提交代码到本地仓库
🎉 本地提交完成！
```

## 使用场景

- 完成功能开发后的本地提交
- 修复bug后的快速提交
- 重构代码后的阶段性提交
- 不想立即推送到远程的临时提交