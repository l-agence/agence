# Agence Development Roadmap (2026 Q1–Q2)

**Updated**: 2026-04-19
**Status**: v0.5.0-dev (rich display, dispatch, ^ CLI, legend footer)
**Current**: main @ 5a60e4f (v0.5.0-dev)

---

## 🎯 Vision: Multi-Agent Swarm Orchestration

Path: **Single-Agent Stabilization** → **Routing + Ledger + Audit** → **Guard + Compute** → **Memory + Chunking** → **Distributed**

```
v0.2.5 (RELEASED)     ← Stabilization, model routing, 91/91 tests
    ↓
v0.3.0 (RELEASED)     ← tmux, env, session.ts, .ailedger, pipe-pane
    ↓
v0.3.1 (RELEASED)     ← router.ts, audit.ts, airun, CI, ledger IDs
    ↓
v0.3.2 (RELEASED)     ← version strings, model routing, glossary
    ↓
v0.4.0 (CURRENT)      ← guard.ts, signal.ts, TCB gates, Docker/Nomad
    ↓
v0.5.0 (IN PROGRESS)  ← dispatch, skills, peers, rich CLI, ^ symlink
    ↓
v0.5.0                 ← matrix.ts, Docker tangent tournaments, agentd
    ↓
v0.6.0                 ← MLS enforcement + MLS-POLICY.yml
    ↓
v0.7.0                 ← Skupper multi-cloud federation
    ↓
v0.9.0                 ← Allegiance ledger (public append-only reputation)
```

---

## 📋 Phase Breakdown

| Phase | Version | Focus | Status |
|-------|---------|-------|--------|
| **1** | v0.2.3.1 | Architecture & docs | 🟢 DONE |
| **1.5** | v0.2.4 | Shell session fixes, test suite | 🟢 DONE |
| **2** | v0.2.5 | Stabilization & release | 🟢 DONE |
| **2.1** | v0.3.0 | tmux 1+1, env.sh, session.ts, .ailedger, pipe-pane | 🟢 DONE |
| **2.2** | v0.3.1 | Bun extraction (router.ts, audit.ts), CI, airun | 🟢 DONE |
| **2.3** | v0.3.2 | Version strings, model routing, glossary | 🟢 DONE |
| **3** | v0.4.0–v0.4.5 | guard.ts, signal.ts, Docker, PS1, task IDs, ^regen | 🟢 DONE |
| **3.5** | v0.5.0-dev | routing layer, rich display, ^ CLI, skills infra, legend | 🟡 IN PROGRESS |
| **3.1** | v0.4.1 | F.AST chunking, 6-layer memory skeleton (COGNOS) | 📍 NEXT |
| **4** | v0.5.0 | matrix.ts, Docker tangent tournaments, agentd | 📍 PLANNED |
| **5** | v0.6.0 | MLS enforcement + MLS-POLICY.yml + capability tokens | 📍 FUTURE |
| **6** | v0.7.0 | Skupper multi-cloud federation | 📍 FUTURE |
| **7** | v0.9.0 | Allegiance/Aillegiance (public reputation ledger) | 📍 FUTURE |

---

## 🔐 Architectural Decisions (Locked)

### **Core Constraints**
- **Paths**: realpath() validation only; NO auto-healing junctions
- **Routing**: @ suffix-based (task@agent, task@user)
- **Symbols**: Hierarchical (agent-level active, swarm reserved)
- **Container**: WSL-Ubuntu + Docker (pure POSIX paths)
- **State**: Matrix math (no database, just Git + computed sums)

### **Scope Model**
- **HERMETIC** (local): ^notes, ^todo (never shared)
- **NEXUS** (local, future ailedger): faults, logs, sessions
- **SYNTHETIC** (team-shared): plans, lessons, issues, docs
- **ORGANIC** (team work): tasks, jobs, workflows

### **Task State (Agent-Level, v0.2.3–v0.3.1)**
```
+task           pending
&task@agent     assigned
%task@agent     in-progress
-task           completed
_task           paused
#task           held by human
```

### **Task State (Swarm-Level, v0.3.2+, Reserved)**
```
~task           swarm accepted
$task           swarm coordinating
```

---

## � Version Horizon & Parking

| Version | Feature | Status | Notes |
|---------|---------|--------|-------|
| v0.4.0–v0.4.5 | guard.ts, signal.ts, Docker, PS1, task IDs, ^regen | 🟢 DONE | guard✅ signal✅ docker✅ overlay✅ aicmd✅ agentd-spawn✅ PS1✅ hex8-IDs✅ ^regen✅ |
| v0.4.1 | F.AST chunking, 6-layer memory skeleton | 📍 NEXT | COGNOS: objectcode/organic/synthetic/globalcache/hermetic + mnemonic (runtime) |
| v0.5.0 | matrix.ts, Docker tangent tournaments, agentd | 📍 PLANNED | |
| v0.6.0 | MLS enforcement + MLS-POLICY.yml + capabilities | 🅿️ PARKED | Not critical until multi-tenant |
| v0.7.0 | Skupper multi-cloud federation | 🅿️ PARKED | Build local swarm first |
| v0.9.0 | Allegiance/Aillegiance (public reputation ledger) | 🅿️ PARKED | .ailedger per-shard is sufficient; reconcile later |

### Naming Changes (v0.4.0+)
- **grimoire → hermetic/masonic** — no more grimoire; gated memory lives under hermetic
- **allegiance/aillegiance** — separate from .ailedger; public append-only aggregate (parked v0.9)
- **6-layer memory** — mnemonic (runtime) is layer 6 atop 5 persistent COGNOS scopes

---

## 📁 Plan Files

- **[v0.2.3-stabilization.md](v0.2.3-stabilization.md)** — Architecture & safety hardening
- **[v0.2.4-docker-matrix.md](v0.2.4-docker-matrix.md)** — Container isolation + priority routing
- **[v0.3.0-tiles.md](v0.3.0-tiles.md)** — Real-time observability + control  
- **[v0.3.1-orchestrator.md](v0.3.1-orchestrator.md)** — Multi-agent scheduling
- **[v0.3.2-skupper.md](v0.3.2-skupper.md)** — Multi-cloud distribution (parked → v0.7.0)
- **[phases.json](phases.json)** — Structured phase data

---

## 📊 Success Metrics

- ✅ v0.2.3.1: Zero TOCTOU vulnerabilities + symbol consistency
- ✅ v0.2.4: Shell session governance, 91/91 tests
- ✅ v0.3.0: tmux 1+1, .ailedger, pipe-pane capture
- ✅ v0.3.1: Bun TS extraction, airun, router.ts
- ✅ v0.3.2: Model routing, version strings, glossary
- ✅ v0.4.0: TCB gates enforced, Docker containers running, PS1 finalized, ^regen dashboards
- 📍 v0.4.1: F.AST indexes codebase, memory skeleton creates/reads all 6 layers

---

**Last Updated**: 2026-04-19  
**Owner**: l-agence team  
**Next Review**: After v0.4.1 planning
