# Phase 1 — Foundation (Low Risk, No Behavior Change)

## Task 1: Add `Decimal.doubleValue` extension
- **File**: Create `FRModels/Sources/Extensions/Decimal+Extensions.swift`
- **Action**: Add `extension Decimal { var doubleValue: Double { NSDecimalNumber(decimal: self).doubleValue } }`
- **Then**: Find-replace all 33 instances of `NSDecimalNumber(decimal: X).doubleValue` with `X.doubleValue` across:
  - FRModels: TokenFormatter.swift, Token.swift, DexTokenInfo.swift
  - FRSciChart: DataSeriesConverters.swift, SciChartSurfaceNode.swift, SciChartMiniSurfaceNode.swift
  - FRTradingUI: TokenMetadataNode.swift, TokenChartPriceRowNode.swift, TokenChartStatsRowNode.swift, InlineTradingWidgetNode.swift
  - FRServices: DexTokenInfo+OKX.swift
- **Add to BUILD**: Update FRModels BUILD file to include new source file
- **Acceptance**: All 33 NSDecimalNumber(decimal:).doubleValue replaced, build passes

## Task 2: Add CandleEntry convenience methods
- **File**: `FRModels/Sources/ChartModels.swift`
- **Action**: Add to existing CandleEntry extensions:
  - `init(timestamp: Date, price: Decimal, volume: Decimal = 0)` — single-price convenience
  - `func updatingClose(_ newClose: Decimal) -> CandleEntry` — update close with hi/lo adjustment
  - `func sortedByTimestamp() -> [CandleEntry]` on Array extension
  - `func sanitized() -> [CandleEntry]` on Array extension (filter isValid + sort)
- **Then**: Replace verbose patterns in callers (SciChartSurfaceNode, InlineTradingWidgetNode, etc.)
- **Acceptance**: No duplicate CandleEntry construction patterns, build passes

## Task 3: Delete duplicate `toMarketCap` in ChartModels.swift
- **File**: `FRModels/Sources/ChartModels.swift`
- **Action**: Delete `toMarketCap(supply:)` at line ~284, keep `convertedToMarketCap(supply:)`
- **Then**: Find all callers of `toMarketCap` and replace with `convertedToMarketCap`
- **Acceptance**: Only one market cap conversion method exists, build passes

## Task 4: Fix duplicate `ChartTimeframe.displayName`
- **File**: `FRTradingUI/Sources/TimeframeSelector.swift`
- **Action**: Delete the `displayName` extension on ChartTimeframe in TimeframeSelector.swift
- **Note**: If lowercase is needed for selector UI, use the existing `displayName` (uppercase) — verify visually
- **Acceptance**: Only one `displayName` definition for ChartTimeframe, build passes

## Build Verification
- Run `./scripts/run.sh --skip-install` after all 4 tasks
