# l'Agence — Agentic Engineering Co-Environments

**Author**: Stephane Korning · 2026 · [MIT + Commons Clause](LICENSE.md)  
**Version**: v1.0.0 · April 2026

> **The governance layer for AI coding agents.**  
> Every agent action classified, gated, and cryptographically logged — regardless of which LLM or tool runs it.

---

## The Problem

Your AI coding agents can write code. They can commit, push, delete, refactor.

**But who's watching them?**

Claude Code has no audit trail. Aider trusts the user. Codex sandboxes everything and hopes for the best. LangChain gives you building blocks but no guardrails.

Agence exists because **advisory guardrails aren't guardrails at all.** It's the layer that sits between any AI agent and your filesystem and says *"not without approval."*

---

## What Agence Does

Agence is an **agent-agnostic governance stack** for software engineering. It doesn't replace your coding agent — it governs, orchestrates, and audits all of them from a single control plane.

**Command Gating** — Every shell command is classified before execution:

| Tier | Gate | Example |
|------|------|---------|
| T0 | Auto-execute | `git status`, `ls`, `cat` |
| T1 | Logged | `git add`, `git commit` |
| T2 | Human approval required | `git push`, `git reset` |
| T3 | Blocked | `rm -rf`, `chmod 777`, `kill` |

Unknown commands default to T2. Not T0. **Fail-closed.** The guard runs as a separate process — agents cannot bypass their own policy.

**Cryptographic Audit** — Every agent decision is logged to a Merkle-chained, append-only ledger. Each entry links to the previous via SHA-256. Tamper with one entry and the chain breaks. Verify with: `agence ^ledger verify`.

**Multi-Agent Orchestration** — 18 agents across 4 types (persona, tool, loop, ensemble). Route with `@agent` syntax. Override models with dot-notation: `@ralph.gpt4o`. Dispatch to Aider, Claude Code, Copilot, or your own tools — all governed by the same policy.

**Peer Consensus** — Route any question to 3 independent LLMs and get weighted consensus. Your architecture review shouldn't depend on one model's blind spots.

**Session Persistence** — Save, resume, and hand off sessions between agents. Full context survives restarts. Automatic tmux capture of stdout/stdin/stderr — no 16KB buffer limits.

**Git-Native** — No database. No server. State lives in git worktrees and flat files. Knowledge is sharded, gated, and selectively routed — you decide what gets shared.

---

## By the Numbers

| | |
|---|---|
| **16,258** | Lines of code (9,939 TypeScript + 6,319 bash) |
| **361** | Tests with 893 assertions |
| **237** | Security-specific tests (132 guard + 105 hardening) |
| **5** | Red-team cycles completed (SEC-008 through SEC-013) |
| **25** | Orchestration skills (`^fix`, `^review`, `^hack`, `^peers`, `^ken`...) |
| **18** | Registered agents (10 persona, 5 tool, 1 loop, 2 ensemble) |
| **12** | LLM providers (Anthropic, OpenAI, Azure, Google, Mistral, Groq, Ollama...) |
| **10** | MCP tools + 3 MCP resources (Model Context Protocol server) |
| **3** | Dependencies total (MCP SDK, Bun, Zod) |
| **0** | Databases required |

---

## Who This Is For

- **Teams using multiple AI coding agents** who need one policy governing all of them
- **Enterprises** requiring audit trails for AI-generated code changes
- **Security-conscious developers** who want fail-closed gating, not fail-open trust
- **Anyone who's had an AI agent break something** and wished there was a layer between the agent and `rm -rf`

## Who This Is NOT For

- If you want an AI pair programmer → use Aider
- If you want IDE autocomplete → use Continue or Copilot
- If you want to build any kind of agent → use LangChain/LangGraph
- If you want cloud-hosted async tasks → use OpenAI Codex

Agence **governs all of the above**.

---

## Install

### As a git submodule (recommended)

```bash
git submodule add https://github.com/l-agence/agence .agence
git submodule update --init --recursive
bash .agence/bin/agence ^init
export PATH="$PWD/.agence/bin:$PATH"
```

### Or: clone directly

```bash
git clone https://github.com/l-agence/agence .agence
cd .agence && bun install
./bin/agence ^init
export PATH="$PWD/.agence/bin:$PATH"
```

### Prerequisites

