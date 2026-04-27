# Contributing to l'Agence

## Prerequisites

- **Bun** ≥ 1.3.12 — TypeScript runtime ([bun.sh](https://bun.sh))
- **bash** 4+ — shell scripts
- **jq**, **yq** — JSON/YAML processing
- **tmux** — session management (runtime only, not needed for tests)

## Setup

```bash
git clone https://github.com/l-agence/agence.git .agence
cd .agence
bun install
```

## Running Tests

```bash
# Full suite (321 tests, ~2 min)
bun run test

# Unit tests only
bun test tests/unit/ --timeout 60000

# Integration tests only
bun test tests/integration/ --timeout 60000

# Single file
bun test tests/unit/guard.test.ts --timeout 60000
```

All `spawnSync` helpers use 15s timeouts. Global test timeout is 60s (via `bunfig.toml` and `--timeout` flag).

## Architecture

- **TCB (Trusted Computing Base)**: `bash` + `guard.ts` + `AIPOLICY.yaml`
- **Guard**: Every agent command is classified (T0–T4) before execution
- **Agents**: Untrusted userland programs — persona, tool, loop, or ensemble types
- **Ledger**: Append-only Merkle-chained audit log in `nexus/.ailedger`

See [SECURITY.md](SECURITY.md) for the full security model.

## Commit Conventions

- Prefix with task ID when applicable: `SEC-010: description`
- Ledger sync commits: `ledger: sync N entries (auto)`
- Keep commits atomic — one logical change per commit

## Pull Requests

1. Branch from `main`
2. Ensure `bun run test` passes (321/321, 0 failures)
3. Run `bash -n` on any modified shell scripts
4. Update test counts in README if tests were added/removed
5. Open PR against `main`

## Security

If you discover a security vulnerability, **do not** file a public issue. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.
