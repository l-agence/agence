# MATRICES: Task State, Workflows & Projects

**Version**: 0.4.0  
**Status**: Implemented (`lib/matrix.ts`)  
**Last Updated**: 2026-04-10

---

## Model

Agence implements a 3-tier matrix model for deterministic, decentralized task orchestration:

$$\text{TASKS} \xrightarrow{\text{aggregate}} \text{WORKFLOWS} \xrightarrow{\text{aggregate}} \text{PROJECTS}$$

All computation via Bun TypeScript (`lib/matrix.ts`). No database — state lives in Git-committed JSON files under `organic/`.

**Design principles:**
- Distributed authority derived from upstream Git remotes (shards)
- Atomic state computed per node, always idempotent
- Linear algebra scoring enables instant priority, scheduling, and bottleneck detection
- Portable: runs anywhere Bun runs
- Robustness built on simplicity that scales from an elegant mathematical model
- Higher-level abstractions (true vector computation, observability) can layer on top later via Python/NumPy — but the core runs with nothing but Bun + jq

---

## State Symbols

See [SYMBOLS.md](SYMBOLS.md) for the canonical table.

| Symbol | Meaning | Numeric | Runnable |
|--------|---------|---------|----------|
| `~` | human-assigned | — | ✓ |
| `$` | human-working | — | ✗ (active) |
| `%` | agent-assigned | — | ✓ |
| `&` | agent-executing | — | ✗ (active) |
| `+` | pending | +1 | ✓ |
| `-` | completed | -1 | ✗ (done) |
| `_` | paused | 0 | ✗ |
| `#` | held by human | 0 | ✗ |
| `!` | failure | -1 | ✗ |
| `?` | awaiting input | — | ✓ |

**Dependency operators:**

| Symbol | Meaning |
|--------|---------|
| `^` | Hard dependency (blocks downstream) |
| `;` | Soft dependency (advisory ordering) |
| `>` | Child task (subtask of parent) |
| `<` | Parent task (waits for children) |

---

## Scoring Formula

$$\text{score} = 10P + 25S + 100H$$

| Variable | Range | Description |
|----------|-------|-------------|
| $P$ | 1–5 | Priority (integer) |
| $S$ | 0+ | Stars — human priority override |
| $H$ | 0.0–1.0 | Heat — complexity/urgency factor |

Higher score = pick first. Agent scheduler selects highest-scoring runnable task.

---

## Formal Notation

Matrices use standard linear algebra element notation:

| Matrix | Variable | Element | Description |
|--------|----------|---------|-------------|
| **TASKS** | $T$ | $T_{ij}$ | Task $i$, attribute $j$ (state, owner, priority) |
| **WORKFLOWS** | $W$ | $W_{ik}$ | Workflow $i$, task $k$ completion vector |
| **PROJECTS** | $P$ | $P_{il}$ | Project $i$, workflow $l$ completion vector |

Aggregation hierarchy:

$$T \xrightarrow{\text{sum}} W \qquad W \xrightarrow{\text{sum}} P$$

$$\text{workflow\_completion}_i = \sum_k W_{ik} \qquad \text{project\_completion}_j = \sum_i P_{ij}$$

---

## Data Model

All files live under `organic/`:

### tasks.json — Task Matrix

```json
{
  "tasks": [
    {
      "id": "DOC-001",
      "repo": "agence",
      "title": "Update documentation",
      "state": "~",
      "priority": 2,
      "stars": 1,
      "heat": 0.2,
      "agent": null,
      "created": "2026-04-10T00:00:00Z",
      "updated": "2026-04-10T00:00:00Z"
    }
  ]
}
```

### deps.json — Dependency Adjacency List

```json
{
  "edges": [
    { "from": "DOC-001", "to": "DOC-002", "type": "^" }
  ]
}
```

- `^` hard dependency: downstream task blocked until upstream completes
- `;` soft dependency: advisory ordering, does not block

### workflows.json — Workflow → Task Mapping

```json
{
  "workflows": [
    { "id": "WF-BUILD", "title": "Build pipeline", "tasks": ["BUILD-001", "TEST-001", "DEPLOY-001"] }
  ]
}
```

### projects.json — Project → Workflow Mapping

```json
{
  "projects": [
    { "id": "PROJ-1", "title": "v0.4.0 Release", "workflows": ["WF-BUILD", "WF-DOCS"] }
  ]
}
```

### agents.json — Agent Capacity (future)

```json
{
  "agents": [
    { "name": "@ralph",  "tier": "cheap",     "cost": 1,  "capacity": 5, "max_tokens": 2000  },
    { "name": "@sonya",  "tier": "mid",       "cost": 5,  "capacity": 3, "max_tokens": 8000  },
    { "name": "@peers",  "tier": "expensive",  "cost": 20, "capacity": 1, "max_tokens": 32000 },
    { "name": "@olena",  "tier": "local",      "cost": 0,  "capacity": 2 }
  ]
}
```

---

## Matrix Operations

### Task Scoring Vector

Each task computes a scalar score. The full task set forms a score vector:

$$\vec{s} = \begin{bmatrix} s_1 \\ s_2 \\ \vdots \\ s_n \end{bmatrix} \quad \text{where } s_i = 10P_i + 25S_i + 100H_i$$

Tasks are ranked by descending score. Agent picks the highest-scoring **runnable** task.

### DAG Blocking Propagation

