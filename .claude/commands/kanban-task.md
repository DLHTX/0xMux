---
description: Intelligent Kanban task processor that automatically analyzes tasks, checks existing documentation, and executes the appropriate Speckit workflow.
handoffs:
  - label: Continue with Planning
    agent: speckit.plan
    prompt: Create implementation plan for this feature
    send: true
  - label: Clarify Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
    send: true
  - label: Generate Tasks
    agent: speckit.tasks
    prompt: Generate task breakdown
    send: true
  - label: Start Implementation
    agent: speckit.implement
    prompt: Begin implementation based on spec and plan
    send: true
---

## User Input

```text
$ARGUMENTS
```

The user provided a task ID or task title. Use this to fetch the task details from Kanban.

## Overview

This command intelligently processes Vibe Kanban tasks by:
1. Analyzing the task to understand its complexity and requirements
2. Checking for existing Speckit documentation (spec.md, plan.md, tasks.md)
3. Automatically selecting and executing the optimal workflow
4. Keeping Kanban tasks synchronized with documentation progress

## Execution Flow

### Step 1: Fetch and Analyze Task

1. **Get task details** from Kanban:
   ```
   If $ARGUMENTS is a UUID (contains hyphens):
     - Call get_task(task_id=$ARGUMENTS)
   Else:
     - Call list_tasks(project_id=<current-project>, limit=50)
     - Search for task matching $ARGUMENTS in title
     - If multiple matches, show list and ask user to select
     - If no matches, ERROR "Task not found"
   ```

2. **Extract task metadata**:
   - Task ID and title
   - Current status (todo/inprogress/inreview/done)
   - Description content
   - Creation and update timestamps

3. **Assess task complexity**:
   ```
   High complexity if ANY of:
   - Description length > 500 characters
   - Contains 5+ technical requirements
   - Mentions "architecture", "system", "module", "integration"
   - Has 5+ functional requirements
   - Has multiple user stories

   Medium complexity if ANY of:
   - Description length 200-500 characters
   - Contains 2-4 technical requirements
   - Single feature with some complexity
   - Involves 3-5 files/components

   Low complexity:
   - Description < 200 characters
   - Single, clear change
   - Involves 1-2 files
   - Examples: "Add a button", "Change color", "Fix typo"
   ```

4. **Detect task type**:
   ```
   Bug fix if:
   - Title contains: "bug", "fix", "修复", "问题", "error", "crash"
   - Description has: "重现步骤", "预期行为", "实际行为"

   Research if:
   - Title contains: "调研", "研究", "探索", "可行性", "research", "investigate"
   - Description asks for analysis or exploration

   Otherwise: Feature/enhancement
   ```

### Step 2: Infer and Check Documentation Path

1. **Infer spec path from task title**:
   ```
   Pattern matching:
   - "006 - 活动标签页" → "specs/006-activities-tab/"
   - "Fix login bug" → "specs/fix-login-bug/"
   - "Add OAuth support" → "specs/add-oauth-support/"

   Rules:
   - If title has number prefix (e.g., "006 -"), use: "specs/{number}-{slug}/"
   - Otherwise use: "specs/{kebab-case-title}/"
   - Maximum 3 words in slug for clarity
   - Remove special characters, keep only alphanumeric and hyphens

   If description explicitly mentions spec path (e.g., "详见: specs/xxx/"):
   - Use that path instead
   ```

2. **Check for existing documentation**:
   ```
   For each file, use Read tool to check existence:

   1. {spec-path}/spec.md      → Specification document
   2. {spec-path}/plan.md      → Implementation plan
   3. {spec-path}/tasks.md     → Task breakdown
   4. {spec-path}/README.md    → Documentation index

   Record results:
   ✓ spec.md exists (size: 3.2KB, lines: 120)
   ✗ plan.md missing
   ✗ tasks.md missing
   ```

3. **If spec.md exists, read it to understand**:
   - Feature scope and requirements
   - Current specification status
   - Any [NEEDS CLARIFICATION] markers
   - Last update timestamp

### Step 3: Select Optimal Workflow

Based on documentation status, task complexity, and task type, automatically choose the workflow:

