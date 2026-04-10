# Agence Roadmap

**Author**: Stephane Korning  
**Status**: Living document — draft, not canonical  
**Last updated**: 2026-04-08

---

## Vision

Agence is a **distributed, multi-agent engineering framework** built on git-native sharding,
linear algebra task orchestration, and tiered intelligence scheduling.

The long-term goal: a **cloud-agnostic, self-optimizing swarm** where each agent is a fully
isolated, auditable compute unit — coordinated without central infrastructure, secured at the
OS boundary, and governed by immutable CODEX law.

---

## Version History & Current State

---

### Session Log: 2026-04-02 — Shell Governance & Logging Plane Diagnosis

*Agent: GitHub Copilot (Claude Sonnet 4.6). Branch: rel_0.2.2_agence_swarm_sessions. Commit: 4aa6814.*

**Work completed this session:**

1. **`bin/aisession init` bug fixed** — aibash's startup chain was silently dying because
   `aisession` had no `init` subcommand. The call fell through to `session_status("init")`,
   looked for a non-existent `init.typescript`, exited 1, and `set -euo pipefail` killed
   aibash before `script(1)` was ever invoked. All `.aisessions/` directories were empty
   on every agent. Now fixed: `session_init()` + `init)` dispatch added.

2. **`GIT_PAGER=cat` added to `bin/agence`** — git commands were dropping into `less` and
   hanging agentic terminal reads. `GIT_PAGER=cat` set globally at the top of the script.

3. **`AIPOLICY.yaml` → VSCode whitelist** — `github.copilot.chat.agent.runCommand.allow`
   added to `.vscode/settings.json`, derived directly from `codex/AIPOLICY.yaml` whitelist
   sections (git_cli, github_cli, linux_shell). Single source of truth maintained.

4. **Shell integration workaround** — Added `Ubuntu (WSL, shell-integrated)` terminal profile
   using `--rcfile .agencerc` to work around VSCode's "shell integration cannot be enabled
   for wsl.exe" warning.

5. **Copilot logging plane established** — `nexus/.aisessions/copilot/` (via `@` symlink)
   now receives daily JSONL chat logs. Copilot runs in the VS Code extension process — it
   is architecturally outside the aibash/script(1) stack and always will be. The JSONL log
   is the appropriate proxy.

6. **I/O capture method comparison** — Full analysis of `script(1)`, `tee`, named pipes,
   tmux `pipe-pane`, VSCode shell integration, and Claude Code's tmux approach. Conclusion:
   `script(1)` for now (bug now fixed), tmux for v0.3.0.

7. **tmux + hypervisor architecture confirmed** — v0.3.0 tile model updated: tmux sessions
   replace Windows Terminal tiling. ibash/ishell = human hypervisor (privileged, overwatch).
   aibash/aishell = agent plane (fully observable, script(1)-captured). No PTY bypass by
   design — governance requires the human can see everything at any time.

**Architecture decisions confirmed this session:**
- `AIPOLICY.yaml` is canonical for all command-tier decisions (VSCode, aido, agence router)
- Copilot/VS Code chat agents are a separate observability plane from aibash
- tmux `pipe-pane` is the v0.3.0 supplement to `script(1)`, not a replacement
- `.ailedger` is still planned (append-only JSONL), not yet implemented

---

