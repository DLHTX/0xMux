---
name: frontrun-ios-code-reviewer
description: iOS code quality reviewer that detects redundancy, duplication, obvious bugs, and architectural issues like over-fragmentation or high coupling. Use this skill when reviewing Swift/iOS code for quality issues, refactoring opportunities, or architectural health checks. Supports two modes - file-level review and branch-level architecture audit.
---

# iOS Code Reviewer

Analyzes iOS/Swift code for quality issues including redundancy, duplication, bugs, and architectural problems. Operates at two levels:
- **File-level review**: Targeted review of specific files/directories
- **Branch-level architecture audit**: Comprehensive analysis of all changes on a feature branch

## Quick Usage

When user requests code review, analyze the specified files/directories and report:
1. **Redundancy & Duplication** - Similar code patterns that could be consolidated
2. **Obvious Bugs** - Logic errors, nil handling issues, memory leaks
3. **Architecture Issues** - Over-fragmentation, high coupling, poor separation

When user requests architecture-level analysis (keywords: "architecture", "branch review", "all changes", "refactor audit"), use the **Branch-Level Architecture Audit** workflow below.

## Review Checklist

### 1. Redundancy & Duplication Detection

**What to look for:**
- Duplicate code blocks (>10 lines similar)
- Similar functions with minor variations
- Copy-paste patterns with slight modifications
- Repeated string literals without constants
- Identical error handling patterns that should be extracted
- Similar UI setup code that could use a factory/builder

**Severity:**
- 🔴 **High**: >30 lines duplicated across 3+ locations
- 🟡 **Medium**: 15-30 lines duplicated in 2 locations
- 🔵 **Low**: <15 lines or minor pattern repetition

### 2. Obvious Bug Detection

**Categories:**

#### 2.1 Nil/Optional Handling
- Force unwraps (`!`) without nil checks
- Implicit unwrapped optionals misused
- Missing nil coalescing where appropriate
- Optional chaining that silently fails critical operations

#### 2.2 Memory Issues
- Strong reference cycles in closures (missing `[weak self]`)
- Retained delegates (should be `weak`)
- Observers not removed in `deinit`
- Large objects retained unnecessarily

#### 2.3 Concurrency Issues
- Main thread violations (UI updates from background)
- Race conditions in shared state
- Missing `@MainActor` annotations
- Unsafe `DispatchQueue.main.sync` from main

#### 2.4 Logic Errors
- Unreachable code paths
- Inverted conditions
- Off-by-one errors
- Missing return statements in computed properties
- Comparison of floating points with `==`

**Severity:**
- 🔴 **Critical**: Will crash or corrupt data
- 🟡 **Warning**: May cause issues under certain conditions
- 🔵 **Info**: Potential issue, worth reviewing

### 3. Architecture Analysis

#### 3.1 Over-Fragmentation (Too Many Files)

**Signs:**
- Single-method classes/structs
- Protocols with only one conforming type and no testing mocks
- Excessive file splitting for small features
- Deep folder nesting (>4 levels)
- Files under 50 lines that could be consolidated

**Thresholds:**
- Feature folder with >15 files for simple CRUD
- Protocol + Implementation + Extension in separate files for trivial types
- >3 files for a single UI component

#### 3.2 High Coupling

**Signs:**
- Circular imports between modules
- Direct instantiation instead of dependency injection
- Massive view controllers (>500 lines)
- God objects that know too much
- Feature A importing implementation details of Feature B
- Service layer directly accessing UI layer

**Coupling Metrics:**
- Count imports: >10 imports = warning, >20 = critical
- Count dependencies: >5 concrete types = warning
- Afferent/Efferent coupling ratio

#### 3.3 Layer Violations

**Check for:**
- UI layer importing Service internals
- Service layer importing UI components
- Model layer with business logic that belongs in services
- Networking code mixed with UI
- Database queries in view controllers

## Review Output Format

Structure the report with:
1. **Summary** — files analyzed, issue counts by severity
2. **Critical Issues** — each with location (file:line), description, and recommendation
3. **Warnings** — same format
4. **Info** — brief list
5. **Architecture Health** — coupling score, fragmentation score, overall assessment

Use tables for compact presentation when listing many issues. Use `file.swift:LINE` references so issues are navigable. Always include concrete recommendations, not just problem descriptions.

## Execution Steps

1. **Scope Definition**
   - Identify files/directories to review
   - Check file count and lines of code

