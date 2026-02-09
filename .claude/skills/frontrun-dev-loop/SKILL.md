---
name: frontrun-dev-loop
description: Complete development loop that chains task execution, build/debug, and code review. Use this when you want to run a continuous development cycle with automatic testing and review after each change.
---

# Development Loop Skill

Complete iterative development loop for Frontrun iOS, featuring:
- **Subagent parallel execution** - Split tasks across multiple agents for concurrent code writing
- **Codex CLI integration** - Code review and difficult bug fixing
- **Automated testing** - XcodeBuild MCP build and UI testing

## Pre-Start Prompt (MANDATORY)

**CRITICAL: You MUST use AskUserQuestion to ask the user BEFORE doing anything else. Do NOT skip this step. Do NOT start working until the user answers:**

```typescript
AskUserQuestion({
  questions: [{
    question: "Enable infinite loop mode? Claude will continuously iterate until all tasks are complete.",
    header: "Loop Mode",
    options: [
      { label: "Enable Ralph Loop", description: "Auto-iterate continuously, move to next task after completing current one (Recommended)" },
      { label: "Single execution", description: "Run one dev-loop cycle, then wait for user instructions" }
    ],
    multiSelect: false
  }]
})
```

**If the user selects "Enable Ralph Loop":**

CRITICAL: ralph-loop args are parsed directly by shell. Never pass multi-line text or non-ASCII characters!

Correct approach:
1. Write the full task description to `.claude/ralph-loop-task.md` file
2. Only pass a short English summary (pure ASCII, single line, no special characters) as ralph-loop args

```typescript
// Step 1: Write full task description to file (supports any language and format)
Write({
  file_path: ".claude/ralph-loop-task.md",
  content: "<full user task description, can be multi-line and any language>"
})

// Step 2: Call ralph-loop with only a short English summary as args
// args MUST be: pure ASCII, single line, no parentheses/colons/quotes or other special chars
Skill({
  skill: "ralph-wiggum:ralph-loop",
  args: "Execute tasks from .claude/ralph-loop-task.md"
})
```

**At the start of each Ralph Loop iteration, Claude MUST read `.claude/ralph-loop-task.md` to get the full task description.**

**If the user selects "Single execution":** Proceed with the normal dev-loop flow below.

**CRITICAL: When ALL tasks in `.claude/ralph-loop-task.md` are complete, Claude MUST immediately set `active: false` in `.claude/ralph-loop.local.md` to stop the loop.** Failure to do this causes the stop hook to 
re-trigger infinitely on a completed task. Use the Edit tool:          
```typescript                                                          
       Edit({                                                                 
         file_path: ".claude/ralph-loop.local.md",                            
         old_string: "active: true",                                          
         new_string: "active: false"                                          
       })                                                                     
```                                                                    
       

---

## App Name

- **Process name / Display name**: `Frontrun` (NOT Telegram!)
- **Bundle ID**: `org.4016f7c4abce0926.Telegram` (kept for historical reasons)
- When using `killall`, `ps aux | grep`, etc., search for **Frontrun** not Telegram

## Workflow

```
┌──────────────────────────────────────────────────────────────┐
│                        DEV LOOP                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  0. Task Analysis                                            │
│     └── Determine if tasks can be parallelized               │
│     └── If yes → Split into parallel subagents               │
│         ↓                                                    │
│  1. Task Execution                                           │
│     ├── Single task → Claude modifies directly               │
│     ├── Distributed tasks → Multiple subagents in parallel   │
│     └── Stuck → Call Codex for assistance                    │
│         ↓                                                    │
│  2. Build & Debug (ios-build-debug)                          │
│     └── ./scripts/run.sh full build                          │
│     └── XcodeBuild MCP launch and test                       │
│     └── Screenshot UI verification                           │
│         ↓                                                    │
│  3. Code Review (Codex Review + ios-code-reviewer)           │
│     └── codex review --uncommitted                           │
│     └── ios-code-reviewer architecture check                 │
│         ↓                                                    │
│  4. Result Evaluation                                        │
│     ├── Issues found → Back to step 1                        │
│     └── Passed → Continue to step 5                          │
│         ↓                                                    │
│  5. Spec Sync (MANDATORY)                                    │
│     └── Update tasks.md with completion status               │
│     └── Update spec.md implementation phases                 │
│     └── Document technical discoveries                       │
│         ↓                                                    │
│  6. Continue to next task or finish                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Subagent Parallel Execution

### When to Use Parallel Subagents

When tasks involve **multiple independent modules/files** with **no dependencies between changes**, split into multiple subagents for parallel execution:

**Good for parallelization:**
- Modifying multiple independent UI components
- Fixing multiple unrelated bugs simultaneously
- Adding similar functionality across multiple service layers
- Batch updating similar logic across multiple files

**Not suitable for parallelization:**
- Code with interdependencies
- Refactoring requiring unified architecture design
- Modifications involving shared state

### Subagent Split Examples

**Example 1: Fixing multiple independent bugs**

```
User: Fix the following issues:
1. TokenChartNode Y-axis display issue
2. InlineTradingWidgetNode duplicate price display
3. SciChartSurfaceNode candlestick data loss