| Version | Branch / Tag | Status | Summary |
|---------|-------------|--------|---------|
| v0.1 | master | ✅ Stable | Core framework: CODEX, NEXUS, agents, bin/agence |
| v0.2.2 | rel_0.2.2_agence_swarm_sessions | ✅ Base | SWARM engine, router v0.4, session persistence, ishell, blast_radius |
| v0.3.0 | lost (AI incident 2026-03) | ❌ Lost | ShellSpec tests, ledger, security hardening — see incident note below |
| v0.2.3.1 | rel_0.2.2_agence_swarm_sessions | ✅ **Released 2026-03-31** | Architecture locked: symbol hierarchy, scope model, path validation, WSL-native shell |
| v0.2.4 | rel_0.2.2_agence_swarm_sessions | ✅ **Released 2026-03-31** | Command router (8 cmds), backport 15 functions, VSCode 2-tile swarm model, bin/ cleanup |
| v0.2.4 (patch) | rel_0.2.2_agence_swarm_sessions | ✅ **Released 2026-04-02** | aisession init fix, GIT_PAGER=cat, AIPOLICY→VSCode whitelist, shell-integrated profile, daily Copilot chat logs (commit 4aa6814) |
| v0.2.4.1 | rel_0.2.2_agence_swarm_sessions | ✅ **Released 2026-04-03** | 91/91 tests passing, copilot auto-detect via gh auth token, AGENCE_TRACE mode, aido/aisession non-interactive bypass, /gh* shortcuts, ^session-restore (commit e06257b, pushed) |
| v0.2.5 | main | ✅ **Released 2026-04-07** | Stabilization: model routing (!agent.model + AGENCE_MODEL), stale ref fixes, glossary + terminology normalization (ChunKing→chunk), .gitignore final review. Merge rel_0.2.2 → main. |
| v0.3.0 | main | ✅ **Released** | env.sh extraction, first Bun TS module (session.ts), Merkle-chained ailedger, tmux pipe-pane |
| v0.3.1 | main | ✅ **Released** | bin/airun wrapper, ^audit auto-resolve, ledger hex IDs + commit refs, pipe-pane completion |
| v0.3.2 | main | ✅ **Released** | ^recall + ~recall, ^index/^reindex split, cross-shard handoff, ^session prune, ^ledger init |
| v0.4.0 | main | ✅ **Released** | guard.ts (command gate), signal.ts (human↔agent IPC), matrix.ts (DAG + scoring), organic/ pillar, agentd skeleton, INFRA-001–005, SWARM-001–002, SHELL-001, CLI-001–003, TEST-001, BUG-001 |
| v0.5.0 | future | 📋 Planned | Docker per-tangent isolation, agentd daemon, socat inject, git worktree per tangent |
| v0.6.0 | future | 📋 Planned | Multi-agent orchestrator (swarmd), tangent tournament + resultant selection, chunk indexer (Bun TS) |
| v0.7.0 | future | 📋 Planned | Matrix math: complexity evaluator, priority DAG, agent routing table, cost tracking |
| v0.8.0 | future | 📋 Planned | Flock tier: Nomad driver, ≤5 node SSH+docker-compose bootstrap |
| v0.9.0+ | future | 📋 Planned | Style/preference model from .ailedger signal, trust ladder earned autonomy |

### v0.3.0 Deliverables (priority order)

1. **tmux 1+1 launcher** (`bin/swarm`) — single command: left=ibash (human hypervisor), right=aibash (focusable agent pane). No Docker yet.
2. **`lib/env.sh` extraction** — single canonical env bootstrap sourced by all bin/ scripts. Kills wrapper proliferation.
3. **First TS module: `lib/session.ts`** — extract session CRUD (~300 lines) from bin/agence into Bun TS. Proves the incremental split pattern.
4. **tmux `pipe-pane` capture** — replace script(1) with tmux-native PTY streaming. Agent pane fully observable from human pane.
5. **`.ailedger` stub** — append-only JSONL: `{timestamp, agent, command, outcome}`. Compounding advantage starts accumulating immediately.

---

### Session Log: 2026-04-03 — Architecture Lock, Test Suite 91/91, @peers Board

*Agent: GitHub Copilot (Claude Sonnet 4.6). Branch: rel_0.2.2_agence_swarm_sessions. Commit: e06257b (pushed).*

**Work completed this session:**

1. **Test suite 91/91** — 0 failures, 8 warnings, 8 skips. Fixed: aido `local`-outside-function, copilot auto-detect via `gh auth token`, AGENCE_TRACE=1 mode (routing decision without LLM call), `aisession` non-interactive bypass (`Your choice:` blocking bug), test 17 `/git log` stable assertion. AIDO_NO_VERIFY=1 global export.

