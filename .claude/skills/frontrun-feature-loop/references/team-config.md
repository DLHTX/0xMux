# Feature Loop Team Configuration

## Roles

### Lead (Main Agent)
- **Purpose**: Orchestrates the pipeline, runs speckit commands, communicates with user
- **Responsibilities**:
  - Dispatches research/architecture tasks
  - Synthesizes findings into speckit inputs
  - Runs `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`
  - Forwards all user-facing questions via AskUserQuestion
  - Manages team lifecycle (create → assign → shutdown → delete)
- **Does NOT**: Write specs manually (uses speckit), make architectural decisions alone

### researcher
- **Agent type**: `parallel-research`
- **Purpose**: Explore codebase and gather technical context
- **Deliverables**:
  - List of related files with descriptions
  - Existing patterns (how similar features are built)
  - External dependencies and API info
  - Technical constraints
- **Tools**: Glob, Grep, Read, WebFetch, WebSearch
- **Read-only**: Does not edit files

### architect
- **Agent type**: `parallel-research`
- **Purpose**: Analyze architecture and propose integration approach
- **Deliverables**:
  - Module placement recommendation
  - Dependency graph
  - Data model sketch
  - Integration points
  - Risk assessment
- **Tools**: Glob, Grep, Read, WebFetch, WebSearch
- **Read-only**: Does not edit files

## Team Lifecycle

```
1. TeamCreate("feature-spec")
2. TaskCreate for discovery tasks
3. Spawn researcher + architect in parallel
4. Wait for both to complete discovery
5. Lead runs speckit pipeline (specify → plan → tasks)
6. Optionally send plan to architect for review
7. Shutdown all agents
8. TeamDelete
```

## When to Skip Team

| Complexity | Team Mode | Rationale |
|-----------|-----------|-----------|
| High | Full team | Multiple modules, new patterns, needs thorough analysis |
| Medium | Full team or Quick | Single module but benefits from architecture review |
| Low | Quick (no team) | Simple change, existing patterns, no new modules |

## Communication Flow

```
User ←→ Lead (AskUserQuestion)
         ├→ researcher (Task + SendMessage)
         └→ architect (Task + SendMessage)
```

- User never talks to agents directly
- Lead relays all questions via AskUserQuestion
- Agents send findings to lead via SendMessage
- Lead synthesizes and feeds into speckit commands
