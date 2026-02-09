# Feature Loop Pipeline

## Full Pipeline (High Complexity)

```
User Prompt
    │
    ▼
┌─────────────────────────────────────────────┐
│  Phase 0: Intake                            │
│  - Parse feature description                │
│  - Check existing docs in specs/            │
│  - Assess complexity                        │
│  - Ask user: Full Team / Quick / Research   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Phase 1: Team Discovery (PARALLEL)         │
│                                             │
│  ┌──────────────┐  ┌────────────────────┐   │
│  │  researcher   │  │    architect       │   │
│  │              │  │                    │   │
│  │ - Grep code  │  │ - Analyze modules  │   │
│  │ - Find       │  │ - Propose placement│   │
│  │   patterns   │  │ - Data model sketch│   │
│  │ - Check APIs │  │ - Integration pts  │   │
│  │ - List deps  │  │ - Risk assessment  │   │
│  └──────┬───────┘  └────────┬───────────┘   │
│         │                   │               │
│         └─────────┬─────────┘               │
│                   │                         │
│              Findings                       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Phase 2: Specification (Lead)              │
│                                             │
│  Synthesize findings → /speckit.specify     │
│  Handle [NEEDS CLARIFICATION] → User        │
│  Optional: architect reviews spec           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Phase 3: Planning (Lead + Architect)       │
│                                             │
│  /speckit.plan → research.md, data-model.md │
│  contracts/, quickstart.md, plan.md         │
│  Architect validates plan                   │
│  User checkpoint                            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Phase 4: Tasks (Lead)                      │
│                                             │
│  /speckit.tasks → tasks.md                  │
│  Final report to user                       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Phase 5: Cleanup                           │
│                                             │
│  Shutdown agents → TeamDelete               │
│  Write state file                           │
└─────────────────────────────────────────────┘
```

## Quick Pipeline (Low/Medium Complexity)

```
User Prompt
    │
    ▼
Quick codebase scan (Explore agent, no team)
    │
    ▼
/speckit.specify (with scan context)
    │
    ▼
/speckit.plan
    │
    ▼
/speckit.tasks
    │
    ▼
Report
```

## Resume Points

| Existing Docs | Resume From |
|--------------|-------------|
| Nothing | Phase 0 (full pipeline) |
| spec.md | Phase 3 (plan) |
| spec.md + plan.md | Phase 4 (tasks) |
| All three | Complete (report only) |

## Outputs

All artifacts go to `specs/{NNN-feature-name}/`:

```
specs/{NNN-feature-name}/
├── spec.md                    # Feature specification
├── plan.md                    # Implementation plan
├── research.md                # Technical research
├── data-model.md              # Data model definitions
├── quickstart.md              # Quick start guide
├── tasks.md                   # Task breakdown
├── checklists/
│   └── requirements.md        # Quality checklist
└── contracts/
    └── *.md                   # API contracts
```
