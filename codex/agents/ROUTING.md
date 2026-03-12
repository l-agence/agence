
# Agence Command & Task Routing Constructs

| Symbol / Prefix | Meaning / Use Case | Notes / Examples |
|-----------------|-------------------|------------------|
| ~task           | Human-assigned, working | Assigned by human, ready to start |
| $task           | Human actively working | Human currently executing task |
| %task           | Agent-assigned | Swarm chooses agent for execution |
| &task           | Agent actively executing | Running independently without human intervention |
| _task           | Paused / deferred | Task temporarily held, can be resumed |
| #task           | Held by human | Requires human unlocking to proceed |
| +task           | Pending addition | Task created but not yet started |
| -task           | Completed task | Marks successful completion |
| ^task           | Hard dependency | Must complete before dependent tasks |
| ;<task>         | Soft dependency | Can run in parallel but logically dependent |
| >subtask        | Child task | Subtask of a parent task |
| <subtask        | Parent task | Parent of a given subtask |
| *               | Priority | Numeric or star-based priority indicator |
| token_cost      | Cost in tokens / resource allocation | Used for heatmap routing to appropriate agent/model |
| @agent          | Explicit agent routing | e.g., @copilot, @ralph, @ollama |
| @               | Default agent / current agent | Shorthand for auto-selection |
| @org:shard:team:sec-label | Security and routing path | e.g., @acme.ltd:shard1:teamA:secret |
| ~commit         | Hermetic knowledge commit | Local-only knowledge saved, not shared upstream |
| ^commit         | Synthetic knowledge commit | Shared knowledge saved in default shard |
| ~share          | Share hermetic object selectively | ~share lesson42.json @team |
| ; (in ;<task>)  | Soft dependency operator | Allows parallel start |
| :               | Metadata separator | repo:task:agent format |
| F(x)            | Function notation | Standard linear algebra function reference |
| M(x)            | Matrix notation | Generic matrix assignment (A=M(x)) |
| [ , ], { , }    | Reserved for arrays / lists / matrices | Not used for task states to avoid confusion |
| !task           | Task failed or warning | Triggered when task errors |
| ?task           | Task waiting on human or agent input | Suspended until resolved |
| ~=              | Human-assigned (alternative notation) | Optional shorthand for clarity |
| %completion     | Completion / progress calculation | Used in workflows / projects |
| workflow = sum(tasks) | Matrix math / aggregation | Sum of negative elements = progress, positive = remaining |
| project = sum(workflows) | Project-level matrix calculation | Aggregates multiple workflows |

**Notes:**

- **Task states and ownership:**
   - Humans: ~, $, #, _
   - Agents: %, &
- **Dependencies:**
   - Hard ^ must complete first
   - Soft ; can run in parallel but still dependent logically
   - Child/parent subtasks: > and <
- **Routing & security:**
   - @ symlinks for default org/agent
   - Full security routing path for selective sharing and agent assignment
- **Matrix / workflow:**
   - Arithmetic symbols +/- represent task state in matrix
   - Aggregation is additive, supports linear algebra calculations
- **Knowledge types:**
   - Hermetic = local only
   - Synthetic = shared in default org/shard

---

# Agent Routing (Legacy Section)

Dynamic agent and LLM model routing for Agence.

## Overview

Agence supports three routing levels:

1. **Agent Personas** (@agent_name): Pre-tuned system prompts + model + personality
2. **Direct Model References** (@model_name): Use a specific LLM model
3. **Default Fallback**: Via symlink `@` or auto-select current model

## Syntax

```bash
# Agent persona (lowest token overhead)
agence @claudia "Design a monitoring strategy"

# Direct model reference
agence @opus4.5 "Explain this error"
agence @gpt-4o "Review this code"

# Default (uses @ symlink or fallback)
agence "What should I do here?"
```

## Agent Directory Structure

```
.agence/codex/agents/
├── @                          ← Symlink to default agent (optional)
├── aider/
│   └── agent.md              ← Aider persona (tool-based, offline)
├── chad/
│   └── agent.md              ← Chad persona (DevOps, rude, Cockney)
├── claudia/
│   └── agent.md              ← Claudia persona (SRE architect, elegant)
├── aiko/
│   └── agent.md              ← Aiko persona (Cloud architect, gamer)
├── olena/
│   └── agent.md              ← (TBD) Custom persona
├── pilot/
│   └── agent.md              ← (TBD) Autonomous execution
├── ralph/
│   └── agent.md              ← Ralph persona (Learning + reliability harness)
├── sonia/
│   └── agent.md              ← (TBD) Custom persona
└── ROUTING.md                 ← This file
```

