# Agent Routing Architecture (Canonical)

This document describes the current routing model and complements the canonical universal `@` routing and state prefix model in `synthetic/l-agence.org/docs/ROUTING.md`.

## Universal Routing Prefix: `@`

- `@` is the universal routing prefix for agents and explicit context routing.
- Common usage:
  - `@agent` — explicit agent selection (for example `@sonya`, `@copilot`)
  - `@agent.model` — explicit model/binary override (for example `@ralph.gpt4o`, `@ralph.aider`)
  - `@` alone — current/default agent or context, when supported by the calling path

## Overview

Agence now uses a **registry-backed routing model**:

- `codex/agents/registry.json` is the source of truth for models, providers, agent types, and skill affinity
- `lib/router.sh` resolves provider/model execution for direct chat and persona/tool launches
- `lib/skill.ts` orchestrates `^` skills, selects an agent from the registry, and routes ensemble work to `lib/peers.ts`
- artifact routing remains a separate helper concern; it is no longer the primary description of agent routing

## Runtime Flow

### Direct agent/chat flow

```text
agence @<agent>[.<override>] <query>
  ↓
bin/agence
  ↓
lib/router.sh
  ├── resolve agent / model / provider
  ├── inject repo + environment context
  └── call selected backend
```

### Skill flow

```text
agence ^<skill> [--agent @<agent>[.<override>]]
  ↓
bin/agence / airun
  ↓
lib/skill.ts
  ├── load skill definition
  ├── load agents from codex/agents/registry.json
  ├── resolve persona / tool / loop agent
  ├── route ensemble skills to lib/peers.ts when needed
  └── save artifact via artifact routing helpers
```

## Routing Types

The registry currently defines four routing types:

- **persona** — direct LLM-backed personas routed through `lib/router.sh`
- **tool** — external binaries such as `claude`, `aider`, `copilot`, `aish`
- **loop** — iterative agents such as `@ralph`
- **ensemble** — consensus agents such as `@peers` and `@pair`, executed through `lib/peers.ts`

## Source of Truth Files

```text
.agence/
├── bin/
│   ├── agence
│   └── airun
├── codex/
│   └── agents/
│       ├── registry.json        ← canonical agent/model/type registry
│       ├── AGENTS.md
│       ├── ROUTING.md
│       └── <agent>/agent.md     ← extended persona/tool docs
└── lib/
    ├── router.sh                ← provider + model routing
    ├── skill.ts                 ← skill orchestration
    ├── peers.ts                 ← ensemble execution
    ├── memory.ts                ← memory stores used by knowledge skills
    └── artifact routing helpers ← save/report output placement
```

## Registry Model

`codex/agents/registry.json` defines:

- model aliases (`opus`, `sonnet`, `gpt4o`, `flash`, …)
- agent type (`persona`, `tool`, `loop`, `ensemble`)
- provider or binary
- default model
- skill affinity
- tier and descriptive metadata

This allows routing decisions to be made from structured metadata instead of hardcoded doc assumptions.

## Invocation Patterns

### Persona

```bash
agence @sonya "Design the API layer"
```

### Tool

```bash
agence !claude
agence !aider
```

### Skill with auto-resolution

```bash
agence ^review src/
agence ^glimpse lib/skill.ts
```

### Skill with explicit override

```bash
agence ^solve --agent @ralph.gpt4o "CI is flaky"
```

### Ensemble

```bash
agence @peers ^review "Is this ready to merge?"
```

## Notes

- Dot-notation applies to the selected agent, not to a separate dispatch layer.
- `agent.md` files remain useful as descriptive persona references, but routing metadata now comes from `registry.json`.
- When documenting routing behavior, prefer `router.sh`, `skill.ts`, `peers.ts`, and `registry.json` over older dispatch-centric descriptions.
