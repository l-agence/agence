# Tasks Dashboard

> **Source**: `organic/tasks.json` | **Formula**: score = 10P + 25S + 100H
> **Generated**: 2026-04-20T21:00:00Z | **Project**: PROJ-LAGENCE

---

## Open Tasks (paused / deferred)

| ID | Title | State | Pri | Score | Milestone | Parent |
|----|-------|-------|-----|-------|-----------|--------|
| SEC-007 | PERPETUAL: Security Integration Loop — ^integrate cycle | `_` | 4 | 170 | v0.7 | — |
| SEC-008 | ^break own tools: non-destructive stress test | `_` | 4 | 180 | v0.7 | SEC-007 |
| SEC-009 | ^hack red-team probe: privilege escalation + self-modification | `_` | 4 | 180 | v0.7 | SEC-007 |
| SEC-010 | ^integrate findings: fix + verify + regression test loop | `_` | 3 | 125 | v0.7 | SEC-007 |
| SEC-004 | F-4 MEDIUM: Signal forgery — IPC auth in nexus/signals/ | `_` | 3 | 85 | v0.6 | — |
| SEC-005 | F-6 MEDIUM: tmux send-keys injection in signal.ts | `_` | 3 | 85 | v0.6 | — |
| SEC-006 | F-7 MEDIUM: Persona injection surface hardening | `_` | 3 | 85 | v0.6 | — |

---

## Completed Tasks (36)

| ID | Title | State | Score | Commit |
|----|-------|-------|-------|--------|
| SEC-001 | F-1 CRITICAL: Fix shell injection in guard.ts emitShellExports eval | `-` | 225 | bf5d8ab |
| SEC-002 | F-2 HIGH: Move Gemini API key to x-goog-api-key header | `-` | 140 | bf5d8ab |
| SEC-003 | F-3 HIGH: Guard default unknown T1→T2 (fail-closed) | `-` | 120 | bf5d8ab |
| INFRA-002 | agentd skeleton: pid file, socket per tangent, Docker spawn | `-` | 170 | 93f96d9 |
| SKILL-001 | Skill infrastructure: agent dispatch + artifact routing | `-` | 170 | — |
| TEST-002 | Guard security boundary tests (122 tests) | `-` | 160 | 9ba25ea |
| AGENT-001 | @linus, @feynman, @aleph persona definitions | `-` | 115 | — |
| WIRE-001 | Wire @peers detection in skill.ts | `-` | 115 | — |
| WIRE-002 | Wire peers.ts → CLI: @peers integration | `-` | 115 | — |
| INFRA-001 | Pipe-pane: tmux-native PTY streaming | `-` | 105 | ab08428 |
| SWARM-001 | Gate = write access — update aido tier routing | `-` | 105 | fba1e9d |
| SWARM-002 | agentd interface contract: abstract container-spawn | `-` | 105 | 67ad891 |
| SKILL-002 | Code skills: ^fix, ^build, ^feature, ^refactor, ^solve | `-` | 105 | — |
| SKILL-003 | Review skills: ^review, ^precommit, ^simplify | `-` | 105 | — |
| SKILL-004 | Analysis skills: ^analyse, ^design, ^pattern, ^scope, ^spec, ^split | `-` | 105 | — |
| SKILL-008 | Move skills to synthetic root + ^deploy, ^brainstorm | `-` | 105 | 408719f |
| TEST-003 | peers.ts + dispatch.ts unit tests (51 tests) | `-` | 105 | 9ba25ea |
| REL-002 | Integration testing + tag v0.5.0-stable | `-` | 105 | f05c7be |
| INFRA-004 | .ailedger enhancements: AIPOLICY.yaml commit, prune | `-` | 95 | 7ea36bd |
| SHELL-001 | Shell UI: state-colored PS1, tmux titles, shell economy | `-` | 95 | 90e4fe7 |
| SKILL-005 | Peer skills: ^peer-design, ^peer-review, ^peer-solve, ^peer-analyse | `-` | 95 | — |
| SKILL-006 | Red team skills: ^hack, ^break | `-` | 85 | — |
| INFRA-003 | Publish AIPOLICY.yaml schema as governance standard | `-` | 75 | e9dc9d0 |
| SKILL-007 | Knowledge skills: ^document, ^test, ^recon, ^grasp, ^glimpse | `-` | 75 | — |
| WIRE-004 | Wire persona injection: agent.md → system prompt | `-` | 60 | 55bfbbb |
| TEST-001 | Shellspec tests for ^ledger, ^audit, ^session prune, ^index | `-` | 50 | — |
| INFRA-005 | Agent persona loading from codex/agents/registry.json | `-` | 50 | 9eb373c |
| CLI-003 | Smoke tests: path validation rejects escapes | `-` | 50 | f8250ff |
| DOC-001 | Update docs for v0.3.2 (plans INDEX, README, COMMANDS.md) | `-` | 40 | — |
| DOC-002 | Update show_help() with new commands | `-` | 40 | — |
| BUG-001 | mnemonic prune + sessions prune (stale file cleanup) | `-` | 40 | — |
| WIRE-003 | Add 'analyze' alias for 'analyse' | `-` | 40 | — |
| REL-001 | package.json version 0.5.0 + ROADMAP.md update | `-` | 40 | — |
| DOC-003 | Clear stale synthetic todos | `-` | 20 | — |
| CLI-001 | agence help deep improvements | `-` | 20 | — |
| CLI-002 | .gitignore final review | `-` | 20 | — |

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 43 |
| Completed (`-`) | 36 |
| Paused (`_`) | 7 |
| Active (`+`/`&`/`%`) | 0 |
| Completion | **84%** |

## By Milestone

| Milestone | Open | Done | Total |
|-----------|------|------|-------|
| v0.5.0 | 0 | 36 | 36 |
| v0.6 | 3 | 0 | 3 |
| v0.7 | 4 | 0 | 4 |

---

## Dependency Graph

```
INFRA-001 ✅ ──^──> INFRA-002 ✅
INFRA-002 ✅ ──^──> SWARM-002 ✅
SWARM-001 ✅ ── ; ──> SWARM-002 ✅
DOC-001 ✅ ── ; ──> DOC-002 ✅
CLI-003 ✅ ── ; ──> TEST-001 ✅
AGENT-001 ✅ ──^──> SKILL-001 ✅
SKILL-001 ✅ ──^──> SKILL-002..007 ✅
SEC-001/002/003 ✅ ──^──> REL-002 ✅
WIRE-001 ✅ ──^──> WIRE-002 ✅ ── ; ──> WIRE-003 ✅
WIRE-004 ✅ ──^──> SEC-006 _
SEC-007 _ ──^──> SEC-008/009/010 _  (v0.7 cycle)
```

^ = hard block | ; = soft advisory

---

*Regenerate: `airun matrix dashboard` | Spec: MATRICES.md | Symbols: SYMBOLS.md*
