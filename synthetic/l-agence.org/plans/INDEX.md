# Agence Development Roadmap (2026 Q1–Q2)

**Locked**: 2026-03-31 by GitHub Copilot (Haiku)  
**Status**: v0.2.3.1 Architecture & Docs Complete  
**Next**: Phase 1.5 Command Router Implementation

---

## 🎯 Vision: Multi-Agent Swarm Orchestration

Path: **Single-Agent Stabilization** → **Local Multi-Agent** → **Distributed (Skupper)** → **Production**

```
v0.2.3.1 (CURRENT)   ← Architecture locked, docs complete
    ↓
v0.2.4              ← Docker + Matrix Math foundations
    ↓
v0.3.0              ← VSCode tiles + real-time observability
    ↓
v0.3.1              ← Orchestrator + collision avoidance
    ↓
v0.3.2+             ← Skupper multi-cloud distribution
```

---

## 📋 Phase Breakdown

| Phase | Version | Focus | Estimate | Status |
|-------|---------|-------|----------|--------|
| **1** | v0.2.3.1 | Architecture & docs (PATH hardening, symbols, scopes) | ✅ Complete | 🟢 DONE |
| **1.5** | v0.2.3.2 | Command router (8 commands, routing, completion) | 1–2 weeks | ⏳ NEXT |
| **2** | v0.2.4 | Docker foundations + matrix math | 3–4 weeks | 📍 QUEUED |
| **3** | v0.3.0 | VSCode tiles + job control | 3–4 weeks | 📍 QUEUED |
| **4** | v0.3.1 | Orchestrator + DWM gating | 4+ weeks | 📍 QUEUED |
| **5** | v0.3.2+ | Skupper multi-cloud | TBD | 📍 QUEUED |

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
