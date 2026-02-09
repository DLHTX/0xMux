---
name: frontrun-feature-loop
description: Feature specification orchestrator that creates a team (architect + researcher) to collaboratively produce spec, plan, and task documents from a user prompt. No implementation — documentation only. Use when starting a new feature from scratch or continuing an incomplete spec pipeline.
---

# Feature Loop

Orchestrates the full feature documentation pipeline: **Prompt → Research → Spec → Clarify → Plan → Tasks**.

Creates a team of specialized agents (architect + researcher) who work in parallel to gather context, then the lead synthesizes their findings into speckit documents.

## When to Use

- Starting a new feature from a user description
- Continuing an incomplete spec pipeline (has spec but no plan, etc.)
- When a feature needs architectural analysis before specification

## Prerequisites

- speckit commands available (`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.clarify`)
- Feature description from user (prompt or conversation context)

---

## Phase 0: Intake

> Goal: Understand what the user wants and determine starting point.

1. **Get feature description**: Read from conversation context. If empty or unclear, use AskUserQuestion:

   ```
   AskUserQuestion({
     questions: [{
       question: "Please describe the feature you want to specify. What problem does it solve and for whom?",
       header: "Feature",
       options: [
         { label: "I'll type it", description: "Provide a natural language feature description" },
         { label: "From issue", description: "I have a GitHub issue or task ID to reference" }
       ],
       multiSelect: false
     }]
   })
   ```

2. **Check existing documentation**: Scan `specs/` for matching feature directories.

   ```
   Glob: specs/**/{spec,plan,tasks}.md
   ```

   Determine documentation state:
   - **Nothing exists** → Full pipeline (Phase 1 → 5)
   - **spec.md only** → Skip to Phase 3 (Plan)
   - **spec.md + plan.md** → Skip to Phase 4 (Tasks)
   - **All exist** → Report complete, ask if user wants to re-run any phase

3. **Assess complexity** (informs team mode):
   - **High**: Multiple user stories, cross-module impact, new data models, external API integration
   - **Medium**: Single module change, 1-2 user stories, extends existing patterns
   - **Low**: Simple UI change, config tweak → suggest skipping team, run speckit directly

4. **Ask user for team mode** (only for Medium/High):

   ```
   AskUserQuestion({
     questions: [{
       question: "How should we approach this feature's documentation?",
       header: "Approach",
       options: [
         { label: "Full Team (Recommended)", description: "Architect + Researcher in parallel, then synthesize into spec/plan/tasks" },
         { label: "Quick Solo", description: "Skip team, run speckit commands directly with basic codebase scan" },
         { label: "Research Only", description: "Just explore codebase and document findings, no spec generation" }
       ],
       multiSelect: false
     }]
   })
   ```

---

## Phase 1: Team Setup & Discovery

> Goal: Create team, dispatch parallel research.

### 1.1 Create Team

```
TeamCreate("feature-spec")
```

### 1.2 Create Discovery Tasks

Create tasks for the team:

```
TaskCreate: "Explore codebase for related modules and patterns"
  → Assigned to: researcher

TaskCreate: "Analyze architecture and propose integration approach"
  → Assigned to: architect
```

### 1.3 Spawn Agents

Spawn two agents in parallel via Task tool:

#### researcher (parallel-research agent)

```
Task({
  subagent_type: "parallel-research",
  team_name: "feature-spec",
  name: "researcher",
  prompt: "You are a research engineer on the feature-spec team.

  FEATURE: {feature description}

  Your job is to explore the codebase and gather technical context for this feature.

  Do the following:
  1. Search for existing modules/files related to this feature
     - Glob for relevant file patterns in Frontrun/FR*/
     - Grep for related class names, protocols, services
  2. Identify existing patterns we should follow
     - How similar features are structured (look at existing FR* modules)
     - What protocols/services already exist that this feature could use
  3. Check for external dependencies
     - API endpoints this feature might need
     - Third-party libraries already in use
  4. Document findings in a structured format:
     - Related files (path + brief description)
     - Existing patterns to follow
     - Potential integration points
     - Technical constraints discovered

  Read the team config at ~/.claude/teams/feature-spec/config.json to find your teammates.
  When done, mark your task completed and send findings to the team lead via SendMessage."
})
```

#### architect (parallel-research agent)

```
Task({
  subagent_type: "parallel-research",
  team_name: "feature-spec",
  name: "architect",
  prompt: "You are a software architect on the feature-spec team.

  FEATURE: {feature description}

  Your job is to analyze this feature from an architectural perspective.

  Do the following:
  1. Analyze the current module structure
     - Read Frontrun/FR*/BUILD files to understand module dependencies
     - Identify which existing modules this feature touches
  2. Propose module placement
     - Should this be a new FR* module or extend an existing one?
     - What should the module dependency graph look like?
  3. Identify data model implications
     - What new models/entities are needed?
     - How do they relate to existing models (Token, DexTokenInfo, etc.)?
  4. Assess integration points
     - Which existing services/protocols need extension?
     - Any new protocols or service layers needed?
  5. Flag architectural risks
     - Upstream Telegram isolation concerns
     - Performance implications
     - State management complexity
  6. Review CLAUDE.md and .claude/skills/frontrun-rules/SKILL.md for architecture rules

  Structure your output as:
  - Module Placement Recommendation
  - Dependency Graph (text diagram)
  - Data Model Sketch (entities + relationships)
  - Integration Points (existing → new)
  - Architectural Risks & Mitigations

  Read the team config at ~/.claude/teams/feature-spec/config.json to find your teammates.
  When done, mark your task completed and send findings to the team lead via SendMessage."
})
```

