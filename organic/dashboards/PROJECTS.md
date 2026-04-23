# Projects Dashboard

> **Source**: `organic/projects.json` + `organic/workflows.json`
> **Generated**: 2026-04-21 | **Repo**: agence-master

---

## Active Projects

| ID | Title | Workflows | Avg Completion % | Status |
|----|-------|-----------|-----------------|--------|
| PROJ-LAGENCE | l'Agence Framework | 14 | 93% | 🟡 In progress |

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
| WF-SKILLS | Skill Commands | 7 | 7 | 100% |
| WF-SECURITY | v0.5 Security Fixes (@aleph findings) | 6 | 6 | 100% |
| WF-WIRING | v0.5 Feature Wiring (@peers.coders) | 4 | 4 | 100% |
| WF-V5TEST | v0.5 Security & Integration Tests | 2 | 2 | 100% |
| WF-RELEASE | v0.5.0 Release Packaging | 2 | 2 | 100% |
| WF-SECLOOP | Security Integration Loop (perpetual) | 4 | 0 | 0% |
| WF-MEMORY | Cognitive Memory Model | 5 | 5 | 100% |
| **Total** | | **47** | **43** | **91%** |

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
| WF-SKILLS | 105 | 675 | 0 |
| WF-SECURITY | 225 | 740 | 0 |
| WF-WIRING | 115 | 330 | 0 |
| WF-V5TEST | 160 | 265 | 0 |
| WF-RELEASE | 105 | 145 | 0 |
| WF-SECLOOP | 180 | 655 | 0 |
| WF-MEMORY | 225 | 725 | 0 |

---

## Completion Formula

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|}$$

Project completion is the mean of its workflow completions.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
