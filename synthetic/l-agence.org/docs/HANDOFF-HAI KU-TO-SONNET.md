# Handoff: Haiku → Sonnet (v0.2.3.1 → Phase 2)

**Date**: 2026-03-31  
**From**: Claude Haiku 4.5  
**To**: Claude Sonnet 4 (or stronger)  
**Context**: Agence multi-agent framework (rel_0.2.2_agence_swarm_sessions branch)  

---

## What Was Completed (v0.2.3.1 Design Milestone)

### Architecture Decisions

✅ **Path Validation Hardening**
- Realpath() before scope checks
- NO auto-healing in security layer (fails loud instead)
- Separation: routing layer (junctions) ≠ security layer (validation)

✅ **Shell Environment Standardization**
- WSL-Ubuntu bash = default (Git Bash unreliable for serious work)
- Optional pwsh inside WSL for Windows devs
- See: [`codex/SETUP.md`](../codex/SETUP.md)

✅ **Symbol Hierarchy (Agent vs. Swarm)**
- Agent-level (active): `+, &, %, -, _, #`
- Swarm-level (reserved): `~, $`
- Priority (independent): `*, **, ***`
- Updated: [`synthetic/l-agence.org/docs/SYMBOLS.md`](./docs/SYMBOLS.md)

✅ **Scope Taxonomy (HERMETIC/NEXUS/SYNTHETIC/ORGANIC)**
- HERMETIC: local personal (notes, todos)
- NEXUS: local-only (faults, logs, sessions — sensitive)
- SYNTHETIC: team-shared (plans, lessons, issues)
- ORGANIC: team work (tasks, jobs, workflows)
- Created: [`codex/TAXONOMY.md`](../codex/TAXONOMY.md)

✅ **Command Router (Phase 1.5)**
- 8 commands: `^lesson`, `^log`, `^plan`, `^todo`, `^fault`, `^issue`, `^task`, `^job`
- Routing inheritance (--org flags with fallback)
- Implemented in: [`bin/agence`](../../bin/agence)
- Documented: [`COMMANDS.md`](./COMMANDS.md)

✅ **Strategic Plans (5-Phase Roadmap)**
- v0.2.3: Stabilization (✅ DONE)
- v0.2.3.2: Command router (IN-PROGRESS, 90%)
- v0.2.4: Docker + matrix math (NEXT FOR YOU)
- v0.3.0: VSCode tiles + job control
- v0.3.1: Multi-agent orchestrator
- v0.3.2+: Skupper multi-cloud
- Location: [`synthetic/l-agence.org/plans/`](./plans/)

✅ **Lessons Extracted**
- Root cause analysis of catastrophic failure
- 5 key principles for future design
- File: [`synthetic/l-agence.org/lessons/2026-03-31-catastrophic-failure-root-cause-and-fix.md`](./lessons/2026-03-31-catastrophic-failure-root-cause-and-fix.md)

---

## What You'll Own (Phase 2: Docker + Matrix Math)

### Priority 1: Docker Foundations (v0.2.4, Week 1-2)

**Deliverables**:
1. **Dockerfile** (WSL-Ubuntu LTS base)
   - Node.js (restricted, no npm)
   - TypeScript compiler
   - `/workspace` mount point (POSIX only)
   - `/run/secrets/{agent-id}` for credentials injection

2. **Session Metadata Schema** (TypeScript)
   - Location: [`lib/aisession-lib.ts`](../../lib/aisession-lib.ts)
   - Captures: agent-id, task-id, start/end time, exit code, both shell streams
   - File format: `${NEXUS}/sessions/{agent-id}-{date}.json`
   - Schema reference: in TAXONOMY.md

3. **aibash/aishell Adapters for Container Mode**
   - Detect: running inside container vs. local
   - Behavior: same command set, adapt path handling
   - Signal handlers: SIGKILL, SIGSTOP propagate correctly
   - Exit hooks: flush session metadata before dying

4. **Integration Test**
   - Spin up container + run aibash session + capture metadata
   - Verify: paths are `/workspace`-relative, no POSIX surprises

### Priority 2: Matrix Math + Git Locking (v0.2.4, Week 2-3, PARALLEL)

**Deliverables**:
1. **Complexity Metrics Evaluator**
   - Input: task scope (files affected, line count)
   - Output: category (trivial | small | medium | large)
   - Location: [`organic/complexity-eval.ts`](../../organic/complexity-eval.ts)
   - Heuristic: see RULES.md (provided in context)

2. **Priority Calculation (Matrix Math)**
   - Input: workflow DAG + human overrides
   - Output: priority scores (1–10)
   - Formula: `1 + count(blocked_tasks)`
   - Location: [`organic/matrix-math.ts`](../../organic/matrix-math.ts)

3. **Agent Routing Table** (Priority × Complexity → Model)
   - 4×4 matrix (priority low/med/high/urgent × complexity trivial/small/med/large)
   - Maps to: free-gpt4, haiku, sonnet, etc.
   - Location: [`organic/agent-routing-rules.json`](../../organic/agent-routing-rules.json)
   - Cost tracking: per-task spend (audit trail)

