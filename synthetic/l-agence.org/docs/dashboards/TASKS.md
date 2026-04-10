# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: $\text{score} = 10P + 25S + 100H$  
> **Generated**: 2026-04-12 | **Project**: PROJ-LAGENCE

---

## Active Tasks

| ID | Title | State | Pri | Stars | Heat | Score | Agent | Blocked By |
|----|-------|-------|-----|-------|------|-------|-------|------------|
| ~~INFRA-002~~ | ~~agentd skeleton: pid, socket, Docker spawn~~ | `-` | 4 | 2 | 0.8 | **170** | copilot | ~~INFRA-001~~ |
| ~~INFRA-001~~ | ~~Pipe-pane: tmux-native PTY streaming~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-001~~ | ~~Gate = write access (not --safe flag)~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-002~~ | ~~agentd interface contract (Docker→Nomad)~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | ~~INFRA-002~~ |
| ~~INFRA-004~~ | ~~.ailedger enhancements: AIPOLICY commit, prune~~ | `-` | 3 | 1 | 0.4 | **95** | copilot | — |
| ~~INFRA-003~~ | ~~Publish AIPOLICY.yaml schema~~ | `-` | 2 | 1 | 0.3 | **75** | copilot | — |
| ~~INFRA-005~~ | ~~Agent persona loading from registry.json~~ | `-` | 2 | 0 | 0.3 | **50** | copilot | — |
| TEST-001 | Shellspec: ^ledger, ^audit, ^session prune | `~` | 2 | 0 | 0.3 | **50** | — | — |
| ~~CLI-003~~ | ~~Smoke tests: path validation rejects escapes~~ | `-` | 2 | 0 | 0.3 | **50** | copilot | — |
| DOC-001 | Update docs for v0.3.2 | `~` | 2 | 0 | 0.2 | **40** | — | — |
| DOC-002 | Update show_help() with new commands | `~` | 2 | 0 | 0.2 | **40** | — | — |
| BUG-001 | mnemonic prune + sessions prune | `~` | 2 | 0 | 0.2 | **40** | — | — |
| DOC-003 | Clear stale synthetic todos | `~` | 1 | 0 | 0.1 | **20** | — | — |
| CLI-001 | agence help deep improvements | `~` | 1 | 0 | 0.1 | **20** | — | — |
| CLI-002 | .gitignore final review | `~` | 1 | 0 | 0.1 | **20** | — | — |
| ~~SHELL-001~~ | ~~Shell UI: state-colored PS1, tmux titles, shell economy~~ | `-` | 2 | 1 | 0.5 | **95** | copilot | — |

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 16 |
| Runnable | 7 |
| Blocked | 0 |
| Completed | 9 |
| Failed | 0 |

## State Distribution

| State | Symbol | Count |
|-------|--------|-------|
| Human-assigned | `~` | 7 |
| Completed | `-` | 9 |

---

## Scoring Leaderboard

*Top 10 tasks by score (highest first):*

| Rank | ID | Score | State |
|------|----|-------|-------|
| 1 | ~~INFRA-002~~ | 170 | `-` ✅ |
| 2 | ~~INFRA-001~~ | 105 | `-` ✅ |
| 3 | ~~SWARM-001~~ | 105 | `-` ✅ |
| 4 | ~~SWARM-002~~ | 105 | `-` ✅ |
| 5 | ~~INFRA-004~~ | 95 | `-` ✅ |
| 6 | ~~INFRA-003~~ | 75 | `-` ✅ |
| 7 | ~~INFRA-005~~ | 50 | `-` ✅ |
| 8 | TEST-001 | 50 | `~` |
| 9 | ~~CLI-003~~ | 50 | `-` ✅ |
| 10 | DOC-001 | 40 | `~` |

---

## Dependency Graph

```
INFRA-001 ✅ ──^──> INFRA-002 ✅ ──^──> SWARM-002 ✅
                                     ^
SWARM-001 ─────────── ; ─────────────┘

DOC-001 ──── ; ──> DOC-002

CLI-003 ──── ; ──> TEST-001
```

`^` = hard block | `;` = soft advisory

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md) | Symbols: [SYMBOLS.md](../SYMBOLS.md)*
