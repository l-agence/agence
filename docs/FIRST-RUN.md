# First Run Guide

Get agence running in 5 minutes.

## 1. Prerequisites

```bash
# Required
bash --version    # 4.0+
git --version     # 2.30+
bun --version     # 1.0+ (bun.sh)

# Recommended
tmux -V           # For multi-agent swarm
jq --version      # For JSON queries
```

## 2. Install

```bash
# Option A: As a git submodule (recommended)
git submodule add https://github.com/l-agence/agence .agence
cd .agence && bun install

# Option B: Standalone clone
git clone https://github.com/l-agence/agence .agence
cd .agence && bun install

# Add to PATH (add to .bashrc / .zshrc)
export PATH="$PWD/.agence/bin:$PATH"
```

## 3. Configure API Keys

Agence is LLM-agnostic. Configure the providers you have:

```bash
# Anthropic (for @sonya, @claudia, @ralph, @linus, @feynman, @aleph, @haiku)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI (for @chad, @peers GPT peer)
export OPENAI_API_KEY="sk-..."

# Google Gemini (for @peers Gemini peer)
export GEMINI_API_KEY="..."

# GitHub Copilot (for @copilot — uses your GitHub auth)
# No key needed — uses `gh auth login`
```

**Minimum viable setup**: Just `ANTHROPIC_API_KEY` gets you all persona agents + @ralph loop.

Add keys to your shell profile or a `.env` file:
```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

## 4. Verify Installation

```bash
# Check agence is working
agence --help

# Run the test suite (no API keys needed)
bun test tests/unit/
# Expected: 275 pass, 0 fail

# Check governance rules are loaded
agence /git-status   # Should work (T0 — free tier)
```

## 5. Your First Session

```bash
# Chat with an agent
agence "Explain the architecture of this codebase"

# Use a specific persona
agence @sonya "Review this module for architectural issues"

# Use the harsh reviewer
agence @linus "Review my latest commit"

# Run a skill command
agence @sonya ^review "Check the auth module"
agence @chad ^scope "Plan the API redesign"
agence @aleph ^recon "Scan for security issues"

# Get peer consensus (requires 2-3 API keys)
agence @peers ^review "Is this code production-ready?"

# Memory operations
agence ^retain "The auth module uses JWT with RS256" --tags auth,security
agence ^recall auth
agence ^glimpse              # Read working memory cache
agence ^distill --dry-run    # Preview memory promotion
```

## 6. Agent Types

| Type | What it does | Example |
|------|-------------|---------|
| **Persona** | LLM call with injected personality | `@sonya ^design "API schema"` |
| **Tool** | Spawn external CLI binary | `@aider "fix the bug in auth.ts"` |
| **Loop** | Iterative agent with backpressure | `@ralph ^build "add OAuth2"` |
| **Ensemble** | Multi-LLM weighted consensus | `@peers ^review "is this ready?"` |

### Dot-notation overrides

```bash
@ralph.gpt4o       # Ralph loop using GPT-4o
@ralph.aider       # Ralph loop wrapping aider
@sonya.opus        # Sonya with Opus model
```

## 7. Governance

Every command is gated by `codex/AIPOLICY.yaml`:

```bash
agence /git-status           # T0 — runs freely
agence /git-push             # T2 — requires human approval
agence ^ledger verify        # Verify Merkle audit chain integrity
agence ^audit trail          # View full decision audit trail
```

## 8. What's Unique About Agence

1. **Merkle-chained audit ledger** — cryptographic proof of every agent action
2. **AIPOLICY.yaml governance** — tiered command permissions (T0-T4), 120+ rules
3. **Git-native state** — no database, no server, `organic/` is the single source of truth
4. **Mixed agent routing** — 4 agent types (persona/tool/loop/ensemble) with dot-notation
5. **Peer consensus** — 3-LLM weighted voting based on MIT research (arXiv:2406.12708)
6. **COGNOS memory** — 3-store cognitive memory model (shared/private/working)

## Need Help?

```bash
agence --help                # Full command reference
agence ^help skills          # List all skill commands
```

- [README](README.md) — Overview and architecture
- [SECURITY.md](SECURITY.md) — Security model and known limitations
- [Commands Reference](bin/COMMANDS.md) — Complete CLI docs
- [GitHub Issues](https://github.com/l-agence/agence/issues) — Bug reports and feature requests
