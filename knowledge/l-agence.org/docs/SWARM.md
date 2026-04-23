# SWARM: Synchronic Work Agentic Resource Manager

**Version**: 0.4.0  
**Status**: Partial (scheduling + routing implemented; agentd + Docker pending)  
**Last Updated**: 2026-04-10

---

## Overview

SWARM orchestrates tasks, agents, and intelligence levels across distributed Git shards. It manages three resources simultaneously:

1. **Task scheduling** — which work happens (priority, dependencies, critical path)
2. **Agent scheduling** — who performs the work (capacity, availability, cost)
3. **Model scheduling** — which intelligence level is used (tier routing, token economy)

All state lives in Git-committed JSON under `organic/`. No central server, no database.

**Core stack**: Bun TypeScript (`lib/matrix.ts`) for computation, with bash + jq + awk portability layer for minimal systems.

---

## Three-Tier Scheduling

```
task scheduling  → which work happens     (matrix scoring, DAG blocking)
agent scheduling → who performs the work   (capacity, tier matching)
model scheduling → which intelligence level (complexity → tier → cheapest model)
```

This separation keeps decision logic independent of specific vendors or models.

---

## Heatmap: Swarm Health Diagnostic

The heatmap measures pressure across the task graph to detect bottlenecks, overloaded agents, and idle work.

**Per-task metrics:**

| Variable | Description |
|----------|-------------|
| $B$ | Number of tasks blocked by this task |
| $D$ | Number of dependencies this task has |
| $A$ | Number of agents assigned |

**Heat formula:**

$$\text{heat}(t) = B + A - D$$

**Interpretation:**

| Heat | Meaning | Action |
|------|---------|--------|
| High (>3) | Bottleneck — many tasks waiting on this | Prioritise, assign stronger agent |
| Medium (1–3) | Active work, healthy pressure | Normal scheduling |
| Low (≤0) | Idle or blocked by upstream | May need unblocking or deprioritising |

The heatmap gives agents situational awareness: most-blocked tasks, agent congestion, dependency choke points, and idle work — all without human supervision.

---

## Intelligence Tiering (T0–T5)

SWARM assigns a cognitive tier based on task complexity, then maps tiers to agents and models.

### Complexity Score

$$\text{complexity} = \text{stars} + \text{critical\_path\_weight} + \text{dependency\_count} + \text{heat}$$

### Tier Assignment

| Complexity | Tier | Description |
|------------|------|-------------|
| 0–2 | T0 | Trivial automation (scripts, no LLM) |
| 3–4 | T1 | Cheap LLM iteration (documentation, lint) |
| 5–6 | T2 | Competent coding agent |
| 7–9 | T3 | Complex reasoning / debugging |
| 10–12 | T4 | Consensus / architecture (multi-agent) |
| secure | T5 | Air-gapped local models only |

### Tier → Agent → Provider Mapping

| SWARM Tier | Router Mode | blast_radius | Agent | @provider.tier |
|------------|-------------|--------------|-------|----------------|
| T0 | query | — | scripts / bash | @groq.free / @cline.free |
| T1 | plan | small | @ralph | @anthropic.plan |
| T2 | code | medium | @aiko, @aider | @anthropic.plan / @openai.mini |
| T3 | code | large | @chad, @copilot | @anthropic.code / @copilot.code |
| T4 | code | critical | @claudia, @peers | @anthropic.opus |
| T5 | code (secure) | critical | @olena | @ollama.free (local) |

### @provider.tier Syntax

Inline routing hint — selects provider + model tier in one token:

| Hint | Provider | Model |
|------|----------|-------|
| `@cline.free` | Cline | kwaipilot/kat-coder (OpenRouter, free) |
| `@groq.free` | Groq | llama-3.3-70b-versatile (free) |
| `@anthropic.plan` | Anthropic | claude-haiku-3-5 (cheap) |
| `@anthropic.code` | Anthropic | claude-sonnet-4-5 |
| `@mistral.code` | Mistral | codestral-latest (code-specialised) |
| `@copilot.code` | GitHub | gpt-4.1 |
| `@anthropic.opus` | Anthropic | claude-opus-4-5 (max quality) |

Full reference: [ROUTING.md](../../codex/agents/ROUTING.md)

---

## Token Economy

Because tiering is derived from matrix math, agents cannot abuse expensive models. Token discipline is enforced by mathematical constraint, not policy.

```
80% cheap tasks  → @cline.free / @groq.free   ($0)
15% normal tasks → @aiko / @openai.mini        (<$0.003)
 4% complex tasks→ @chad / @copilot.code       (<$0.006)
 1% critical     → @claudia / @anthropic.opus  (<$0.013)
```

---

