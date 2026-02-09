# Extract Task Prompt

**Trigger**: `/extract-task-prompt`

**Purpose**: 从项目 spec 文档中提取指定任务，生成独立的、上下文完整的任务 prompt，便于开启新的工作会话而不会因上下文过长导致效率下降。

## Usage

```bash
# 基本用法：提取单个任务
/extract-task-prompt T047b

# 提取多个任务（生成多个独立 prompt）
/extract-task-prompt T047b T053b

# 按阶段提取（生成该阶段所有待完成任务的 prompt）
/extract-task-prompt --phase 2.5

# 按关键词提取
/extract-task-prompt --keyword "websocket"
/extract-task-prompt --keyword "widget UI"

# 指定 spec 目录（默认自动检测）
/extract-task-prompt T050 --spec specs/003-inline-trading-widget
```

## What This Skill Does

1. **读取 spec 文档**:
   - 自动检测项目中的 spec 目录（`specs/*/`）
   - 读取 `plan.md`, `tasks.md`, `backend-api-spec.md` 等相关文档

2. **提取任务信息**:
   - 根据任务 ID（如 T047b）或关键词定位任务
   - 提取任务描述、依赖关系、涉及文件、验证标准

3. **生成独立 prompt**:
   - **目标**: 清晰的任务目标陈述
   - **工作目录**: 明确的工作路径
   - **涉及文件**: 需要修改/创建的文件列表
   - **需求详情**: 完整的实现要求（从 tasks.md 提取）
   - **参考文档**: 相关 spec 文件的路径和行号
   - **前置条件**: 依赖任务列表（如果有）
   - **成功标准**: 验证清单

4. **优化上下文**:
   - 只包含任务相关的代码片段和文档引用
   - 生成的 prompt 可以直接复制到新的 Claude Code 会话
   - 避免携带整个项目历史和无关文件

## Generated Prompt Format

```markdown
## 📋 Task {ID}: {任务简短描述}

**目标**: {一句话目标陈述}

**工作目录**: {绝对路径}

**前置条件**: {依赖任务列表，如果有}

**涉及文件**:
- `{file1}` (修改/创建)
- `{file2}` (修改)

**需求详情**:

{从 tasks.md 提取的完整任务描述，包含：}
1. {子任务 1}
   - {详细说明}
   - {代码示例或配置}

2. {子任务 2}
   ...

**参考文档**:
- `{spec_file}` (第 X-Y 行: {摘要})
- `{other_spec}` ({相关部分})

**成功标准**:
- ✅ {验证项 1}
- ✅ {验证项 2}
- ✅ {验证项 3}

**测试验证**:
```bash
# {测试命令和预期结果}
```
```

## Example Output

用户执行：
```bash
/extract-task-prompt T047b T053b
```

生成两个独立的 prompt：

### Prompt 1: 后端 WebSocket price-info channel 实现
```
## 📋 Task T047b: 添加 price-info channel 到 WebSocket gateway

**目标**: 在后端 market.gateway.ts 中添加 `price-info` channel 支持...

{完整的独立 prompt，包含所有必要上下文}
```

### Prompt 2: 后端 WebSocket price-info 测试验证
```
## 📋 Task T053b: 验证 price-info channel WebSocket 推送

**前置条件**: T047b (price-info channel 支持) 已完成

{完整的测试验证 prompt}
```

## Implementation Notes

此 skill 应该：

1. **智能检测 spec 目录**:
   - 扫描 `specs/*/tasks.md` 文件
   - 如果找到多个，提示用户选择或使用 `--spec` 参数

2. **解析任务依赖**:
   - 从 tasks.md 中提取 `**Dependency**` 标记
   - 自动包含依赖任务的摘要信息

3. **提取代码上下文**:
   - 如果任务涉及修改现有文件，读取文件并提取相关部分
   - 包含接口定义、现有实现的关键代码片段

4. **格式化输出**:
   - 使用清晰的 markdown 格式
   - 代码块使用正确的语法高亮
   - 包含文件路径行号引用

5. **分组策略**:
   - 如果提取多个任务，检测是否可以合并为一个 prompt
   - 规则：如果任务属于同一个文件、同一个模块、或有强依赖关系，可以合并
   - 否则生成多个独立 prompt

## Configuration

可以在项目根目录创建 `.claude/extract-task-prompt.config.json`:

```json
{
  "specDir": "specs/003-inline-trading-widget",
  "defaultTaskFiles": [
    "tasks.md",
    "plan.md",
    "backend-api-spec.md"
  ],
  "includeCodeContext": true,
  "maxContextLines": 50,
  "promptTemplate": "default"
}
```

## Benefits

- ✅ **上下文隔离**: 每个任务有独立的上下文，避免污染
- ✅ **并行工作**: 可以开启多个 Claude Code 会话并行处理不同任务
- ✅ **知识传递**: 生成的 prompt 可以分享给团队成员
- ✅ **版本控制**: Prompt 可以保存到 git，追踪任务演进
- ✅ **快速启动**: 新会话可以立即开始工作，无需重新阅读整个 spec

## Related Skills

- `/speckit.tasks` - 生成任务列表
- `/speckit.plan` - 生成实施计划
- `/kanban-task` - 任务管理