2. **Duplication Scan**
   - Look for similar code patterns across files
   - Identify repeated logic blocks
   - Check for constant extraction opportunities

3. **Bug Hunt**
   - Scan for force unwraps and nil issues
   - Check closure capture lists
   - Verify main thread UI updates
   - Look for logic errors

4. **Architecture Audit**
   - Count files per feature
   - Analyze import statements
   - Check file sizes (flag >500 lines)
   - Verify layer boundaries

5. **Report Generation**
   - Prioritize by severity
   - Provide actionable recommendations
   - Include code examples for fixes

## iOS/Swift Specific Patterns

### Common Anti-Patterns to Flag

1. **Massive AppDelegate** - Should delegate to coordinators
2. **Storyboard Segue Spaghetti** - Prefer programmatic or coordinator pattern
3. **Singleton Abuse** - Flag `shared` instances without DI option
4. **NotificationCenter Spam** - Should use delegation or reactive patterns
5. **UserDefaults as Database** - Flag if storing complex data
6. **Stringly-Typed APIs** - Flag raw strings for identifiers, keys, etc.

### Good Patterns to Acknowledge

- ✅ Protocol-oriented design
- ✅ Proper use of value types
- ✅ Clean separation of concerns
- ✅ Appropriate use of extensions
- ✅ Proper access control (private/internal/public)

---

## Branch-Level Architecture Audit

Use this workflow when the user asks for a comprehensive review of all changes on a feature branch, wants to find cross-file architectural issues, or asks for refactoring opportunities across the codebase.

### Execution Strategy

**Step 1: Scope the branch**
```bash
git log master..HEAD --oneline        # All commits
git diff master...HEAD --stat         # All changed files with line counts
```

**Step 2: Categorize files by layer**

Group changed files into architectural layers for parallel analysis:
- **Models** (FRModels, data types, DTOs)
- **Services** (networking, data sources, WebSocket, caching)
- **UI** (nodes, view controllers, animations)
- **Integration** (bridge code between modules)
- **Build/Config** (BUILD files, scripts, configs)

**Step 3: Launch parallel research agents**

Use the Task tool to spawn 3-4 `parallel-research` agents simultaneously, one per layer. Each agent reads ALL files in its layer and produces a structured report. This is critical for efficiency — a 15,000+ line branch cannot be reviewed sequentially.

Each agent should receive:
- Full list of file paths to read
- Specific checklist of what to look for (see per-layer checklists below)
- Instruction to report: line count, purpose, key types, and issues for each file

**Step 4: Synthesize findings**

Merge agent reports into a single prioritized audit document with CRITICAL/HIGH/MEDIUM/LOW tiers.

### Per-Layer Analysis Checklists

#### Models Layer
- [ ] Duplicate model types representing the same domain concept
- [ ] Duplicated formatting/conversion logic across models
- [ ] Inconsistent numeric types (Decimal vs Double vs String) for same kind of data
- [ ] Models over 300 lines (likely violating SRP)
- [ ] Files with 3+ unrelated types (grab-bag files)
- [ ] Tight coupling between models and UI state
- [ ] Inconsistent Codable/Equatable conformances
- [ ] Custom Equatable that ignores mutable state (causes UI update bugs)
- [ ] Duplicate validation/detection logic (e.g., address validation in multiple places)
- [ ] UIKit imports in pure model files

#### Services Layer
- [ ] God classes over 800 lines
- [ ] Duplicate networking code (GET/POST sharing 90%+ logic)
- [ ] Duplicate cache wrapper classes (should be generic `CacheWrapper<T>`)
- [ ] Duplicate batch queue patterns (should be generic `BatchQueue<Key,Value>`)
- [ ] Double caching (same data cached at two layers with same TTL)
- [ ] Protocol abstractions bypassed by direct singleton access
- [ ] Protocol missing methods that consumers need (forcing bypass)
- [ ] Dead code: unused parsing methods, stub implementations
- [ ] Request deduplication duplicated across services
- [ ] Hardcoded URLs without environment configuration
- [ ] NSLog with string interpolation (crashes if `%` in interpolated value — must use `%@`)
- [ ] WebSocket subscription key mismatches (subscribe vs unsubscribe key formats)
- [ ] Promises/subscriptions not cleaned on disconnect
- [ ] Fire-and-forget signal disposal (`let _ = signal.start()`)

