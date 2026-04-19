# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: score = 10P + 25S + 100H
> **Generated**: 2026-04-19 | **Project**: PROJ-LAGENCE

---

## Active Tasks

| ID | Title | State | Pri | Stars | Heat | Score | Agent | Blocked By |
|----|-------|-------|-----|-------|------|-------|-------|------------|
| ~~INFRA-002~~ | ~~agentd skeleton: pid file, socket per tangent, Docker spawn~~ | `-` | 4 | 2 | 0.8 | **170** | copilot | — |
| SKILL-001 | Skill infrastructure: agent dispatch + artifact routing to synthetic/objectcode | `+` | 4 | 2 | 0.8 | **170** | — | AGENT-001 |
| AGENT-001 | @linus, @feynman, @aleph persona definitions | `+` | 3 | 1 | 0.6 | **115** | — | — |
| ~~INFRA-001~~ | ~~Pipe-pane: replace script(1) with tmux-native PTY streaming~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-001~~ | ~~Gate = write access (not --safe flag) — update aido tier routing~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-002~~ | ~~agentd interface contract: abstract container-spawn (Docker now, Nomad later)~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| SKILL-002 | Code skills: ^fix, ^build, ^feature, ^refactor, ^solve | `+` | 3 | 1 | 0.5 | **105** | — | SKILL-001 |
| SKILL-003 | Review skills: ^review, ^precommit, ^simplify | `+` | 3 | 1 | 0.5 | **105** | — | SKILL-001 |
| SKILL-004 | Analysis skills: ^analyse, ^design, ^pattern, ^scope, ^spec, ^split | `+` | 3 | 1 | 0.5 | **105** | — | SKILL-001 |
| ~~INFRA-004~~ | ~~.ailedger enhancements: AIPOLICY.yaml commit, prune policy~~ | `-` | 3 | 1 | 0.4 | **95** | copilot | — |
| ~~SHELL-001~~ | ~~Shell UI: state-colored PS1, tmux titles, shell economy + reap~~ | `-` | 2 | 1 | 0.5 | **95** | copilot | — |
| SKILL-005 | Peer skills: ^peer-design, ^peer-review, ^peer-solve, ^peer-analyse | `+` | 3 | 1 | 0.4 | **95** | — | SKILL-001 |
| SKILL-006 | Red team skills: ^hack, ^break (autonomous attack surface probing) | `+` | 2 | 1 | 0.4 | **85** | — | SKILL-001 |
| ~~INFRA-003~~ | ~~Publish AIPOLICY.yaml schema as governance standard~~ | `-` | 2 | 1 | 0.3 | **75** | copilot | — |
| SKILL-007 | Knowledge skills: ^document, ^test, ^recon, ^grasp, ^glimpse | `+` | 2 | 1 | 0.3 | **75** | — | SKILL-001 |
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
| Total tasks | 24 |
| Runnable | 8 |
| Blocked | 7 |
| Completed | 16 |
| Failed | 0 |

## State Distribution

| State | Symbol | Count |
|-------|--------|-------|
| Completed | `-` | 16 |
| Pending | `+` | 8 |

---

## Scoring Leaderboard

*Top 10 tasks by score (highest first):*

| Rank | ID | Score | State |
|------|----|-------|-------|
| 1 | ~~INFRA-002~~ | 170 | `-` ✅ |
| 2 | SKILL-001 | 170 | `+` |
| 3 | AGENT-001 | 115 | `+` |
| 4 | ~~INFRA-001~~ | 105 | `-` ✅ |
| 5 | ~~SWARM-001~~ | 105 | `-` ✅ |
| 6 | ~~SWARM-002~~ | 105 | `-` ✅ |
| 7 | SKILL-002 | 105 | `+` |
| 8 | SKILL-003 | 105 | `+` |
| 9 | SKILL-004 | 105 | `+` |
| 10 | ~~INFRA-004~~ | 95 | `-` ✅ |

---

## Dependency Graph

INFRA-001 ✅ ──^──> INFRA-002 ✅

INFRA-002 ✅ ──^──> SWARM-002 ✅

SWARM-001 ✅ ── ; ──> SWARM-002 ✅

DOC-001 ✅ ── ; ──> DOC-002 ✅

CLI-003 ✅ ── ; ──> TEST-001 ✅

AGENT-001 + ──^──> SKILL-001 +

SKILL-001 + ──^──> SKILL-002 +

SKILL-001 + ──^──> SKILL-003 +

SKILL-001 + ──^──> SKILL-004 +

SKILL-001 + ──^──> SKILL-005 +

SKILL-001 + ──^──> SKILL-006 +

SKILL-001 + ──^──> SKILL-007 +

^ = hard block | ; = soft advisory

---

*Regenerate: `airun matrix dashboard` | Spec: MATRICES.md | Symbols: SYMBOLS.md*
