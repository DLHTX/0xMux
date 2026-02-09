---
name: frontrun-refactor-loop
description: Reusable refactoring workflow that orchestrates discovery, planning, parallel execution, and verification. Use when tackling architectural issues, code duplication, or structural improvements. Chains code-reviewer for analysis, team-based parallel implementation, and build-debug for verification.
---

# Refactor Loop

Orchestrates the full refactoring lifecycle: Discover → Plan → Execute → Verify.

## When to Use

- Architectural refactoring (god objects, layer violations, coupling)
- Code deduplication across modules
- Structural extraction (nested classes, shared utilities)
- Data layer redesign (protocol fixes, cache consolidation, type standardization)

## Prerequisites

- Depends on: `/ios-review` (discovery phase) and `/frontrun-ios-build-debug` (verification phase)
- Phase spec files should be at `.claude/state/refactor-phase*.md`

---

## Phase 0: Discover

> Goal: Find problems and quantify them.

1. Run `/ios-review` in **branch-level architecture audit** mode
2. Output: prioritized issue list with severity (CRITICAL / HIGH / MEDIUM / LOW)
3. Group issues into risk tiers:
   - **Low-risk**: Pure deduplication, dead code deletion (no behavior change)
   - **Medium-risk**: Structural extraction (file reorg, preserves behavior)
   - **High-risk**: Architectural changes (data flow, type contracts, protocols)

### Output Artifact

Write `.claude/state/refactor-discovery.md` with:
- Issue inventory table (file, severity, category, line count affected)
- Risk-grouped summary
- Recommended phase breakdown

---

## Phase 1: Plan

> Goal: Turn discovery into actionable phase specs.

For each risk tier, generate a phase spec file following the template in `references/phase-template.md`.

### Output Artifacts

- `.claude/state/refactor-phase1.md` (low-risk)
- `.claude/state/refactor-phase2.md` (medium-risk)
- `.claude/state/refactor-phase3.md` (high-risk)

Each phase spec must include:
- Numbered tasks with clear acceptance criteria
- File paths involved
- Dependency order between tasks
- Build verification step at the end

---

## Phase 2: Execute

> Goal: Implement refactoring with appropriate parallelism.

### Choose Team Mode

See `references/team-config.md` for full details. Pick based on scope:

| Mode | When | Agents |
|------|------|--------|
| **Solo** | < 5 tasks, low-risk | Main agent only (no team) |
| **Duo** (default) | 5-10 tasks, low/medium-risk | `coder` + `verifier` |
| **Squad** | 10+ tasks, independent workstreams | 2 `coder`s + `verifier` |

### Duo Mode (Default)

The coder validates assumptions AND implements — no separate analyzer needed.

```
Timeline:
  coder    ──→ [grep+implement Task 1] ──→ [Task 2] ──→ [Task 3] ──→ ...
  verifier ──→ [wait]                  ──→ [review Task 1] ──→ [review 2+3, build] ──→ ...
```

**Rules:**
- `coder` greps/reads to validate each task's assumptions first, then implements
- `verifier` reviews completed tasks in batches and runs builds
- If `verifier` finds issues → sends fix instructions to `coder`
- Build (`./scripts/run.sh --skip-install`) after every 2-3 tasks, full build after each phase
- Process phases sequentially (Phase 1 → 2 → 3)

### Task Flow per Task

```
1. coder: grep/read to validate assumptions → implement the change → mark task complete
2. verifier: review the diff + batch build → passes or sends fix instructions
```

---

## Phase 3: Verify

> Goal: Ensure nothing is broken.

1. Full build: `./scripts/run.sh --skip-install`
2. If build passes, full run: `./scripts/run.sh`
3. Use `/frontrun-ios-build-debug` for interactive testing:
   - Launch app
   - `describe_ui` for coordinates
   - `tap` / `gesture` for automated interaction
   - `screenshot` at key states
   - `start_sim_log_cap` / `stop_sim_log_cap` for log verification
4. Regression checklist (customize per feature):
   - [ ] Core feature works
   - [ ] Real-time updates function
   - [ ] Error states display correctly
   - [ ] No new warnings in logs

---

## Quick Start

If phase specs already exist:

```
User: /refactor-loop
→ Agent reads phase specs from .claude/state/refactor-phase*.md
→ Creates team
→ Executes phases sequentially with pipelined tasks
→ Verifies with build + interactive test
```

If starting fresh:

```
User: /refactor-loop
→ Agent runs /ios-review branch audit (discovery)
→ Generates phase specs
→ Creates team
→ Executes + verifies
```

---

## Resuming Interrupted Refactoring

If a session ends mid-refactoring:
1. Read `.claude/state/current-task.md` for last session state
2. Read phase spec files to find uncompleted tasks
3. Resume from the next incomplete task — do NOT redo completed work
4. Re-run build verification before continuing (code may have changed)

---

## Notes

- This is a Telegram-iOS fork built with Bazel
- Use `NSLog` not `print` for debugging
- Follow existing code style (PascalCase types, camelCase methods)
- SciChart patterns: see MEMORY.md for critical gotchas
- WebSocket subscription: subscribe FIRST, dispose old SECOND
- Do NOT push or create PRs unless explicitly asked