Claude analysis: These three issues involve different files, can be processed in parallel
```

```typescript
// Launch 3 subagents in parallel
Task({
  subagent_type: "swift-utility-writer",
  prompt: "Fix TokenChartNode.swift Y-axis switching from market cap to price...",
  description: "Fix TokenChartNode Y-axis"
})

Task({
  subagent_type: "swift-utility-writer",
  prompt: "Fix InlineTradingWidgetNode.swift duplicate priceChange display...",
  description: "Fix duplicate priceChange"
})

Task({
  subagent_type: "swift-utility-writer",
  prompt: "Fix SciChartSurfaceNode.swift candlestick only showing 2 data points...",
  description: "Fix candlestick data loss"
})
```

**Example 2: Batch updating multiple components**

```
User: Add loading state to all chart components

Claude analysis: Need to modify TokenChartNode, InlineTradingWidgetNode, MiniChartNode
These are independent components, can be processed in parallel
```

```typescript
// Modify multiple components in parallel
Task({
  subagent_type: "swift-utility-writer",
  prompt: "Add loading state to TokenChartNode: 1. Add isLoading property 2. Add loading UI 3. Show during fetchChartData...",
  description: "Add loading to TokenChartNode"
})

Task({
  subagent_type: "swift-utility-writer",
  prompt: "Add loading state to InlineTradingWidgetNode...",
  description: "Add loading to InlineTradingWidget"
})

Task({
  subagent_type: "swift-utility-writer",
  prompt: "Add loading state to MiniChartNode...",
  description: "Add loading to MiniChartNode"
})
```

### Subagent Type Selection

| Subagent Type | Use Case |
|--------------|----------|
| `swift-utility-writer` | Write independent Swift code modules |
| `parallel-research` | Research multiple code areas in parallel |
| `Explore` | Quickly explore codebase to find files |
| `Plan` | Plan complex implementation approaches |

### Parallel Execution Best Practices

1. **Clear boundaries**: Each subagent owns independent files/modules
2. **Detailed prompts**: Provide full context since subagents cannot see main conversation history
3. **Avoid conflicts**: Do not let multiple subagents modify the same file
4. **Unified verification**: Build and verify after all subagents complete

### Complex Task Hybrid Strategy

For complex tasks, combine Subagents and Codex:

```
┌─────────────────────────────────────────────────────────────┐
│                 Complex Task Strategy                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Analyze task                                            │
│     └── Identify independent subtasks                       │
│         ↓                                                   │
│  2. Parallel execution (Subagents)                          │
│     ├── Subagent A: Modify module A                        │
│     ├── Subagent B: Modify module B                        │
│     └── Subagent C: Modify module C                        │
│         ↓                                                   │
│  3. Merge results                                           │
│     └── Check for conflicts                                 │
│         ↓                                                   │
│  4. Difficult problems (Codex)                              │
│     └── If a subtask failed, call Codex to handle           │
│         ↓                                                   │
│  5. Build verification                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```typescript
// Example: Hybrid strategy
// 1. Execute simple tasks in parallel first
const results = await Promise.all([
  Task({ subagent_type: "swift-utility-writer", prompt: "Task A...", description: "Task A" }),
  Task({ subagent_type: "swift-utility-writer", prompt: "Task B...", description: "Task B" }),
])

// 2. If any failed, use Codex to handle
if (results.some(r => r.failed)) {
  Bash({ command: 'codex exec --full-auto "Fix failed tasks..."' })
}

// 3. Build verification
Bash({ command: './scripts/run.sh' })
```

