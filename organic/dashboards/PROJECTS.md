# Projects Dashboard

> **Source**: `organic/projects.json` + `organic/workflows.json`  
> **Generated**: 2026-04-10 | **Repo**: agence-master

---

## Active Projects

| ID | Title | Workflows | Avg Completion % | Status |
|----|-------|-----------|-----------------|--------|
| PROJ-LAGENCE | l'Agence Framework | 6 | 0% | 🔴 Not started |

## Project → Workflow Breakdown

### PROJ-LAGENCE — l'Agence Framework

| Workflow | Title | Tasks | Done | Completion |
|----------|-------|-------|------|------------|
| WF-INFRA | Core Infrastructure | 5 | 0 | 0% |
| WF-DOCS | Documentation | 3 | 0 | 0% |
| WF-TEST | Test Suite | 2 | 0 | 0% |
| WF-CLI | CLI & Tools | 2 | 0 | 0% |
| WF-SWARM | Swarm Orchestration | 2 | 0 | 0% |
| WF-BUGS | Bug Fixes | 1 | 0 | 0% |
| **Total** | | **15** | **0** | **0%** |

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
