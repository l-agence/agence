# SHARDING: Git-Native Swarm Distribution

**Version**: 0.4.0  
**Status**: Active  
**Last Updated**: 2026-04-10

---

## Overview

Agence uses Git as both coordination layer and distribution mechanism. Each Git fork becomes simultaneously:

- A **compute shard** (agents running jobs)
- A **state shard** (matrix data in `organic/`)
- A **human console** (readable task/workflow/project state)

No central server, no database, no custom transport.

---

## Core Architecture

```
Git     = coordination layer
Matrices = swarm state
Agents  = compute
```

Each fork is a self-contained swarm node:

```
agence-shard/
  organic/           ← shared upstream (tasks, workflows, projects)
    tasks.json
    workflows.json
    projects.json
    deps.json
  nexus/             ← local only (sessions, logs, ledger)
  hermetic/          ← local only (private knowledge)
```

Only `organic/` is shared upstream. Everything else stays local.

---

## Fork-Based Topology

Forks create natural shard boundaries:

```
        upstream/agence
              │
    ┌─────────┼──────────┐
    │         │          │
team-a/     team-b/    team-c/
agence      agence     agence
    │         │          │
 agents    agents     agents
```

Each fork maintains its own TASKS, WORKFLOWS, and PROJECTS matrices but shares Git ancestry, making collaboration straightforward.

---

## Sharding by Repository

Tasks belong to exactly one repository. The natural shard boundary is the repo itself.

Cross-repo workflows reference tasks by qualified name:

```
repo-web:DEPLOY-001
    ^ repo-api:TEST-001
    ^ repo-auth:BUILD-001
```

The DAG engine resolves dependencies across shard boundaries.

---

## Agent Discovery Across Forks

Agents discover cross-shard work by adding remotes:

```bash
git remote add swarmA github.com/team-a/agence
git remote add swarmB github.com/team-b/agence
git fetch --all
```

Then merge matrix snapshots:

```bash
airun matrix merge ../team-a/organic    # union tasks + deps + agents
```

See [SWARM.md § Merge Protocol](SWARM.md#merge-protocol-git-native-swarm-state) for deterministic field merge rules.

---

## Conflict Avoidance

The task model prevents most conflicts by design:

- Each task maps to exactly one commit (`task.id → commit`)
- Only one commit satisfies a task
- Once merged upstream: task → completed → every shard sees it

State precedence rules (see [SWARM.md](SWARM.md)) make merge order irrelevant — CRDT semantics.

---

## Integrity: Ledger Root Snapshots

Local ledger (`nexus/.ailedger/`) remains private, but shards publish a Merkle root snapshot:

```
organic/ledger_root.txt
2026-04-10
root=4e91b8c8d4...
```

Other shards can verify integrity without seeing raw logs.

---

## Scaling via Forking

When matrices grow too large, fork into new swarm shards:

```
agence-core          (framework)
agence-enterprise    (org-specific tasks)
agence-research      (experimental work)
```

Each swarm runs independently but shares code. This mirrors how Linux distributions scale via forks.

---

## Human-Readable Console

Because matrices are JSON, the repository itself is the dashboard:

```bash
git pull
jq '.tasks[] | "\(.id) [\(.state)] p=\(.priority)"' organic/tasks.json
```

No UI required for basic visibility. See [DASHBOARDS.md](DASHBOARDS.md) for rendered views.

---

## Why Git Solves Everything

| Problem | Solved By |
|---------|-----------|
| Authentication | Git SSH keys |
| Consensus | Git merges |
| Sharding | Forks |
| History | Git DAG |
| Integrity | Merkle trees |
| Coordination | Matrices |

Agence code handles only: task math, dependency propagation, and agent scheduling. Everything else delegates to battle-tested Git infrastructure.

---

*See also: [SWARM.md](SWARM.md) | [MATRICES.md](MATRICES.md) | [ARCHITECTURE.md](ARCHITECTURE.md)*
