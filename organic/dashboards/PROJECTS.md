# Projects Dashboard

> **Source**: `organic/projects.json` + `organic/workflows.json`
> **Generated**: 2026-04-20T21:00:00Z | **Repo**: l-agence/agence

---

## PROJ-LAGENCE — l'Agence Framework

| Metric | Value |
|--------|-------|
| Version | v0.5.0-stable (f05c7be) |
| HEAD | 873b30e (organic bookkeeping) |
| Total tasks | 43 |
| Completed | 36 (84%) |
| Paused | 7 (v0.6: 3, v0.7: 4) |
| Workflows | 13 (10 done, 1 partial, 1 perpetual, 1 deferred) |
| Tests | 173 TS unit + shellspec suite |
| Status | **v0.5.0 shipped** — sprint complete |

---

## Workflow Breakdown

| Workflow | Title | Done | Total | Completion | Status |
|----------|-------|------|-------|------------|--------|
| WF-INFRA | Core Infrastructure | 5 | 5 | 100% | ✅ |
| WF-DOCS | Documentation | 3 | 3 | 100% | ✅ |
| WF-TEST | Test Suite | 2 | 2 | 100% | ✅ |
| WF-CLI | CLI & Tools | 2 | 2 | 100% | ✅ |
| WF-SWARM | Swarm Orchestration | 2 | 2 | 100% | ✅ |
| WF-BUGS | Bug Fixes | 1 | 1 | 100% | ✅ |
| WF-AGENTS | Agent Personas & Dispatch | 2 | 2 | 100% | ✅ |
| WF-SKILLS | Skill Commands | 7 | 7 | 100% | ✅ |
| WF-SECURITY | v0.5 Security Fixes | 3 | 6 | 50% | ⏸ v0.6 |
| WF-WIRING | v0.5 Feature Wiring | 4 | 4 | 100% | ✅ |
| WF-V5TEST | v0.5 Tests | 2 | 2 | 100% | ✅ |
| WF-RELEASE | v0.5.0 Release | 2 | 2 | 100% | ✅ |
| WF-SECLOOP | Security Loop | 0 | 4 | 0% | ⏸ v0.7 |

---

## Milestone Roadmap

### v0.5.0 — SHIPPED ✅
All 36 tasks complete. Tagged v0.5.0-stable at f05c7be.

### v0.6 — Security Hardening (3 tasks)
- SEC-004: Signal forgery IPC auth
- SEC-005: tmux send-keys injection
- SEC-006: Persona injection surface hardening

### v0.7 — Security Integration Loop (4 tasks, perpetual)
- SEC-007: ^integrate cycle orchestrator
- SEC-008: ^break stress test
- SEC-009: ^hack red-team probe
- SEC-010: ^integrate findings → regression tests

### v0.8+ — Memory Model (planned)
- COGNOS 7-layer memory architecture
- ^grasp / ^glimpse / ^recon skill wiring
- Persistent memory across sessions (eidetic/episodic/semantic)

---

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|} = \frac{1050}{1300} = 80.8\%$$

---

*Regenerate: `airun matrix dashboard` | Spec: MATRICES.md*
