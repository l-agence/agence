# Agent Routing Architecture (Canonical)

This document describes the agent routing architecture and references the canonical universal `@` routing and state prefix model. All code and documentation must conform to the canonical definitions in synthetic/l-agence.org/docs/ROUTING.md.

## Universal Routing Prefix: `@`

- `@` is the universal routing prefix for agent, org, team, repo, security label, etc.
- Usage patterns:
  - `@agent` — explicit agent routing (e.g., @ralph, @copilot)
  - `@org`, `@team`, `@shard`, `@sec` — explicit org/team/shard/security routing
  - `@` alone — default/current agent or context (resolved via symlink or config)
- Appears in metadata: `agent=@ralph`, `org=@acme.ltd`, `sec=@internal`
- Supported in all command grammars and EBNF definitions.

## Canonical State Prefix Table

See synthetic/l-agence.org/docs/ROUTING.md for the canonical state prefix table and full glossary.



## Overview

Agence uses a **three-tier agent/model routing system** for flexible LLM persona management with minimal token overhead.

## Architecture

```
User Input: agence @<name> <query>
    ↓
bin/agence (entry point)
    ├── Detects @ prefix
    └── Calls: mode_chat() with @<name>
         ↓
         lib/router.sh (router_resolve)
         ├── Check: Is <name> an agent?
         │   ├── Yes → router_parse_agent() → Load agent.md
         │   │        Extract: model, system_prompt, behavior
         │   │        Token cost: ~40-60 tokens
         │   └── No → Continue to step 2
         │
         ├── Check: Is <name> a model alias?
         │   ├── Yes → router_resolve_model() → Load model config
         │   │        Token cost: 0 tokens (direct call)
         │   └── No → Continue to step 3
         │
         └── Check: Default agent via @ symlink?
             ├── Yes → Use symlinked agent
             └── No → Fall back to auto-select

         ↓
         router_inject_context()
         ├── Add git branch/remote
         ├── Add repo org/project/env
         └── Enhance system prompt with environment

         ↓
         router_init_provider()
         └── Load API credentials
             (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)

         ↓
         LLM Provider (anthropic/openai/ollama)
         └── Execute: system_prompt + query → response
```

## File Structure

```
.agence/
├── .github/
│   ├── agence.md                  ← Framework spec
│   ├── copilot-instructions.md    ← LLM-agnostic guidelines
│   ├── CLAUDE.md                  ← Claude-specific config
│   └── AGENTS.md ← Quick reference (this section)
│
├── bin/
│   ├── agence                     ← Entry point (330 lines)
│   └── commands.json              ← Allowed external commands
│
├── lib/
│   ├── router.sh                  ← Agent/model resolution (341 lines)
│   ├── logging.sh                 ← Logging utilities (TBD)
│   └── utils.sh                   ← Common helpers (TBD)
│
├── codex/
│   └── agents/
│       ├── ROUTING.md             ← Routing specifications
│       ├── AGENTS.md              ← Agent quick reference
│       ├── @                      ← Symlink to default agent (optional)
│       ├── aider/
│       │   └── agent.md           ← (aider) Aider session (~40 tokens) - aider coding agent
│       ├── chad/
│       │   └── agent.md           ← (chatGPT) (~0 tokens) - low cost optimized but reliable CloudOps/DevOps.
│       ├── claudia/
│       │   └── agent.md           ← (opus) (~60 tokens) -Visionary, Principal SRE and architect. Full stack evolution.
│       ├── aiko/
│       │   └── agent.md           ← (haiku) Fast/lightweight architecture HLA, prototypes or CI/CD DevOps. Disruptive innovation.
│       ├── olena/
│       │   └── agent.md           ← (ollama) (~0 tokens) secure On-Premises Local ollama agents with guardrails.
│       ├── pilot/
│       │   └── agent.md           ← (copilot) GitHub Copilot agent sessions.
│       ├── ralph/
│       │   └── agent.md           ← (ralph) Ralph Wiggum recursion loops with principal Skinner harness
│       └── sonya/
│           └── agent.md           ← (sonnet) Sr SRE and Full Stack developer. tricky problems. Obsession with Code beauty.
│
└── modules/
    ├── git/
    │   └── git.sh                 ← Git operations module
    ├── iac/
    │   └── iac.sh                 ← Terraform/Bicep module
    └── cloud/
        └── aws.sh                 ← Cloud platform module
```

