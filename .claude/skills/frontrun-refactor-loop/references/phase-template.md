# Phase Spec Template

Use this template when generating refactoring phase specs from discovery results.

---

```markdown
# Phase N: [Title] ([Risk Level])

**Branch**: `branch-name`
**Risk**: [Low / Medium / High] — [one-line risk description]
**Prerequisite**: [Prior phases that must be completed]
**Estimated scope**: ~N tasks, [brief action summary]

---

## Context

[2-3 sentences explaining what this phase addresses and why]

---

## Task 1: [Verb] [Target]

**Problem**: [What's wrong, with line counts or duplication metrics]

**Files**:
- `path/to/file1.swift` — [what it contains]
- `path/to/file2.swift` — [what it contains]

**Action**:
1. [Read / grep step to understand current state]
2. [Concrete implementation step]
3. [Update BUILD if needed]

**Acceptance criteria**: [Measurable outcome, e.g., "X lines removed", "single source of truth", "build succeeds"]

---

## Task 2: ...

[Same structure as Task 1]

---

## Build Verification

After all tasks, run:
\```bash
./scripts/run.sh --skip-install
\```

Build must succeed with zero new warnings related to these changes.

---

## Notes for the AI Context

- [Project-specific notes]
- [Known gotchas from MEMORY.md]
- [Build system notes]
- Do NOT push or create PRs — just make the code changes
```

---

## Guidelines for Writing Phase Specs

### Risk Classification

| Risk | Criteria | Examples |
|------|----------|---------|
| **Low** | No behavior change, pure cleanup | Dead code deletion, deduplication, constant extraction |
| **Medium** | File reorg, preserves behavior | Extract nested classes, consolidate caches, move files |
| **High** | Changes data flow or type contracts | ViewModel extraction, protocol redesign, numeric type changes |

### Task Ordering Rules

1. **Independent tasks first** — can be parallelized
2. **Extraction before deletion** — extract shared code, then delete the duplicates
3. **Read before write** — each task starts with a read/grep step
4. **Build after every 2-3 tasks** — catch errors early

### Task Size Guidelines

- Each task should be completable in one agent turn (< 500 lines changed)
- If a task touches > 5 files, consider splitting it
- If a task has > 5 action steps, consider splitting it

### Acceptance Criteria Rules

Every task must have criteria that are:
- **Measurable**: "X lines removed", "N files consolidated into 1"
- **Verifiable**: "build succeeds", "grep returns 0 results"
- **Behavior-preserving**: "no functional change" (unless intentional)