### 1.4 Wait for Results

Wait for both agents to complete their tasks. The lead receives their findings via automatic message delivery.

---

## Phase 2: Specification

> Goal: Synthesize research into a formal spec.

### 2.1 Synthesize Context

Combine researcher + architect findings into a rich feature description:

```
Enhanced description = Original prompt
  + Researcher's findings (existing patterns, related modules, constraints)
  + Architect's recommendations (module placement, data model, integration)
```

### 2.2 Run speckit.specify

Invoke the speckit.specify skill with the enhanced description:

```
Skill({ skill: "speckit.specify", args: "{enhanced description}" })
```

### 2.3 Handle Clarifications

If speckit.specify produces [NEEDS CLARIFICATION] markers:
- **Use AskUserQuestion** to forward each question to the user
- Provide architect's recommendation as the default/recommended option
- After user responds, update the spec

If speckit.specify asks clarification questions directly, relay them to the user.

### 2.4 Architect Review (Optional)

For high-complexity features, send the spec to the architect for review:

```
SendMessage({
  type: "message",
  recipient: "architect",
  content: "Review this spec for architectural consistency: {spec path}",
  summary: "Review spec for architecture"
})
```

Incorporate feedback if any.

---

## Phase 3: Planning

> Goal: Generate implementation plan with architectural grounding.

### 3.1 Run speckit.plan

```
Skill({ skill: "speckit.plan" })
```

This generates:
- `research.md` (Phase 0 of plan)
- `data-model.md` (Phase 1 of plan)
- `contracts/` (API contracts)
- `quickstart.md`
- `plan.md` (the plan itself)

### 3.2 Architect Validation

Send the plan to the architect for validation:

```
SendMessage({
  type: "message",
  recipient: "architect",
  content: "Validate this implementation plan against our architecture:
  - Plan: {plan.md path}
  - Data model: {data-model.md path}
  Check for: module boundary violations, upstream isolation issues, missing protocols",
  summary: "Validate plan architecture"
})
```

If the architect flags issues, update the plan before proceeding.

### 3.3 User Checkpoint

Report plan summary to user and ask to proceed:

```
AskUserQuestion({
  questions: [{
    question: "Implementation plan is ready. How should we proceed?",
    header: "Next Step",
    options: [
      { label: "Generate Tasks (Recommended)", description: "Break the plan into actionable tasks (final step)" },
      { label: "Review Plan First", description: "I want to read the plan before generating tasks" },
      { label: "Revise Plan", description: "I have feedback on the plan" }
    ],
    multiSelect: false
  }]
})
```

---

## Phase 4: Task Generation

> Goal: Break the plan into actionable, dependency-ordered tasks.

### 4.1 Run speckit.tasks

```
Skill({ skill: "speckit.tasks" })
```

This generates `tasks.md` with:
- Phase-organized tasks
- Dependency ordering
- Parallel execution opportunities
- File paths for each task

### 4.2 Final Report

Report to user:

```markdown
## Feature Documentation Complete

**Feature**: {feature name}
**Branch**: {branch name}
**Spec Directory**: specs/{NNN-feature-name}/

### Generated Artifacts
- spec.md - Feature specification ({N} user stories, {M} requirements)
- plan.md - Implementation plan ({P} phases)
- research.md - Technical research findings
- data-model.md - Data model definitions
- contracts/ - API contracts
- tasks.md - Task breakdown ({T} tasks, {parallel} parallelizable)
- checklists/requirements.md - Quality checklist

### Architecture Summary
{architect's key recommendations}

### Suggested Next Steps
1. Review all documents in specs/{NNN-feature-name}/
2. When ready to implement: run `/frontrun-dev-loop` or `/speckit.implement`
3. For task tracking: run `/speckit.taskstoissues` to create GitHub issues
```

---

## Phase 5: Cleanup

> Goal: Shut down team and clean up.

1. Send shutdown requests to all team members:
   ```
   SendMessage({ type: "shutdown_request", recipient: "researcher" })
   SendMessage({ type: "shutdown_request", recipient: "architect" })
   ```

2. After all agents confirm shutdown:
   ```
   TeamDelete()
   ```

---

## Resuming Interrupted Sessions

If a session ends mid-pipeline:

1. Check `.claude/state/current-task.md` for last session state
2. Check `specs/{feature}/` for which documents exist
3. Resume from the next incomplete phase:
   - Has nothing → Phase 1 (Discovery)
   - Has spec.md → Phase 3 (Planning)
   - Has plan.md → Phase 4 (Tasks)
   - Has tasks.md → Complete

---

## Quick Mode (No Team)

For low-complexity features or when user selects "Quick Solo":

```
1. Quick codebase scan (Explore agent, not a team)
2. Run /speckit.specify with findings
3. Run /speckit.plan
4. Run /speckit.tasks
5. Report
```

No team creation, no architect/researcher. Faster but less thorough.

---

## Error Handling

| Error | Action |
|-------|--------|
| speckit script fails | Report error, suggest manual fix or retry |
| Agent times out | Continue without their input, note gap |
| User wants to skip a phase | Allow, warn about downstream impact |
| Feature too vague | Ask 2-3 targeted questions before starting |
| Existing spec conflicts | Ask user: overwrite, create v2, or use existing |

---

## Notes

- This skill produces documentation only. No code changes.
- All speckit commands are run by the lead agent (not team members).
- Team members do research and review only (read-only agents).
- The architect's recommendations inform the spec/plan but don't override user decisions.
- Forward ALL user-facing questions through AskUserQuestion, never let agents ask users directly.
- Keep the team alive during the full pipeline for iterative review.
