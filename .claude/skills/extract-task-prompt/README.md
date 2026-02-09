# Extract Task Prompt Skill

从 spec 文档中提取任务，生成独立的、上下文完整的任务 prompt。

## 快速开始

```bash
# 提取单个任务
/extract-task-prompt T047b

# 提取多个任务
/extract-task-prompt T047b T053b

# 按阶段提取
/extract-task-prompt --phase 2.5
```

## 安装状态

✅ Skill 已安装在: `.claude/skills/extract-task-prompt/`

要在 Claude Code 中使用此 skill，只需输入 `/extract-task-prompt` 即可。

## 使用场景

### 场景 1: 上下文太长，需要拆分任务

**问题**: 当前会话已经处理了很多任务，上下文超过 70K tokens，响应变慢。

**解决**:
```bash
# 提取剩余待完成的任务
/extract-task-prompt T050 T054 T055

# 复制生成的 prompt 到新会话
# 在新会话中继续工作
```

### 场景 2: 并行处理多个独立任务

**问题**: 后端和 iOS 任务可以并行处理，但在同一个会话中混在一起。

**解决**:
```bash
# 提取后端任务
/extract-task-prompt T047b T053b

# 提取 iOS 任务
/extract-task-prompt T050 T050b T054 T054b

# 开启两个独立会话并行工作
```

### 场景 3: 团队协作分工

**问题**: 需要将任务分配给团队成员，但 spec 文档太长。

**解决**:
```bash
# 为每个成员生成独立的任务 prompt
/extract-task-prompt T047b --output team/backend-member.md
/extract-task-prompt T050 T050b --output team/ios-member.md
/extract-task-prompt T054 --output team/ui-member.md

# 成员各自打开自己的 prompt 开始工作
```

## 文件结构

```
.claude/skills/extract-task-prompt/
├── SKILL.md          # Skill 定义（AI 会读取这个）
├── EXAMPLES.md       # 使用示例
└── README.md         # 本文件
```

## 工作原理

1. **读取 spec 文档**: 自动检测项目中的 `specs/*/` 目录
2. **解析任务**: 从 `tasks.md` 中提取指定任务的完整信息
3. **收集上下文**: 包含相关文件路径、代码片段、参考文档
4. **生成 prompt**: 格式化为独立的、可复制的任务 prompt

## 生成的 Prompt 包含

- ✅ **目标**: 清晰的任务目标陈述
- ✅ **工作目录**: 明确的工作路径
- ✅ **涉及文件**: 需要修改/创建的文件列表
- ✅ **需求详情**: 完整的实现要求
- ✅ **参考文档**: 相关 spec 文件的路径和行号
- ✅ **前置条件**: 依赖任务列表
- ✅ **成功标准**: 验证清单
- ✅ **测试命令**: 具体的测试步骤

## 与 Speckit 的关系

此 skill 是 Speckit 工作流的补充：

```
/speckit.plan        → 生成 plan.md
/speckit.tasks       → 生成 tasks.md
/extract-task-prompt → 从 tasks.md 提取独立 prompt 用于执行
```

**工作流**:
1. 用 `/speckit.plan` 规划项目
2. 用 `/speckit.tasks` 生成任务列表
3. 用 `/extract-task-prompt` 提取任务开始实现
4. 任务完成后更新 `tasks.md` 的完成状态

## 示例用法

参见 `EXAMPLES.md` 获取详细的使用示例。

## 贡献

如需改进此 skill：

1. 编辑 `SKILL.md` 修改 skill 定义
2. 编辑 `EXAMPLES.md` 添加新示例
3. 测试：在 Claude Code 中运行 `/extract-task-prompt --help`

## 版本

- v1.0.0 (2026-02-05): 初始版本，支持基本的任务提取功能
