# Refactor Team Configuration

## Choosing Team Size

Based on task complexity, choose the right mode:

| Mode | When to use | Agents |
|------|-------------|--------|
| **Solo** | < 5 tasks, low-risk, < 200 lines changed | Main agent only |
| **Duo** | 5-10 tasks, low/medium-risk | `coder` + `verifier` |
| **Squad** | 10+ tasks OR high-risk with multiple independent workstreams | 2 `coder`s + `verifier` |

**Default is Duo.** Solo for trivial, Squad only for large parallel workloads.

> Lesson learned: A dedicated `analyzer` agent that only reads/greps is wasteful.
> The coder should validate assumptions (grep for callers, confirm dead code) as the
> first step of each task implementation. This avoids the coder waiting on analyzer
> and eliminates a communication bottleneck.

---

## Mode: Solo (No Team)

For small refactors (< 5 tasks, low-risk):
- Main agent executes tasks sequentially
- Validate (grep) → implement → build after all tasks
- Still follow the Discover → Plan → Execute → Verify phases

---

## Mode: Duo (Default)

### Roles

#### coder
- **Agent type**: `general-purpose`
- **Purpose**: Validate assumptions AND implement changes
- **Per-task workflow**:
  1. Grep/read to validate the task's assumptions (callers, dead code, duplication)
  2. If assumptions are wrong, adjust approach or flag to lead
  3. Implement the change
  4. Mark task completed
- **Tools used**: Read, Edit, Write, Grep, Glob, Bash
- **Does NOT**: Make architectural decisions without lead approval

#### verifier
- **Agent type**: `general-purpose`
- **Purpose**: Review completed changes and verify builds
- **Workflow**:
  1. Monitor TaskList for completed tasks
  2. Review diffs (git diff) against acceptance criteria
  3. Run build after every 2-3 completed tasks: `./scripts/run.sh --skip-install`
  4. Report issues to `coder` via SendMessage
  5. Run final build after all tasks complete
- **Tools used**: All (needs Bash for builds, Read for review)
- **Skills**: `frontrun-ios-code-reviewer`, `frontrun-ios-build-debug`

### Execution Flow

```
coder    ──→ [validate+implement Task 1] ──→ [Task 2] ──→ [Task 3] ──→ ...
verifier ──→ [wait]                      ──→ [review Task 1] ──→ [review 2+3, build] ──→ ...
```

No waiting, no bottleneck. Coder runs straight through tasks. Verifier trails behind reviewing + building.

### Team Lifecycle

```
1. TeamCreate("refactor-squad")
2. TaskCreate for each phase task
3. Spawn coder + verifier via Task tool with team_name
4. coder works through tasks in order
5. verifier reviews + builds in batches
6. After all done: shutdown coder, wait for verifier final build, shutdown verifier
7. TeamDelete
```

### Communication Protocol

- **coder → verifier**: Automatic via TaskUpdate (marking task completed)
- **verifier → coder**: "Task N needs fix: [details]" (only when issues found)
- **lead → verifier**: "N tasks done, start review" (nudge when needed)
- **any → lead**: Escalate if blocked

---

## Mode: Squad (Large Refactors)

For 10+ tasks with independent workstreams:

### Roles

#### coder-1, coder-2
- Same as Duo `coder`, but each works on a different subset of tasks
- Split tasks by independence: e.g., coder-1 does model layer, coder-2 does UI layer
- Must NOT edit the same files simultaneously

#### verifier
- Same as Duo, reviews both coders' output
- Runs build after every 3-4 completed tasks

### Task Assignment

- Lead assigns tasks upfront: odd tasks to coder-1, even to coder-2 (or by layer)
- If tasks have dependencies, assign them to the same coder to avoid conflicts
- Verifier reviews in completion order, not assignment order

---

## Anti-Patterns (Avoid These)

1. **Dedicated analyzer agent** — Wastes a slot waiting; coder can grep before implementing
2. **Coder waiting for validation** — Creates serial bottleneck worse than single agent
3. **Too many agents for small tasks** — Coordination overhead exceeds parallel gains
4. **Both coders editing same file** — Merge conflicts; split by file boundary
5. **Verifier building after every single task** — Build takes ~3 min; batch reviews
