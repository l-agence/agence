# Workflows Dashboard

> **Source**: `organic/workflows.json` + `organic/tasks.json`  
> **Generated**: 2026-04-10 | **Project**: PROJ-LAGENCE

---

## Active Workflows

| ID | Title | Tasks | Completed | Remaining | Completion % | Status |
|----|-------|-------|-----------|-----------|-------------|--------|
| WF-INFRA | Core Infrastructure | 5 | 0 | 5 | 0% | 🔴 Not started |
| WF-DOCS | Documentation | 3 | 0 | 3 | 0% | 🔴 Not started |
| WF-TEST | Test Suite | 2 | 0 | 2 | 0% | 🔴 Not started |
| WF-CLI | CLI & Tools | 2 | 0 | 2 | 0% | 🔴 Not started |
| WF-SWARM | Swarm Orchestration | 2 | 0 | 2 | 0% | 🔴 Not started |
| WF-BUGS | Bug Fixes | 1 | 0 | 1 | 0% | 🔴 Not started |

---

## Workflow Detail

### WF-INFRA — Core Infrastructure (5 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| INFRA-001 | Pipe-pane: tmux-native PTY streaming | `-` | 105 | — |
| INFRA-002 | agentd skeleton: pid, socket, Docker | `-` | 170 | ~~INFRA-001~~ |
| INFRA-003 | Publish AIPOLICY.yaml schema | `-` | 75 | — |
| INFRA-004 | .ailedger enhancements | `-` | 95 | — |
| INFRA-005 | Agent persona loading | `-` | 50 | — |

### WF-DOCS — Documentation (3 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| DOC-001 | Update docs for v0.3.2 | `~` | 40 | — |
| DOC-002 | Update show_help() | `~` | 40 | ; DOC-001 |
| DOC-003 | Clear stale synthetic todos | `~` | 20 | — |

### WF-TEST — Test Suite (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| CLI-003 | Smoke tests: path validation | `-` | 50 | — |
| TEST-001 | Shellspec: ^ledger, ^audit | `~` | 50 | ; CLI-003 |

### WF-CLI — CLI & Tools (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| CLI-001 | agence help deep improvements | `~` | 20 | — |
| CLI-002 | .gitignore final review | `~` | 20 | — |

### WF-SWARM — Swarm Orchestration (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| SWARM-001 | Gate = write access | `-` | 105 | — |
| SWARM-002 | agentd interface contract | `-` | 105 | ~~INFRA-002~~ |

### WF-BUGS — Bug Fixes (1 task)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| BUG-001 | mnemonic + sessions prune | `~` | 40 | — |

---

## Completion Formula

$$\text{completion}(W) = \frac{|\{t \in W : \text{state}(t) = \texttt{"-"}\}|}{|W|} \times 100\%$$

A workflow is **complete** when all its tasks reach state `-`.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
