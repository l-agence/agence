# Agence Development Roadmap (2026 Q1–Q2)

**Updated**: 2026-04-10
**Status**: v0.3.2 shipped, v0.4.0 in progress
**Current**: main @ ee8d15c

---

## 🎯 Vision: Multi-Agent Swarm Orchestration

Path: **Single-Agent Stabilization** → **Routing + Ledger + Audit** → **Guard + Compute** → **Distributed**

```
v0.2.5 (RELEASED)     ← Stabilization, model routing, 91/91 tests
    ↓
v0.3.0 (RELEASED)     ← tmux, env, session.ts, .ailedger, pipe-pane
    ↓
v0.3.1 (RELEASED)     ← router.ts, audit.ts, airun, CI, ledger IDs
    ↓
v0.3.2 (RELEASED)     ← version strings, model routing, glossary
    ↓
v0.4.0 (CURRENT)      ← guard.ts, signal.ts, matrix.ts, MLS enforcement
    ↓
v0.5.0+               ← Skupper multi-cloud distribution
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
| **3** | v0.4.0 | guard.ts, signal.ts, matrix.ts, MLS enforcement | ⏳ CURRENT |
| **4** | v0.5.0+ | Skupper multi-cloud | 📍 FUTURE |

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

## 📁 Plan Files

- **[v0.2.3-stabilization.md](v0.2.3-stabilization.md)** — Architecture & safety hardening
- **[v0.2.4-docker-matrix.md](v0.2.4-docker-matrix.md)** — Container isolation + priority routing
- **[v0.3.0-tiles.md](v0.3.0-tiles.md)** — Real-time observability + control  
- **[v0.3.1-orchestrator.md](v0.3.1-orchestrator.md)** — Multi-agent scheduling
- **[v0.3.2-skupper.md](v0.3.2-skupper.md)** — Multi-cloud distribution
- **[phases.json](phases.json)** — Structured phase data

---

## 🚀 Handoff Points

### **Haiku (Haiku 4.5) — Phases 1–1.5**
- ✅ Architecture design + documentation
- ✅ Symbol hierarchy + scope model
- ✅ Command router + shell integration
- ⏳ Remaining: gitignore cleanup, smoke tests, merge

### **Sonnet/Opus (Claude Sonnet-4) — Phases 2–5**
- Orchestrator design + implementation
- Git merge strategy + conflict resolution
- Distributed system reasoning (Skupper)
- Edge case handling + architectural tradeoffs

---

## 🎓 Key Learning

**Catastrophic Failure (2026-03-06)**:
> Auto-healing junctions in security layer → TOCTOU → sandbox escape

**Resolution**:
> Separate concerns: routing layer (junctions ✓) ≠ security layer (realpath only, no creation)

**Result**: Clean, verifiable boundary + path validation

---

## 📊 Success Metrics

- ✅ v0.2.3.1: Zero TOCTOU vulnerabilities + symbol consistency
- ✅ v0.2.4: Agents in containers, matrix math computes priorities
- ✅ v0.3.0: Human sees both agent tiles in real-time
- ✅ v0.3.1: Multi-agent scheduling + no collisions
- ✅ v0.3.2: Same code on any Skupper node

---

**Last Updated**: 2026-03-31  
**Owner**: l-agence team  
**Next Review**: After Phase 1.5 completion
