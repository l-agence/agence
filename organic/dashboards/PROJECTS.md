# Projects Dashboard

> **Source**: `organic/projects.json` + `organic/workflows.json`
> **Generated**: 2026-04-20 | **Repo**: agence-master

---

## Active Projects

| ID | Title | Workflows | Avg Completion % | Status |
|----|-------|-----------|-----------------|--------|
| PROJ-LAGENCE | l'Agence Framework | 8 | 100% | ✅ Done |

## Project → Workflow Breakdown

### PROJ-LAGENCE — l'Agence Framework

| Workflow | Title | Tasks | Done | Completion |
|----------|-------|-------|------|------------|
| WF-INFRA | Core Infrastructure | 5 | 5 | 100% |
| WF-DOCS | Documentation | 3 | 3 | 100% |
| WF-TEST | Test Suite | 2 | 2 | 100% |
| WF-CLI | CLI & Tools | 2 | 2 | 100% |
| WF-SWARM | Swarm Orchestration | 2 | 2 | 100% |
| WF-BUGS | Bug Fixes | 1 | 1 | 100% |
| WF-AGENTS | Agent Personas & Dispatch | 2 | 2 | 100% |
| WF-SKILLS | Skill Commands | 6 | 6 | 100% |
| **Total** | | **23** | **23** | **100%** |

### Score Heat Map

| Workflow | Top Score | Total Score | Blocked |
|----------|-----------|-------------|---------|
| WF-INFRA | 170 | 495 | 0 |
| WF-DOCS | 40 | 100 | 0 |
| WF-TEST | 50 | 100 | 0 |
| WF-CLI | 20 | 40 | 0 |
| WF-SWARM | 105 | 210 | 0 |
| WF-BUGS | 40 | 40 | 0 |
| WF-AGENTS | 170 | 285 | 0 |
| WF-SKILLS | 105 | 570 | 0 |

---

## Completion Formula

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|}$$

Project completion is the mean of its workflow completions.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