2. **Canonical architecture locked in SWARM.md** — sequent model, tangent/agentd/swarmd distinction, Docker-per-tangent rule, socat+Unix socket inject, matrix-native merge as CRDT, filesystem scope rule, mnemonic 2-tier, Bun runtime decision, Skupper shelved.

3. **Design docs loaded and validated** — 15 hermetic design notes from external LLM sessions reviewed. Key corrections: external LLM reinvented aido (use existing), `/tmp/agency` rejected (use `$AI_ROOT/`), FIFO rejected (socat), Dev Container per tangent applies to flock not local sequents.

4. **@peers architecture review board** — 9 questions, heavy flavor, 3-peer weighted consensus. Key findings:
   - Docker gate = write access (not `--safe` flag)
   - **Git worktree per tangent** (not full clone — major spin-up improvement)
   - Socket path = `$AI_ROOT/nexus/agentd/sockets/<tangent-id>-<pid>.sock`
   - Nomad over Docker Swarm for flock tier
   - **Ship `.ailedger` stub immediately** — only compounding advantage that can't be copied
   - Primary competitive threat: Anthropic building Claude Code multi-agent (9–18mo timeline)
   - Three-moat model: unified governance (AIPOLICY.yaml) + git-native state + trust gradient

5. **Architecture decisions clarified:**
   - tmux = observation/control layer only (not isolation)
   - tangents = tournament model (select resultant, discard losers) — NOT code merge
   - complementary tangent synthesis = human call, indefinitely
   - trust gradient model formally articulated: autonomy earned per rung of trust ladder
   - hermetic/grimoire (renamed from mnemonic) — gated, explicit recall, never pruned
   - swarm/flock/fleet tier naming confirmed

**Architecture decisions confirmed this session:**
- Docker required for all write-tangents, even local swarms — post-2026-03 symlink incident rule
- tmux is observation layer; Docker containers provide isolation
- Git worktree per tangent (shared `.git` object store, worktree dir = writable volume)
- agentd manages worktree lifecycle on HOST; tangents cannot run `git worktree` commands
- socat + Unix domain sockets + tmux send-keys for inject (FIFOs rejected permanently)
- `.ailedger` = highest priority new feature (compounding data moat)
- AIPOLICY.yaml schema publication = first-mover governance standard opportunity

---

## Phase 1 — Stabilize & Rebuild (v0.3.x)

**Goal**: Recover lost v0.3.0 work. Stable, tested, locally running Agence.

**Starting point**: `rel_0.2.2_agence_swarm_sessions`

### What was lost (to reconstruct)
- ShellSpec test coverage for `bin/agence` (all major functions + modes)
- PowerShell integration (`ishell`, `aishell.ps1`) — partially in branch
- Immutable `.ailedger` (append-only session audit trail)
- Fully wired `router.sh` operational modes into `bin/agence`
- Tiered privilege escalation (T0 whitelist → T3 blacklist) with human confirmation gates
- `swarm` ↔ `bin/agence`/`aicmd` integration
- `aisession` handoff and resume flows
- `jq` metadata escaping fixes

### Security lessons from the incident
The v0.3 security model was **advisory** (agent-layer enforcement). The incident exposed:
- Agents had same filesystem privileges as host user
- Guardrails were bash functions in the same process — bypassable
- Path junction `mklink /j /c <path>` at shell mount point created C:\ traversal risk
- Double-`//` MSYS2 prefix broke `dirname` path arithmetic in cleanup operations
- Two concurrent agents with overlapping write domains = unlimited blast radius

**Principle for v0.3+**: Guardrails must be **structural** (OS boundary) not advisory (policy).  
Interim mitigation until Phase 2 containers arrive:
- All agent write operations routed through a **write-gate process** (separate binary, not sourced function)
- Write gate validates path is inside `GIT_ROOT` before executing
- Append-only ledger written by gate before any destructive op
- No junctions at shell mount points — scoped junctions only (`$GIT_ROOT/.mnt/c`)
- Path normalization to absolute Windows paths internally; MSYS2 translation only at display boundary

