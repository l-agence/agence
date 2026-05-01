# CODEX: TAXONOMY

**Data Classification & Scope Model**

Agence organizes knowledge into four scopes with strict privacy and ownership rules. This ensures secrets stay hidden, team knowledge is shared appropriately, and future ailedger integration doesn't leak sensitive data.

---

## Scope Hierarchy

### 1. PRIVATE (Local, Never Shared)

**Location**: `knowledge/private/@{context}/`

**Contents**:
- `notes/` — Personal research, scratch work, debugging notes
- `todos/` — Personal task list (not team assignments)

**Principles**:
- ❌ Never committed to Git
- ❌ Never pushed upstream
- ❌ Never shared with other agents or team
- ✅ Local debugging/learning only
- ✅ Can reference from personal notes

**Ownership**: Individual

**Privacy**: Absolute (except during human-supervised debugging)

**Examples**:
```
knowledge/private/@/notes/         # My research on path normalization
knowledge/private/@/notes/debugging-20260331.md
knowledge/private/@/todos/         # My personal checklist
knowledge/private/@/todos/phase-2-tasks.md
```

**Command Interface**:
```bash
^notes list               # Show all my notes
^notes add "Research findings"
^todo list                # Show my todos
^todo add "Review merge-strategy.ts"
^todo show "Review merge-strategy.ts"
```

---

### 2. NEXUS (Local-Only by Default, Future ailedger)

**Location**: `nexus/`

**Contents**:
- `faults/` — Failures, incidents, raw errors (⚠️ may contain secrets)
- `logs/` — Operational logs, timelines, audit trails
- `sessions/` — Agent execution history, metadata

**Principles**:
- ✅ Stored locally
- ❌ Not shared by default (privacy protection)
- ⚠️ Raw data may contain sensitive information
- 🔐 Can publish sanitized lessons to KNOWLEDGE (via `^lesson` derived from fault)
- 🔮 Future: Append-only ailedger with human-gated publishing

**Ownership**: System (agent executions), accessed privately

**Privacy**: Restricted (no public sharing without sanitization)

**Examples**:
```
nexus/faults/
  f9e7c3d2-symlink-false-success.md  # The catastrophic failure
  
nexus/logs/
  INDEX.md
  LOGS.json
  
nexus/sessions/
  69c9e444.meta.json                 # Session metadata
  ralph-001-session.json             # Agent session
```

**Command Interface**:
```bash
^fault list               # Show faults (local only)
^fault show "f9e7c3d2"
^fault add "New incident"
^fault add --sanitize "Extract lesson from this"  # → synthetic/lessons/

^log list
^log show ralph           # Ralph's logs only
^log add "Manual entry"

# Sessions accessible via swarm orchestrator (future)
```

**Note**: Sanitized faults can be published to `knowledge/@/lessons/` after human review (shipped v0.4.0+).

---

### 3. KNOWLEDGE (Team-Shared, Committed)

**Location**: `knowledge/@{org}/`

**Contents**:
- `plans/` — Strategic roadmaps, version plans, architecture designs
- `lessons/` — Sanitized learning extracted from faults
- `issues/` — Discoveries, problems, questions (team-visible)
- `docs/` — Architecture, guides, references

**Principles**:
- ✅ Committed to Git
- ✅ Shared upstream with team
- ❌ NO raw secrets, NO raw faults
- ✅ Only sanitized content (personally-identifying data removed)
- ✅ Default routing: inherits `@` symlink context

**Ownership**: Team

**Privacy**: Public (team-accessible)

**Examples**:
```
knowledge/@/
  plans/
    v0.2.3-roadmap.md
    v0.3.0-swarms.md
  lessons/
    path-normalization-gotchas.md  # Sanitized from fault f9e7c3d2
    never-auto-heal-paths.md
  issues/
    windows-symlink-edge-cases.md
  docs/
    SYMBOLS.md
    MATRICES.md
    SHARDING.md
```

**Command Interface**:
```bash
^plan list                # Show all plans
^plan show "v0.3.0-swarms"
^plan add "New roadmap"

^lesson list              # Show all team lessons
^lesson show "path-normalization-gotchas"
^lesson add "New learning" (or derived from fault)

^issue list               # Show team issues
^issue show "windows-symlink-edge-cases"
```

**Routing Inheritance**:
- Default: `knowledge/@/`
- Override: `^plan list --org acme.tld` → `knowledge/@acme.tld/plans/`
- If missing, falls back to default

---

### 4. ORGANIC (Team-Assigned Work, Committed)

**Location**: `organic/`

**Contents**:
- `tasks/` — Team assignments (human or agent executable)
- `jobs/` — Robot-only assignments (agent terminal output)
- `workflows/` — State machines, DAGs, execution plans
- `projects/` — Multi-workflow deliverables
- `matrix-state.json` — Source of truth (signed task matrix)
- `@{org}/` — Org-specific overrides (future multi-agent)

**Principles**:
- ✅ Committed to Git
- ✅ Shared with team
- ✅ Team-assigned (who does the work? human or agent?)
- ✅ Routable by agent/team/project
- ✅ Future: agents coordinate via shared matrices + Git merge

