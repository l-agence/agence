# Agence Roadmap

**Author**: Stephane Korning  
**Status**: Living document — draft, not canonical  
**Last updated**: 2026-03-28

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
| v0.2.2 | rel_0.2.2_agence_swarm_sessions | ✅ Current base | SWARM engine, router v0.4, session persistence, ishell, blast_radius |
| v0.3.0 | lost (AI incident 2026-03) | ❌ Lost | ShellSpec tests, power shell integration, ledger, security hardening |
| v0.4 | next | 🚧 Planning | Dev-containers + GitHub Workspaces per agent |
| v0.5 | future | 📋 Planned | Local swarm launch |
| v0.6 | future | 📋 Planned | Skupper multi-cloud |

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
- [ ] Reconstruct ShellSpec test suite
- [ ] Implement write-gate process (`bin/aigate`)
- [ ] Immutable `.ailedger` (append-only, JSONL)
- [ ] POSIX path normalization — safe, tested, no junction-at-root
- [ ] `swarm` fully integrated with `bin/agence`
- [ ] `aisession` resume + handoff working
- [ ] All T0–T3 tiers wired into `router.sh` + `agence`

---

## Phase 2 — Dev-Container Agent Isolation (v0.4)

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
- Runs a **locked-down TypeScript/Node API server** (no shell escape)
- Mounts only its scoped workspace volume (read-only for shared codex, read-write for own nexus)
- Exposes a minimal JSON API: `{ execute, read, write_request, status }`
- All `write_request` calls validated by the **gate** before filesystem commit
- Session logs written inside container, exported as metadata via API

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
- [ ] `devcontainer.json` template per agent tier (T0–T4)
- [ ] TypeScript/Node API server (`agent-runtime/`) — minimal, locked down
- [ ] `bin/aigate` — host-side write gate process
- [ ] Docker Compose for local multi-agent launch
- [ ] GitHub Codespace launch workflow
- [ ] Agent identity (container name / env) flows through to session metadata

---

## Phase 3 — Local Swarm Launch (v0.5)

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

## Phase 4 — Skupper Multi-Cloud Swarm (v0.6)

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

- [ ] Agent API contract v1.0 — define now before Phase 2 locks it in
- [ ] `/` slash command namespace — Option D (passthrough) + `/g<cmd>` migration path
- [ ] Ledger format — JSONL append-only, signed entries, SHA256 chain?
- [ ] devcontainer tier sizing — T0 Alpine, T1 node-slim, T2+ full Ubuntu?
- [ ] Cross-agent communication protocol — HTTP REST vs. message queue vs. git-based
- [ ] Hermetic (`~`) context in containers — how does air-gap work with Phase 4?

---

*This document will be updated as phases complete and design notes are reviewed.*  
*Paste v3 roadmap and v4 ChatGPT design notes to refine further.*
