# Agence Development Roadmap (2026 Q1–Q2)

**Updated**: 2026-04-22
**Status**: v0.7.0-alpha (modular architecture, MCP, ^ken, ^recon, consensus consolidation)
**Current**: main @ 1637d5a (v0.7.0-alpha)

---

## 🎯 Vision: Multi-Agent Swarm Orchestration

Path: **Single-Agent Stabilization** → **Routing + Ledger + Audit** → **Guard + Compute** → **Skills + Peers + Memory** → **Modular Architecture** → **Distributed**

```
v0.2.5 (RELEASED)     ← Stabilization, model routing, 91/91 tests
    ↓
v0.3.0 (RELEASED)     ← tmux, env, session.ts, .ailedger, pipe-pane
    ↓
v0.3.1 (RELEASED)     ← router.ts, audit.ts, airun, CI, ledger IDs
    ↓
v0.3.2 (RELEASED)     ← version strings, model routing, glossary
    ↓
v0.4.0 (RELEASED)     ← guard.ts, signal.ts, TCB gates, Docker/Nomad
    ↓
v0.5.0 (RELEASED)     ← skill routing, peers, rich CLI, ^ symlink, security fixes
    ↓
v0.6.0-alpha (RELEASED) ← First public release — governance framework, 291 tests
    ↓
v0.7.0-alpha (CURRENT)  ← Modular bin/agence split, MCP server, ^ken, ^recon, ledger auto-derive
    ↓
v0.8.0                 ← MLS enforcement + AIPOLICY capability tokens
    ↓
v0.9.0                 ← Skupper multi-cloud federation
    ↓
v1.0.0                 ← Production release — Allegiance ledger, multi-org support
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
| **4** | v0.5.0 | skill routing, skills (29), peers, rich CLI, ^ symlink, security fixes | 🟢 DONE |
| **5** | v0.6.0-alpha | First public release — governance framework, memory model, 291 tests | 🟢 DONE |
| **6** | v0.7.0-alpha | Modular architecture — bin/agence split (9 lib/*.sh), MCP, ^ken, ^recon, ledger auto-derive | 🟢 DONE |
| **7** | v0.8.0 | MLS enforcement + AIPOLICY capability tokens | 📍 NEXT |
| **8** | v0.9.0 | Skupper multi-cloud federation | 📍 FUTURE |
| **9** | v1.0.0 | Production release — Allegiance ledger, multi-org support | 📍 FUTURE |

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

## 🔮 Version Horizon

| Version | Feature | Status | Notes |
|---------|---------|--------|-------|
| v0.4.0–v0.4.5 | guard.ts, signal.ts, Docker, PS1, task IDs, ^regen | 🟢 DONE | guard✅ signal✅ docker✅ overlay✅ aicmd✅ agentd-spawn✅ PS1✅ hex8-IDs✅ ^regen✅ |
| v0.5.0 | skill routing, skills (29), peers (3-tangent), mixed agent routing | 🟢 DONE | WIRE-001..005✅ SKILL-001..008✅ SEC-001..006✅ REL-001..002✅ |
| v0.6.0-alpha | First public release — governance framework | 🟢 DONE | 291 tests, 750 expect(), GitHub public, MIT+CC |
| v0.7.0-alpha | Modular architecture — bin/agence split, MCP, ^ken, ^recon | 🟢 DONE | 9 lib/*.sh, MCP 10 tools+3 resources, ledger auto-derive, consensus 3-algo, dispatch.ts removed |
| v0.8.0 | MLS enforcement + AIPOLICY capability tokens | 📍 NEXT | Not critical until multi-tenant |
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
- 📍 v0.8.0: MLS enforcement, capability tokens, multi-tenant isolation

---

**Last Updated**: 2026-04-22  
**Owner**: l-agence team  
**Next Review**: After v0.8.0 planning
