# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: $\text{score} = 10P + 25S + 100H$

---

## Active Tasks

| ID | Title | State | Priority | Stars | Heat | Score | Agent | Blocked By |
|----|-------|-------|----------|-------|------|-------|-------|------------|
| — | *No tasks yet* | — | — | — | — | — | — | — |

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 0 |
| Runnable | 0 |
| Blocked | 0 |
| Completed | 0 |
| Failed | 0 |

## State Distribution

| State | Symbol | Count |
|-------|--------|-------|
| Pending | `+` | 0 |
| Human-assigned | `~` | 0 |
| Human-working | `$` | 0 |
| Agent-assigned | `%` | 0 |
| Agent-executing | `&` | 0 |
| Awaiting input | `?` | 0 |
| Paused | `_` | 0 |
| Held | `#` | 0 |
| Completed | `-` | 0 |
| Failed | `!` | 0 |

---

## Scoring Leaderboard

*Top 10 tasks by score (highest first):*

| Rank | ID | Score | State |
|------|----|-------|-------|
| — | *No scored tasks* | — | — |

---

## Add a Task

```bash
airun matrix add TASK-001 "Description"
airun matrix set TASK-001 priority 3
airun matrix set TASK-001 heat 0.5
airun matrix dep TASK-001 TASK-002    # hard dependency
```

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md) | Symbols: [SYMBOLS.md](../SYMBOLS.md)*