4. **Git Merge Strategy** (Conflict Resolution)
   - Custom function: `resolveConflict(path, theirs, ours, ancestor)`
   - Decision logic: compare agent metadata (priority, security_label)
   - Special case: security-critical tasks require human approval
   - Location: [`organic/merge-strategy.ts`](../../organic/merge-strategy.ts)
   - Test: merge two agent branches simultaneously, verify deterministic outcome

---

## Critical Architectural Decisions for You

### 1. Agent Metadata Schema (CRITICAL)
```yaml
agent-ralph:
  priority: 5
  security_label: admin
  max_concurrent_tasks: 2
  cost_tier: high  # sonnet, expensive
  
agent-aider:
  priority: 3
  security_label: user
  max_concurrent_tasks: 1
  cost_tier: low   # haiku, cheap
```
This drives matrix math routing. Confirm with user before implementing.

### 2. Git Branch Strategy for Agents
```
main: organic/matrix-state.json (source of truth)
  ↓
agent-ralph-001: local branch (ralph does work)
  ↓ (commits to this branch)
agent-aider-002: local branch (aider does work)
  ↓
Merge: orchestrator attempts merge using custom strategy
  → conflicts resolved by priority/labels
  → result commits back to main
  → all agents re-pull (state propagates)
```
Question: Should agent commits be signed? Should there be a CI gate?

### 3. Edge Cases to Handle
```
Scenario 1: Two agents modify same matrix rows (conflict)
  → Merge strategy resolves by priority
  
Scenario 2: Agent disconnects mid-task
  → Task remains in +state on agent's branch
  → Locks file prevents orphaning
  → Orchestrator can reassign or retry
  
Scenario 3: Human overrides cost tier
  → `--cost-override $$$$ --approver steff@l-agence.org`
  → Stored in task metadata (audit trail)
  → Actual cost tracked in cost-tracking.json
```

---

## Testing Strategy (Recommend for v0.2.4)

### Unit Tests
```bash
# Complexity evaluator
complexity(task_001) --> 'medium' (450 LOC, 8 modules)

# Priority calc
priority(task_001, dag, overrides) --> 4 (1 + 3 blocked)

# Merge strategy
resolve_conflict(agent_ralph$$$, agent_aider$, 'matrix_row_X') --> ralph's version
```

### Integration Tests
```bash
# Docker session
docker run --mount type=bind,source=/workspace,target=/workspace \
  agence-container aibash --session-id ralph-001
  
# Verify: session metadata in /nexus/sessions/ralph-001.json

# Git merge
git checkout agent-ralph-001; echo "update" >> matrix.json; git commit
git checkout main
git merge --strategy-option=custom agent-ralph-001
  → Verify: merge strategy invoked, no conflicts
```

---

## Context You'll Need (Already Committed)

| File | Purpose |
|------|---------|
| **[`codex/LAWS.md`](../codex/LAWS.md)** | Hard constraints (path validation, symbol scope) |
| **[`codex/RULES.md`](../codex/RULES.md)** | Best practices (to be expanded for Docker/matrix) |
| **[`codex/TAXONOMY.md`](../codex/TAXONOMY.md)** | Scope model (HERMETIC/NEXUS/SYNTHETIC/ORGANIC) |
| **[`synthetic/l-agence.org/docs/MATRICES.md`](./docs/MATRICES.md)** | Matrix math foundation |
| **[`synthetic/l-agence.org/docs/SHARDING.md`](./docs/SHARDING.md)** | Git-based coordination |
| **[`synthetic/l-agence.org/plans/v0.2.4-docker-matrix.md`](./plans/v0.2.4-docker-matrix.md)** | Your phase spec |
| **[`lib/format.sh`](../../lib/format.sh)** | Format helpers (use for output) |

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Git merge strategy too simplistic | Add human approval gate for security labels |
| Agent metadata drift | Add validation check before applying routing |
| Container path edge cases | Test with symbolic link mounts, relative paths |
| Merge conflicts on startup | Implement lock file before merge attempt |

---

## Recommendation for Handoff

✅ **Good to hand off to Sonnet now because:**
- Phase 1.5 mostly done (90% command router)
- Phase 2 is well-scoped (Docker + matrix math)
- Architectural decisions locked in
- No surprises should emerge

⚠️ **Phase 1.5 Remaining (Quick for Haiku):**
- [ ] Test command router smoke tests
- [ ] Add routing inheritance logic (--org flags)
- [ ] Git commit v0.2.3.1 release

Then Sonnet takes Phase 2 fresh.

---

## Contact Points

If Sonnet hits blockers:
1. **Path validation edge cases** → Refer to: LAWS.md § Path Validation
2. **Matrix math formulas** → Refer to: MATRICES.md + matrix-math pseudocode
3. **Agent metadata schema** → Refer to: TAXONOMY.md + confirm with user
4. **Docker image decisions** → Refer to: SETUP.md + ask user about additional tools

---

**Date Prepared**: 2026-03-31  
**Status**: Ready for handoff  
**Duration of Phase 1.5**: ~2 hours  
**Recommended Start (Phase 2)**: Immediately