### Deliverables
- [x] ~~POSIX path normalization~~ — **done 2026-03-31**: `realpath()` before validation, no junction creation in security layer (`codex/LAWS.md § Law 8`)
- [x] ~~`aisession` resume + handoff working~~ — **done 2026-03-31**: `^handoff`, `^pickup`, `^pause`, `^resume` all backported and wired
- [x] ~~All T0–T3 tiers wired into `router.sh` + `agence`~~ — **done 2026-03-31**: commands.json T0/T1/T2/T3 tiers, 11 git commands, all modes dispatched
- [ ] Reconstruct ShellSpec test suite — deferred (low risk given WSL-native baseline)
- [ ] Implement write-gate process (`bin/aigate`) — deferred to v0.2.5 (Docker phase)
- [ ] Immutable `.ailedger` (append-only, JSONL) — deferred to v0.3.1 (orchestrator phase)
- [ ] `swarm` fully integrated with `bin/agence` — deferred to v0.3.0 (tile model phase)

---

---

## Design Decisions Locked In — 2026-03-31

*Session: Haiku (planning) + Sonnet/Copilot (implementation). Branch: rel_0.2.2_agence_swarm_sessions.*

### 1. Symbol Hierarchy (Extensible, Not Flat)
All agent state is **signed linear algebra** — no state database, matrices are the state.

| Tier | Symbols | Active? | Meaning |
|------|---------|---------|--------|
| Agent-level | `+, &, %, -, _, #` | ✅ v0.2.3.1+ | Task lifecycle (pending → assigned → progress → done) |
| Swarm-level | `~, $` | 🔒 reserved v0.3.2+ | Skupper swarm queuing + coordination |
| Priority | `*, **, ***` | ✅ v0.2.3.1+ | Independent of state, orthogonal |
| Routing | `@agent, @org` | ✅ | Suffix-based, composes cleanly |

**Key math**: `%completion = |negatives| / total`. Net work = signed sum. No state store.

### 2. Scope Model (Privacy + Authority)
```
HERMETIC (local, personal)  → notes, todos (NEVER committed)
NEXUS    (local-only)       → faults, logs, sessions (sensitive, not shared raw)
SYNTHETIC (team-shared)    → plans, lessons, issues, docs (committed to git)
ORGANIC  (team-routable)   → tasks, jobs, workflows (matrix assignments)
```
See: `codex/TAXONOMY.md`

### 3. Path Validation (Security Layer Constraint)
- **Routing layer** (junctions/symlinks): Routing context only (`@`, `@org` switches) — KEEP
- **Security layer**: Uses `realpath()` only — NEVER creates junctions or heals paths
- **Future agents**: Run in Docker containers (pure POSIX paths `/workspace/...`), no path translation needed

### 4. Shell Environment (Standardized)
- **Mandatory default**: WSL-Ubuntu bash (`codex/SETUP.md`)
- **Optional**: `pwsh` inside WSL for Windows-familiar devs
- **NOT recommended**: Git Bash on Windows host (emulation hacks, path gotchas)
- **Rationale**: Local dev = container environment (same bash, same paths)

### 5. 2-Column Swarm Tile Model (VSCode)
```
Row per agent:
  LEFT  tile: docker exec -it (Human Plane)  ← human authority, overrides agent
  RIGHT tile: aibash/aishell (Agent Plane)   ← session-captured, traceable

Coordination: POSIX job control
  Ctrl+K → SIGKILL aibash (agent stop)
  Ctrl+Z → SIGSTOP (suspend + fg/bg for recovery)
  %jobs  → inspect running tasks
```

### 6. Git-Native Agent State (No Database)
- Matrix state (`organic/matrix-state.json`) = source of truth on main branch
- Agent branches commit task updates atomically
- Custom merge strategy: priority + security_label resolves conflicts
- Human-gated DWM: agents propose lessons → human reviews → merge only if approved