## Agent Metadata Format

Each `agent.md` contains:

```markdown
# Agent: <Name>

## Identity
Who this agent is and their background

## Behavior
How the agent operates:
- **Default Mode**: interactive, batch, background, tool-based
- **Execution**: via CLI, direct LLM, middleware

## Expertise
Domain specialization

## Model Routing
```json
{
  "model": "claude-3-5-sonnet",
  "provider": "anthropic",
  "temperature": 0.6,
  "max_tokens": 3000
}
```

## System Prompt (minimal)
```
2-3 sentences defining persona and behavior.
Optimized for lowest token overhead.
```

## Examples
Usage examples and expected output.

---

**Token Cost**: ~60 tokens (prompt) + output
**Latency**: ~2-4s
**Best For**: [use cases]
```

## Token Efficiency

| Agent | Prompt Tokens | Advantage |
|-------|---------------|-----------|
| Aider | ~40 | Offline/tool-based | 
| Chad | ~50 | Fast, direct |
| Claudia | ~60 | Deep expertise |
| Direct Model | 0 | No persona overhead |
| Default @ | 0-60 | Configured for task |

**Key**: System prompts are *minimal* (2-3 sentences) to keep token overhead low.

Compare to typical LLM persona systems: 150-300+ tokens per query.

## Invocation Patterns

### Pattern 1: Chat with Agent Persona
```bash
agence @claudia "Design the API layer"
# → Loads claudia agent
# → Injects minimal system prompt (~60 tokens)
# → Adds git/repo context
# → Calls claude-3-5-sonnet
```

### Pattern 2: Direct Model Call (No Persona)
```bash
agence @gpt-4o "Quick answer?"
# → Direct model mapping
# → No persona system prompt
# → Minimal overhead
```

### Pattern 3: Default Agent
```bash
agence "What should I do?"
# → Resolves @ symlink (or auto-select)
# → Uses configured default agent
```

## Implementation Checklist

- [x] Entry point routing in `bin/agence`
- [x] Router library in `lib/router.sh` with:
  - [x] `router_resolve_name()` → agent or model
  - [x] `router_parse_agent()` → extract config
  - [x] `router_resolve_model()` → alias to model
  - [x] `router_inject_context()` → git/repo context
  - [x] `router_init_provider()` → load API creds
  - [x] `router_chat()` → main entry function
- [x] Agent definitions:
  - [x] Aider (tool-based, offline)
  - [x] Chad (DevOps, sarcastic)
  - [x] Claudia (SRE architect, mentor)
- [x] Routing docs in `codex/agents/ROUTING.md`
- [x] Agent reference in `codex/agents/AGENTS.md`
- [ ] Support files: `lib/logging.sh`, `lib/utils.sh` (TBD)
- [ ] LLM client integration (TBD)
- [ ] Tests (TBD)

## Next Steps

1. **Implement LLM clients** (`lib/llm_provider.py` or similar)
2. **Integrate with entry point** (wire `mode_chat()` to `router_chat()`)
3. **Add remaining agents** (haiku, lima, pilot, ralph, sonny)
4. **Build domain modules** (git, IaC, cloud)
5. **Add knowledge management** (RAG integration)
6. **Create tests** (unit + integration)

---

**Version**: 0.1.0 (alpha)
**Last Updated**: 2026-03-04
**Status**: Routing architecture defined, core agents created