#### UI Layer
- [ ] God objects over 1,000 lines with nested private classes
- [ ] Business logic in UI (Decimal parsing, model mutation, supply calculation)
- [ ] Duplicated helper functions across UI nodes (format, convert, animate)
- [ ] Duplicated animation patterns (color flash, price update animation)
- [ ] Duplicated image loading (raw URLSession instead of shared loader)
- [ ] Hardcoded color constants defined in multiple places
- [ ] Hardcoded user-facing strings (should use `frString()`)
- [ ] Excessive NSLog in production (especially call stack logging)
- [ ] `DispatchQueue.main.asyncAfter` patterns without cancellation
- [ ] Missing accessibility labels (empty `updateAccessibilityLabel()`)
- [ ] Deprecated APIs (`preferredFramesPerSecond` → `preferredFrameRateRange`)
- [ ] Dead code: entirely unused theme/style files
- [ ] Nested classes that should be extracted to own files (>100 lines)

#### Integration Layer
- [ ] Clean isolation from host app (Telegram) internals
- [ ] Minimal modifications to host app core files
- [ ] Dead bridge code (factory methods unused by actual consumers)
- [ ] Duplicated logic between bridge and consumer (e.g., dedup logic)
- [ ] Unnecessary BUILD dependencies
- [ ] Singleton initialization called repeatedly (should be once at launch)
- [ ] Feature flags with hardcoded values (getter ignoring stored state)

### God Object Detection

Flag any file exceeding these thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Total lines | >500 | >1,000 |
| Responsibilities | >3 | >5 |
| Nested types | >2 | >4 |
| Import count | >10 | >15 |

For each god object, list its responsibilities and propose concrete **extraction targets** (new types to break it into).

### Cross-Cutting Duplication Detection

Look for patterns duplicated **across modules**, not just within files:

| Pattern | What to check |
|---------|--------------|
| Formatting | Same `formatPrice`, `formatLargeNumber`, `formatMarketCap` in multiple models |
| Validation | Address validation in Chain.swift, ContractAddress.swift, DexTokenInfo.swift |
| Caching | Identical cache wrapper structs in different service files |
| Colors | Same RGB constants defined in 3+ files |
| URL construction | Explorer URLs built in multiple places |
| Address display | Different shortening logic (`prefix(4)` vs `prefix(6)`) |
| WS handling | Same Decimal parsing + model mutation in multiple UI nodes |

### Output Format for Architecture Audit

Structure the report as:
1. **Executive Summary** — branch scope, key metrics (files over threshold, duplicated lines, dead code, potential bugs)
2. **Issues by severity tier** — CRITICAL → HIGH → MEDIUM → LOW, each with file:line evidence and concrete recommendations
3. **Positive Patterns** — acknowledge good architecture decisions (balanced review builds trust)
4. **Proposed Refactoring Plan** — phased by risk level (low-risk pure extraction first, structural changes later, large refactors last)

Use tables for compact presentation. Every issue must have a file:line reference and a recommendation. Prioritize issues that cause real problems (bugs, leaks, maintenance burden) over style preferences.

### Severity Classification

| Tier | Criteria | Examples |
|------|----------|---------|
| **CRITICAL** | Blocks maintainability, causes bugs, >100 lines duplicated | God objects >1,300 lines; duplicated models; subscription key bugs |
| **HIGH** | Significant waste or design flaw, >50 lines affected | Dead code modules; double caching; protocol bypass; leaked resources |
| **MEDIUM** | Code smell, inconsistency, <50 lines affected | Hardcoded strings; scattered constants; excessive logging |
| **LOW** | Style, minor cleanup | Deprecated API; unused imports; naming inconsistency |

### Refactoring Safety Rules

When proposing refactoring:
1. **Phase by risk** — pure extraction first, behavioral changes later
2. **Build after each phase** — verify no compilation errors
3. **No functional changes** — refactoring must not alter behavior
4. **Preserve public API** — internal restructuring only unless explicitly requested
5. **Test integration points** — especially WebSocket subscriptions, cache invalidation, UI state machines

---

## Notes

- Be pragmatic - not every duplication needs extraction
- Consider the project phase - early stage can tolerate some tech debt
- Prioritize issues that affect reliability over style
- Always provide concrete, actionable recommendations
- Include code examples for non-trivial fixes
- For branch-level audits, always use parallel research agents — sequential reading of 15,000+ lines wastes context window
- Acknowledge good patterns alongside issues — balanced reviews are more credible and actionable