### 7. Intelligent Cost Routing (to rebuild)
Lost with v0.3.0. Design preserved:
```
Complexity = f(LOC, modules_affected) → trivial/small/medium/large
Priority   = 1 + count(tasks_blocked_by_me) + human_overrides
Model      = routing_table[priority][complexity]  → free/haiku/sonnet/opus
```
See: `synthetic/l-agence.org/plans/v0.2.5-docker-matrix.md` for rebuild spec.

---

## Phase 2 — Dev-Container Agent Isolation (v0.4 → renamed v0.2.5)

**Goal**: Each agent lives in its own Docker container / GitHub Codespace. OS-level isolation
replaces advisory guardrails. A minimal TypeScript/Node runtime is the only exposed interface.

### Architecture

```
Host (GIT_ROOT)
    │
    ├─ bin/agence         ← orchestrator, never runs inside container
    ├─ bin/swarm          ← dispatches tasks to containers
    │
    └─ .devcontainers/
        ├─ @ralph/        ← devcontainer.json + Dockerfile
        ├─ @aiko/
        ├─ @claudia/
        ├─ @chad/
        └─ @pilot/        ← copilot agent container
```

Each container:
- Runs pure **aibash/aishell** (same scripts as local, no path translation)
- Mounts workspace as `/workspace` volume (pure POSIX, path validation trivial)
- `/run/secrets/` for credential injection (never exported outside container)
- Session logs in `/workspace/nexus/sessions/` (mapped to host nexus via volume)
- TypeScript/Node API layer optional (for orchestrator integration in v0.3.1)
- All `write_request` calls validated by the **gate** before filesystem commit

### Write Gate becomes a Container Boundary

```
Agent (container) ──→ HTTP API (write_request) ──→ Gate process (host) ──→ filesystem
                                                         ↑
                                               Validates path scope
                                               Checks CODEX LAWS
                                               Appends to ledger
                                               Requires T2+ human confirmation
```

The agent **cannot** directly call `rm`, `mv`, or any filesystem op. It submits a request.
The gate process (running on host, different UID if possible) is the only thing that writes.

### GitHub Workspaces Integration
- Each agent container = a GitHub Codespace with its own identity
- Swarm coordinator dispatches via GitHub Codespace API or local Docker Compose
- Session persistence per container, ledger exported to shared nexus on handoff

### Deliverables
- [ ] Dockerfile: WSL-Ubuntu LTS + bash + aibash/aishell (no path translation)
- [ ] `/run/secrets/` injection pattern for agent credentials
- [ ] Session metadata schema: left tile (human) + right tile (agent) streams
- [ ] `devcontainer.json` template per agent tier (T0–T4)
- [ ] `bin/aigate` — host-side write gate process (validates scope, appends ledger)
- [ ] Docker Compose for local 2-tile multi-agent launch
- [ ] Agent identity flows through `AI_AGENT` env var to session metadata (`AIDO_AGENT` deprecated)

---

## Phase 3 — VSCode Tile Integration + Job Control (v0.3.0)

**Goal**: Humans see every agent's work in real-time. Full POSIX job control surfaces in VSCode.

### Architecture
```
VSCode Terminal Grid (N rows × 2 columns):
  ┌─────────────────────┬─────────────────────┐
  │ ⬛ @ralph: Human    │ 🤖 @ralph: aibash   │
  │   (docker exec -it) │   (agent plane)     │
  ├─────────────────────┼─────────────────────┤
  │ ⬛ @sonya: Human    │ 🤖 @sonya: aibash   │
  ├─────────────────────┼─────────────────────┤
  │ ⬛ @aider: Human    │ 🤖 @aider: aibash   │
  └─────────────────────┴─────────────────────┘
```

