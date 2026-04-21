# l'Agence v0.6.0-alpha — The First Governance Framework for Agentic CLI

**Release date**: April 20, 2026
**Repository**: https://github.com/l-agence/agence

---

## What is l'Agence?

l'Agence is a git-native, governed, auditable multi-agent framework for software engineering.

Every agent action is Merkle-chained. Every command is policy-gated. Consensus comes from 3 independent LLMs, not one.

Unlike single-agent tools, agence coordinates multiple agents in parallel — each isolated, observable, and governed by the same immutable rules.

## Why governance matters now

The agentic CLI space is exploding: Claude Code (116k stars), Gemini CLI (102k stars), Aider (43.6k stars). But none of them answer the fundamental question:

**Who audits the agent?**

When an AI agent runs `git push --force` or `rm -rf /`, who is accountable? Where is the audit trail? What policy governed that decision?

l'Agence is the first framework to answer these questions with:

### 1. Merkle-chained audit ledger

Every agent action is logged to an append-only, HMAC-signed decision log. Each entry links to the previous via a chain hash. Tamper with one entry and the chain breaks. This is cryptographic proof of what every agent did, when, and why.

### 2. AIPOLICY.yaml — tiered command governance

A declarative policy file with 120+ rules across 5 tiers (T0-T4). T0 commands run freely. T4 commands are blocked without explicit human override. EBNF grammar rules define what's safe, what needs approval, and what's forbidden. The policy is committed to git — it's versioned, auditable, and immutable.

### 3. Git-native state — no database, no server

All state lives in git. Tasks, workflows, projects, memory — all flat files in `organic/`. No PostgreSQL, no Redis, no external dependencies. Your project state is your git history.

## What else ships in v0.6.0-alpha

- **Mixed agent routing**: 4-type dispatch — persona (LLM), tool (CLI binary), loop (iteration harness), ensemble (multi-LLM consensus)
- **Dot-notation**: `@ralph.gpt4o` or `@ralph.aider` — override model or binary per-dispatch
- **COGNOS memory**: 6-tier cognitive memory model with retain/recall/cache/forget/promote/distill
- **bin/loop**: Generic iteration primitive with backpressure validation between cycles
- **Peer consensus**: 3-LLM weighted voting based on MIT research (arXiv:2406.12708)
- **16 agents**: 11 personas + 4 tools + 1 loop + 2 ensembles
- **28 skill commands**: `^fix`, `^build`, `^review`, `^hack`, `^recon`, `^design`, `^peers`, and more
- **275 tests**: Security hardening, guard boundary, peer dispatch, memory operations
- **HMAC-signed IPC**: Human↔agent signals are cryptographically authenticated

## Quick start

```bash
git clone https://github.com/l-agence/agence .agence
cd .agence && bun install
export PATH="$PWD/bin:$PATH"
export ANTHROPIC_API_KEY="sk-ant-..."

agence "Explain the architecture of this codebase"
agence @sonya ^review "Check auth module for issues"
agence @peers ^review "Is this production-ready?"
agence ^ledger verify
```

See [docs/FIRST-RUN.md](docs/FIRST-RUN.md) for full setup guide.

## What's next (v0.7)

- SEC-007: Perpetual security probing loop (^break, ^hack, ^integrate)
- MEM-005: ^ken orchestrator (grasp + glimpse + recon + distill in one shot)
- MCP support for ecosystem integration
- Container-per-agent isolation

## The competitive landscape

We built agence because we believe governance is the missing layer in agentic tooling.

Claude Code has Agent Teams. Gemini CLI has autoMemory. Aider has 43k stars. Letta just shipped AI_POLICY.md. These are all excellent tools.

But none of them have:
- A Merkle-chained audit ledger
- Tiered command governance with 120+ rules
- Git as the only coordination layer
- Multi-LLM consensus from independent providers

Agence is the auditable multi-agent CLI — every decision Merkle-chained, every command policy-gated, consensus from 3 independent LLMs, not one.

---

MIT + Commons Clause · Built by Stephane Korning · [l-agence.org](https://l-agence.org)
