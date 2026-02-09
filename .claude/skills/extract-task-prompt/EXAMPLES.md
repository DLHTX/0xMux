# Extract Task Prompt - 使用示例

## 快速开始

### 示例 1: 提取单个后端任务

```bash
/extract-task-prompt T047b
```

**生成的 prompt**:

```markdown
## 📋 Task T047b: 后端 WebSocket price-info channel 实现

**目标**: 在后端 market.gateway.ts 中添加 `price-info` channel 支持，实现实时推送完整 token 信息（marketCap、liquidity、volume 等）

**工作目录**: `/Users/koray/Documents/GitHub/copilot/apps/service`

**涉及文件**:
- `src/controllers/market/market.gateway.ts` (修改)

**需求详情**:

1. **添加 price-info channel 支持**:
   - 在 supported channels 列表中添加 `"price-info"`
   - 转发订阅到 OKX upstream: `wss://wsdex.okx.com/ws/v5/dex`
   - 格式: `{"op":"subscribe","args":[{"channel":"price-info",...}]}`

2. **推送数据格式**:
   ```json
   {
     "arg": {"channel":"price-info","chainIndex":"501",...},
     "data": [{
       "time": "...", "price": "...",
       "marketCap": "...", "liquidity": "...",
       "volume5M/1H/4H/24H": "...",
       "priceChange5M/1H/4H/24H": "...",
       "holders": "...", "circSupply": "..."
     }]
   }
   ```

**参考文档**:
- `specs/003-inline-trading-widget/backend-api-spec.md` (第 325-439 行)
- `specs/003-inline-trading-widget/tasks.md` (第 94-100 行)
- OKX 官方文档: https://web3.okx.com/zh-hans/build/dev-docs/wallet-api/websocket-price-info-channel

**成功标准**:
- ✅ price-info 订阅/推送/取消订阅正常工作
- ✅ 推送数据包含 marketCap, liquidity, volume24H 且非空
- ✅ SOL/USDC 测试持续收到推送（每秒最多 1 次）
- ✅ 后端无错误日志，OKX upstream 连接稳定
```

---

### 示例 2: 提取多个相关任务（自动合并）

```bash
/extract-task-prompt T050 T050b
```

**生成单个合并的 prompt**（因为两个任务都修改同一个文件）:

```markdown
## 📋 Task T050 + T050b: iOS WebSocket 实时更新实现

**目标**:
1. T050: 实现 price-info channel 订阅，获取完整 token 信息
2. T050b: 实现 dex-token-candle1m channel 订阅，获取实时 K 线更新

**工作目录**: `/Users/koray/Documents/GitHub/frontrun-ios-private`

**前置条件**:
- T047b (后端 price-info channel) 已完成
- T053b (后端测试验证) 已通过

**涉及文件**:
- `Frontrun/FRServices/Sources/MarketData/OKXWebSocketService.swift` (修改)
- `Frontrun/FRModels/Sources/WebSocketModels.swift` (可能需要扩展)

**需求详情**:

### Part 1: price-info Channel 订阅 (T050)

1. **修改订阅格式**:
   ```swift
   {
     "op": "subscribe",
     "args": [{
       "channel": "price-info",  // 改为 price-info，不是 price
       "chainIndex": "501",
       "tokenContractAddress": "{address}"
     }]
   }
   ```

2. **数据模型**:
   ```swift
   struct PriceInfoUpdate {
       let time: String
       let price: String
       let marketCap: String      // 新增
       let liquidity: String       // 新增
       let volume5M/1H/4H/24H: String
       let priceChange5M/1H/4H/24H: String
       let holders: String
       let circSupply: String
   }
   ```

3. **发布更新**:
   - 通过 `Signal<PriceInfoUpdate, NoError>` 推送
   - 移除 1 秒 REST 轮询 timer

### Part 2: Candle Channel 订阅 (T050b)

1. **新增 candle 订阅**:
   ```swift
   {
     "op": "subscribe",
     "args": [{
       "channel": "dex-token-candle1m",
       "chainIndex": "501",
       "tokenContractAddress": "{address}"
     }]
   }
   ```

2. **推送数据**: `[ts, o, h, l, c, vol, volUsd, confirm]`

3. **发布更新**: 通过 `Signal<OHLCVCandle, NoError>`

**参考文档**:
- `specs/003-inline-trading-widget/backend-api-spec.md` (WebSocket 规范)
- `specs/003-inline-trading-widget/tasks.md` (第 124-140 行)

