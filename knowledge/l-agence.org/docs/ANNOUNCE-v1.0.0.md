# l'Agence v1.0.0 — Release Announcement

**Release date**: May 1, 2026
**Author**: Stephane Korning

---

## What is l'Agence?

l'Agence is a governance framework for AI coding agents. It provides command gating, cryptographic audit trails, multi-agent orchestration, and structured task lifecycle management — all git-native, no database, no server.

## What's new in v1.0.0

### Interactive Onboarding (`^setup`)

New 6-step guided wizard for first-time setup:
1. **Org namespace** — domain-scoped knowledge base (e.g. `acme.io`)
2. **Repository platform** — GitHub/GitLab/Bitbucket with automatic `^recon` scanning
3. **Wiki/docs** — Confluence, wiki URL integration with `^recon`
4. **LLM API keys** — Anthropic, OpenAI, Azure, Gemini, Mistral, Groq, OpenRouter
5. **Artifact registry** — JFrog Artifactory, npm
6. **Project tracking** — JIRA, Linear, GitHub Issues

Run `^setup status` to review your configuration at any time.

### Task Queue with Dashboard (`^queue`)

Full task lifecycle management with GitHub Issues integration:
- **Dashboard** (`^queue dashboard`) — active task with elapsed time, pending queue, recent completions, session counts from `.airuns/`
- **GitHub bridge** — `^queue import #42` creates a task from an issue, `^queue link` associates existing tasks, `^queue done` auto-closes linked issues
- **Task→session linkage** — every session tracks its `AGENCE_TASK_ID`, queryable via `^session airuns <task_id>`

### Steering Notes (`^btw`)

Lightweight context injection for agent sessions:
- `^btw "use horde, not flock"` — append a steering note
- `^btw show` — display notes for the active context
- Notes are scoped by `AGENCE_TASK_ID` or `AI_SESSION`, stored as JSONL in `nexus/btw/`

### Verification Queue (`^verify`)

Structured pipeline for items requiring human review:
- `^verify add` / `^verify ingest` — populate from `^integrate` output (auto-piped)
- `^verify ack` / `^verify reject` — disposition items
- `^verify list` / `^verify status` — overview of pending verification

### Doc Versioning (`^redoc`)

Automated documentation lifecycle:
- `^redoc run` — save → version → publish cycle
- `^redoc status` / `^redoc diff` — track pending changes
- Archives previous versions with timestamps in `deprecated/`

### Security Hardening

- 15 security findings fixed across 6 red-team cycles (SEC-010 through SEC-015)
- Path traversal guards on `.airuns/`, `^diff`, `^btw` context IDs
- Null-byte rejection, hex validation, JIRA key format checks
- All guard bypass vectors from SEC-014/015 closed

## By the Numbers

| Metric | v0.6.0-alpha | v1.0.0 |
|--------|-------------|--------|
| Tests | 291 | 723 |
| expect() calls | — | 1,705 |
| Test files | — | 20 |
| LOC (TS + bash) | ~12,000 | ~29,700 |
| TypeScript modules | 15 | 29 |
| Agents | 16 | 18 |
| Skills | 28 | 33+ |
| Red-team cycles | 2 | 7 |
| Security findings fixed | 8 | 30+ |

## Architecture

```
CODEX/          ← Laws, Rules, Principles, AIPOLICY.yaml
KNOWLEDGE/      ← Org-scoped knowledge base (^recon indexed)
NEXUS/          ← Runtime state (sessions, signals, queue, btw, verify)
ORGANIC/        ← Tasks, workflows, projects (state matrix)
```

Four pillars. Git-native. No database. No server. No cloud dependency.

## Getting Started

```bash
git clone https://github.com/l-agence/agence.git .agence
cd .agence
bun install
source bin/agence
agence ^setup        # Interactive wizard
agence ^init         # Environment bootstrap
agence ^recon .      # Index your repo
```

## License

MIT + Commons Clause

---

*Built by humans who believe AI agents need guardrails, not just prompts.*