**Updated 2026-04-02**: Tile implementation will use **tmux** rather than Windows Terminal
tiling. This gives us:
- True POSIX session management (tmux sessions survive VSCode restarts)
- `pipe-pane` for real-time PTY streaming alongside `script(1)` capture
- Portable to Docker containers (tmux runs identically inside containers)
- `tmux send-keys` as the signal delivery mechanism (Ctrl+K SIGKILL)

**Hypervisor model**: The LEFT tile (ibash/ishell) is not just a "human console" — it is an
**agentic hypervisor**. At any moment the human can observe any agent's work or reasoning
in any aibash/aishell pane. Governance requires full observability: no PTY bypass, no direct
pipe shortcuts. `script(1)` inside tmux panes provides the governance record.

```
tmux session: agence-swarm
  ├─ window 0: @copilot
  │   ├─ pane 0 (left):  ibash    ← human overwatch (PRIVILEGED)
  │   └─ pane 1 (right): aibash   ← agent plane (OBSERVABLE, script(1) captured)
  ├─ window 1: @ralph
  │   ├─ pane 0 (left):  ibash
  │   └─ pane 1 (right): aibash
  └─ window N: @sonya ...
```

### Key Controls
- `Ctrl+K` → SIGKILL agent (human issues in LEFT tile, applies to RIGHT)
- `Ctrl+Z` → SIGSTOP (suspend), `fg` to resume
- `%jobs` → enumerate all agent tasks
- Signal handlers live in `ibash/ishell` (privileged) — CANNOT be overridden by aibash

### Deliverables
- [ ] VSCode extension task: `🚀 Swarm: Launch All Agents` (N rows × 2 tiles, parallel)
- [ ] Signal handler hierarchy: ibash → aisession → aibash (privileged chain)
- [ ] `Ctrl+K` SIGKILL binding wired to aibash subprocess
- [ ] Session capture: both left (human audit) + right (agent metadata) streams logged
- [ ] `swarm` CLI: `swarm launch`, `swarm status`, `swarm kill @agent`

---

## Phase 4 — Local Swarm Launch + Orchestrator (v0.3.1, formerly v0.5)

**Goal**: Launch a full local swarm — N agents in N containers, coordinated by `bin/swarm`,
matrix state synced via git sharding.

### Architecture

```
bin/swarm (orchestrator)
    │
    ├─ Reads: organic/tasks.json, workflows.json, projects.json
    ├─ Computes: heat matrix, critical path, bottleneck vector
    ├─ Assigns: tasks → agents (by tier, blast_radius, availability)
    │
    ├─ @ralph  (container:4001)  ← T1 plan tasks
    ├─ @aiko   (container:4002)  ← T2 code tasks
    ├─ @chad   (container:4003)  ← T3 code/devops tasks
    ├─ @claudia(container:4004)  ← T4 architecture tasks
    └─ @olena  (container:4005)  ← T5 secure/airgapped tasks
```

### Intelligence Scheduling

Three-axis scheduling (the core innovation):
- **Task scheduling** — which work happens (DAG + dependencies)
- **Agent scheduling** — who performs it (persona + expertise match)
- **Model scheduling** — which intelligence tier is used (cheapest capable model for blast_radius)

Swarm heatmap runs continuously:
```
heat(task) = B + A - D
  B = tasks blocked by this task
  A = agents assigned
  D = number of dependencies
```
Critical path recomputes automatically as tasks complete. Swarm shifts effort to next bottleneck.

### Deliverables
- [ ] `docker-compose.swarm.yml` — full local swarm definition
- [ ] `bin/swarm launch` — starts all agent containers
- [ ] `bin/swarm status` — heatmap + critical path display
- [ ] Matrix state sync via git (organic/ committed, nexus/ local)
- [ ] Cross-container session handoff
- [ ] Human override at any tier (interrupt, escalate, reassign)

---

## Phase 5 — Skupper Multi-Cloud Swarm (v0.3.2+, formerly v0.6)

**Goal**: Swarm spans multiple clouds (AWS, Azure, GCP) without vendor lock-in.
Skupper provides cloud-agnostic service mesh without VPN or centralized broker.

