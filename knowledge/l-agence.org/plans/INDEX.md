# Agence Development Roadmap (2026)

**Updated**: 2026-05-06
**Status**: v1.0.1 (current release) + unreleased MLS work on main
**Current**: main @ a8e6e40 (post-v1.0.1: MLS capability engine, ^bundle, transcript eviction)

---

## 🎯 Vision: Multi-Agent Swarm Orchestration

Path: **Single-Agent Stabilization** → **Routing + Ledger + Audit** → **Guard + Compute** → **Skills + Peers + Memory** → **Modular Architecture** → **Production** → **Distributed**

```
v0.2.5 (2026-03)       ← Stabilization, model routing, 91/91 tests
    ↓
v0.3.x (2026-03/04)    ← tmux, env, session.ts, .ailedger, pipe-pane, router, audit
    ↓
v0.4.x (2026-04)       ← guard.ts, signal.ts, TCB gates, Docker, PS1, task IDs
    ↓
v0.5.0 (2026-04)       ← skill routing, peers, rich CLI, ^ symlink, 29 skills
    ↓
v0.6.0-alpha (2026-04) ← First public release — governance framework, 291 tests
    ↓
v0.7.0-alpha (2026-04) ← Modular bin/agence split, MCP server, ^ken, ^recon
    ↓
v0.8.0-alpha (2026-04) ← Security hardening release (SEC-010/012/013)
    ↓
v1.0.0 (2026-05-01)    ← PRODUCTION: tournament tangents, signal IPC, ^vault, ^watch,
                          ^setup wizard, ^redoc, cost tracking, scope locks, 751 tests
    ↓
v1.0.1 (2026-05-04)    ← Security patch + MCP npm publish + /gh* MCP commands
    ↓
v1.1.0 (NEXT)          ← MLS capability engine, ^bundle CI/CD, transcript eviction
    ↓
v1.2.0 (PLANNED)       ← Skupper multi-cloud federation, horde primitives
    ↓
v2.0.0 (HORIZON)       ← Allegiance ledger, multi-org trust federation
```

---

## 📋 Phase Breakdown

| Phase | Version | Focus | Status |
|-------|---------|-------|--------|
| **1** | v0.2.3–v0.2.5 | Architecture, shell fixes, stabilization | 🟢 DONE |
| **2** | v0.3.0–v0.3.2 | tmux, env, session, ledger, router, audit, CI | 🟢 DONE |
| **3** | v0.4.0–v0.4.5 | guard.ts, signal.ts, Docker, PS1, task IDs, ^regen | 🟢 DONE |
| **4** | v0.5.0 | skill routing, skills (29), peers, rich CLI, ^ symlink | 🟢 DONE |
| **5** | v0.6.0-alpha | First public release — governance framework, 291 tests | 🟢 DONE |
| **6** | v0.7.0-alpha | Modular architecture — bin/agence split, MCP, ^ken, ^recon | 🟢 DONE |
| **7** | v0.8.0-alpha | Security hardening (SEC-010/012/013, 40 regression tests) | 🟢 DONE |
| **8** | v1.0.0 | Production: sequent tangents, MCP client, signal IPC, ^vault, ^watch, ^setup, ^redoc, cost, scope locks | 🟢 DONE |
| **8.1** | v1.0.1 | Security patch (recon.ts injection), MCP npm, /gh* commands | 🟢 DONE |
| **9** | v1.1.0 | MLS capability engine (14 caps, 5 levels), ^bundle CI/CD, transcript eviction | 🔧 IN PROGRESS |
| **10** | v1.2.0 | Skupper multi-cloud, horde lock primitives | 📍 PLANNED |
| **11** | v2.0.0 | Allegiance ledger, multi-org trust federation | 📍 HORIZON |

---

## 🔐 Architectural Decisions (Locked)

### **Core Constraints**
- **Paths**: realpath() validation only; NO auto-healing junctions
- **Routing**: @ suffix-based (task@agent, task@user)
- **Symbols**: Hierarchical (agent-level active, swarm reserved)
- **Container**: WSL-Ubuntu + Docker (pure POSIX paths)
- **State**: Matrix math (no database, just Git + computed sums)

### **Scope Model**
- **HERMETIC** (local): ^notes, ^todo, ^vault (never shared)
- **NEXUS** (local, ailedger): faults, logs, sessions, signals
- **SYNTHETIC** (team-shared): plans, lessons, issues, docs
- **ORGANIC** (team work): tasks, jobs, workflows

### **Task State (Agent-Level)**
```
+task           pending
&task@agent     assigned
%task@agent     in-progress
-task           completed
_task           paused
#task           held by human
```

### **Task State (Swarm-Level, Reserved)**
```
~task           swarm accepted
$task           swarm coordinating
```

