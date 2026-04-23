# Agence Canonical Symbols Table (SYMBOLS.md)

This document defines the canonical symbols, prefixes, and routing constructs for Agence. All code, documentation, and help output must conform to these definitions.

## Universal Routing Prefix: `@`

- `@` is the universal routing prefix for agent, org, team, repo, security label, etc.
- Usage patterns:
  - `@agent` — explicit agent routing (e.g., @ralph, @copilot)
  - `@org`, `@team`, `@shard`, `@sec` — explicit org/team/shard/security routing
  - `@` alone — default/current agent or context (resolved via symlink or config)
- Appears in metadata: `agent=@ralph`, `org=@acme.ltd`, `sec=@internal`
- Supported in all command grammars and EBNF definitions.

### `@provider.tier` — Inline Model Routing Hints  (v0.3.0)

The dotted suffix selects provider + model tier in a single token:

```
@<provider>.<tier>    → AGENCE_LLM_PROVIDER + mode model for that tier
@<provider>.<model>   → AGENCE_LLM_PROVIDER + explicit AGENCE_LLM_MODEL
@<agent>              → named agent persona (see codex/agents/AGENTS.md)
```

Standard tier suffixes:

| Suffix   | Cost tier | Typical model                          |
|----------|-----------|----------------------------------------|
| `.free`  | T0 free   | kwaipilot/kat-coder, groq/llama        |
| `.plan`  | T1 cheap  | haiku-3-5, gpt-4o-mini, gemini-flash   |
| `.code`  | T2/T3     | claude-sonnet-4-5, gpt-4o, codestral   |
| `.query` | T0        | alias for `.free`                      |

Examples:
- `@cline.free` → cline provider via OpenRouter → `kwaipilot/kat-coder-latest` (free)
- `@anthropic.code` → anthropic + `claude-sonnet-4-5`
- `@mistral.code` → mistral + `codestral-latest`
- `@copilot.auto` → copilot + `auto` (GitHub picks model)
- `@groq.free` → groq + `llama-3.3-70b-versatile` (free tier)

Full reference: `codex/agents/ROUTING.md`

## Canonical State Prefix Table (Hierarchical)

### Agent-Level Scope (v0.2.3–v0.3.1, Currently Active)

| Prefix | Sign | Meaning                   | Who/When                    | Example |
|--------|------|---------------------------|-----------------------------|----------|
| +      | +1   | Pending/todo              | In queue, not assigned      | +task |
| &      | +1   | Agent assigned            | Agent queued, not executing | &task@ralph |
| %      | +1   | In-progress (agent/human) | Actively working            | %task@ralph |
| -      | -1   | Completed                 | Work done (terminal state)  | -task |
| _      | 0    | Paused/deferred           | Either human or agent       | _task@ralph |
| #      | 0    | Held by human             | Human lock (blocked)        | #task@user |

### Swarm-Level Scope (v0.3.2+, Skupper Integration, RESERVED)

| Prefix | Sign | Meaning                   | Use Case | Example | Note |
|--------|------|---------------------------|----|---------|-------|
| ~      | +1   | Swarm accepted/queued     | Multi-agent coordination | ~task | Swarm has it, not yet delegated to agent |
| $      | +1   | Swarm coordinating        | Merge + sync across agents | $task | Swarm consolidating results |

**Note**: Swarm-level prefixes `~` and `$` are reserved for future use. Do NOT use them in v0.2.3–v0.3.1 code. They will be activated with Skupper integration (v0.3.2+).

### Dependency & Routing Operators

| Operator | Meaning                     | Who/When |
|----------|-----------------------------|-----------|
| ^        | Hard dependency             | N/A      |
| ;        | Soft dependency / pause     | N/A      |
| >/<      | Child/parent task           | N/A      |
| @        | Routing (agent/org/sec)     | N/A      |

## Priority & Metrics Symbols

| Symbol | Meaning / Use Case                | Notes / Examples                       |
|--------|-----------------------------------|----------------------------------------|
| *      | Low priority                     | One star = low urgency                 |
| **     | Medium priority                  | Two stars = medium urgency             |
| ***    | High priority                    | Three stars = high urgency             |
| %completion | Completion/progress calc     | Sum of negative tasks / total tasks    |

**Usage**: `***&task@ralph` (urgent assignment), `*+task` (low-priority pending)

## Matrix Mathematics Symbols

| Symbol | Meaning / Use Case                | Notes / Examples                       |
|--------|-----------------------------------|----------------------------------------|
| :      | Metadata separator               | repo:task:index@agent format           |
| F(x)   | Function notation                | Standard linear algebra reference      |
| M(x)   | Matrix notation                  | Generic matrix assignment (A=M(x))     |
| [ , ]  | Arrays/lists/matrix containers   | Workflow notation: [task1, task2; task3] |

## Special States (Error/Waiting Conditions)

| Symbol | Meaning / Use Case                | Notes / Examples                       |
|--------|-----------------------------------|----------------------------------------|
| !task  | Task failed or warning           | Error state (recoverable)              |
| ?task  | Task waiting on input            | Suspended until human resolves         |

---

## Composition Examples

### Agent-Level Workflow (Current)

```
WF1 = [ +task1, +task2; +task3 ]
  ↓ (assign)
WF1 = [ &task1@ralph, &task2@aider; &task3@ralph ]
  ↓ (execute)
WF1 = [ %task1@ralph, %task2@aider; %task3@ralph ]
  ↓ (complete)
WF1 = [ -task1, -task2, -task3 ]
```

### Swarm-Level Workflow (Future, v0.3.2+)

```
WF1 = [ ~task1, ~task2; ~task3 ]                (swarm queued)
  ↓ (assign)
WF1 = [ &task1@ralph, &task2@aider; &task3@ralph ] (agent assigned)
  ↓ (execute)
WF1 = [ %task1@ralph, %task2@aider; %task3@ralph ] (agent working)
  ↓ (swarm merge)
WF1 = [ $task1, $task2; $task3 ]                (swarm coordinating)
  ↓ (complete)
WF1 = [ -task1, -task2, -task3 ]                (all done)
```

---

All code, docs, and examples must use these symbols and prefixes consistently.

**Routing reference:** `codex/agents/ROUTING.md`  
**Matrix reference:** `synthetic/l-agence.org/docs/MATRICES.md`  
**Sharding reference:** `synthetic/l-agence.org/docs/SHARDING.md`  
**Version:** 0.3.1 — Hierarchical state model (Agent + Swarm reserved) — last updated 2026-03-31