#### Workflow A: Complete Documentation Exists
```
Conditions:
- spec.md ✓ AND plan.md ✓ AND tasks.md ✓
- OR: spec.md ✓ AND plan.md ✓ (for medium complexity)

Action:
1. Report to user:
   "✓ Found complete documentation for this task:
   - Specification: {spec-path}/spec.md
   - Implementation Plan: {spec-path}/plan.md
   - Task Breakdown: {spec-path}/tasks.md (if exists)

   Ready to begin implementation."

2. Brief summary:
   - Show 3-5 key requirements from spec
   - Show implementation phases from plan
   - Show next 2-3 tasks if tasks.md exists

3. Ask user:
   "Choose next action:
   1. Start implementation (/speckit.implement)
   2. Review documentation first (I'll summarize)
   3. Update workspace session (if needed)
   4. Something else (specify)"

4. If user chooses 1:
   - Update task status to "inprogress" in Kanban
   - Execute /speckit.implement
   - After completion, sync results to Kanban
```

#### Workflow B: Only Spec Exists
```
Conditions:
- spec.md ✓ AND plan.md ✗

Action:
1. Report:
   "✓ Found specification: {spec-path}/spec.md
   ✗ Missing implementation plan

   Reading specification..."

2. Read and summarize spec:
   - Core requirements (top 3-5)
   - Success criteria
   - Any clarification needs

3. Check for [NEEDS CLARIFICATION]:
   - If found, recommend: "Run /speckit.clarify first"
   - If none, recommend: "Generate plan with /speckit.plan"

4. Ask user:
   "Recommended next steps:
   1. Generate implementation plan (/speckit.plan) [Recommended]
   2. Clarify requirements first (if needed)
   3. Skip planning and implement directly (not recommended for high complexity)

   Choose (1/2/3):"

5. Execute chosen action:
   - If 1: Run /speckit.plan, then optionally /speckit.tasks if high complexity
   - If 2: Run /speckit.clarify, then return to planning
   - If 3: Warn about risk, then proceed to implementation

6. Update Kanban task description with generated document links
```

#### Workflow C: No Documentation (Full Speckit Flow)
```
Conditions:
- spec.md ✗

Action:
1. Report:
   "✗ No specification found at {spec-path}/

   Task complexity: {High/Medium/Low}
   Task type: {Feature/Bug/Research}

   Initiating specification workflow..."

2. Route by task type and complexity:

   **If Bug Fix**:
   - Skip Speckit entirely
   - Report: "Bug fix detected - skipping documentation"
   - Ask user: "Should I:
     1. Investigate and diagnose the issue
     2. You'll provide fix instructions
     Choose (1/2):"
   - Proceed with bug fix workflow
   - After fix, optionally document in task description

   **If Research Task**:
   - Report: "Research task detected"
   - Ask user: "Investigation approach:
     1. Explore codebase and document findings
     2. Research external solutions/patterns
     Choose (1/2):"
   - Conduct research
   - Create {spec-path}/research.md with findings
   - Sync results to Kanban description

   **If Feature (High Complexity)**:
   - Execute full Speckit flow:
     1. Run /speckit.specify
        - Auto-answer clarifications where reasonable
        - Ask user only for critical decisions (max 3 questions)
     2. If [NEEDS CLARIFICATION] remains: Run /speckit.clarify
     3. Run /speckit.plan
     4. Run /speckit.tasks (generate task breakdown)
     5. Run /speckit.analyze (verify consistency)
     6. Update Kanban with document links
     7. Ask if ready to implement

   **If Feature (Medium Complexity)**:
   - Execute quick Speckit flow:
     1. Run /speckit.specify (with fewer clarifications)
     2. Run /speckit.plan
     3. Skip /speckit.tasks (use plan directly)
     4. Update Kanban with document links
     5. Ask if ready to implement

   **If Feature (Low Complexity)**:
   - Ask user first:
     "This appears to be a simple task. Options:
     1. Create quick documentation (spec only)
     2. Skip documentation and implement directly
     Choose (1/2):"
   - If 1: Quick /speckit.specify only
   - If 2: Direct implementation
```

