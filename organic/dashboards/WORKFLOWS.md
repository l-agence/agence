# Workflows Dashboard

> **Source**: `organic/workflows.json` + `organic/tasks.json`
> **Generated**: 2026-04-20 | **Project**: PROJ-LAGENCE

---

## Active Workflows

| ID | Title | Tasks | Completed | Remaining | Completion % | Status |
|----|-------|-------|-----------|-----------|-------------|--------|
| WF-DOCS | Documentation | 3 | 3 | 0 | 100% | ✅ Done |
| WF-TEST | Test Suite | 2 | 2 | 0 | 100% | ✅ Done |
| WF-INFRA | Core Infrastructure | 5 | 5 | 0 | 100% | ✅ Done |
| WF-CLI | CLI & Tools | 2 | 2 | 0 | 100% | ✅ Done |
| WF-SWARM | Swarm Orchestration | 2 | 2 | 0 | 100% | ✅ Done |
| WF-BUGS | Bug Fixes | 1 | 1 | 0 | 100% | ✅ Done |
| WF-AGENTS | Agent Personas & Dispatch | 2 | 2 | 0 | 100% | ✅ Done |
| WF-SKILLS | Skill Commands | 7 | 7 | 0 | 100% | ✅ Done |
| WF-SECURITY | v0.5 Security Fixes (@aleph findings) | 6 | 3 | 3 | 50% | 🟡 In progress |
| WF-WIRING | v0.5 Feature Wiring (@peers.coders) | 4 | 3 | 1 | 75% | 🟡 In progress |
| WF-V5TEST | v0.5 Security & Integration Tests | 2 | 0 | 2 | 0% | ⚪ Not started |
| WF-RELEASE | v0.5.0 Release Packaging | 2 | 2 | 0 | 100% | ✅ Done |

---

## Workflow Detail

### WF-DOCS — Documentation (3 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| DOC-001 | Update docs for v0.3.2 (plans INDEX, README, COMMANDS.md) | `-` | 40 | — |
| DOC-002 | Update show_help() with new commands (^ledger, ^audit, airun) | `-` | 40 | — |
| DOC-003 | Clear stale synthetic todos (shellspec, v0.2.5 done) | `-` | 20 | — |

### WF-TEST — Test Suite (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| TEST-001 | Shellspec tests for ^ledger, ^audit, ^session prune, ^index | `-` | 50 | — |
| CLI-003 | Smoke tests: path validation rejects escapes without junctions | `-` | 50 | — |

### WF-INFRA — Core Infrastructure (5 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| INFRA-001 | Pipe-pane: replace script(1) with tmux-native PTY streaming | `-` | 105 | — |
| INFRA-002 | agentd skeleton: pid file, socket per tangent, Docker spawn | `-` | 170 | — |
| INFRA-003 | Publish AIPOLICY.yaml schema as governance standard | `-` | 75 | — |
| INFRA-004 | .ailedger enhancements: AIPOLICY.yaml commit, prune policy | `-` | 95 | — |
| INFRA-005 | Agent persona loading from codex/agents/registry.json | `-` | 50 | — |

### WF-CLI — CLI & Tools (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| CLI-001 | agence help deep improvements (multi-tool docs entry point) | `-` | 20 | — |
| CLI-002 | .gitignore final review (local symlinks, build artifacts) | `-` | 20 | — |

### WF-SWARM — Swarm Orchestration (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| SWARM-001 | Gate = write access (not --safe flag) — update aido tier routing | `-` | 105 | — |
| SWARM-002 | agentd interface contract: abstract container-spawn (Docker now, Nomad later) | `-` | 105 | — |

### WF-BUGS — Bug Fixes (1 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| BUG-001 | mnemonic prune + sessions prune (stale file cleanup) | `-` | 40 | — |

### WF-AGENTS — Agent Personas & Dispatch (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| AGENT-001 | @linus, @feynman, @aleph persona definitions | `-` | 115 | — |
| SKILL-001 | Skill infrastructure: agent dispatch + artifact routing to synthetic/objectcode | `-` | 170 | — |

### WF-SKILLS — Skill Commands (7 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| SKILL-002 | Code skills: ^fix, ^build, ^feature, ^refactor, ^solve | `-` | 105 | — |
| SKILL-003 | Review skills: ^review, ^precommit, ^simplify | `-` | 105 | — |
| SKILL-004 | Analysis skills: ^analyse, ^design, ^pattern, ^scope, ^spec, ^split | `-` | 105 | — |
| SKILL-005 | Peer skills: ^peer-design, ^peer-review, ^peer-solve, ^peer-analyse | `-` | 95 | — |
| SKILL-006 | Red team skills: ^hack, ^break (autonomous attack surface probing) | `-` | 85 | — |
| SKILL-007 | Knowledge skills: ^document, ^test, ^recon, ^grasp, ^glimpse | `-` | 75 | — |
| SKILL-008 | Move skills to synthetic root + add ^deploy, ^brainstorm | `-` | 105 | — |

### WF-SECURITY — v0.5 Security Fixes (@aleph findings) (6 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| SEC-001 | F-1 CRITICAL: Fix shell injection in guard.ts emitShellExports eval | `-` | 225 | — |
| SEC-002 | F-2 HIGH: Move Gemini API key from URL query param to x-goog-api-key header | `-` | 140 | — |
| SEC-003 | F-3 HIGH: Guard default unknown commands T1→T2 (fail-closed) | `-` | 120 | — |
| SEC-004 | F-4 MEDIUM: Signal forgery — add auth on IPC files in nexus/signals/ | `_` | 85 | — |
| SEC-005 | F-6 MEDIUM: tmux send-keys injection in signal.ts | `_` | 85 | — |
| SEC-006 | F-7 MEDIUM: Persona injection surface hardening (when @ routing wired) | `_` | 85 | WIRE-004 |

### WF-WIRING — v0.5 Feature Wiring (@peers.coders) (4 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| WIRE-001 | Wire @peers detection in skill.ts (~15 lines, @ routing) | `-` | 115 | — |
| WIRE-002 | Wire peers.ts → CLI: @peers ^analyze/^solve/^review integration | `-` | 115 | — |
| WIRE-003 | Add 'analyze' alias for 'analyse' spelling in skill dispatch | `-` | 40 | — |
| WIRE-004 | Wire persona injection: codex/agents/<name>/agent.md → system prompt | `_` | 60 | — |

### WF-V5TEST — v0.5 Security & Integration Tests (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| TEST-002 | Guard security boundary tests (~50 tests for guard.ts, F-5) | `+` | 160 | — |
| TEST-003 | peers.ts + dispatch.ts unit test bootstrap | `+` | 105 | — |

### WF-RELEASE — v0.5.0 Release Packaging (2 tasks)

| ID | Title | State | Score | Blocked |
|----|-------|-------|-------|---------|
| REL-001 | package.json version 0.5.0 + ROADMAP.md update | `-` | 40 | — |
| REL-002 | Integration testing + tag v0.5.0-stable | `-` | 105 | TEST-002 |

---

## Completion Formula

$$\text{completion}(W) = \frac{|\{t \in W : \text{state}(t) = \texttt{"-"}\}|}{|W|} \times 100\%$$

A workflow is **complete** when all its tasks reach state `-`.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
