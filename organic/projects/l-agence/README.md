# l'Agence — Project

**ID**: `PROJ-LAGENCE`  
**Repo**: `agence-master`  
**Created**: 2026-04-10  
**Status**: Active

---

## Description

The Agence framework itself. All non-proprietary development tasks for the open-source swarm orchestration platform.

## Workflows

| Workflow | ID | Description |
|----------|----|-------------|
| Infrastructure | `WF-INFRA` | Guard, signal, matrix, agentd core |
| Documentation | `WF-DOCS` | Synthetic docs, dashboards, specs |
| Test Suite | `WF-TEST` | ShellSpec unit tests, CI pipeline |
| CLI & Tools | `WF-CLI` | bin/ commands, aibash, aisession |
| Swarm | `WF-SWARM` | tmux, agentd, swarmd, Docker |

## Task Prefixes

Tasks for this project use the following ID prefixes:

| Prefix | Domain |
|--------|--------|
| `INFRA-` | Core infrastructure (guard, signal, matrix) |
| `DOC-` | Documentation |
| `TEST-` | Testing |
| `CLI-` | CLI tools and commands |
| `SWARM-` | Swarm orchestration |
| `BUG-` | Bug fixes |

## Routing

Default project for unqualified task IDs. Symlink `organic/@` → `organic/projects/l-agence/`.
