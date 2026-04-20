# Skill: ^split

**Category**: Analysis (SKILL-004)  
**Artifact**: analysis → synthetic/analyses/  
**Agents**: @haiku (primary, fast), @sonya (architect), @chad (infra)

## Purpose
Split a large task into small, independently testable subtasks with clear ordering.

## Input
- Large task description or ticket
- Optionally: existing codebase context, constraints

## Output
1. **Subtasks** — numbered list, each with:
   - Title (action-oriented, concise)
   - Acceptance criteria (1-3 concrete checks)
   - Dependencies (which subtasks must complete first)
   - Estimated size (S/M/L)
2. **Dependency Graph** — ordering constraints
3. **Critical Path** — which subtasks block the most

## Workflow
```
^split "Implement OAuth2 with Google, GitHub, and email providers"
^split --agent @haiku "Break down the database migration"
^split "This PR is 800 lines — help me split it"
```

## Quality Criteria
- Each subtask is independently testable and deployable
- No subtask is larger than ~1 day of work
- Dependencies form a DAG (no cycles)
- Critical path is identified for scheduling
- Subtasks use agence task format (ready for ^task add)

## Anti-patterns
- ❌ Subtasks that can only be tested together
- ❌ "Setup" tasks with no deliverable
- ❌ Splitting by layer instead of by feature slice