**Ownership**: Team (work assignments)

**Privacy**: Public (team-accessible)

**Examples**:
```
organic/
  tasks/
    matrix-001-refactor-auth.md
    matrix-002-e2e-tests.md
  jobs/
    ralph-task-001.json             # Ralph executing matrix-001
    aider-task-002.json
  workflows/
    qa-pipeline.md
    release-flow.md
  projects/
    okta-sso-q2.md
  matrix-state.json                 # Core state (all tasks, signed)
  @acme.tld/jobs                    # Org-specific (future)
```

**Command Interface**:
```bash
^task list                # Show all tasks
^task show "matrix-001"
^task add "New task" --assign ralph

^job list                 # Show job queue
^job show ralph           # Ralph's current jobs
```

**Shipped (v0.5.0+)**:
- matrix.ts computes priority (blocking impact) + complexity
- Cost-aware routing: expensive models for urgent/complex tasks
- Agents merge task state via Git + custom merge strategy

---

## Taxonomy Reference Table

| Scope | Location | Owner | Shared | Commits | Data Type | Privacy |
|-------|----------|-------|--------|---------|-----------|---------|
| PRIVATE | `knowledge/private/@/` | Individual | ❌ | ❌ | Notes, todos | Absolute |
| NEXUS | `nexus/` | System | ❌ default | ❌ | Faults, logs, sessions | Restricted |
| KNOWLEDGE | `knowledge/@{org}/` | Team | ✅ | ✅ | Plans, lessons, issues, docs | Public |
| ORGANIC | `organic/` | Team | ✅ | ✅ | Tasks, jobs, workflows, matrices | Public |

---

## Command Router Mapping

| Command | Scope | Default | Override | Purpose |
|---------|-------|---------|----------|---------|
| `^notes` | PRIVATE | `knowledge/private/@/notes/` | N/A (always local) | Personal research |
| `^todo` | PRIVATE | `knowledge/private/@/todos/` | N/A (always local) | Personal tasks |
| `^fault` | NEXUS | `nexus/faults/` | N/A (always local) | Incident tracking |
| `^log` | NEXUS | `nexus/logs/` | `--filter=agent` | Operational history |
| `^plan` | KNOWLEDGE | `knowledge/@/plans/` | `--org NAME` | Strategic roadmaps |
| `^lesson` | KNOWLEDGE | `knowledge/@/lessons/` | `--org NAME` | Shared learning |
| `^issue` | KNOWLEDGE | `knowledge/@/issues/` | `--org NAME` | Team discoveries |
| `^task` | ORGANIC | `organic/tasks/` | `--assign AGENT` | Team work |
| `^job` | ORGANIC | `organic/jobs/` | `--agent NAME` | Robot work queue |

---

## Data Flow Examples

### Example 1: From Incident to Shared Lesson

```
1. Agent encounters failure
   └─ nexus/faults/incident-001.md ← captured (with secrets)

2. Human reviews fault (private, NEXUS)
   ^fault show incident-001
   └─ Identifies root cause, sanitizes details

3. Human extracts lesson
   ^fault add --sanitize "Path validation must use realpath()"
   └─ Creates: knowledge/@/lessons/realpath-validation-required.md (no secrets)

4. Team learns from shared lesson
   ^lesson list
   ^lesson show "realpath-validation-required"
   └─ Improved code follows best practice
```

### Example 2: Task Assignment in Multi-Agent Swarm

```
1. Human creates task (ORGANIC)
   ^task add "Implement matrix-math.ts" --assign ralph
   └─ organic/tasks/matrix-math.md

2. Swarm evaluates complexity
   - LOC estimate: 300
   - Modules: 5
   - Category: medium
   - Priority: blocking 2 other workflows
   → Route to: claude-sonnet (expensive, but unblocks)

3. Ralph (agent) checks out task
   git checkout -b ralph-task-matrix-math
   └─ local branch (ephemeral)

4. Ralph executes, commits to branch
   git commit -m "matrix-math: implemented priority routing"

5. Swarm merges (Git-native coordination)
   - Matrix state updated (task goes from +task to -task)
   - Git merge strategy applies agent priority rules
   - Result: organic/matrix-state.json updated, task marked complete

6. Lesson extraction (if noteworthy)
   - If novel approach: extract to knowledge/@/lessons/
   - Team learns from ralph's implementation
```

---

## Integration: ailedger (shipped v0.3.0+)

**Principle**: Append-only ledger with human-gated publishing

- NEXUS → ailedger: Raw faults published only after human sanitization
- KNOWLEDGE → ailedger: Team lessons + decisions permanently recorded
- ORGANIC → ailedger: Task executions + outcomes audited (for swarm learning)

**Security**: Signatures + encryption (team controls publishing, no unauthorized export)

---

## Version

**Version**: 0.4.0  
**Status**: In Effect  
**Last Updated**: 2026-04-10  

**References**:
- [LAWS.md](LAWS.md) — Security & validation rules
- [SYMBOLS.md](../knowledge/l-agence.org/docs/SYMBOLS.md) — Canonical notation
- [MATRICES.md](../knowledge/l-agence.org/docs/MATRICES.md) — Matrix mathematics
