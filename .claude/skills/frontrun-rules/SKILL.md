---
name: frontrun-rules
description: Architecture and code organization rules for Frontrun iOS development. Use this skill BEFORE writing any Swift code to ensure correct module placement, utility reuse, and pattern consistency. Covers module boundaries, shared utility locations, formatting conventions, and anti-patterns learned from codebase audits.
---

# Frontrun Architecture Rules

写代码前必读。违反这些规则的代码在 review 时会被打回。

## Module Dependency Graph

```
FRModels       (最底层 — 0 个 FR 依赖)
    ↑
FRServices     (业务逻辑)
    ↑
FRSciChart     (图表渲染)
    ↑
FR*UI          (UI 模块，互相不依赖)
    ↑
FRIntegration  (唯一允许 import TelegramUI 的模块)
```

- 依赖只能向上，禁止向下或循环
- UI 模块之间禁止互相依赖

## Utility Code Placement

工具代码跟着领域走，不搞集中 Utils 模块。

| 工具类型 | 放哪里 | 举例 |
|---------|--------|------|
| Foundation 扩展 (Decimal, Date) | `FRModels/Sources/Extensions/` | `Decimal.doubleValue`, `Date.fromUnixMilliseconds` |
| 价格/数字格式化 | `FRModels/TokenFormatter.swift` | 唯一权威，其他模块禁止重写 |
| 地址验证/链检测 | `FRModels/TokenAddressUtility.swift` | `isValidSolanaAddress`, `detectChainType` |
| CandleEntry 扩展 | `FRModels/ChartModels.swift` | 便利构造器、排序、清洗 |
| OKX 解析工具 | `FRServices/MarketData/Helpers/` | `Dictionary.decimal(forKey:)`, `SignalDeduplicator` |
| SciChart 样式工具 | `FRSciChart/Helpers/` | axis 配置、annotation 工厂 |
| Trading UI 共享组件 | `FRTradingUI/TradingUIUtilities.swift` | `TradingThemeColors`, `TradingColors`, `AnimatedPriceLabel` |

## Anti-Patterns

写代码前对照检查，命中任何一条就要改：

| # | 禁止 | 改用 |
|---|------|------|
| 1 | `NSDecimalNumber(decimal: x).doubleValue` | `x.doubleValue` (Decimal 扩展) |
| 2 | UI 文件里写 `String(format: "%.2f%%")` | `TokenFormatter.formatPercentageChange()` |
| 3 | UI 文件里写 `isDark ? white : black` | `TradingThemeColors(isDark:)` |
| 4 | `entries.sorted { $0.timestamp < $1.timestamp }` | `entries.sortedByTimestamp()` |
| 5 | 重复 OKX JSON 信封验证 | `OKXResponseParser.validateEnvelope()` |
| 6 | `(dict["key"] as? String).flatMap { Decimal(string:) }` | `dict.decimal(forKey:)` |
| 7 | 多文件重复 `priceChange1h ?? priceChange24h` | `token.priceChange(for: timeframe)` |
| 8 | SciChart 里重写数字格式化 | 委托给 `TokenFormatter` |
| 9 | 同一文件两个相同功能的方法 | 删除重复 |
| 10 | `address.lowercased()` 不分链 | 通过 `ContractAddress` 规范化 |
| 11 | `ChartTimeframe.displayName` 重复定义 | FRModels 一份定义 |
| 12 | 每次 `DateFormatter()` 新建实例 | 用静态缓存的 formatter |
| 13 | 散落的 `UIColor.systemGreen/Red` | `TradingColors.accentGreen/Red` |
| 14 | 手写 pendingRequests dict 做去重 | `SignalDeduplicator` |
| 15 | CandleEntry 手动重建 struct 更新 close | `candle.updatingClose(newPrice)` |

## Module Rules

**FRModels** — 不依赖任何 FR 模块。Foundation 扩展放 `Extensions/` 子目录。`TokenFormatter` 是格式化唯一权威。

**FRServices** — 内部工具放 `MarketData/Helpers/`，不对外暴露。OKX 解析用 Dictionary 扩展。

**FRSciChart** — 格式化委托给 `TokenFormatter`。内部样式放 `Helpers/`。注解必须 remove + recreate，禁止原地改属性。

**FRTradingUI** — 共享组件放 `TradingUIUtilities.swift`。颜色用 `TradingThemeColors` 和 `TradingColors`。禁止在单文件定义全局用到的枚举。

**FRIntegration** — 唯一允许 `import TelegramUI`。做 Telegram ↔ Frontrun 桥接。

## New File Checklist

- [ ] 确认该放哪个模块 — 工具代码放最低可用层
- [ ] grep 搜索是否已存在同类功能
- [ ] 用 AsyncDisplayKit 的文件必须 `import Display`
- [ ] BUILD 的 srcs glob 覆盖新文件路径
- [ ] 新增 utility 函数/扩展时，更新 `references/utility-inventory.md`（防止下次 AI 遗忘已有工具重复造轮子）

## Reference

详细 utility 清单: `references/utility-inventory.md`
完整分析文档: `specs/003-inline-trading-widget/utils-architecture.md`
