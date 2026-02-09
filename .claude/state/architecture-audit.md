# Architecture Audit: `003-inline-trading-widget` Branch

**Date**: 2026-02-06
**Branch**: 003-inline-trading-widget (59 files, +15,338 / -239 lines)

---

## Executive Summary

This branch introduces an inline trading widget for contract address detection in chat. The feature is well-integrated into Telegram's bubble system with minimal core modifications. However, the implementation has significant code duplication, several god objects, and inconsistent patterns that should be addressed before merging.

**Key Metrics:**
- 6 files over 500 lines (2 over 1,300 lines)
- ~200 lines of duplicated formatting logic across Token/DexTokenInfo
- ~90 lines of duplicated WebSocket parsing in 2 UI files
- 6 identical cache wrapper classes across 2 files
- 211 lines of dead code (SciChartTheme.swift - entirely unused)
- 1 potential bug (WebSocket subscription key mismatch)

---

## CRITICAL Issues

### C1. God Objects (InlineTradingWidgetNode: 1,694 lines, TokenChartNode: 1,351 lines, OKXDataSource: 1,381 lines)

Three files exceed 1,300 lines each and violate single-responsibility:

| File | Lines | Responsibilities |
|------|-------|-----------------|
| InlineTradingWidgetNode | 1,694 | State machine, data fetch, WS subscription, price→mcap conversion, shimmer, theming, accessibility, 3 nested classes |
| TokenChartNode | 1,351 | Data fetch, WS subscription, price→mcap conversion, chart display, 5 nested classes |
| OKXDataSource | 1,381 | HTTP networking, 3 batch queues, 5 caches, response parsing, chain index resolution |

**Recommended extraction targets:**
- `TokenPriceUpdateHandler` — shared WS price parsing (from both UI nodes)
- `BatchQueue<Key, Value>` — generic batch queue (replace 3 copies)
- `CacheWrapper<T>` — generic cache (replace 6 copies)
- `OKXResponseParser` — extract all `parse*` methods
- Move nested classes to own files (TokenMetadataNode, ChainIndicatorNode, TimeframeSelector, etc.)

### C2. Duplicated Token Models (Token vs DexTokenInfo)

Two models represent the same concept with duplicated formatting logic:

| Method | Token.swift | DexTokenInfo.swift |
|--------|------------|-------------------|
| `formatPrice()` / `formattedPrice` | Decimal-based | Double-based |
| `formatLargeNumber()` | static, takes Decimal? | instance, takes Double? |
| `formattedMarketCap` | ✓ | ✓ |
| `formattedVolume` | ✓ | ✓ |
| `isPriceUp` | ✓ | ✓ |
| `formattedPriceChange` | ✓ | ✓ |

~60 lines of duplicated formatting logic with subtle type differences.

**Recommendation:** Extract a `TokenFormatter` utility with both Decimal and Double overloads.

### C3. Triple-Duplicated Chain/Address Validation

Three independent systems validate addresses and map chains:

1. `Chain` protocol + `SolanaChain`/`EthereumChain` (Chain.swift) — full OOP with registry
2. `ChainDetection` enum (DexTokenInfo.swift) — static helper functions
3. `ContractAddress.init` (ContractAddress.swift) — inline normalization

**Recommendation:** Delete `ChainDetection`, unify through `ChainRegistry`.

---

## HIGH Issues

### H1. SciChartTheme.swift is 211 Lines of Dead Code

`SciChartTheme` provides exactly the abstractions needed (color mapping, series factories, axis styling) but is **completely unused**. Both `SciChartSurfaceNode` and `SciChartMiniSurfaceNode` hardcode their own colors.

**Recommendation:** Either adopt SciChartTheme or delete it.

### H2. Double Caching (OKXDataSource + TokenChartService)

Both layers maintain independent caches with identical TTLs:
- `OKXDataSource`: priceCache (10s), chartCache (10s), metadataCache (1h), basicInfoCache (1h)
- `TokenChartService`: tokenCache (10s), chartCache (10s)

Every lookup checks two caches; every store writes to two caches.

**Recommendation:** Cache at one layer only (OKXDataSource).

### H3. 6 Identical Cache Wrapper Classes

```
OKXDataSource:    PriceCacheWrapper, ChartCacheWrapper, MetadataCacheWrapper, BasicInfoCacheWrapper
TokenChartService: TokenCacheWrapper, ChartCacheWrapper
```

All structurally identical — only the generic type differs.

**Recommendation:** Single `CacheWrapper<T>`.

### H4. Protocol Abstraction is Leaky

`TokenChartService` bypasses `ChartDataSourceProtocol` by calling `OKXDataSource.shared` directly:
- `OKXDataSource.shared.setChainIndex()` (not on protocol)
- `OKXDataSource.shared.fetchBasicInfo()` (not on protocol)

**Recommendation:** Add missing methods to protocol, or remove the protocol if only one implementation exists.

### H5. WebSocket Subscription Key Mismatch (Potential Bug)

`subscribeToPriceUpdates` registers key as `"token"` but `handleUnsubscribe` constructs `"price:token"`. Subscriber counts may never decrement for price channel → leaked promises.

**Recommendation:** Verify and fix key consistency.

### H6. Duplicated WebSocket Update Handling in UI