## Codex CLI Integration

### 1. Code Review (Recommended)

Use Codex for code review - excellent at finding bugs and code issues:

```bash
# Review uncommitted changes
codex review --uncommitted

# Review changes relative to master
codex review --base master

# Review a specific commit
codex review --commit HEAD

# Review with custom prompt
codex review --uncommitted "Focus on memory leaks and thread safety issues"
```

### 2. Difficult Bug Fixing

When Claude encounters hard-to-solve problems, call Codex for assistance:

```bash
# Non-interactive execution, let Codex fix the bug
codex exec --full-auto "Fix the Y-axis displaying price instead of market cap in TokenChartNode"

# Specify working directory
codex exec --full-auto -C /path/to/project "Analyze and fix the chart data clearing bug"

# With image context (e.g., screenshot)
codex exec --full-auto -i /tmp/screenshot.png "Fix UI display issues based on screenshot"
```

### 3. Calling Codex from Claude

Call Codex via the Bash tool:

```typescript
// Code review
Bash({ command: 'codex review --uncommitted "Check Swift code quality and potential bugs"' })

// Fix difficult bug
Bash({
  command: 'codex exec --full-auto "Fix SciChartSurfaceNode candlestick only showing 2 data points"',
  timeout: 300000  // 5 minute timeout
})
```

## Detailed Steps

### Phase 1: Task Execution

1. Claude analyzes the problem/requirements
2. Claude attempts to modify code
3. **If stuck**:
   ```bash
   # Let Codex assist with analysis and fix
   codex exec --full-auto "Problem description..."
   ```
4. Merge Codex changes (if any)

### Phase 2: Build & Debug (ios-build-debug)

```bash
# 1. Full build
./scripts/run.sh
```

```typescript
// 2. Launch app
mcp__XcodeBuildMCP__launch_app_sim({
  bundleId: "org.4016f7c4abce0926.Telegram"
})

// 3. Get UI hierarchy
const ui = mcp__XcodeBuildMCP__describe_ui({})

// 4. Screenshot verification
mcp__XcodeBuildMCP__screenshot({})

// 5. Log capture and analysis
const session = mcp__XcodeBuildMCP__start_sim_log_cap({
  bundleId: "org.4016f7c4abce0926.Telegram"
})
// ... run tests ...
mcp__XcodeBuildMCP__stop_sim_log_cap({ logSessionId: session.logSessionId })
```

### Phase 3: Code Review (Dual Review)

**3.1 Codex Review (great at finding bugs)**

```bash
# Codex review uncommitted changes
codex review --uncommitted "Check for:
1. Memory leaks and retain cycles
2. Thread safety issues
3. Potential crash points
4. Logic errors
5. Performance issues"
```

**3.2 ios-code-reviewer (architecture check)**

Check using ios-code-reviewer skill:
- Redundant and duplicate code
- Architecture issues (over-fragmentation, high coupling)
- Swift best practices

### Phase 4: Result Evaluation

**If Codex Review finds issues:**
1. Let Codex auto-fix:
   ```bash
   codex exec --full-auto "Fix issues found in review"
   ```
2. Or Claude fixes manually
3. Return to Phase 2 for re-testing

**If all passed:**
1. Summarize completed work
2. Continue to next task or finish

### Phase 5: Spec Sync (MANDATORY)

**每次完成代码修改后，必须同步更新 spec 文档。**

如果当前任务关联了 spec 目录（如 `specs/007-token-detail-enhanced/`），Claude 必须：

1. **更新 tasks.md**:
   - 将已完成的任务标记为 ✅
   - 添加完成情况说明
   - 记录技术发现（如 API 限制、架构决策）

2. **更新 spec.md**:
   - 更新 Implementation Phases 的完成状态
   - 如有新的技术发现，添加到相应章节

