# Phase 2 — Formatting Consolidation (Medium Risk)

## Task 5: Add `TokenFormatter.formatPercentageChange`
- **File**: `FRModels/Sources/TokenFormatter.swift`
- **Action**: Add static method:
  ```swift
  static func formatPercentageChange(_ change: Decimal?, decimals: Int = 2) -> (text: String, isPositive: Bool)
  ```
- **Then**: Replace inline formatting in:
  - TokenMetadataNode.swift (~line 114)
  - TokenChartPriceRowNode.swift (~line 97)
  - InlineTradingWidgetNode.swift (~line 408)
  - TokenChartStatsRowNode.swift (~line 86)
- **Also**: Update `Token.formattedPriceChange` and `DexTokenInfo.formattedPriceChange` to delegate
- **Acceptance**: All percentage formatting goes through TokenFormatter, build passes

## Task 6: Add `Token.priceChange(for:)` method
- **File**: `FRModels/Sources/Token.swift`
- **Action**: Add extension method:
  ```swift
  func priceChange(for timeframe: ChartTimeframe) -> (change: Decimal?, label: String)
  ```
- **Then**: Replace inline switch statements in:
  - TokenMetadataNode.swift
  - TokenChartPriceRowNode.swift
  - InlineTradingWidgetNode.swift
- **Acceptance**: No inline timeframe-to-priceChange switch statements remain, build passes

## Task 7: Move `TradingColors` to TradingUIUtilities
- **File from**: `FRTradingUI/Sources/TokenChartNode.swift` (lines 16-19)
- **File to**: `FRTradingUI/Sources/TradingUIUtilities.swift`
- **Action**: Move `TradingColors` enum definition to TradingUIUtilities.swift
- **Acceptance**: TradingColors accessible from all FRTradingUI files, no longer in TokenChartNode.swift, build passes

## Task 8: Add `TradingThemeColors` struct
- **File**: `FRTradingUI/Sources/TradingUIUtilities.swift`
- **Action**: Add `TradingThemeColors` struct with isDark-based computed properties
- **Then**: Replace isDark ternaries in:
  - TokenChartNode.swift
  - TokenChartPriceRowNode.swift
  - TokenChartHeaderNode.swift
  - TimeframeSelector.swift
- **Acceptance**: No raw `isDark ? white : black` ternaries in FRTradingUI, build passes

## Build Verification
- Run `./scripts/run.sh --skip-install` after all tasks
