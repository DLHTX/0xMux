# Utility Inventory

Canonical list of shared utilities and where they live. When writing code, check here first.

> **维护规则**: 每次新增 utility 函数、扩展或共享组件，必须同步更新本文件。这是 AI 下次写代码时的唯一参考，不更新 = 下次重复造轮子。

## FRModels/Sources/Extensions/

### Decimal+Extensions.swift
```swift
extension Decimal {
    var doubleValue: Double { NSDecimalNumber(decimal: self).doubleValue }
}
```
**Status**: TO BE CREATED — currently 25+ inline casts across 8+ files

### Date+Extensions.swift
```swift
extension Date {
    static func fromUnixSeconds(_ t: Int) -> Date
    static func fromUnixMilliseconds(_ t: Int64) -> Date
}
```
**Status**: TO BE CREATED — currently inconsistent ms/s conversion in WebSocketModels, SummaryRecord

---

## FRModels/Sources/TokenFormatter.swift

### Existing
- `formatPrice(_ price: Decimal?) -> String` — handles sub-penny precision tiers
- `formatLargeNumber(_ value: Decimal?) -> String` — K/M/B suffix, 2 dp

### To Add
- `formatPercentageChange(_ change: Decimal?, decimals: Int = 2) -> (text: String, isPositive: Bool)`
- `formatNumber(_ value: Decimal?, style: NumberFormatStyle, prefix: String = "$") -> String`
  - `.compact` = 1 dp (for axis labels)
  - `.standard` = 2 dp (for UI display)
  - `.detailed` = full precision (for tooltips)

---

## FRModels/Sources/ChartModels.swift

### Existing
- `CandleEntry` struct
- `[CandleEntry].convertedToMarketCap(supply:)`

### To Add
- `CandleEntry(timestamp:price:volume:)` convenience init
- `CandleEntry.updatingClose(_:) -> CandleEntry`
- `[CandleEntry].sortedByTimestamp()`
- `[CandleEntry].sanitized()`

### To Delete
- `[CandleEntry].toMarketCap(supply:)` — exact duplicate of `convertedToMarketCap`

---

## FRModels/Sources/Token.swift

### To Add
```swift
extension Token {
    func priceChange(for timeframe: ChartTimeframe) -> (change: Decimal?, label: String)
}
```

---

## FRModels/Sources/TokenAddressUtility.swift

**Status**: TO BE CREATED

```swift
enum TokenAddressUtility {
    static func isValidSolanaAddress(_ s: String) -> Bool
    static func isValidEVMAddress(_ s: String) -> Bool
    static func detectChainType(_ address: String) -> ChainType?
    static func extractAddresses(from text: String) -> [String]
}
```
Currently duplicated in: DexTokenInfo+OKX, AIMarkdownTagProcessor, SummaryManager, OKXWebSocketService

---

## FRModels/Sources/FRHashUtility.swift

**Status**: TO BE CREATED

```swift
enum FRHashUtility {
    static func stableFNV1aHash(_ string: String) -> UInt32
    static func makeValueBoxKey(_ string: String) -> ValueBoxKey
}
```
Currently duplicated in: TokenIndexStorageService, SummaryStorageService

---

## FRServices/Sources/MarketData/Helpers/

### OKXDictionaryParsing.swift
```swift
extension Dictionary where Key == String, Value == Any {
    func decimal(forKey key: String) -> Decimal?
    func string(forKey key: String) -> String?
    func int(forKey key: String) -> Int?
}
```
**Status**: TO BE CREATED — currently 10+ inline casts in OKXResponseParser + OKXWebSocketService

### SignalDeduplicator.swift
```swift
final class SignalDeduplicator<Key: Hashable, Value, E: Error> {
    func deduplicate(key: Key, create: () -> Signal<Value, E>) -> Signal<Value, E>
}
```
**Status**: TO BE CREATED — pattern repeated 4x in TokenChartService + OKXDataSource

---

## FRTradingUI/Sources/TradingUIUtilities.swift

### Existing
- `ChainPlaceholder` — chain-colored placeholder image
- `TokenImageLoader` — async image loading with placeholder
- `AnimatedPriceLabel` — per-digit rolling animation

### To Add

#### TradingThemeColors
```swift
struct TradingThemeColors {
    let isDark: Bool
    var primaryText: UIColor
    var secondaryText: UIColor
    var mutedText: UIColor
    var background: UIColor
    var cardBackground: UIColor
}
```
Currently: isDark ternary repeated in 6 files (20+ individual color resolutions)

#### TradingColors (move from TokenChartNode.swift:16-19)
```swift
enum TradingColors {
    static let accentGreen = UIColor(red: 0.0, green: 0.85, blue: 0.55, alpha: 1.0)
    static let accentRed = UIColor(red: 0.95, green: 0.25, blue: 0.35, alpha: 1.0)
}
```
Currently: defined in TokenChartNode but used in 5+ files

#### DisplayLinkProxy (move from ChartLoadingAnimationNode)
```swift
final class DisplayLinkProxy {
    let handler: () -> Void
    @objc func handleDisplayLink()
}
```

#### Constants
```swift
enum TradingUIConstants {
    static let middotSeparator = "  \u{00B7}  "
}
```

---

## FRSciChart/Sources/Helpers/

### ChartStyleHelpers.swift
```swift
// Annotation factory (eliminates 30-line duplication)
func createPriceLineAnnotation(price:lineColor:priceText:) -> SCIHorizontalLineAnnotation

// Axis configuration
func configureAxis(_:showLabels:showGrid:labelColor:)

// Surface background
extension SCIChartSurface { func setChartBackground(_:) }
```
**Status**: TO BE CREATED — currently duplicated in SciChartSurfaceNode + SciChartMiniSurfaceNode