#### Workflow D: Partial Documentation
```
Conditions:
- Other combinations (e.g., plan exists but spec missing, tasks exist but plan missing)

Action:
1. Report inconsistency:
   "⚠️ Inconsistent documentation state:
   {list what exists and what's missing}"

2. Ask user:
   "How to proceed:
   1. Regenerate missing documents from existing ones
   2. Start fresh (backup existing, create new)
   3. Use what exists and continue
   Choose (1/2/3):"

3. Execute based on choice
```

### Step 4: Automatic Kanban Synchronization

Throughout execution, automatically update Kanban task at these milestones:

**After /speckit.specify completes**:
```
Update task description, prepend:

---
## 📋 Documentation

- **Specification**: `{spec-path}/spec.md`
- **Status**: Specification complete

---

{original description}
```

**After /speckit.plan completes**:
```
Update task description, modify Documentation section:

---
## 📋 Documentation

- **Specification**: `{spec-path}/spec.md`
- **Implementation Plan**: `{spec-path}/plan.md`
- **Status**: Planning complete

### Implementation Phases
1. {phase 1 from plan}
2. {phase 2 from plan}
3. {phase 3 from plan}

---

{original description}
```

**After /speckit.tasks completes**:
```
Update task description, add Tasks section:

### 📝 Task Breakdown
- Total tasks: {N}
- See: `{spec-path}/tasks.md`

Key tasks:
1. {task 1}
2. {task 2}
3. {task 3}
```

**When starting implementation**:
```
1. Update task status: "todo" → "inprogress"
2. Update task description, change Status to: "Status: Implementation in progress"
```

**When implementation completes**:
```
1. Update task description, add completion section:

---
## ✅ Implementation Complete

### Modified Files
- {file 1}
- {file 2}
- {file 3}

### Key Changes
- {change 1}
- {change 2}

### Testing Notes
{test results if applicable}

---

2. Update task status: "inprogress" → "inreview"

3. Ask user:
   "Implementation complete. Next steps:
   1. Mark task as done in Kanban
   2. Create PR for review
   3. Additional changes needed
   Choose (1/2/3):"
```

### Step 5: Error Handling and Recovery

**If documentation path conflicts**:
```
Error: "{spec-path}/ exists but content doesn't match task"

Options:
1. Use existing documentation (show summary)
2. Create new path: {spec-path}-v2/
3. Overwrite existing (backup first)

Choose (1/2/3):
```

**If Speckit command fails**:
```
Error: "/speckit.{command} failed: {error message}"

Recovery options:
1. Retry with different parameters
2. Manual creation (I'll guide you)
3. Skip this step and continue

Choose (1/2/3):
```

**If task description too vague**:
```
Warning: "Task description is very brief (< 50 chars)"

Before generating documentation, I need more context:

Current description: "{description}"

Please provide:
1. What problem does this solve?
2. Who are the users?
3. What should the outcome be?

Or say "skip" to proceed with assumptions.
```

### Step 6: Final Reporting

At the end of execution, provide a summary:

```
✅ Task Processing Complete

**Task**: {title}
**Workflow**: {workflow-name}
**Status**: {new-status}

**Generated Documentation**:
- {list of created/updated files}

**Next Steps**:
- {recommended next action}

**Kanban Status**: Updated from {old-status} to {new-status}
```

## Workflow Decision Matrix

Quick reference for automatic workflow selection:

| Documentation State | Complexity | Task Type | Workflow | Actions |
|-------------------|-----------|-----------|----------|---------|
| spec ✓ plan ✓ tasks ✓ | Any | Any | Direct Implement | Review → Implement |
| spec ✓ plan ✓ | Medium/Low | Feature | Direct Implement | Implement |
| spec ✓ plan ✗ | Any | Feature | Continue from Spec | Plan → Tasks → Implement |
| spec ✗ | High | Feature | Full Speckit | Specify → Clarify → Plan → Tasks → Implement |
| spec ✗ | Medium | Feature | Quick Speckit | Specify → Plan → Implement |
| spec ✗ | Low | Feature | Ask User | Quick Doc or Direct |
| Any | Any | Bug | Bugfix Direct | Diagnose → Fix → Document |
| Any | Any | Research | Research | Explore → Document → Report |

