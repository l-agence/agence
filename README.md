# 🤖 l'Agence (^) —  Agentic Engineering Code Environment

**Author**: Stephane Korning · 2026 · [MIT + Commons Clause](LICENSE.md)

> *The first git-native and governed, multi-agent swarm for software engineering.*

---

## What is l'Agence?

**l'Agence** is a framework that turns your git repo into a **collaborative agent workspace** — with audit trails, session persistence, and safe multi-agent coordination built in from the start.

Unlike single-agent tools (Claude Code, Copilot, aider), agence coordinates **multiple agents in parallel**, each isolated, observable, and governed by the same CODEX rules.

| Capability | How |
|---|---|
| Multi-agent swarm | tmux tiles — one agent per pane, human hypervisor |
| Session persistence | `^save` / `^resume` — context survives restarts |
| Safe handoffs | `^handoff @ralph` — full context transfer between agents |
| Audit trail | `nexus/.ailedger` — append-only JSONL decision log |
| Tiered governance | `AIPOLICY.yaml` → T0 (free) → T4 (gated) command tiers |
| Tool-agnostic | Works with claude, copilot, aider, aish, or your own agent |
| LLM-agnostic | Anthropic, OpenAI, GitHub Copilot, OpenRouter, Ollama, and more |
| Git-native | No DB, no server — just git worktrees and flat files |

---

## ⚡ Install (60 seconds)

### As a git submodule (recommended — keeps agence separate from your project)

```bash
# 1. Add agence to your repo
git submodule add https://github.com/l-agence/agence .agence

# 2. Initialize
git submodule update --init --recursive

# 3. Set up agence in your repo (creates .agencerc, checks dependencies)
bash .agence/bin/agence ^init

# 4. Add agence to your PATH (add this to your .bashrc / .zshrc)
export PATH="$PWD/.agence/bin:$PATH"

# 5. Commit
git add .gitmodules .agence && git commit -m "Add agence agent framework"
```

### Or: run directly (no install, no submodule)

```bash
git clone https://github.com/l-agence/agence .agence
export PATH="$PWD/.agence/bin:$PATH"
agence --help
```

### Prerequisites

