# Agence Model Routing Reference  (v0.3.0)

> This is the canonical routing reference. See also:
> - `lib/router.sh` — implementation
> - `synthetic/l-agence.org/docs/SWARM.md` — swarm intelligence tiers
> - `synthetic/l-agence.org/docs/SYMBOLS.md` — symbol/prefix table

---

## Routing Layers (precedence, highest first)

```
1. AGENCE_LLM_MODEL=<model>     explicit override — always wins
2. AGENCE_BLAST_RADIUS=<level>  code scope override (v0.5)
3. AGENCE_ROUTER_MODE=<mode>    operational mode (query|plan|code)
4. AGENCE_LLM_PROVIDER=<name>   provider selection
5. Auto-detection               first configured API key wins
```

---

## Operational Modes  (AGENCE_ROUTER_MODE)

| Mode    | Tier    | Purpose                                    | Danger  |
|---------|---------|------------------------------------------- |---------|
| `query` | T0/free | General Q&A, status, quick lookups         | Minimal |
| `plan`  | T1/cheap| Architecture, step planning, analysis      | Low     |
| `code`  | T2/T3   | Code gen, editing, execution, tool calls   | HIGH    |

**Alignment with Cline/Aider:**
- `query` = background status / trivial chat
- `plan`  = Cline Plan mode / Aider `--architect`
- `code`  = Cline Act mode / Aider `--editor-model`

**Usage:**
```bash
AGENCE_ROUTER_MODE=code  agence "write unit tests for lib/router.sh"
AGENCE_ROUTER_MODE=plan  agence "how should we restructure the swarm?"
AGENCE_ROUTER_MODE=query agence "what branch am I on?"
```

**Convenience wrappers (from router.sh):**
```bash
router_query "what is X?"    # T0 free
router_plan  "how to do X?"  # T1 cheap
router_code  "write X"       # T2/T3 capable
```

---

## blast_radius — code mode sub-tiers  (AGENCE_BLAST_RADIUS, v0.5)

Refines the `code` mode by scope of impact:

| Level      | Tier   | LOC / Scope                              | Model tier       |
|------------|--------|------------------------------------------|------------------|
| `small`    | T0/T1  | <100 lines, standalone, no shared deps   | kwaipilot, haiku |
| `medium`   | T1/T2  | 100–500 lines, 1–2 lib touches           | haiku, gpt-4o-mini |
| `large`    | T2/T3  | 500–1000+ lines, shared lib, many callers| sonnet, gpt-4o   |
| `critical` | T3/T4  | 1000+ lines, cross-repo, release commit  | opus, gpt-o1     |

**Swarm integration:** `bin/swarm` cross-repo runs set `AGENCE_BLAST_RADIUS=critical` automatically.

**Usage:**
```bash
AGENCE_BLAST_RADIUS=critical agence "commit release across all repos"
AGENCE_BLAST_RADIUS=small    agence "write a 10-line log rotation script"
```

---

## @provider.tier Routing Hint Syntax

The `@<provider>.<tier>` syntax is an inline routing hint that selects
provider + model tier in a single token:

```
@<provider>.<tier>    → AGENCE_LLM_PROVIDER=<provider> + mode model for <tier>
@<provider>.<model>   → AGENCE_LLM_PROVIDER=<provider> + AGENCE_LLM_MODEL=<model>
@<agent>              → route to named agent persona (see AGENTS.md)
```

### Standard tier aliases

| Alias   | Maps to          | Example models                          |
|---------|------------------|-----------------------------------------|
| `.free` | T0 free          | kwaipilot/kat-coder, groq/llama, ollama |
| `.plan` | T1 cheap (plan)  | haiku-3-5, gpt-4o-mini, gemini-flash    |
| `.code` | T2/T3 (code)     | claude-sonnet-4-5, gpt-4o, codestral    |
| `.query`| T0 (alias free)  | same as .free                           |

### Provider routing hint examples

| Hint              | Provider   | Route / Model                          |
|-------------------|------------|----------------------------------------|
| `@cline.free`     | cline      | OpenRouter → kwaipilot/kat-coder-latest|
| `@anthropic.code` | anthropic  | claude-sonnet-4-5                      |
| `@anthropic.plan` | anthropic  | claude-haiku-3-5                       |
| `@mistral.code`   | mistral    | codestral-latest                       |
| `@groq.free`      | groq       | llama-3.3-70b-versatile (free)         |
| `@copilot.auto`   | copilot    | auto (GitHub picks)                    |
| `@copilot.code`   | copilot    | gpt-4.1                                |
| `@openrouter.free`| openrouter | kwaipilot/kat-coder-latest             |
| `@ollama.free`    | ollama     | llama3.2 (local)                       |

