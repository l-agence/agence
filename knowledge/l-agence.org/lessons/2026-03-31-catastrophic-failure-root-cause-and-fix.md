# Lesson: Catastrophic Failure Root Cause & Architectural Fix

**Date**: 2026-03-31  
**Session**: Design Milestone v0.2.3.1  
**Extracted From**: Fault analysis + system redesign  
**Author**: Haiku4.5 + Steff (collaborative)

---

## The Catastrophic Failure (Recap)

### What Happened
Path normalization system attempted to unify WSL (`/mnt/c/...`), Cygwin (`/cygdrive/c/...`), and Windows (`C:\...`) paths via automatic `mklink -j` (junction creation).

Security layer tried to **auto-heal missing paths** by creating junctions → opened filesystem-level escape routes → sandbox boundary collapsed.

### Root Cause
**Conflated two independent concerns:**
1. **Routing layer** (junctions): `@` context resolution (agent/org switching) ✅ ELEGANT
2. **Security layer** (PATH validation): Verify ops within allowed bounds ❌ BROKEN

The error: Security layer used junctions to bandage "broken" paths → automatic junction creation = arbitrary filesystem remapping = sandbox escape.

---

## The Architectural Fix (Discovered & Implemented)

### Fix Vector 1: Path Validation Hardening
- ✅ Use `realpath()` for validation BEFORE checking scope boundaries
- ✅ Remove auto-healing junction creation from security layer
- ✅ Fail loudly if path can't be resolved (don't patch it)
- ✅ Separate concerns: routing layer owns junctions, security layer owns validation

### Fix Vector 2: Shell Environment Standardization
Path normalization problems stem from **shell incompatibility**, not design:
- ❌ Git Bash: MSYS2 emulation (fragile, gotchas)
- ⚠️ PowerShell: Windows-native (not POSIX)
- ✅ WSL-Ubuntu Bash: Real Linux kernel (reliable, POSIX-native)

**Decision**: Set VSCode default → WSL-Ubuntu bash (mandatory), with optional pwsh in WSL for Windows-native devs.

**Why**: Local dev = container environment (same bash) = path handling identical everywhere.

### Fix Vector 3: Scope Clarification
- ✅ Git-native state management (no auto-remediation)
- ✅ HERMETIC scope: local notes/todos (never shared)
- ✅ NEXUS scope: faults/logs/sessions (local, not published raw)
- ✅ SYNTHETIC scope: plans/lessons/issues (team-shared, committed)
- ✅ ORGANIC scope: tasks/jobs/workflows (routable, team work)

---

## Key Principles Extracted

### Principle 1: Separation of Concerns
**Routing ≠ Security**
- Junctions (routing): elegant, solve context switching perfectly
- Path validation (security): uses `realpath()`, never creates artifacts
- Result: Both work; neither corrupts the other

### Principle 2: No Auto-Healing in Security Layer
**Never let security layer create escape hatches to fix problems**
- When PATH breaks, fail loudly (let human fix it)
- Never auto-create junctions/symlinks to patch gaps
- Preserves sandbox integrity

### Principle 3: Environment Parity
**Local dev MUST match container environment**
- Same shell: WSL-Ubuntu bash everywhere
- Same paths: `/workspace` in containers = project mounted at same path
- Same constraints: real POSIX, no emulation tricks
- Result: Agent code tested locally = works in container

### Principle 4: Matrix Math State (No Database)
**State = matrices, git commits = diffs, computation is local**
- Tasks are signed: `+task` (pending), `-task` (completed)
- `%completion` computed dynamically: `|negative_tasks| / (positive + negative)`
- DAG/dependencies emerge from matrix structure
- No central "state database" = coordination via Git (atomic commits)

### Principle 5: Hierarchical Symbol Scope
**Symbols scale from agent-level to swarm-level**
- Agent-level (v0.2.3+): `+, &, %, -, _, #` (active now)
- Swarm-level (v0.3.2+): `~, $` (reserved, not used yet)
- Priority: `*, **, ***` (independent)
- Result: Architecture extensible without symbol collision

---

## Implications for Future Versions

### v0.2.4 (Docker Foundations)
- Build on WSL-Ubuntu bash standardization
- Agent paths = container paths (same POSIX semantics)
- Session metadata captures both human + agent shells

### v0.3.0 (VSCode Tiles)
- 2-column layout: left (human control) + right (agent work)
- POSIX job control (`Ctrl+K`, `%jobs`) coordination
- Real-time observability + human override authority

### v0.3.1 (Multi-Agent Orchestrator)
- Matrix math routing: priority + complexity → model selection
- Git-based agent locking + merge strategy (priority/security labels)
- No junctions in orchestrator logic (validation only)

### v0.3.2+ (Skupper Multi-Cloud)
- Activate swarm-level prefixes (`~`, `$`)
- Same path logic distributed across clusters
- Skupper routing at network layer (not filesystem)

---

## What NOT to Do (Antipatterns)

❌ Auto-heal paths (security layer creating junctions)  
❌ Use Git Bash for critical work (path normalization unreliable)  
❌ Store state in database (use matrices + git)  
❌ Mix routing logic with security validation  
❌ Assume local dev ≠ container (they should match)  

---

## For Team: Update Check-In

This lesson should be referenced when:
- Debugging path issues (link to fix vectors 1–2)
- Designing new security boundaries (principle 2)
- Adding new scope types (principle 5)
- Implementing multi-agent features (principle 4)

**File path**: [`synthetic/l-agence.org/lessons/2026-03-31-catastrophic-failure-root-cause-and-fix.md`](../../l-agence.org/lessons/2026-03-31-catastrophic-failure-root-cause-and-fix.md)
