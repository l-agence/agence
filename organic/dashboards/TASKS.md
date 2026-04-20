# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: score = 10P + 25S + 100H
> **Generated**: 2026-04-20 | **Project**: PROJ-LAGENCE

---

## Active Tasks

| ID | Title | State | Pri | Stars | Heat | Score | Agent | Blocked By |
|----|-------|-------|-----|-------|------|-------|-------|------------|
| ~~SEC-001~~ | ~~F-1 CRITICAL: Fix shell injection in guard.ts emitShellExports eval~~ | `-` | 5 | 3 | 1 | **225** | — | — |
| ~~INFRA-002~~ | ~~agentd skeleton: pid file, socket per tangent, Docker spawn~~ | `-` | 4 | 2 | 0.8 | **170** | copilot | — |
| ~~SKILL-001~~ | ~~Skill infrastructure: agent dispatch + artifact routing to synthetic/objectcode~~ | `-` | 4 | 2 | 0.8 | **170** | @copilot | — |
| TEST-002 | Guard security boundary tests (~50 tests for guard.ts, F-5) | `+` | 4 | 2 | 0.7 | **160** | — | — |
| ~~SEC-002~~ | ~~F-2 HIGH: Move Gemini API key from URL query param to x-goog-api-key header~~ | `-` | 4 | 2 | 0.5 | **140** | — | — |
| ~~SEC-003~~ | ~~F-3 HIGH: Guard default unknown commands T1→T2 (fail-closed)~~ | `-` | 4 | 2 | 0.3 | **120** | — | — |
| ~~AGENT-001~~ | ~~@linus, @feynman, @aleph persona definitions~~ | `-` | 3 | 1 | 0.6 | **115** | @copilot | — |
| WIRE-001 | Wire @peers detection in skill.ts (~15 lines, @ routing) | `+` | 3 | 1 | 0.6 | **115** | — | — |
| WIRE-002 | Wire peers.ts → CLI: @peers ^analyze/^solve/^review integration | `+` | 3 | 1 | 0.6 | **115** | — | WIRE-001 |
| ~~INFRA-001~~ | ~~Pipe-pane: replace script(1) with tmux-native PTY streaming~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-001~~ | ~~Gate = write access (not --safe flag) — update aido tier routing~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SWARM-002~~ | ~~agentd interface contract: abstract container-spawn (Docker now, Nomad later)~~ | `-` | 3 | 1 | 0.5 | **105** | copilot | — |
| ~~SKILL-002~~ | ~~Code skills: ^fix, ^build, ^feature, ^refactor, ^solve~~ | `-` | 3 | 1 | 0.5 | **105** | @copilot | — |
| ~~SKILL-003~~ | ~~Review skills: ^review, ^precommit, ^simplify~~ | `-` | 3 | 1 | 0.5 | **105** | @copilot | — |
| ~~SKILL-004~~ | ~~Analysis skills: ^analyse, ^design, ^pattern, ^scope, ^spec, ^split~~ | `-` | 3 | 1 | 0.5 | **105** | @copilot | — |
| SKILL-008 | Move skills to synthetic root + add ^deploy, ^brainstorm | `+` | 3 | 1 | 0.5 | **105** | — | — |
| TEST-003 | peers.ts + dispatch.ts unit test bootstrap | `+` | 3 | 1 | 0.5 | **105** | — | — |
| REL-002 | Integration testing + tag v0.5.0-stable | `+` | 3 | 1 | 0.5 | **105** | — | TEST-002 |
| ~~INFRA-004~~ | ~~.ailedger enhancements: AIPOLICY.yaml commit, prune policy~~ | `-` | 3 | 1 | 0.4 | **95** | copilot | — |
| ~~SHELL-001~~ | ~~Shell UI: state-colored PS1, tmux titles, shell economy + reap~~ | `-` | 2 | 1 | 0.5 | **95** | copilot | — |
| ~~SKILL-005~~ | ~~Peer skills: ^peer-design, ^peer-review, ^peer-solve, ^peer-analyse~~ | `-` | 3 | 1 | 0.4 | **95** | @copilot | — |
| ~~SKILL-006~~ | ~~Red team skills: ^hack, ^break (autonomous attack surface probing)~~ | `-` | 2 | 1 | 0.4 | **85** | @copilot | — |
| SEC-004 | F-4 MEDIUM: Signal forgery — add auth on IPC files in nexus/signals/ | `_` | 3 | 1 | 0.3 | **85** | — | — |
| SEC-005 | F-6 MEDIUM: tmux send-keys injection in signal.ts | `_` | 3 | 1 | 0.3 | **85** | — | — |
| SEC-006 | F-7 MEDIUM: Persona injection surface hardening (when @ routing wired) | `_` | 3 | 1 | 0.3 | **85** | — | WIRE-004 |
| ~~INFRA-003~~ | ~~Publish AIPOLICY.yaml schema as governance standard~~ | `-` | 2 | 1 | 0.3 | **75** | copilot | — |
| ~~SKILL-007~~ | ~~Knowledge skills: ^document, ^test, ^recon, ^grasp, ^glimpse~~ | `-` | 2 | 1 | 0.3 | **75** | @copilot | — |
| WIRE-004 | Wire persona injection: codex/agents/<name>/agent.md → system prompt | `_` | 2 | 0 | 0.4 | **60** | — | — |
| ~~TEST-001~~ | ~~Shellspec tests for ^ledger, ^audit, ^session prune, ^index~~ | `-` | 2 | 0 | 0.3 | **50** | copilot | — |
| ~~INFRA-005~~ | ~~Agent persona loading from codex/agents/registry.json~~ | `-` | 2 | 0 | 0.3 | **50** | — | — |
| ~~CLI-003~~ | ~~Smoke tests: path validation rejects escapes without junctions~~ | `-` | 2 | 0 | 0.3 | **50** | — | — |
| ~~DOC-001~~ | ~~Update docs for v0.3.2 (plans INDEX, README, COMMANDS.md)~~ | `-` | 2 | 0 | 0.2 | **40** | copilot | — |
| ~~DOC-002~~ | ~~Update show_help() with new commands (^ledger, ^audit, airun)~~ | `-` | 2 | 0 | 0.2 | **40** | copilot | — |
| ~~BUG-001~~ | ~~mnemonic prune + sessions prune (stale file cleanup)~~ | `-` | 2 | 0 | 0.2 | **40** | copilot | — |
| WIRE-003 | Add 'analyze' alias for 'analyse' spelling in skill dispatch | `+` | 2 | 0 | 0.2 | **40** | — | — |
| REL-001 | package.json version 0.5.0 + ROADMAP.md update | `+` | 2 | 0 | 0.2 | **40** | — | — |
| ~~DOC-003~~ | ~~Clear stale synthetic todos (shellspec, v0.2.5 done)~~ | `-` | 1 | 0 | 0.1 | **20** | copilot | — |
| ~~CLI-001~~ | ~~agence help deep improvements (multi-tool docs entry point)~~ | `-` | 1 | 0 | 0.1 | **20** | copilot | — |
| ~~CLI-002~~ | ~~.gitignore final review (local symlinks, build artifacts)~~ | `-` | 1 | 0 | 0.1 | **20** | copilot | — |

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 39 |
| Runnable | 8 |
| Blocked | 3 |
| Completed | 27 |
| Failed | 0 |

