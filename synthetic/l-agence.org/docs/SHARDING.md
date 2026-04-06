# AGENCE GIT-BASED SHARDING

Agence is essentially Git-native swarm sharding, where each fork becomes both:

- a compute shard (agents running jobs)
- a state shard (matrix data)
- a human console (readable knowledgebases, readable tasks/workflows/project state)

**Note:** This document describes the foundational matrix architecture (valid for all versions). State prefixes used in examples follow the **Agent-Level** hierarchy (v0.2.3–v0.3.1). When Skupper integration arrives (v0.3.2+), Swarm-Level prefixes (`~`, `$`) will coordinate across shards. See [SYMBOLS.md](SYMBOLS.md) for the complete hierarchical model.

That is a very elegant architecture.


1️⃣ The Core Principle

we already chose the correct primitive:

Git = coordination layer
Matrices = swarm state
Agents = compute

Each fork becomes a self-contained swarm node.

agence-root
 ├─ organic/
 │   ├─ tasks.json
 │   ├─ workflows.json
 │   └─ projects.json
 │
 ├─ nexus/
 │   ├─ .aisessions/
 │   ├─ .airuns/
 │   └─ .ailedger/
 │
 └─ orchestrator/
     └─ swarm/

Only organic/ is shared upstream.

Everything else stays local/private.

2️⃣ Forks Become Natural Shards

Example:

upstream/agence
      │
 ┌────┴───────────────┐
 │                    │
team-a/agence     team-b/agence
 │                    │
 │                    │
agent nodes       agent nodes

Each fork has its own:

- TASK MATRIX
- WORKFLOW MATRIX
- PROJECT MATRIX

But they still share Git ancestry.

So collaboration remains easy.

3️⃣ Sharding by Repository

Since tasks belong to exactly one repo, the natural shard boundary is already present.

Example swarm:

- repo-auth
- repo-api
- repo-web
- repo-docs

Each repository has its own task space.

Workflows simply reference cross-repo tasks:

repo-web:deploy
    ^ repo-api:test
    ^ repo-auth:build

This is perfect for your DAG engine.

4️⃣ Human Readable Console

Because matrices are simple JSON or CSV, the repository itself becomes the dashboard.

Example:

organic/tasks.json
[
  { "task":"repo-auth:add_saml", "state":"done" },
  { "task":"repo-web:update_docs", "state":"running" },
  { "task":"repo-api:fix_bug42", "state":"pending" }
]

Anyone can inspect:

git pull
jq

or build dashboards later.

You don't need a UI initially.

5️⃣ Natural Scaling Through Forking

When matrices grow too large:

fork → new swarm shard

Example:

- agence-core
- agence-enterprise
- agence-research

Each swarm runs independently but still shares code.

This is very similar to how Linux distributions scale via forks.

6️⃣ How Agents Discover Work Across Forks

Agents simply add additional remotes.

Example:

git remote add swarmA github.com/team-a/agence
git remote add swarmB github.com/team-b/agence

Then periodically:

git fetch --all

Agents can merge matrix snapshots:

tasks = union(all forks)

Then compute priorities.

7️⃣ Conflict Avoidance

Your task model already prevents most conflicts:

task = repo:commit

Only one commit satisfies a task.

Once merged upstream:

task → completed

Every shard sees completion automatically.

8️⃣ Your Ledger Still Works

Local ledger:

nexus/.ailedger/

remains private.

But you publish a Merkle root snapshot.

Example:

organic/ledger_root.txt
2026-03-12
root=4e91b8c8d4...

Other shards can verify integrity without seeing raw logs.

9️⃣ This Produces a True Swarm Topology

Your network eventually looks like this:

        upstream
           │
   ┌───────┼────────┐
   │       │        │
 shardA  shardB   shardC
   │       │        │
agents   agents   agents

Each shard:

runs jobs

updates matrices

merges upstream

The swarm self-organizes via Git.

No central coordinator required.

🔟 Why This Is Architecturally Strong

You are leveraging existing battle-tested systems:

Problem	Solved by
auth	Git keys
consensus	Git merges
sharding	forks
history	Git DAG
integrity	Merkle trees
coordination	matrices

Your code only handles:

task math
dependency propagation
agent scheduling

Which keeps the system extremely small.