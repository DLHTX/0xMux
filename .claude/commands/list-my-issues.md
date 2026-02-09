---
model: composer1
---

# 查看我的待办 Issues

快速查看分配给我的 Linear issues，重点关注 Todo 和 In Progress 状态，并获得今日工作建议。

## 功能

**智能推荐**：根据优先级、截止日期、更新时间、是否有 PR 等因素，直接推荐今天应该优先处理的 1-3 个 issues。

## 使用方式

调用此命令时，Claude 会：
1. 获取我的 Todo 和 In Progress issues（使用 `mcp_Linear_list_issues`）
2. 分析优先级、截止日期、更新时间、PR 状态等因素
3. **直接输出今日建议**：只显示推荐的 1-3 个 issues，不列出全部
4. 每个推荐项包含：标题、简要描述、Linear 链接

## 输出格式

```
💡 今日建议：

1.限价单执行成功后状态未更新为 Completed [查看详情](https://linear.app/frontrun/issue/FRONT-937/limit-order-status-does-not-update-to-completed-after-successful)
   

2.交易面板浮动按钮功能（用于快速卖出持仓）[查看详情](https://linear.app/frontrun/issue/FRONT-440/floating-button-for-tradingpanel)
   
建议开始顺序：xxx
```

**格式要求：**
- 只显示推荐的 1-5 个 issues
- 不显示 identifier（如 FRONT-937），标题直接翻译成中文
- 不显示状态、标签、更新时间等详细信息
- 每个推荐项包含：序号、中文标题、简要描述、Markdown 格式的链接
- 链接使用标准 Markdown 格式 `[查看详情](url)`，方便直接点击跳转

## 推荐逻辑

优先级权重（按顺序）：
1. Urgent + 有截止日期 = 最高优先级
2. Urgent + 已有 PR = 需要尽快完成
3. Urgent + Todo = 紧急待办
4. High + Bug 标签 = 影响用户体验
5. In Progress = 继续进行中的工作
6. Todo + 阻塞其他任务 = 解除依赖

## 适用场景

- 🌅 每天早上开始工作前，快速了解今日任务
- 📊 站会前确认工作进度
- 🎯 需要快速决策优先处理哪个 issue