### Named model aliases

| Hint              | Means                        |
|-------------------|------------------------------|
| `@anthropic.sonnet` | claude-sonnet-4-5           |
| `@anthropic.haiku`  | claude-haiku-3-5            |
| `@anthropic.opus`   | claude-opus-4-5             |
| `@openai.mini`      | gpt-4o-mini                 |
| `@mistral.small`    | mistral-small-latest        |

---

## SWARM Tier ↔ Router Mode ↔ Agent Alignment

The SWARM intelligence tier system and the router mode system are unified:

| SWARM Tier | Router Mode     | blast_radius  | Agent         | Default Model              |
|------------|-----------------|---------------|---------------|----------------------------|
| T0         | query           | —             | scripts/bash  | groq/llama, kwaipilot(free)|
| T1         | plan            | small         | @ralph        | haiku-3-5, gemini-flash    |
| T2         | code            | medium        | @aiko, @aider, @aish | gpt-4o-mini, haiku, aish-auto |
| T3         | code            | large         | @chad, @copilot| sonnet-4-5, gpt-4o        |
| T4         | code            | critical      | @claudia, @peers| opus-4-5, gpt-o1         |
| T5         | code (secure)   | critical      | @olena        | ollama (local, air-gapped) |

**Emergent property:** The swarm automatically enforces token discipline because:
- Swarm complexity score (stars + heat + deps + critical_path) maps to tier
- Tier maps to AGENCE_ROUTER_MODE + blast_radius
- Mode maps to cheapest capable model for that provider

---

## Provider Auto-Detection Order

When no provider is specified, first configured key wins:

```
1. AGENCE_LLM_PROVIDER env var
2. ~/.agence/config.yaml  provider: field
3. ANTHROPIC_API_KEY      → anthropic
4. OPENAI_API_KEY         → openai
5. AZURE_OPENAI_API_KEY   → azure
6. GEMINI_API_KEY         → gemini
7. MISTRAL_API_KEY        → mistral
8. GROQ_API_KEY           → groq
9. OPENROUTER_API_KEY     → openrouter
10. GROK_API_KEY          → grok
11. DASHSCOPE_API_KEY     → qwen
12. GITHUB_TOKEN          → copilot
13. aish.exe available    → aish  (Windows-only; skipped in WSL/Linux)
14. Ollama running        → ollama
15. Error
```

---

## Supported Providers (v0.3.0)

| Provider     | Type             | Key Var              | Default Model (code mode)    |
|--------------|------------------|----------------------|------------------------------|
| `anthropic`  | Direct API       | ANTHROPIC_API_KEY    | claude-sonnet-4-5            |
| `openai`     | OAI-compat       | OPENAI_API_KEY       | gpt-4o                       |
| `azure`      | Direct API       | AZURE_OPENAI_API_KEY | gpt-4o                       |
| `gemini`     | Direct API       | GEMINI_API_KEY       | gemini-1.5-pro               |
| `mistral`    | OAI-compat       | MISTRAL_API_KEY      | codestral-latest             |
| `copilot`    | OAI-compat       | GITHUB_TOKEN         | gpt-4.1                      |
| `grok`       | OAI-compat       | GROK_API_KEY         | grok-3-fast                  |
| `qwen`       | OAI-compat       | DASHSCOPE_API_KEY    | qwen-max                     |
| `groq`       | OAI-compat       | GROQ_API_KEY         | llama-3.3-70b-versatile      |
| `openrouter` | OAI-compat       | OPENROUTER_API_KEY   | anthropic/claude-3.5-sonnet  |
| `cline`      | Meta (OR→Anthro) | OPENROUTER_API_KEY   | kwaipilot/kat-coder-latest   |
| `ollama`     | Direct (local)   | OLLAMA_HOST          | llama3.2                     |
| `aish`       | Tool (Windows)   | —                    | auto (GitHub Copilot via aish) |

---

**Version**: 0.4.0  
**Last Updated**: 2026-04-10  
**Implementation**: `lib/router.ts`
