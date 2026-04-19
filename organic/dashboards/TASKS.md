# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: score = 10P + 25S + 100H
> **Generated**: 2026-04-19 | **Project**: PROJ-LAGENCE

---

## Active Tasks

| ID | Title | State | Pri | Stars | Heat | Score | Agent | Blocked By |
|----|-------|-------|-----|-------|------|-------|-------|------------|
| ~~INFRA-002~~ | ~~agentd skeleton: pid file, socket per tangent, Docker spawn~~ | `-` | 4 | 2 | 0.8 | **170** | copilot | — |
| ~~INFRA-001~~ | ~~Pipe-pane: replace script(1) with tmux-native PTY streaming~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-001~~ | ~~Gate = write access (not --safe flag) — update aido tier routing~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-002~~ | ~~agentd interface contract: abstract container-spawn (Docker now, Nomad later)~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~INFRA-004~~ | ~~.ailedger enhancements: AIPOLICY.yaml commit, prune policy~~ | `-` | 3 | 1 | 0.4 | **95** | copilot | — |
| ~~SHELL-001~~ | ~~Shell UI: state-colored PS1, tmux titles, shell economy + reap~~ | `-` | 2 | 1 | 0.5 | **95** | copilot | — |
| ~~INFRA-003~~ | ~~Publish AIPOLICY.yaml schema as governance standard~~ | `-` | 2 | 1 | 0.3 | **75** | copilot | — |
| ~~TEST-001~~ | ~~Shellspec tests for ^ledger, ^audit, ^session prune, ^index~~ | `-` | 2 | 0 | 0.3 | **50** | copilot | — |
| ~~INFRA-005~~ | ~~Agent persona loading from codex/agents/registry.json~~ | `-` | 2 | 0 | 0.3 | **50** | — | — |
| ~~CLI-003~~ | ~~Smoke tests: path validation rejects escapes without junctions~~ | `-` | 2 | 0 | 0.3 | **50** | — | — |
| ~~DOC-001~~ | ~~Update docs for v0.3.2 (plans INDEX, README, COMMANDS.md)~~ | `-` | 2 | 0 | 0.2 | **40** | copilot | — |
| ~~DOC-002~~ | ~~Update show_help() with new commands (^ledger, ^audit, airun)~~ | `-` | 2 | 0 | 0.2 | **40** | copilot | — |
| ~~BUG-001~~ | ~~mnemonic prune + sessions prune (stale file cleanup)~~ | `-` | 2 | 0 | 0.2 | **40** | copilot | — |
| ~~DOC-003~~ | ~~Clear stale synthetic todos (shellspec, v0.2.5 done)~~ | `-` | 1 | 0 | 0.1 | **20** | copilot | — |
| ~~CLI-001~~ | ~~agence help deep improvements (multi-tool docs entry point)~~ | `-` | 1 | 0 | 0.1 | **20** | copilot | — |
| ~~CLI-002~~ | ~~.gitignore final review (local symlinks, build artifacts)~~ | `-` | 1 | 0 | 0.1 | **20** | copilot | — |

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 16 |
| Runnable | 0 |
| Blocked | 0 |
| Completed | 16 |
| Failed | 0 |

## State Distribution

| State | Symbol | Count |
|-------|--------|-------|
| Completed | `-` | 16 |

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
| 6 | ~~SHELL-001~~ | 95 | `-` ✅ |
| 7 | ~~INFRA-003~~ | 75 | `-` ✅ |
| 8 | ~~TEST-001~~ | 50 | `-` ✅ |
| 9 | ~~INFRA-005~~ | 50 | `-` ✅ |
| 10 | ~~CLI-003~~ | 50 | `-` ✅ |

---

## Dependency Graph

INFRA-001 ✅ ──^──> INFRA-002 ✅

INFRA-002 ✅ ──^──> SWARM-002 ✅

SWARM-001 ✅ ── ; ──> SWARM-002 ✅

DOC-001 ✅ ── ; ──> DOC-002 ✅

CLI-003 ✅ ── ; ──> TEST-001 ✅

^ = hard block | ; = soft advisory

---

*Regenerate: `airun matrix dashboard` | Spec: MATRICES.md | Symbols: SYMBOLS.md*