## Agent Metadata

Each `agent.md` contains:
- **Identity**: Who this agent is
- **Model Routing**: Which LLM + provider + params + **flavor_intensity (0-10)**
- **System Prompt**: Minimal, token-efficient prompt
- **Behavior**: How the agent operates (interactive, batch, tool-based)
- **Personality**: Flavor profile
- **Token Cost**: Estimated overhead

### Flavor Intensity (0-10 Scale)

**flavor_intensity** controls personality injection without token bloat:

```
0   = Pure technical (no personality)
2-3 = Subtle hints (professional)
5   = Balanced default
6-8 = Strong personality (recommended for learning)
10  = Maximum flavor (chaotic, fun)
```

**Per-agent defaults:**
- **Aider**: 0 (tool-based, no personality needed)
- **Claudia**: 2 (professional mentor, subtle)
- **Chad**: 5 (Cockney humor balanced with utility)
- **Aiko**: 6 (gamer refs enhance learning)

**User can override:**
```bash
agence @chad --flavor=2 "Prod config review"      # Toned down
agence @aiko --flavor=9 "Design my app"          # Full personality
```

## Model Aliases

Models can be referenced by:

### Anthropic Claude
```
@claude           → claude-3-5-sonnet (default)
@haiku            → claude-3-5-haiku
@opus             → claude-3-opus
@sonnet           → claude-3-5-sonnet
```

### OpenAI
```
@gpt-4o           → gpt-4o
@gpt-4-turbo      → gpt-4-turbo-preview
@gpt-4            → gpt-4
@chatgpt          → gpt-4o (or current default)
```

### Qwen (via Ollama)
```
@qwen7b           → qwen:7b
@qwen14b          → qwen:14b
@qwen72b          → qwen:72b
```

## Routing Resolution Order

When user types `agence @<name> <query>`:

1. **Check if agent**: Is `./agents/<name>/agent.md` present?
   - Yes → Load agent persona, extract model, inject system prompt
   - No → Continue to step 2

2. **Check if model alias**: Is `<name>` in model alias list?
   - Yes → Load model config directly
   - No → Continue to step 3

3. **Check default symlink**: Does `.agence/agents/@` exist?
   - Yes → Use default agent
   - No → Fall through to step 4

4. **Auto-select**: Use current configured model or VS Code chat default

## Token Efficiency

Agents optimized for minimal token overhead (cost-aligned with LLM pricing):

```
aider        ~5 tokens   (offline, tool-based)
chad         ~10 tokens  (gpt-4o, cheapest LLM)
aiko         ~10 tokens  (haiku, 1/3 of claudia)
ralph        ~20 tokens  (sonnet, learning-focused)
claudia      ~30 tokens  (opus 4.5, most detailed)
```

Compare to: Typical non-optimized persona systems = 100-300+ tokens

## Example: Setting Default Agent

```bash
# Make Claudia the default agent
cd .agence/codex/agents
ln -s claudia/@

# Now these are equivalent:
agence @claudia "Design the architecture"
agence "Design the architecture"           # Uses @ symlink
```

## Implementation

### Router Module (`lib/router.sh`)
Implements:
- `router_resolve_agent <name>`  → Returns model + system_prompt
- `router_inject_context <agent>` → Adds git/repo context
- `router_call_llm <agent> <query>` → Execute with persona
- `router_cache_agent <name>` → Cache parsed agent metadata

### CLI Integration
```bash
# In bin/agence, mode_chat() calls:
router_resolve_agent <@name>
router_inject_context <agent>
router_call_llm <agent> <query>
```

## Adding New Agents

1. Create directory: `agents/<agent_name>/`
2. Create `agent.md` with metadata
3. Test: `agence @<agent_name> "test query"`
4. Optional: symlink as default `ln -s <agent_name> @`

---

**Version**: 0.1.0 (alpha)
**Last Updated**: 2026-03-04