Both `InlineTradingWidgetNode.handleWebSocketPriceInfoUpdate` (~96 lines) and `TokenChartNode.handlePriceInfoUpdate` (~89 lines) contain nearly identical business logic: Decimal string parsing, supply calculation, token mutation, chart entry construction.

**Recommendation:** Extract to shared `TokenPriceUpdateHandler`.

---

## MEDIUM Issues

### M1. Inconsistent Numeric Types

| Context | Type Used |
|---------|----------|
| Token prices | Decimal |
| DexTokenInfo prices | Double |
| CandleEntry OHLCV | Decimal |
| PricePoint price | Double |
| WebSocketCandleUpdate | Double |
| WebSocketPriceInfoUpdate | String (all fields) |

### M2. Duplicated UI Components

| Component | Location A | Location B | Lines |
|-----------|-----------|-----------|-------|
| `convertPriceToMarketCap` | InlineTradingWidgetNode:972 | TokenChartNode:499 | 16 |
| `updatePriceWithAnimation` | TokenMetadataNode:1361 | TokenChartPriceRowNode:882 | 67 |
| `makePlaceholder` (chain icon) | ChainIndicatorNode:1197 | TokenChartHeaderNode:747 | 18 |
| Image loading (URLSession) | ChainIndicatorNode:1175 | TokenChartHeaderNode:666 | 11 |
| `accentGreen`/`accentRed` | 4 separate definitions | | 8 |

### M3. Hardcoded Strings Violate Localization Rules

Found in: InlineTradingWidgetNode, TokenChartNode, TokenChartViewController, ChartErrorNode.
Examples: "Token not found", "Chart data unavailable", "Retry", "Close", "MCap".
Should use `frString()`.

### M4. Excessive NSLog in Production Code

~55+ NSLog statements across UI files, many with emoji. `SciChartMiniSurfaceNode.update()` logs full call stack on every invocation — performance concern.

### M5. FRFeatureFlags Dead Code

Getter hardcoded to `true`, ignoring UserDefaults. Setter, reset, and Keys enum are non-functional.

### M6. Explorer URL Logic Scattered in 3 Places

`Chain.explorerUrl()`, `DexTokenInfo.getExplorerUrl()`, `ContractAddress.explorerUrl` — three independent implementations.

### M7. Address Shortening Inconsistency

`ContractAddress.shortDisplay` uses prefix(4)...suffix(4); `FRAddressFormatting.shortenAddress` uses prefix(6)...suffix(4).

### M8. Dead Code in OKXDataSource

`parseChartResponse` and `parsePriceResponse` are never called.

### M9. Dead Code in ChatMessageExtensions

`ChatMessageWidgetExtensions.createWidgets()` is never called by the actual content node. Dedup logic is duplicated in the content node.

### M10. `ChainRegistry.registerDefaults()` Called 5 Times

Called on every string extension property access in `ChatMessageExtensions.swift`. Should be called once at app launch.

---

## LOW Issues

- `Chain.swift` imports UIKit but only uses Foundation types
- `Token.==` ignores price data → two tokens with different prices compare as equal
- `preferredFramesPerSecond = 30` deprecated in iOS 15+
- `DataSeriesConverters.priceRange`/`timeRange` unused
- Unnecessary `FRServices` BUILD dependency in `ChatMessageContractAddressBubbleContentNode`
- `InlineWidgetState.loaded` tightly couples widget state to `Token` model
- `Token` property naming inconsistent: `priceChange1h` vs `priceChange4H` vs `priceChange5M`

---

## Positive Patterns Worth Noting

1. **Telegram integration is clean** — only 2 core files modified with surgical diffs, using existing `isDetached` mechanism
2. **FRIntegration layer** provides good isolation between Frontrun and Telegram
3. **ChartLoadingAnimationNode** — well-structured, focused, proper CADisplayLink lifecycle
4. **TokenChartViewController** — thin controller, delegates to chart node
5. **DataSeriesConverters** — clean static utility
6. **FRSciChartLicense** — minimal, idempotent
7. **DexTokenInfo+OKX** adapter — focused bridge between data sources

---

## Proposed Refactoring Plan (Priority Order)

### Phase 1: Low-Risk Deduplication (No behavioral change)
1. Extract `CacheWrapper<T>` generic → replace 6 copies
2. Extract `TokenFormatter` utility → unify formatting from Token + DexTokenInfo
3. Extract shared `convertPriceToMarketCap` → used by both UI nodes
4. Extract shared trading colors (`accentGreen`/`accentRed`)
5. Delete dead code: `parseChartResponse`, `parsePriceResponse`, `SciChartTheme` (or adopt it)
6. Delete `ChainDetection` enum → use ChainRegistry

### Phase 2: Medium-Risk Structural Improvements
7. Extract `TokenPriceUpdateHandler` from both UI nodes
8. Extract nested classes to own files (TokenMetadataNode, ChainIndicatorNode, etc.)
9. Remove double-caching (keep only OKXDataSource cache)
10. Fix WebSocket subscription key mismatch

### Phase 3: Larger Refactors (Future)
11. Break up OKXDataSource (NetworkClient, BatchQueue, ResponseParser)
12. Add missing methods to ChartDataSourceProtocol
13. Introduce ViewModel for InlineTradingWidgetNode / TokenChartNode
14. Standardize numeric types (Decimal vs Double)