**成功标准**:
- ✅ price-info 和 candle 订阅同时工作
- ✅ 正确解析并发布两种类型的推送数据
- ✅ Signal subscription 正确管理，无内存泄漏
```

---

### 示例 3: 提取独立任务（不合并）

```bash
/extract-task-prompt T047b T050
```

**生成两个独立的 prompt**（因为属于不同模块：后端 vs iOS）:

**Prompt 1**: Task T047b (后端)
**Prompt 2**: Task T050 (iOS)

---

### 示例 4: 按阶段提取

```bash
/extract-task-prompt --phase 2.5
```

**生成该阶段所有待完成任务的 prompt**:

```markdown
## 📋 Phase 2.5: API Refactor - 待完成任务

共 11 个待完成任务，已按执行顺序分组：

### Group 1: 后端 WebSocket (BLOCKING)
- T047b: 添加 price-info channel
- T053b: 验证 price-info 推送

### Group 2: iOS WebSocket (依赖 Group 1)
- T049: 创建 OKXDataSource
- T050: 实现 price-info 订阅
- T050b: 实现 candle 订阅
- T051: 重构 TokenChartService

### Group 3: Widget UI (依赖 Group 2)
- T054: Widget metadata 实时更新
- T054b: Mini chart 实时追加
- T055: 详情页实时更新

---

{每个 group 生成独立的 prompt}
```

---

### 示例 5: 按关键词搜索

```bash
/extract-task-prompt --keyword "websocket"
```

**找到并生成相关任务**:
- T047b (后端 WebSocket price-info)
- T050 (iOS WebSocket price-info)
- T050b (iOS WebSocket candle)
- T053b (WebSocket 测试)

---

## 高级用法

### 保存生成的 prompt 到文件

```bash
# 生成 prompt 并保存
/extract-task-prompt T047b --output .prompts/backend-websocket.md
```

### 包含代码上下文

```bash
# 自动提取涉及文件的相关代码片段
/extract-task-prompt T050 --with-code-context
```

示例输出：

```markdown
**涉及文件**:
- `Frontrun/FRServices/Sources/MarketData/OKXWebSocketService.swift` (修改)

**当前实现**:
```swift
// 第 45-67 行: 现有订阅方法
func subscribe(to address: String) {
    let subscription = WebSocketSubscription(
        type: "price",  // ← 需要改为 "price-info"
        chainId: "501",
        contractAddress: address
    )
    // ...
}
```

**需要修改的部分**:
1. 第 47 行: `type: "price"` → `type: "price-info"`
2. 第 89-102 行: 添加 marketCap, liquidity 等字段的解析
3. 新增: PriceInfoUpdate 数据模型
```

### 自定义模板

```bash
# 使用简化模板（只包含核心信息）
/extract-task-prompt T047b --template minimal

# 使用详细模板（包含背景、决策记录等）
/extract-task-prompt T047b --template detailed
```

---

## 与其他工作流结合

### 1. 生成 prompt → 开启新会话

```bash
# 1. 提取任务
/extract-task-prompt T047b --output .prompts/task-t047b.md

# 2. 在新的 terminal/IDE 中打开新的 Claude Code 会话

# 3. 直接粘贴生成的 prompt 开始工作
```

### 2. 团队协作

```bash
# 生成多个独立任务 prompt
/extract-task-prompt T047b T050 T054 --output-dir .prompts/

# 团队成员各自领取任务：
# - 成员 A: .prompts/task-t047b.md (后端)
# - 成员 B: .prompts/task-t050.md (iOS WebSocket)
# - 成员 C: .prompts/task-t054.md (Widget UI)
```

### 3. 任务检查点

```bash
# 完成任务后，保存最终 prompt + 实现记录
/extract-task-prompt T047b --with-implementation-notes --output .prompts/completed/t047b.md
```

---

## 自动化脚本

创建 shell 别名简化使用：

```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
alias extract-task='claude /extract-task-prompt'

# 使用
extract-task T047b
extract-task --phase 2.5
```

---

## 总结

这个 skill 解决的核心问题：

1. **上下文爆炸**: 长期会话导致 token 消耗过高，响应变慢
2. **任务隔离**: 每个任务需要独立、清晰的上下文
3. **知识传递**: 生成的 prompt 可以分享、版本控制、复用
4. **并行工作**: 多个独立会话处理不同任务，提高效率

**最佳实践**:
- 单个任务 < 5 个涉及文件 → 直接提取
- 多个相关任务（同一模块） → 合并提取
- 跨模块任务（后端 + iOS） → 分开提取
- 整个阶段 → 按依赖关系分组提取
