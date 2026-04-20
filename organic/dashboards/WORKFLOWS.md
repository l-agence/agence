# Workflows Dashboard

> **Source**: `organic/workflows.json` + `organic/tasks.json`
> **Generated**: 2026-04-20T21:00:00Z | **Project**: PROJ-LAGENCE

---

## Workflow Summary

| ID | Title | Tasks | Done | Open | Completion | Status |
|----|-------|-------|------|------|-----------|--------|
| WF-INFRA | Core Infrastructure | 5 | 5 | 0 | 100% | ✅ Done |
| WF-DOCS | Documentation | 3 | 3 | 0 | 100% | ✅ Done |
| WF-TEST | Test Suite | 2 | 2 | 0 | 100% | ✅ Done |
| WF-CLI | CLI & Tools | 2 | 2 | 0 | 100% | ✅ Done |
| WF-SWARM | Swarm Orchestration | 2 | 2 | 0 | 100% | ✅ Done |
| WF-BUGS | Bug Fixes | 1 | 1 | 0 | 100% | ✅ Done |
| WF-AGENTS | Agent Personas & Dispatch | 2 | 2 | 0 | 100% | ✅ Done |
| WF-SKILLS | Skill Commands | 7 | 7 | 0 | 100% | ✅ Done |
| WF-SECURITY | v0.5 Security Fixes | 6 | 3 | 3_ | 50% | ⏸ Partial (v0.6) |
| WF-WIRING | v0.5 Feature Wiring | 4 | 4 | 0 | 100% | ✅ Done |
| WF-V5TEST | v0.5 Security & Integration Tests | 2 | 2 | 0 | 100% | ✅ Done |
| WF-RELEASE | v0.5.0 Release Packaging | 2 | 2 | 0 | 100% | ✅ Done |
| WF-SECLOOP | Security Integration Loop | 4 | 0 | 4_ | 0% | ⏸ Deferred (v0.7) |
| **Total** | | **42** | **35** | **7** | **83%** | |

> Note: WF-SECLOOP is perpetual — never reaches 100%. SEC-007 is the orchestrator; SEC-008/009/010 are cycle children.

---

## Completed Workflows (10/13)

All tasks shipped and verified:

- **WF-INFRA** — INFRA-001..005 (PTY, agentd, AIPOLICY, ledger, registry)
- **WF-DOCS** — DOC-001..003 (README, help, cleanup)
- **WF-TEST** — TEST-001, CLI-003 (shellspec, smoke)
- **WF-CLI** — CLI-001..002 (help, gitignore)
- **WF-SWARM** — SWARM-001..002 (gate, interface)
- **WF-BUGS** — BUG-001 (prune)
- **WF-AGENTS** — AGENT-001, SKILL-001 (personas, dispatch)
- **WF-SKILLS** — SKILL-002..008 (28 skills defined)
- **WF-WIRING** — WIRE-001..004 (@peers, alias, persona injection)
- **WF-V5TEST** — TEST-002 (122 guard), TEST-003 (51 peers/dispatch)
- **WF-RELEASE** — REL-001..002 (v0.5.0-stable @ f05c7be)

## Paused Workflows

### WF-SECURITY — v0.5 Security Fixes (50% — 3 done, 3 paused v0.6)

| ID | Title | State | Milestone |
|----|-------|-------|-----------|
| ~~SEC-001~~ | Shell injection fix | `-` | v0.5.0 |
| ~~SEC-002~~ | Gemini key→header | `-` | v0.5.0 |
| ~~SEC-003~~ | Fail-closed default | `-` | v0.5.0 |
| SEC-004 | Signal forgery IPC auth | `_` | v0.6 |
| SEC-005 | tmux send-keys injection | `_` | v0.6 |
| SEC-006 | Persona injection hardening | `_` | v0.6 |

### WF-SECLOOP — Security Integration Loop (perpetual, cycle 1 — all deferred v0.7)

| ID | Title | State | Role |
|----|-------|-------|------|
| SEC-007 | ^integrate cycle orchestrator | `_` | parent |
| SEC-008 | ^break stress test | `_` | child |
| SEC-009 | ^hack red-team probe | `_` | child |
| SEC-010 | ^integrate findings | `_` | child |

---

*Regenerate: `airun matrix dashboard` | Spec: MATRICES.md | Symbols: SYMBOLS.md*
