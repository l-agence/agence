# 🤖 l'Agence (^) —  Agentic Engineering Collaboration Environment

**Author**: Stephane Korning · 2026 · [MIT + Commons Clause](LICENSE.md)

> *The first git-native and governed, multi-agent swarm for software engineering.*

---

## Introduction 

**l'Agence** is a framework that turns your git repo into a **collaborative agent workspace** — with audit trails, session persistence, and safe multi-agent coordination and governance built in from the start.

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

## What is l'Agence?

Welcome to **Agence**, an agentic engineering collaboration environment.
L'agence is a tool and model agnostic framework for humnan/agentic and multi-agentic development & collaboration. L'agence achieves this with aphilosophy of simplicity. For example in agence there is no vectored database, no state machines. Where posisble, everything including swarm and task states, workflows, RAG and DWM, are managed based on git. L'agence scales and remembers  using **Git-based sharding**. 

L'agence is deployed both as a portable git submodule (.agence) living in any project's repo, and one or more 'team shards' existing as that .agence submodule origin. This way agence lives in an active context inside each project, but also shares upstream to it's team based shard. However L'agence gates all knowledge, and so it allows you to selectively route and share. YOU DECIDE where and how to share. 

Unlike other agentic models that aim for full AI autonomy, L'agence aims for human supervised workflows. It is human gated first by design. It incorporates strong Explicit and immutable  safeguards via the CODEX:  laws, principles, rules, and most importantly an EBNFgrammar based universal tiered AI access policy.

Governance is a central concept in L'agence. Agence is the firts such system with a full agentic audit trail based on immutable append only merkle ailedger. The ledger is implemented as a sister repository to each shard. AI commands are logges , auditable and replayable for RCA or accountability. 

l 'agence implements a human control plane with multiple agent shells as needed. But full agent sessions must always be accesible via terminal panes or session replay or audits. 

In agence, state is local but knowledge and metadata is selectively sharded. Full local agent session states are preserved, allowing for local session save, resume and even handoff to other agents. L'agence does automatic full session capture of stdout, stdin, stderr, exit codes and everythimng via tmux pipe with a unix script based typescript fallback. 

This allows for full agentic access to the entire session, bypassing VScode 16kb buffer limits and reducing hallucinations and token wastage. 

Full session data is never shared verbatim to the shard.  This is gated such that we do not leak unless a human asks. 

As well, agence's knowledge bases are tiered and segregated between both hermetic (private local user knowledge in this repo) and sytnthetic ( team based Derived World Knowledge).

L'agence uses an innovative and deterministic routing system that is flexible and secure. It allows uses to select where knowledge and lessons are shared. Efforts have been made to gate guard your data from unecessary discolsure. 

By design l'agence is tooling agnostic. It already comes pre-loaded with multiple agentic personas and external agent support and encourages these such as: 'aider, claude-code, aishell, copilot-cli, local ollama cluster,etc'. In fact out-of-the-box we support 13 other agents but rolling your own agent is also encouraged.

L' agence makes use of a strong linear algrebra matrix-based task and workflow model which allows for atomic and idempotent task and swarm state management . This means swarms instantly recompute task states. As well , this enables deterministic  task scheduling which is selected on needs, LLM capabilities and LLM token costs. 


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

### AIPOLICY.yml 
Agence implements a universal tiered agentic security policy by design.  This uses EBNF grammar rules and presets to determine safe (whitelist) , unsafe (blacklist), and nuanced (greylist) commands needing human approval. 


### aido 
While I now know that the aido name is not unique, in agence it is something different. at its base in agence aido is like the oppposite of sudo . Where sudo aims to execute with privilege , aido aims to execute with the least privilege.  It allows command whitelists, block command blacklists, and implements a human prompt escalation for greylists where human permission is required. 

--- 
## The Agence Lexicon

### COGGNOS foundation
Agence is built on a 6-pillar foundation the acronym for which is COGNOS: 

CODEX: This forms the stronng and immutable governance layer of agence. It contains the Laws of Agentic : Laws, principles rules, as well as the AIPOLICY.

OBJECTCODE: in Agence this a RAG meant exclusively for your organization's code bases. Eg it should contain .md and json files describing your git repos. These are handled differently than other RAG sources (eg they can use an AST Chunking memory index. ) 

It may also contain  architecture docs, Solutions and patterns specific to your organzation. 

GLOBALCACHE: is the main RAG 'database' . It consists of .md and json files that can fast indexed via a Dwey-Decimal like formtag. Global cache is distinct from DWM derived world model so we don't assume truth unless gated by a human. 

NEXUS:  This is the local state machine. It is intentionally not shared to the shard.  Agenst states are preserved vi a mix of tmux pipe-pan and script typescript as fallback. This allows for full agentic session view, session audits and vene session replay. 

ORGANIC:  This is the SWARM or Orchestration layer. This contains our unique matrix-based task and workflow and project system. It also includes the Shard based team shared dahsboards to view these. In time this will be more sophisticated. But the general idea is that each shard head becomes a git based dashboard into the state of all the tasks, workflows, projects. 

SYNTHETHIC: This is the Derived World Model. Whereas tasks, projects and workflows are team shared (the states of them) actual knowledge is gated by our routing rules. So Synthetic knowledge is only shared where you decide. This tries to enforce a compromise between sharing and data leakage. 


### Other layers: 

HERMETIC: BY design this is an intentionally private local only Derived World Model. It is quite useful to put strategic vision, personal todos and personal notes .

MNEMONIC: This is a "fast access, ephemeral memory cache' It is intended to be an index that can be regenreated on the fly from canonical and persistent knowledge. This bit is still in development and not fully tested but as our datasets grow this will become important. 



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