## Critical Path Detection

Dependency depth approximates critical path pressure. The scoring formula extends to include depth:

$$\text{score} = 10P + 25S + 100H + 15D$$

Where $D$ = dependency depth (longest chain of hard dependencies to root). Tasks on the critical path naturally surface to the top of the scheduling queue.

When tasks complete, the critical path recomputes instantly. The swarm automatically shifts effort to the next bottleneck — a self-optimising execution model.

---

## Merge Protocol: Git-Native Swarm State

Two forks of Agence can merge their task matrices without corrupting swarm state. No central server needed — just `git merge` + deterministic field rules.

### Field Merge Rules

| Field | Merge Rule |
|-------|-----------|
| `task.id` | Unique key (identity) |
| `task.priority` | `max()` of both shards |
| `task.stars` | `max()` of both shards |
| `task.heat` | `average()` of both shards |
| `task.state` | Highest precedence wins |
| `task.agent` | Preserve shard where state = `&` (running wins) |

### State Precedence

| Precedence | Symbol | Meaning |
|-----------|--------|---------|
| 9 | `&` | Agent executing |
| 8 | `$` | Human working |
| 7 | `%` | Agent assigned |
| 6 | `~` | Human assigned |
| 5 | `?` | Awaiting input |
| 4 | `_` | Paused |
| 3 | `#` | Human-held lock |
| 2 | `!` | Failure |

Precedence is numeric, not arbitrary — derived from the scoring model. Two shards merging always produce the same result regardless of merge order. Commutative and associative — true CRDT semantics without a CRDT library.

### Dependency and Agent Merges

- **Dependencies**: union of both edge sets (deduplicated)
- **Agents**: union by agent name (deduplicated)

### Workflow

```bash
git pull upstream main
airun matrix merge ../fork/organic   # merges tasks + deps + agents
```

This creates a federated swarm: each Git fork is an independent compute shard that can rejoin at any time.

---

## Distributed Work-Stealing

The heatmap + critical path + scoring math provide the signals for agents to automatically steal work from overloaded shards. An agent on a quiet shard can:

1. Fetch remote shard state via `git fetch`
2. Identify high-heat tasks with no agent assigned
3. Claim the task (`state → &`) and push back

The swarm self-balances across repositories without central coordination — a distributed work-stealing scheduler using Git as the transport layer.

---

## Future: Swarm Memory Compression

Solved tasks can produce:
- Knowledge vectors (what was learned)
- Reasoning chains (how it was solved)
- Agent success scores (who performed best)

Future tasks reuse past solutions, giving the swarm collective learning. The `.ailedger` JSONL decision ledger gradually learns which agent/model performs best on which task types and automatically improves routing over time.

Implementable with jq + awk + git objects — no external database required.

---

# CANONICAL SWARM/TANGENT/AGENTD ARCHITECTURE
*Locked April 3, 2026 — supersedes earlier design-session notes*

## Tier Hierarchy

| Tier | Name | Transport | Isolation | Status |
|------|------|-----------|-----------|--------|
| 1 | **swarm** | tmux | per-tangent dev container | current |
| 2 | **flock** | Docker Swarm | container cluster | next |
| 3 | **fleet/horde** | Skupper | multi-cloud mesh | far future |

## Sequent = Human Plane + N Tangents

```
SEQUENT
  ├─ ibash/ishell pane (tmux left)   ← human control plane
  │    kill authority (Ctrl-K = SIGKILL, Ctrl-Z = SIGSTOP)
  │    full filesystem + git access
  │
  └─ tangent-1 (tmux right-1)        ← docker container
  └─ tangent-2 (tmux right-2)        ← docker container
  └─ tangent-N (tmux right-N)        ← docker container
       each tangent:
         - isolated git workspace (volume-mounted clone)
         - own dev container (cannot see sibling tangents)
         - own aibash/aishell session inside container
         - own socat Unix socket for inject
```

**Rule**: Docker is used even for local swarms. Not optional. Safety after 2026-03 symlink incident.

## Why Docker Even Locally

