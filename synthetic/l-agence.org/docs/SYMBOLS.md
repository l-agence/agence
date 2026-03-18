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

## Canonical State Prefix Table

| Prefix | Meaning                        | Who/When                |
|--------|-------------------------------|-------------------------|
| ~      | Human assigned                | Human, ready to start   |
| $      | Human in progress             | Human, actively working |
| %      | Agent assigned                | Agent, queued           |
| &      | Agent executing               | Agent, running          |
| _      | Paused/deferred               | Either                  |
| #      | Held by human                 | Human, locked           |
| +      | Pending addition              | Either                  |
| -      | Completed                     | Either                  |
| ^      | Hard dependency               | N/A                     |
| ;      | Soft dependency               | N/A                     |
| >/<    | Child/parent task             | N/A                     |
| @      | Routing (agent/org/etc.)      | N/A                     |

## Additional Symbols

| Symbol | Meaning / Use Case                | Notes / Examples                       |
|--------|-----------------------------------|----------------------------------------|
| *      | Priority                         | Numeric or star-based priority         |
| token_cost | Cost in tokens / resource     | Used for heatmap routing               |
| :      | Metadata separator               | repo:task:agent format                 |
| F(x)   | Function notation                | Standard linear algebra reference      |
| M(x)   | Matrix notation                  | Generic matrix assignment (A=M(x))     |
| [ , ]  | Reserved for arrays/lists/matrix | Not used for task states               |
| !task  | Task failed or warning           | Triggered when task errors             |
| ?task  | Task waiting on input            | Suspended until resolved               |
| ~=     | Human-assigned (alt. notation)   | Optional shorthand                     |
| %completion | Completion/progress calc     | Used in workflows/projects             |

---

All code, docs, and examples must use these symbols and prefixes consistently.

**Routing reference:** `codex/agents/ROUTING.md`  
**Version:** 0.3.0 — last updated 2026-03-18