| Tool | Required | Install |
|---|---|---|
| `bash` 4+ | Yes | Built-in on Linux/macOS/WSL |
| `git` 2.30+ | Yes | `sudo apt install git` |
| `bun` 1.3+ | Yes | [bun.sh](https://bun.sh) |
| `tmux` | For swarm | `sudo apt install tmux` |
| `jq` | For ledger queries | `sudo apt install jq` |

> **Windows**: Use WSL (Ubuntu recommended).

---

## Quick Start

```bash
# Chat with an agent
agence "How should I structure this feature?"

# Route to a specific agent
agence @sonya "Review this auth module"

# Launch an agent shell
agence !ralph                    # Persona: autonomous iteration
agence !claude                   # Tool: Claude Code CLI
agence !aider                    # Tool: aider (code patches)

# Save session (resume later or hand off to another agent)
agence ^save "OAuth2: done token validation, next: refresh flow"
agence ^resume
agence ^handoff @sonya

# Audit trail
agence ^ledger verify            # Verify Merkle chain integrity
agence ^audit trail              # View full decision history

# Peer consensus (3 independent LLMs)
agence @peers "Should we use Redis or Postgres for session storage?"

# See all commands
agence --help
```

---

## Architecture

```
YOUR REPO/
└── .agence/                     ← lives here (submodule or clone)
    ├── bin/                     # CLI: agence, aibash, ibash, aido, agentd
    ├── codex/                   # Governance: AIPOLICY.yaml, Laws, Principles, agents/
    ├── nexus/                   # Local state: .ailedger, sessions, faults (gitignored)
    ├── knowledge/               # Team knowledge: docs, lessons, plans (committed)
    │   └── private/             # Private knowledge (gitignored, never shared)
    ├── organic/                 # Swarm coordination: tasks, jobs, workflows
    └── lib/                     # Core: guard.ts, signal.ts, skill.ts, memory.ts, peers.ts
```

**COGNOS** — Four pillars:

| Pillar | Purpose | Location |
|--------|---------|----------|
| **CODEX** | Immutable governance — Laws, Principles, Rules, AIPOLICY | `codex/` |
| **KNOWLEDGE** | Team-shared docs, lessons, plans — selectively routed via `@` symlinks | `knowledge/` |
| **NEXUS** | Local operational state — sessions, ledger, signals | `nexus/` (gitignored) |
| **ORGANIC** | Swarm orchestration — tasks, workflows, matrix scheduling | `organic/` |

**Runtime**: Bun + bash. No Python. No pip. No npm install of untrusted packages in the critical path.

**MCP**: Agence exposes itself as an MCP server (10 tools, 3 resources) so any MCP-compatible client can use agence's governance layer. Agence also acts as an MCP client — consuming tools from external MCP servers.

---

## Command Reference

| Prefix | Mode | Example | Use When |
|---|---|---|---|
| _(none)_ | Chat | `agence "explain this error"` | Advice, explanation, Q&A |
| `^` | Knowledge | `agence ^save`, `agence ^lesson` | Shared state, knowledge ops |
| `~` | Private | `agence ~note "idea"` | Private notes (never committed) |
| `+` | Autonomous | `agence +refactor-auth` | Agent plans & executes a task |
| `/` | Validated | `agence /git-status` | Pre-approved safe commands |
| `!` | System | `agence !ralph`, `agence !claude` | Launch agents or tools |
| `@` | Route | `agence @sonya "review this"` | Send to specific agent |

---

## Agent Roster

| Agent | Type | Best For |
|---|---|---|
| `@ralph` | **Loop** | Autonomous iteration with backpressure |
| `@sonya` | Persona | Architecture, code review |
| `@claudia` | Persona | Deep reasoning, critical decisions |
| `@chad` | Persona | DevOps, infra, CI/CD |
| `@aleph` | Persona | Red team, security analysis |
| `@claude` | **Tool** | Claude Code CLI (headless spawn) |
| `@aider` | **Tool** | Code patches, git diffs |
| `@pilot` | **Tool** | GitHub Copilot CLI |
| `@peers` | **Ensemble** | 3-LLM weighted consensus |
| `@pair` | **Ensemble** | 2-LLM lightweight consensus |

Override models with dot-notation: `@ralph.gpt4o`, `@sonya.opus`, `@ralph.aider`

---

## Governance

Agence uses a 5-tier command policy. The guard runs as a **separate process** — agents cannot bypass their own policy.

| Tier | Gate | Example |
|---|---|---|
| T0 | Auto-execute | `git status`, `ls`, `cat` |
| T1 | Logged | `git add`, `git commit` |
| T2 | Human approval | `git push`, `git reset` |
| T3 | Blocked | `rm -rf`, `chmod 777` |
| T4 | Never | Force push main, drop DB |

Unknown commands default to T2. **Fail-closed.** 120+ rules across git, GitHub CLI, AWS, Terraform, and shell.

All decisions logged to `nexus/.ailedger` — append-only, Merkle-chained, HMAC-signed.

See [SECURITY.md](SECURITY.md) for full security architecture, red-team findings, and disclosure timeline.

---

## Swarm (agentd)

```bash
agentd start ralph claude aider   # Launch 3 agents in tmux
agentd tangent create fix-auth    # Isolated worktree + container
agentd inject fix-auth "run tests"  # Send command via socat socket
agentd status                     # View all agents + tangents
```

Each tangent gets: isolated git worktree, optional Docker container (`--cap-drop ALL`, `--read-only`, `--no-new-privileges`), socat socket for IPC, tmux pane for observability.

---

## Tests

```bash
bun test                          # Full suite
```

**361 tests**, 893 assertions, 0 failures:

| Suite | Tests | Coverage |
|---|---|---|
| `guard.test.ts` | 132 | Command gate, tier escalation, eval safety |
| `security-hardening.test.ts` | 105 | HMAC, signal forgery, injection prevention, SEC-010/012/013 |
| `memory.test.ts` | 62 | COGNOS 3-store: retain/recall/cache/forget/promote/distill |
| `peers-dispatch.test.ts` | 53 | Peer consensus, mixed routing |
| `mcp.test.ts` | 9 | MCP tool/resource surface verification |

---

## Documentation

| Doc | What it covers |
|---|---|
| [Architecture](knowledge/l-agence.org/docs/ARCHITECTURE.md) | End-to-end system design |
| [Swarm](knowledge/l-agence.org/docs/SWARM.md) | agentd, tangents, tmux model |
| [Commands](bin/COMMANDS.md) | Complete CLI reference |
| [Security](SECURITY.md) | TCB, red-team findings, disclosure timeline |
| [Tutorial](docs/TUTORIAL.md) | Getting started walkthrough |
| [Setup](docs/SETUP.md) | Detailed installation guide |

---

## License

MIT + Commons Clause — free to use, modify, and self-host.  
Commercial redistribution requires a separate agreement.  
See [LICENSE.md](LICENSE.md).

---

*Built by Stephane Korning. Hardened by 5 red-team cycles. Governed by its own CODEX.*
