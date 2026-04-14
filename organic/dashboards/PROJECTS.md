# Projects Dashboard

> **Source**: `organic/projects.json` + `organic/workflows.json`  
> **Generated**: 2026-04-14 | **Repo**: agence-master

---

## Active Projects

| ID | Title | Workflows | Avg Completion % | Status |
|----|-------|-----------|-----------------|--------|
| PROJ-LAGENCE | l'Agence Framework | 6 | 89% | 🟡 In progress |

## Project → Workflow Breakdown

### PROJ-LAGENCE — l'Agence Framework

| Workflow | Title | Tasks | Done | Completion |
|----------|-------|-------|------|------------|
| WF-INFRA | Core Infrastructure | 5 | 5 | 100% |
| WF-DOCS | Documentation | 3 | 1 | 33% |
| WF-TEST | Test Suite | 2 | 2 | 100% |
| WF-CLI | CLI & Tools | 2 | 2 | 100% |
| WF-SWARM | Swarm Orchestration | 2 | 2 | 100% |
| WF-BUGS | Bug Fixes | 1 | 1 | 100% |
| **Total** | | **15** | **13** | **89%** |

### Score Heat Map

| Workflow | Top Score | Total Score | Blocked |
|----------|-----------|-------------|---------|
| WF-INFRA | 170 | 425 | 1 |
| WF-SWARM | 105 | 210 | 1 |
| WF-TEST | 50 | 100 | 0 |
| WF-DOCS | 40 | 100 | 0 |
| WF-BUGS | 40 | 40 | 0 |
| WF-CLI | 20 | 40 | 0 |

---

## Completion Formula

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|}$$

Project completion is the mean of its workflow completions.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