Hard dependencies form a directed acyclic graph (DAG). A task is **blocked** if any hard dependency (`^`) has not reached state `-` (completed):

$$\text{blocked}(t) = \exists\, e \in \text{edges} : e.\text{to} = t \wedge e.\text{type} = \texttt{"^"} \wedge \text{state}(e.\text{from}) \neq \texttt{"-"}$$

Cycle detection via DFS prevents circular dependency insertion.

**Example blocking chain:**

```
repo:init ──┐
            v
repo:build ──> repo:test ──> repo:deploy
                              ^
repo:docs ─────────────────── ; (soft, advisory)
```

### Workflow Completion

$$\text{completion}(W) = \frac{|\{t \in W : \text{state}(t) = \texttt{"-"}\}|}{|W|} \times 100\%$$

### Project Completion

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|}$$

---

## Runnable Task Selection

A task is **runnable** if:
1. State is one of: `+`, `~`, `%`, `?`
2. Not blocked by any incomplete hard dependency
3. Not in terminal state: `-`, `_`, `#`, `!`

```
Filter: state ∈ {+, ~, %, ?} ∧ blockers = ∅
Sort:   descending by score
Pick:   top N (agent capacity)
Claim:  state → & (agent-executing)
```

State transitions on claim:

```
Mark claimed tasks → score updates
Completed tasks   → workflow row sums update
Workflow completion → project row sums update
```

---

## CLI Reference

All commands via `airun matrix <cmd>`:

| Command | Description |
|---------|-------------|
| `score` | Score + rank all tasks (highest first) |
| `runnable` | Tasks eligible for agent pickup (JSON) |
| `blocked` | Show blocking dependency chains |
| `status` | Summary: counts, completion %, workflows |
| `workflow <id>` | Workflow detail with per-task status |
| `add <id> <title>` | Add new task (state=~, priority=1) |
| `set <id> <field> <value>` | Update task field |
| `assign <id> <agent>` | Assign task to agent (state → %) |
| `complete <id>` | Mark task completed (state → -) |
| `dep <from> <to> [^/;]` | Add dependency (default: ^ hard) |
| `init` | Create empty data files |

---

## Example: 4-Task Pipeline

```bash
# Create tasks
airun matrix add BUILD-001 "Build core module"
airun matrix add TEST-001  "Run test suite"
airun matrix add DOCS-001  "Update documentation"
airun matrix add DEPLOY-001 "Deploy to staging"

# Set priorities and heat
airun matrix set BUILD-001 priority 3
airun matrix set BUILD-001 stars 2
airun matrix set BUILD-001 heat 0.8    # score = 30+50+80 = 160

# Add dependencies: BUILD → TEST → DEPLOY, DOCS → DEPLOY (soft)
airun matrix dep BUILD-001 TEST-001
airun matrix dep TEST-001 DEPLOY-001
airun matrix dep DOCS-001 DEPLOY-001 ";"

# Check state
airun matrix score      # BUILD-001(160) > DEPLOY-001(70) > TEST-001(20) > DOCS-001(10)
airun matrix blocked    # TEST-001 ⛔ BUILD-001, DEPLOY-001 ⛔ TEST-001
airun matrix runnable   # BUILD-001, DOCS-001 (unblocked)

# Execute
airun matrix assign BUILD-001 ralph
airun matrix complete BUILD-001
airun matrix blocked    # DEPLOY-001 ⛔ TEST-001 (TEST-001 now unblocked)
```

---

## Prototype Helpers

Reference snippets for jq and awk matrix operations. The canonical implementation is `lib/matrix.ts`; these are provided for portability on minimal systems.

### jq Helpers (matrix.jq)

```jq
# Get tasks assigned to a human
def human_tasks:
  map(select(.status | test("^~|\\$")));

# Get tasks assigned to agent
def agent_tasks:
  map(select(.status | test("^%|&")));

# Filter by minimum priority
def priority_tasks($min):
  map(select(.priority >= $min));

# Sum token costs
def sum_tokens:
  map(.token_cost) | add;

# Compute completion %
def completion:
  (map(select(.status == "-")) | length) as $done
  | ($done / length) * 100;
```

### awk Scoring (matrix.awk)

```awk
# matrix.awk — Compute task scores from CSV: id,priority,stars,heat
BEGIN { FS = "," }
{
  score = ($2 * 10) + ($3 * 25) + ($4 * 100)
  printf "%s\t%d\n", $1, score
}
```

---

## Sharding: Git-Native Distribution

Each Git fork is both a compute shard and a state shard:

- `organic/tasks.json` (signed source of truth) lives in each shard
- Agents discover cross-shard work via `git remote add` + `git fetch --all`
- Task completion propagates via Git merges
- `.ailedger` Merkle root snapshots verify integrity across shards

See [SHARDING.md](SHARDING.md) for the full distribution model.

---

## Future: Agent Routing Table

The scoring vector feeds into agent routing:

| Priority × Complexity | T0 (cheap) | T1 (mid) | T2 (expensive) | T3 (critical) |
|----------------------|------------|----------|----------------|---------------|
| Low × Simple | @ralph | @ralph | — | — |
| Low × Complex | @ralph | @sonya | @peers | — |
| High × Simple | @ralph | @sonya | — | — |
| High × Complex | — | @sonya | @peers | @peers |

Agent capacity and cost are tracked in `organic/agents.json` (future implementation).

---

*Implementation: [lib/matrix.ts](../../lib/matrix.ts) | Data: [organic/](../../organic/)*