---

## 🔮 Version Horizon

| Version | Feature | Status | Notes |
|---------|---------|--------|-------|
| v0.4.0–v0.4.5 | guard.ts, signal.ts, Docker, PS1, task IDs, ^regen | 🟢 DONE | guard✅ signal✅ docker✅ overlay✅ PS1✅ hex8-IDs✅ ^regen✅ |
| v0.5.0 | skill routing, skills (29), peers (3-tangent) | 🟢 DONE | WIRE-001..005✅ SKILL-001..008✅ SEC-001..006✅ |
| v0.6.0-alpha | First public release — governance framework | 🟢 DONE | 291 tests, GitHub public, MIT+CC |
| v0.7.0-alpha | Modular architecture — bin/agence split, MCP server | 🟢 DONE | 9 lib/*.sh, MCP 10 tools+3 resources, consensus 3-algo |
| v0.8.0-alpha | Security hardening release | 🟢 DONE | SEC-010/012/013, 40 regression tests, 805 tests |
| v1.0.0 | Production release (May 1, 2026) | 🟢 DONE | sequent tangents, MCP client, signal IPC (HMAC), ^vault, ^watch, ^setup, ^redoc, ^queue, cost tracking, scope locks, GC eviction, 751 tests |
| v1.0.1 | Security patch (May 4, 2026) | 🟢 DONE | recon.ts injection fix, MCP npm publish, /gh* commands |
| v1.1.0 | MLS capability engine + ^bundle CI/CD | 🔧 WIP | 14 caps, 5 levels, Bell-LaPadula+Biba, transcript eviction, on main (untagged) |
| v1.2.0 | Skupper multi-cloud federation | 📍 PLANNED | cross-cluster routing, horde primitives |
| v2.0.0 | Multi-org trust | 📍 HORIZON | Allegiance ledger, org federation |
| v0.9.0 | Skupper multi-cloud federation | 🅿️ PARKED | Build local swarm first |
| v1.0.0 | Production — Allegiance ledger, multi-org, CLI polish | 🅿️ PARKED | Aggregate reputation from per-shard .ailedger |

### Naming Changes (v0.4.0+)
- **grimoire → hermetic/masonic** — no more grimoire; gated memory lives under hermetic
- **allegiance/aillegiance** — separate from .ailedger; public append-only aggregate (parked v1.0)
- **6-layer memory** — mnemonic (runtime) is layer 6 atop 5 persistent COGNOS scopes
- **synthesis → synthetic** — canonical scope name is `synthetic/` (team-shared knowledge)

---

## 📁 Plan Files

- **[v0.2.3-stabilization.md](v0.2.3-stabilization.md)** — Architecture & safety hardening
- **[v0.2.4-docker-matrix.md](v0.2.4-docker-matrix.md)** — Container isolation + priority routing
- **[v0.3.0-tiles.md](v0.3.0-tiles.md)** — Real-time observability + control  
- **[v0.3.1-orchestrator.md](v0.3.1-orchestrator.md)** — Multi-agent scheduling
- **[v0.3.2-skupper.md](v0.3.2-skupper.md)** — Multi-cloud distribution (parked → v0.9.0)
- **[phases.json](phases.json)** — Structured phase data

---

## 📊 Success Metrics

- ✅ v0.2.3.1: Zero TOCTOU vulnerabilities + symbol consistency
- ✅ v0.2.4: Shell session governance, 91/91 tests
- ✅ v0.3.0: tmux 1+1, .ailedger, pipe-pane capture
- ✅ v0.3.1: Bun TS extraction, airun, router.ts
- ✅ v0.3.2: Model routing, version strings, glossary
- ✅ v0.4.0: TCB gates enforced, Docker containers running, PS1 finalized, ^regen dashboards
- ✅ v0.5.0: 29 skills, @peers 3-tangent routing, 6 security fixes, mixed agent routing
- ✅ v0.6.0-alpha: First public release — 291 tests, cognitive memory model (6-tier COGNOS)
- ✅ v0.7.0-alpha: Modular bin/agence (4617→384 lines), MCP server, ^ken orchestrator, ^recon crawler, ledger auto-derive, consensus consolidation (winner/judge/merge), dispatch.ts removed, ^recon direct primitive
- ✅ v0.8.0-alpha: MLS capability engine (14 tokens, 5 levels, fail-closed), ^bundle CI/CD pipeline, transcript eviction, 7 security fixes from ^break/^hack cycle, 805 tests
- 📍 v0.9.0: Skupper multi-cloud federation (parked)

---

**Last Updated**: 2026-05-06  
**Owner**: l-agence team  
**Next Review**: After v0.9.0 planning