## Communication Principles

1. **Always report what you found**:
   ```
   Bad:  "Starting work..."
   Good: "✓ Found spec.md (120 lines)
          ✗ Missing plan.md
          → Generating implementation plan..."
   ```

2. **Show progress at each stage**:
   ```
   "Step 1/4: Reading specification... ✓
    Step 2/4: Generating plan...
    Step 3/4: Creating tasks...
    Step 4/4: Updating Kanban..."
   ```

3. **Ask only when necessary**:
   - Don't ask if documentation is clear and complete
   - Don't ask for confirmation on standard workflows
   - DO ask when multiple valid approaches exist
   - DO ask when user input significantly changes the outcome

4. **Summarize, don't dump**:
   ```
   Bad:  {paste entire spec.md}
   Good: "Specification Summary:
          - 5 core requirements
          - 3 user scenarios
          - Target: mobile users
          - Key constraint: offline support

          Full spec: specs/006-feature/spec.md"
   ```

5. **Keep Kanban updated**:
   - Never finish a phase without updating Kanban
   - Always add document links to task description
   - Always sync completion status

## Example Execution

**User**: `/kanban-task 257afd09-8f34-44d8-ac7b-5846d701d381`

**AI Execution**:

```
Fetching task details...
[Call get_task]

✓ Task Retrieved: "006 - 活动标签页"
  Status: todo
  Complexity: High (1,500 chars, 10+ requirements)
  Type: Feature

Checking documentation at specs/006-activities-tab/...
[Call Read for spec.md, plan.md, tasks.md]

Documentation Status:
✓ spec.md found (3.2KB, 120 lines)
✓ plan.md found (1.8KB, 65 lines)
✗ tasks.md missing

→ Workflow: Continue from Plan (generate tasks)

Reading specification... ✓
Reading implementation plan... ✓

Specification Summary:
- Activity tab in user profile showing recent messages
- Display messages from mutual groups
- Group by date, click to navigate to original chat
- Support for refresh and empty states

Implementation Plan (4 phases):
1. Add Activities tab UI component
2. Implement message fetching logic
3. Build date grouping and display
4. Add navigation and state management

Recommendation: Generate task breakdown for easier tracking

Generate tasks.md? (y/n):
```

**User**: `y`

```
Generating task breakdown...
[Execute /speckit.tasks]

✓ Generated tasks.md (7 tasks, dependency-ordered)

Task Breakdown:
1. Create ActivityTab component structure
2. Implement getMutualGroups API
3. Build message search and aggregation
4. Implement date grouping logic
5. Add message tap navigation
6. Build loading and empty states
7. Implement pull-to-refresh

Updating Kanban task...
[Call update_task]

✓ Kanban updated with task breakdown

Next steps:
1. Start implementation (/speckit.implement)
2. Review tasks in detail first
3. Setup workspace session

Choose (1/2/3):
```

## Special Handling

### Multi-repo Projects
```
If task involves multiple repositories:
1. Check each repo for relevant code
2. Document cross-repo dependencies in plan
3. Ask user about workspace session setup
4. Consider creating subtasks per repo
```

### Urgent Bug Fixes
```
If task is marked urgent or critical:
1. Skip all documentation
2. Direct investigation and fix
3. Document fix in commit message
4. Optionally create post-mortem document
```

### Incomplete Information
```
If critical information missing:
1. Don't guess on security/privacy/scope decisions
2. Ask maximum 3 focused questions
3. Document assumptions in spec
4. Mark areas needing future clarification
```

## Success Criteria

This command succeeds when:
- ✓ Task is analyzed and understood
- ✓ Appropriate workflow is selected
- ✓ Necessary documentation is created/verified
- ✓ Kanban task is kept in sync
- ✓ User knows next steps clearly
- ✓ No unnecessary questions asked
- ✓ Progress is visible at each stage

This command fails when:
- ✗ Wrong workflow chosen for complexity
- ✗ Kanban task not updated
- ✗ Documentation path conflicts unresolved
- ✗ User left confused about next steps
- ✗ Excessive questions asked
- ✗ Silent failures without error handling