| Tool | Required | Install |
|---|---|---|
| `bash` 4+ | ✅ Yes | built-in on Linux/macOS/WSL |
| `git` 2.30+ | ✅ Yes | `sudo apt install git` |
| `tmux` | For `agentd` swarm | `sudo apt install tmux` |
| `script` (util-linux) | For session logging | `sudo apt install util-linux` |
| `jq` | For JSON ledger queries | `sudo apt install jq` |
| `bun` | For TypeScript modules | [bun.sh](https://bun.sh) |

> **Windows**: Use WSL (Ubuntu recommended). All tools above available via `sudo apt install`.

---

## 🚀 Quick Start

```bash
# Chat with an agent about your task
agence "How should I structure this feature?"

# Save session state (resume later or hand off)
agence ^save "Implementing OAuth2, halfway through token validation"

# Launch a named agent in an aibash session
agence !ralph                    # persona agent (learning + reliability)
agence !claude                   # Claude Code CLI
agence !pilot                    # GitHub Copilot CLI
agence !aider                    # aider (code patches)
agence !aish                     # Microsoft AI Shell

# Run a pre-approved git command
agence /git-status
agence /git-log

# Record a decision in the audit ledger
agence ^fault add "Missed nil check in router"

# See all commands
agence --help
```

---

## 📐 Architecture

```
YOUR REPO/
└── .agence/                     ← agence lives here (submodule or clone)
    ├── bin/
    │   ├── agence               # Main CLI entry point
    │   ├── aibash               # Agent plane shell (observable)
    │   ├── ibash                # Human plane shell (hypervisor)
    │   └── aido                 # Autonomous task runner
    ├── codex/                   # Immutable governance (committed, shared)
    │   ├── PRINCIPLES.md        # Philosophical maxims
    │   ├── LAWS.md              # Hard constraints (must not)
    │   ├── RULES.md             # Best practices (should)
    │   ├── AIPOLICY.yaml        # Command tier whitelist (T0–T4)
    │   └── agents/              # Agent personas (ralph, sonya, claude…)
    ├── nexus/                   # Local operational state (gitignored)
    │   ├── .ailedger            # Append-only decision audit log (JSONL)
    │   ├── faults/              # Incident tracking
    │   └── sessions/            # Persisted agent context
    ├── synthetic/               # Team-shared knowledge (committed)
    │   ├── @                    # → symlink to active org (e.g. l-agence.org)
    │   └── l-agence.org/
    │       ├── docs/            # Architecture, routing, swarm docs
    │       ├── lessons/         # Captured insights
    │       └── plans/           # Project roadmap
    ├── hermetic/                # Private knowledge (gitignored, never shared)
    │   ├── @                    # → symlink to active org
    │   └── l-agence.org/
    │       ├── todos/           # Personal task tracking
    │       └── brainstorms/     # Design notes, analysis
    ├── globalcache/             # Cross-org shared knowledge (committed)
    ├── organic/                 # Swarm coordination (tasks, jobs, workflows)
    │   ├── tasks/               # In-progress agent work items
    │   ├── jobs/                # Scheduled background work
    │   └── workflows/           # Multi-step orchestration definitions
    └── lib/
        ├── env.sh               # Canonical env bootstrap (sourced by all bin/)
        ├── router.sh            # LLM provider routing
        ├── format.sh            # Output formatting
        ├── shell-ui.sh          # PS1 state colors, tmux titles
        ├── session.ts           # Session CRUD (Bun TS)
        ├── guard.ts             # Non-bypassable command gate (Bun TS)
        ├── signal.ts            # Human↔agent IPC + ^ask (Bun TS)
        └── matrix.ts            # Task DAG + scoring engine (Bun TS)
```

### The `@` Symlink (Org Routing)

Inside `synthetic/` and `hermetic/`, the `@` symlink points to the **active organization directory**:

```
synthetic/@ → synthetic/l-agence.org/
hermetic/@  → hermetic/l-agence.org/
```

This lets all commands resolve paths like `synthetic/@/docs/ARCHITECTURE.md` without hardcoding the org name. When you add agence to a different org's repo, just point `@` at that org's directory:

```bash
# In your-company's repo:
ln -s synthetic/your-company.com synthetic/@
```

The `^init` command checks and reports `@` symlink status. If missing, it tells you what to create.

---

## 🎯 Command Reference

| Prefix | Mode | Example | Use When |
|---|---|---|---|
| _(none)_ | Chat | `agence "explain this error"` | Advice, explanation, Q&A |
| `^` | Synthetic | `agence ^save`, `agence ^lesson` | Shared state, knowledge ops |
| `~` | Hermetic | `agence ~note "idea"` | Private notes (never committed) |
| `+` | Autonomous | `agence +refactor-auth` | Agent plans & executes a task |
| `/` | Validated | `agence /git-status` | Pre-approved safe commands |
| `!` | System | `agence !ralph`, `agence !claude` | Launch agents or tools |
| `@` | Route | `agence @sonya "review this"` | Send to specific agent |

---

## 🤖 Agent Roster

| Agent | Type | Best For | Model |
|---|---|---|---|
| `!ralph` | Persona | Learning, reliability, explanations | Claude Sonnet |
| `!sonya` | Persona | Architecture, code review | Claude Sonnet |
| `!claudia` | Persona | Deep reasoning, critical decisions | Claude Opus |
| `!aiko` | Persona | Fast analysis, cheap queries | Claude Haiku |
| `!chad` | Persona | DevOps, infra, CI/CD (Cockney) | GPT-4o |
| `!claude` | Tool | Claude Code interactive CLI | Anthropic direct |
| `!pilot` | Tool | GitHub Copilot CLI | GitHub Copilot |
| `!aider` | Tool | Code patches, git diffs | OpenRouter/local |
| `!aish` | Tool | Windows shell, Azure CLI | AI Shell (winget) |

---

## 🔄 How Sessions Work

**Before agence:**
```
Session 1: Agent works on OAuth2 → context lost at end
Session 2: Start over, re-explain everything → wasted time
```

**With agence:**
```
Session 1: agence ^save "OAuth2: done token validation, next: refresh flow"
Session 2: agence ^resume → agent picks up exactly where you left off
         or: agence ^handoff @sonya → different agent, full context
```

---

## 🔐 Governance Model

Agence uses a 5-tier command policy (`codex/AIPOLICY.yaml`):

| Tier | Level | Example Commands | Gate |
|---|---|---|---|
| T0 | Free | `git status`, `git log` | None |
| T1 | Soft confirm | `git add`, `git commit` | Logged |
| T2 | Hard confirm | `git push`, `git reset` | Human approval |
| T3 | Restricted | `git clean`, `rm -rf` | Explicit flag required |
| T4 | Blocked | Force push to main, drop DB | Never without override |

All decisions are logged to `nexus/.ailedger` (local, gitignored, append-only).

---

## 📚 Documentation

| Doc | What it covers |
|---|---|
| [Architecture](synthetic/l-agence.org/docs/ARCHITECTURE.md) | How agence works end-to-end |
| [Swarm](synthetic/l-agence.org/docs/SWARM.md) | agentd, tangents, tmux model |
| [Routing](codex/agents/ROUTING.md) | LLM provider selection, tiers, blast_radius |
| [Agents](codex/agents/AGENTS.md) | Full agent roster and system prompts |
| [Commands](bin/COMMANDS.md) | Complete CLI reference |
| [Principles](codex/PRINCIPLES.md) | Core maxims (why) |
| [Laws](codex/LAWS.md) | Hard constraints (must not) |
| [Rules](codex/RULES.md) | Best practices (should) |
| [Roadmap](synthetic/l-agence.org/docs/ROADMAP.md) | What's next |

---

## 🧪 Tests

```bash
# Run full suite (91 examples, 0 failures)
AIDO_NO_VERIFY=1 tests/lib/shellspec/shellspec --shell bash tests/unit/agence_spec.sh
```

---

## License

MIT + Commons Clause — free to use, modify, and self-host.  
Commercial redistribution requires a separate agreement.  
See [LICENSE.md](LICENSE.md).


