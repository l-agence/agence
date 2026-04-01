# Agence Roadmap

**Author**: Stephane Korning  
**Status**: Living document — draft, not canonical  
**Last updated**: 2026-03-31

---

## Vision

Agence is a **distributed, multi-agent engineering framework** built on git-native sharding,
linear algebra task orchestration, and tiered intelligence scheduling.

The long-term goal: a **cloud-agnostic, self-optimizing swarm** where each agent is a fully
isolated, auditable compute unit — coordinated without central infrastructure, secured at the
OS boundary, and governed by immutable CODEX law.

---

## Version History & Current State

| Version | Branch / Tag | Status | Summary |
|---------|-------------|--------|---------|
| v0.1 | master | ✅ Stable | Core framework: CODEX, NEXUS, agents, bin/agence |
| v0.2.2 | rel_0.2.2_agence_swarm_sessions | ✅ Base | SWARM engine, router v0.4, session persistence, ishell, blast_radius |
| v0.3.0 | lost (AI incident 2026-03) | ❌ Lost | ShellSpec tests, ledger, security hardening — see incident note below |
| v0.2.3.1 | rel_0.2.2_agence_swarm_sessions | ✅ **Released 2026-03-31** | Architecture locked: symbol hierarchy, scope model, path validation, WSL-native shell |
| v0.2.4 | rel_0.2.2_agence_swarm_sessions | ✅ **Released 2026-03-31** | Command router (8 cmds), backport 15 functions, VSCode 2-tile swarm model, bin/ cleanup |
| v0.2.5 | next | 🚧 Planning | Docker foundations, matrix math algorithm, Git-native agent locking |
| v0.3.0 (new) | future | 📋 Planned | VSCode tile integration: 2-column layout, POSIX job control, Ctrl+K signal handler |
| v0.3.1 | future | 📋 Planned | Multi-agent orchestrator, DWM gating, task priority routing |
| v0.3.2+ | future | 📋 Planned | Skupper multi-cloud swarm |

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
