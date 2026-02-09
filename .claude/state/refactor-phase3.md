# Phase 3 — Service Layer Cleanup (Medium Risk)

## Task 9: Add `Dictionary.decimal(forKey:)` + `validateEnvelope` in OKXResponseParser
- **File**: `FRServices/Sources/MarketData/OKXResponseParser.swift`
- **Action**: Add private extensions:
  - `Dictionary.decimal(forKey:)`, `string(forKey:)`, `int(forKey:)`
  - `validateEnvelope(_ data: Data) throws -> Any`
- **Then**: Replace verbose parsing patterns in OKXResponseParser methods
- **Acceptance**: No raw `(dict["key"] as? String).flatMap { Decimal(string: $0) }` patterns, build passes

## Task 10: Extract `stableFNV1aHash` from storage services
- **File create**: `FRServices/Sources/Summary/FRHashUtility.swift`
- **Action**: Extract shared `stableFNV1aHash` function
- **Then**: Delete private copies from:
  - TokenIndexStorageService.swift
  - SummaryStorageService.swift
- **Update BUILD**: Add new file to FRServices BUILD
- **Acceptance**: Single implementation of FNV1a hash, build passes

## Task 11: Extract `jsonString` from AI module
- **File**: `FRServices/Sources/AI/AIService.swift`
- **Action**: Make one implementation `internal static` (or a free function) and delete the other 2 copies
- **Delete from**: StreamingDelegate (line ~308), AIToolExecutionContext (AIToolProtocol.swift line ~129)
- **Acceptance**: Single jsonString implementation, build passes

## Build Verification
- Run `./scripts/run.sh --skip-install` after all tasks
