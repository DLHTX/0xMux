# Refactor Discovery Report

> Generated: 2026-02-06
> Source: specs/003-inline-trading-widget/utils-architecture.md
> Branch: 003-inline-trading-widget

## Issue Inventory

| # | File(s) | Severity | Category | Instances | Risk |
|---|---------|----------|----------|-----------|------|
| 1 | 8+ files / 4 modules | CRITICAL | Decimal.doubleValue missing | 33 | Low |
| 2 | ChartModels.swift | HIGH | Duplicate toMarketCap | 2 methods | Low |
| 3 | TimeframeSelector.swift | HIGH | Duplicate displayName (case bug) | 2 defs | Low |
| 4 | ChartModels.swift | MEDIUM | CandleEntry missing conveniences | 8 patterns | Low |
| 5 | 4 files / 2 modules | CRITICAL | Price change formatting inconsistency | 6 impls | Medium |
| 6 | 3 files | HIGH | priceChange(for:) duplication | 3 switches | Medium |
| 7 | TokenChartNode.swift | HIGH | TradingColors misplaced | 5+ consumers | Medium |
| 8 | TokenFormatter.swift | MEDIUM | NumberFormatStyle missing | 2 formatters | Medium |
| 9 | OKXResponseParser.swift | MEDIUM | Dictionary parsing boilerplate | 10+ casts | Medium |
| 10 | 2 storage files | MEDIUM | stableFNV1aHash duplication | 2 copies | Low |
| 11 | 3 AI files | MEDIUM | jsonString duplication | 3 copies | Low |
| 12 | OKXWebSocketService.swift | MEDIUM | Subscribe boilerplate | 3 methods | High |
| 13 | 6 FRTradingUI files | HIGH | isDark theme ternaries | 20+ ternaries | Medium |
| 14 | 2 error node files | MEDIUM | Error node duplication | 2 classes | Medium |
| 15 | SciChartSurfaceNode.swift | LOW | Annotation factory missing | 2 creation sites | Low |

## Risk Tiers

### Low Risk (Phase 1) - Pure extraction, no behavior change
- Tasks 1-4: Decimal extension, delete duplicate methods, CandleEntry conveniences

### Medium Risk (Phase 2) - Formatting consolidation, preserves behavior
- Tasks 5-8: formatPercentageChange, priceChange(for:), TradingColors, NumberFormatStyle

### Medium Risk (Phase 3) - Service layer cleanup
- Tasks 9-11: OKX parsing helpers, hash utility, JSON utility

### Medium Risk (Phase 4) - UI layer cleanup
- Tasks 13-15: TradingThemeColors, error node unification, annotation factory