### Architecture

```
Cloud A (AWS)              Cloud B (Azure)           Cloud C (GCP)
├─ agent-cluster-a         ├─ agent-cluster-b         ├─ agent-cluster-c
│  ├─ @claudia             │  ├─ @aiko                │  ├─ @chad
│  └─ @ralph               │  └─ @olena               │  └─ @aider
│                          │                          │
└─ Skupper router ─────────┴─ Skupper router ─────────┴─ Skupper router
                                    │
                             Shared service mesh
                             (no public IPs needed)
```

### Security Considerations (known challenges)
- **Agent identity**: mTLS cert per container — must be designed in Phase 2 or painful retrofit
- **Secret management**: No shared secret store across clouds — Skupper + per-cloud KMS
- **Blast radius now cross-cloud**: A rogue agent in Cloud A could trigger work in Cloud B
  → Swarm dispatcher must enforce cross-cloud CODEX validation
- **Network segmentation**: Each cloud cluster is isolated; Skupper links are service-level only
- **Audit trail**: Ledger entries must be signed and replicated across sites before destructive ops

### Deliverables
- [ ] Skupper installation + link setup (AWS ↔ Azure ↔ GCP)
- [ ] Per-agent mTLS identity (cert provisioning in devcontainer build)
- [ ] Cross-cloud swarm dispatch in `bin/swarm`
- [ ] Distributed ledger (append-only, multi-site replication)
- [ ] Security label routing (`SEC-LABELS.md`) enforced at network layer
- [ ] Cross-cloud blast_radius enforcement

---

## Design Principles (Non-Negotiable)

These apply across all phases:

1. **Git is the coordination layer.** No central database. No external broker required.
2. **bash + jq + awk at core.** Works anywhere. Python/TypeScript are additive layers.
3. **CODEX gates everything.** No operation bypasses governance.
4. **Structural security over advisory.** OS boundaries, not bash functions.
5. **Append-only ledger before every destructive op.** The incident must not repeat.
6. **Cheapest capable model wins.** Tier routing is cost discipline, not just preference.
7. **Human can always interrupt.** T2+ ops require confirmation. T3 ops require explicit unlock.
8. **Agents never touch junctions at shell mount points.** Scoped paths only.

---

## Open Design Questions

### Resolved 2026-03-31
- [x] ~~Path normalization strategy~~ → WSL-Ubuntu + Docker mounts (no translation needed)
- [x] ~~Junctions in security layer~~ → routing only, NEVER in security validation
- [x] ~~Symbol hierarchy~~ → Agent-level active (`+,&,%,-,_,#`), Swarm reserved (`~,$`)
- [x] ~~Scope model~~ → HERMETIC/NEXUS/SYNTHETIC/ORGANIC (see TAXONOMY.md)
- [x] ~~Human in-progress prefix~~ → `%task@user` (unified with agent, no separate `$`)
- [x] ~~Cost routing~~ → auto-routed by orchestrator (priority × complexity matrix)

### Still Open
- [ ] Agent API contract v1.0 — define now before Phase 2 locks it in
- [ ] `/` slash command namespace — Option D (passthrough) + `/g<cmd>` migration path
- [ ] Ledger format — JSONL append-only, signed entries, SHA256 chain?
- [ ] devcontainer tier sizing — T0 Alpine, T1 node-slim, T2+ full Ubuntu?
- [ ] Cross-agent communication protocol — git-ba sed (current) vs. message queue vs. HTTP
- [ ] Hermetic (`~`) context in containers — how does local-only hermetic work inside Docker?
- [ ] `swarm` prefix (`~task`, `$task`) — activation criteria for v0.3.2+ (when not before?)
- [ ] SWARM.md revision — heatmap model conflicts with new tile model; needs reflection
- [ ] ailedger design — distributed append-only audit trail (pre-Skupper design needed)

---

*This document will be updated as phases complete and design notes are reviewed.*  
*Paste v3 roadmap and v4 ChatGPT design notes to refine further.*