## State Distribution

| State | Symbol | Count |
|-------|--------|-------|
| Completed | `-` | 27 |
| Pending | `+` | 8 |
| Paused | `_` | 4 |

---

## Scoring Leaderboard

*Top 10 tasks by score (highest first):*

| Rank | ID | Score | State |
|------|----|-------|-------|
| 1 | ~~SEC-001~~ | 225 | `-` ✅ |
| 2 | ~~INFRA-002~~ | 170 | `-` ✅ |
| 3 | ~~SKILL-001~~ | 170 | `-` ✅ |
| 4 | TEST-002 | 160 | `+` |
| 5 | ~~SEC-002~~ | 140 | `-` ✅ |
| 6 | ~~SEC-003~~ | 120 | `-` ✅ |
| 7 | ~~AGENT-001~~ | 115 | `-` ✅ |
| 8 | WIRE-001 | 115 | `+` |
| 9 | WIRE-002 | 115 | `+` |
| 10 | ~~INFRA-001~~ | 105 | `-` ✅ |

---

## Dependency Graph

INFRA-001 ✅ ──^──> INFRA-002 ✅

INFRA-002 ✅ ──^──> SWARM-002 ✅

SWARM-001 ✅ ── ; ──> SWARM-002 ✅

DOC-001 ✅ ── ; ──> DOC-002 ✅

CLI-003 ✅ ── ; ──> TEST-001 ✅

AGENT-001 ✅ ──^──> SKILL-001 ✅

SKILL-001 ✅ ──^──> SKILL-002 ✅

SKILL-001 ✅ ──^──> SKILL-003 ✅

SKILL-001 ✅ ──^──> SKILL-004 ✅

SKILL-001 ✅ ──^──> SKILL-005 ✅

SKILL-001 ✅ ──^──> SKILL-006 ✅

SKILL-001 ✅ ──^──> SKILL-007 ✅

SEC-001 ✅ ──^──> REL-002 +

SEC-002 ✅ ──^──> REL-002 +

SEC-003 ✅ ──^──> REL-002 +

SEC-001 ✅ ──^──> TEST-002 +

WIRE-001 + ──^──> WIRE-002 +

WIRE-002 + ── ; ──> WIRE-003 +

WIRE-004 _ ──^──> SEC-006 _

TEST-002 + ──^──> REL-002 +

TEST-003 + ── ; ──> REL-002 +

REL-001 + ── ; ──> REL-002 +

^ = hard block | ; = soft advisory

---

*Regenerate: `airun matrix dashboard` | Spec: MATRICES.md | Symbols: SYMBOLS.md*