- Blast radius bounded by container filesystem
- Path normalization issues (MSYS2 //c/, cygpath) cannot escape the container
- No cross-agent symlink traversal possible
- Rollback = docker rm + fresh clone — deterministic
- Same isolation model scales unchanged to flock and fleet

## tmux Role (clarified)

tmux is the **observation and control layer** only. It does NOT provide isolation.

- Provides: pane layout, pipe-pane streaming, send-keys inject, human split view
- Does NOT: sandbox filesystem access or replace dev container isolation

Tangents stream output into tmux panes via `docker logs -f | tmux pipe-pane`. Human sees all tangents. Containers cannot see each other.

## agentd vs swarmd

```
agentd (local per-user daemon)
  ├─ spawns docker containers (one per tangent)
  ├─ creates tmux panes (one per tangent + ibash pane)
  ├─ binds pane <-> agent ID mapping (nexus/agentd/)
  ├─ manages socat Unix sockets per agent (inject transport)
  ├─ routes: inject cmd -> socat -> docker exec -> tmux send-keys
  └─ cleans up sockets + containers on sequent teardown

swarmd (cross-sequent orchestrator — future)
  ├─ task queue + heat-based scheduling
  ├─ collision avoidance (no overlapping scopes)
  ├─ human-gated DWM proposals
  └─ dispatches sequents to agentd
```

## Inject Architecture: socat + Unix Sockets + tmux send-keys

FIFOs rejected: blocking, no addressing, orphan on crash, no framing.

```
agence inject @tangent-1 "git status"
  -> echo "git status" | socat - UNIX-CONNECT:/run/agence/tangent-1.sock
  -> agentd listener (socat UNIX-LISTEN:... fork)
  -> docker exec -it tangent-1 tmux send-keys -t aishell "git status" Enter
```

socat `fork` = multiple concurrent injectors, no blocking. Socket per tangent = no cross-talk. Crash cleanup = socket removed with container.

## Matrix-Native Merge Strategy (pre-existing, canonical)

**This predates Docker/dev-container thinking.** The matrix math on TASKS was already designed to handle distributed concurrent agents. This is NOT the external LLM's merge protocol — it is the original design.

**Core invariant**: every agentic change to a git repo must correspond to exactly one agentic **job**, which produces exactly one standard commit. Task ID → commit. No task = no commit. This is how matrix state and git state stay in sync.

```
task state:  & (agent executing) → - (completed)
git state:   working tree dirty  → clean commit tagged with task ID
```

Matrix merge rules (deterministic, no human needed):
- `task.id` = unique key across shards
- `task.priority` = max() of both shards
- `task.stars` = max() of both shards
- `task.heat` = average of both shards
- `task.state` = highest precedence wins: `& > $ > % > ~ > ? > _ > # > !`
- `task.agent` = preserve the shard where state = `&` (running wins)

State precedence is numeric (not arbitrary) — derived from the matrix scoring model. This means **merges are mathematically deterministic**: two shards merging always produce the same result regardless of merge order. Commutative and associative — true CRDT semantics without a CRDT library.

Socket path for agentd: `$AI_ROOT/nexus/agentd/sockets/<tangent-id>.sock` (NOT `/run/agence/` — survives WSL2 reboot, stays inside repo tree, cleaned up with nexus).

## Filesystem Scope Rule

If the repo does not have the file a tangent needs, that tangent should not be doing that work.
- Missing file = scope boundary, not a path problem to solve
- Use ^plan to map the dependency and route to the correct owner
- Use swarm to route to the shard/tangent that has access

## Cognitive Memory — 6-tier COGNOS (shipped v0.6.0-alpha)

```
PERSISTENT (indexed, durable — .jsonl per store)
  synthetic/eidetic/         → distilled knowledge, plans, decisions
  globalcache/semantic/      → shared KB, designs, cross-repo
  organic/episodic/          → tasks, workflows, execution traces
  objectcode/kinesthetic/    → code patterns, solutions, skills
  hermetic/masonic/          → private, local, gated (never auto-loaded)

RUNTIME
  nexus/mnemonic/            → fast working-set cache (hydrated projection)
                               rebuilt: agence ^cache <tags>
                               only mnemonic participates in automatic sequent resolution
```

Operations: `^retain`, `^recall`, `^cache`, `^forget`, `^promote`, `^distill`
Promotion paths: episodic→eidetic, episodic→kinesthetic, kinesthetic→semantic, masonic→eidetic
Schema: MemoryRow JSONL — id, tags, content, source, importance, polarity, ts
Anti-patterns: stored with polarity=negative, excluded from mnemonic hydration

## Pattern Normalisation (error memory matrix)

Pattern ID = `type:md5(normalize(raw))` where:
- normalize strips: absolute paths, line numbers, hex addresses, git SHAs, normalizes case
- type = one of: parse | perm | missing | cmd | timeout | unknown
- NOT raw md5 of output line (semantically useless across different errors)

## TypeScript Runtime

**Bun** — single statically-linked binary, runs TS natively, `bun build --compile` produces self-contained executable. Zero Node/npm on target. Used for: chunk indexer, sequent engine.

## Skupper (fleet/horde) — Shelved

Cross-node tier-system breakage and policy fragmentation risks documented. Security model insufficiently understood. Not prioritised. Requires dedicated swarmd Skupper lifecycle management when revisited.
