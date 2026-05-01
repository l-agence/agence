# SEC-LABELS: Security Labels & Symbol Grammar

**Version**: 0.4.0  
**Status**: Active  
**Last Updated**: 2026-04-10

---

## Overview

Agence uses inline symbols and metadata tags to encode priority, security, ownership, and dependencies directly in task expressions. This keeps the notation lightweight, shell-friendly, and mathematically interpretable.

---

## Reserved Symbols

| Symbol | Role | Example | Notes |
|--------|------|---------|-------|
| `*` | Priority (star count) | `***task` = priority 3 | Visual scalar — count of `*` |
| `^` | Hard dependency | `^BUILD-001` | Blocks downstream |
| `;` | Soft dependency | `; BUILD-001` | Advisory ordering |
| `,` | List separator | `task1, task2` | Standard |
| `:` | Metadata separator | `repo:task:key=val` | Extensible key-value |
| `@` | Agent/entity routing | `@ralph`, `@sec:internal` | Identity prefix |
| `+` `-` | Pending / completed | `+task`, `-task` | Vector math compatible |
| `~` `$` | Human assigned / working | `~task`, `$task` | Ownership |
| `%` `&` | Agent assigned / executing | `%task`, `&task` | Ownership |
| `_` `#` | Paused / human-held | `_task`, `#task` | Excluded from runnable |
| `!` | Failure | `!task` | Penalty in scoring |
| `?` | Awaiting input | `?task` | Human input pending |
| `>` `<` | Child / parent | `>subtask`, `<parent` | Hierarchy |

---

## Priority

Priority uses star count as a visual scalar:

```
*task      → priority 1
**task     → priority 2
***task    → priority 3
```

Numeric priority is stored in JSON (`"priority": 3`) but the symbolic override stays ergonomic for human use.

---

## Security Labels

Security is encoded as a metadata tag rather than a symbol prefix, avoiding collisions with the already-dense symbol space.

**Syntax**: `:sec=<level>`

| Level | Meaning | Routing |
|-------|---------|---------|
| `public` | No restrictions | Any agent/shard |
| `internal` | Team-visible only | Same-org shards |
| `secret` | Restricted access | Hermetic scope, local agents only |
| `top-secret` | Air-gapped | T5 tier (@olena), no cloud |

**Example:**

```
repo1:task7:sec=internal
repo1:task7:sec=secret
repo1:task7:sec=top-secret
```

Security labels integrate with SWARM intelligence tiering — `sec=secret` and above automatically route to T5 (local models only).

---

## Task Expression Grammar

A task expression combines all metadata inline:

```
TASK := [priority] repo:task [:metadata]* [dependency]*
```

**Full example:**

```
***repo1:task7:agent=@cursor:sec=internal ; repo2:task3
```

**Parsed:**

| Field | Value |
|-------|-------|
| Priority | 3 (three stars) |
| Repository | `repo1` |
| Task | `task7` |
| Agent | `@cursor` |
| Security | `internal` |
| Soft dependency | `repo2:task3` |

This grammar maps directly to:
- **Vector elements** — scoring and priority math
- **Matrix nodes** — task state representation
- **Graph edges** — dependency DAG

---

## Metadata Keys

Standard metadata keys (extensible):

| Key | Value | Example |
|-----|-------|---------|
| `agent` | Agent assignment | `:agent=@ralph` |
| `sec` | Security label | `:sec=internal` |
| `tier` | Intelligence tier | `:tier=T2` |
| `cost` | Token cost cap | `:cost=0.003` |

All metadata is trivially parseable with jq:

```bash
jq -r '.tasks[] | select(.security == "internal")' tasks.json
```

---

## Design Rationale

**Why metadata tags instead of symbol prefixes for security?**

Most common symbols are already reserved for task state and dependency operators. Using `:sec=` avoids collision, supports future extensibility, and stays consistent with the `:key=value` metadata pattern already used for agent assignment.

**Why stars for priority?**

Stars (`*`) are universally associated with importance, do not conflict with shell arithmetic, and scale visually — `***` is immediately recognisable as high priority.

---

*See also: [SYMBOLS.md](SYMBOLS.md) | [MATRICES.md](MATRICES.md) | [SWARM.md](SWARM.md)*
