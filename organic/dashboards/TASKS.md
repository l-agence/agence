# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: score = 10P + 25S + 100H
> **Generated**: 2026-04-20T22:00:00Z | **Project**: PROJ-LAGENCE

---

## Open Tasks (paused / deferred — v0.7 only)

| ID | Title | State | Pri | Score | Milestone | Parent |
|----|-------|-------|-----|-------|-----------|--------|
| SEC-007 | PERPETUAL: Security Integration Loop — ^integrate cycle | `_` | 4 | 170 | v0.7 | — |
| SEC-008 | ^break own tools: non-destructive stress test | `_` | 4 | 180 | v0.7 | SEC-007 |
| SEC-009 | ^hack red-team probe: privilege escalation + self-modification | `_` | 4 | 180 | v0.7 | SEC-007 |
| SEC-010 | ^integrate findings: fix + verify + regression test loop | `_` | 3 | 125 | v0.7 | SEC-007 |

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 43 |
| Completed (`-`) | 39 |
| Paused (`_`) | 4 |
| Active | 0 |
| Completion | **91%** |

## By Milestone

| Milestone | Open | Done | Total |
|-----------|------|------|-------|
| v0.5.0 | 0 | 36 | 36 |
| v0.6.0 | 0 | 3 | 3 |
| v0.7 | 4 | 0 | 4 |

---

## Dependency Graph

```
SEC-007 _ ──^──> SEC-008/009/010 _  (v0.7 perpetual cycle)
```

---

*Regenerate: `airun matrix dashboard` | Symbols: SYMBOLS.md*