```typescript
// Example: Update tasks.md after completing a task
Edit({
  file_path: "specs/<feature>/tasks.md",
  old_string: "### Task X.X: <task name>\n**Priority**: P0 | **Status**: 🔲",
  new_string: "### Task X.X: <task name> ✅\n**Priority**: P0 | **Status**: ✅ 完成"
})

// Example: Update spec.md implementation status
Edit({
  file_path: "specs/<feature>/spec.md",
  old_string: "- [ ] <task description>",
  new_string: "- [x] <task description>"
})
```

**Spec sync 规则**:
- 完成 mock 数据实现 → 标记 "✅ 完成 (Mock 数据)"
- 完成真实数据接入 → 标记 "✅ 完成"
- 发现技术限制 → 添加到 "技术发现" 章节
- 跳过某任务 → 标记 "🔲 跳过" 并说明原因

## Usage Examples

### Example 1: Bug Fix

```
User: Fix chart Y-axis display issue

Claude:
# Dev Loop - Iteration #1

## Phase 1: Task Execution
Analyzing problem... Attempting fix...
[Modified TokenChartNode.swift]

Stuck, calling Codex for help:
$ codex exec --full-auto "TokenChartNode Y-axis switches from market cap to price after clicking timeframe button, analyze and fix"

Codex fix complete, applying changes.

## Phase 2: Build & Debug
$ ./scripts/run.sh
Build successful

[Screenshot verification]
UI looks correct

## Phase 3: Code Review
$ codex review --uncommitted
Codex Review results:
- No memory leaks
- Thread safe
- Suggest adding comments for conversion logic

ios-code-reviewer results:
- No duplicate code
- Architecture is sound

## Result
Iteration #1 complete
```

### Example 2: Difficult Problem

```
User: Candlestick chart only has 2 data points, hard to locate the issue

Claude:
This is a complex problem, calling Codex for deep analysis:

$ codex exec --full-auto -i /tmp/chart_screenshot.png \
  "Analyze why candlestick chart only shows 2 data points:
   1. Check data source fetchChartData
   2. Check SciChartSurfaceNode renderCandlestickChart
   3. Check data conversion logic
   4. Find root cause of data loss and fix"

[Codex analyzes and fixes]

Applying Codex changes, continuing tests...
```

## Codex Invocation Timing

| Scenario | Recommended Action |
|----------|-------------------|
| Routine code changes | Claude handles directly |
| Code review | `codex review --uncommitted` |
| Simple bug | Claude tries first, call Codex on failure |
| Complex bug | Call `codex exec --full-auto` directly |
| Performance issue | Codex analysis + Claude implementation |
| Architecture refactor | Claude leads, Codex reviews |

## Configuration

```yaml
# dev-loop config
codex_review: true           # Enable Codex code review
codex_for_hard_bugs: true    # Call Codex when stuck
codex_model: "o3"            # Model used by Codex
max_iterations: 5            # Maximum iteration count
auto_build: true             # Automatic build
screenshot: true             # Screenshot verification
```

## Command Reference

### Codex CLI Commands

```bash
# Code review
codex review --uncommitted                    # Review uncommitted changes
codex review --base master                    # Review changes vs master
codex review --commit HEAD                    # Review latest commit

# Task execution
codex exec --full-auto "task description"     # Auto execute
codex exec -m o3 --full-auto "description"    # Specify model
codex exec --full-auto -i image.png "task"    # With image

# Apply changes
codex apply                                   # Apply Codex-generated diff
```

### XcodeBuild MCP Commands

```typescript
mcp__XcodeBuildMCP__build_run_sim({})         // Build and run
mcp__XcodeBuildMCP__screenshot({})            // Screenshot
mcp__XcodeBuildMCP__describe_ui({})           // Get UI hierarchy
mcp__XcodeBuildMCP__tap({x, y})               // Tap
mcp__XcodeBuildMCP__start_sim_log_cap({...})  // Start log capture
```

## Notes

1. **Codex timeout**: Complex tasks may take a long time, set reasonable timeouts (5-10 minutes recommended)
2. **Codex permissions**: `--full-auto` executes commands automatically, ensure safe environment
3. **Merge conflicts**: Check for conflicts between Codex and Claude changes
4. **Cost considerations**: Codex calls have API costs, let Claude try first
