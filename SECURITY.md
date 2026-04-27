# Security Policy

**Version**: v0.7.0-alpha · April 27, 2026

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- **Email**: security@l-agence.org
- **GitHub**: Open a [private security advisory](https://github.com/l-agence/agence/security/advisories/new)
- **Do not** file public issues for security vulnerabilities.

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

---

## Security Architecture

### Trusted Computing Base (TCB)

Agence treats **bash + yq/jq + guard.ts** as the TCB — the only code that cannot lie. Agents are intelligent but untrusted userland programs. Every agent action passes through the guard before execution.

### Governance: AIPOLICY.yaml

All agent commands are gated by `codex/AIPOLICY.yaml` — a tiered command policy with EBNF grammar rules:

| Tier | Level | Gate | Example |
|------|-------|------|---------|
| T0 | Free | None | `git status`, `git log` |
| T1 | Soft | Logged | `git add`, `git commit` |
| T2 | Hard | Human approval required | `git push`, `git reset` |
| T3 | Restricted | Explicit flag required | `git clean`, `rm -rf` |
| T4 | Blocked | Never without override | Force push main, drop DB |

Currently 120+ rules across git, GitHub CLI, AWS, Terraform, Linux shell, and PowerShell.

### Audit Trail: .ailedger

Every agent action is logged to `nexus/.ailedger` — an append-only, **Merkle-chained** decision log. Each entry includes:
- Agent identity, command, tier, timestamp
- HMAC-SHA256 signature for tamper detection
- Chain hash linking to previous entry (Merkle chain)

Verify chain integrity: `agence ^ledger verify`

### Signal IPC Security (SEC-004)

Human↔agent communication via `nexus/signals/` uses:
- **HMAC-SHA256 envelope signing** with per-session secret
- **0o600 file permissions** (owner-only read/write)
- **Signal ID validation** (hex format, length check, path traversal guard)

### Injection Hardening

- **SEC-001**: `guard.ts` shell export uses `printf '%q'` — no eval injection
- **SEC-002**: API keys in headers only (never URL query params)
- **SEC-003**: Guard defaults unknown commands to T2 (fail-closed)
- **SEC-005**: `shellSafe()` strips control characters from tmux send-keys
- **SEC-006**: Agent names validated by regex, 64KB size limit, PERSONA-BEGIN/END boundary markers

### Test Coverage

312 unit tests (804 expect() assertions) covering security boundaries:
- 132 guard boundary tests (tier escalation, AIPOLICY parsing, eval safety)
- 64 security hardening tests (HMAC, signal forgery, injection prevention, SEC-010 regressions)
- 62 memory operation tests (tier isolation, store boundaries)
- 53 peer dispatch tests (agent routing, consensus validation)
- 9 MCP server tests (tool/resource surface verification)

---

## Known Limitations (v0.7.0-alpha)

These are documented here for transparency. They are tracked via the perpetual SEC-007..011 security improvement loop.

### 1. Perpetual Security Loop (SEC-007..011)

Security is a process, not a product. The following probes are designed to run continuously against released versions:

- **SEC-008** (`^break`): Non-destructive stress testing of guard bypass paths
- **SEC-009** (`^hack`): Red-team privilege escalation and self-modification probes
- **SEC-010** (`^integrate`): Fix, verify, and regression test findings
- **SEC-011+**: Next cycle (perpetual)

These are perpetual tasks — they intentionally never complete. Each cycle feeds the next.

---

## Resolved in v0.7.0-alpha (SEC-010)

The following vulnerabilities were identified by SEC-008/009 and fixed in SEC-010:

| Fix | Severity | Detail |
|-----|----------|--------|
| `aicmd` guard gate | P0 | All commands now pass through guard.ts. Previously `aicmd` could bypass the tiered policy. |
| `AGENCE_GUARD_PERMISSIVE` removed | P0 | Environment variable eliminated entirely. Unknown commands always T2 (fail-closed). |
| `aibash` env sanitization | P0 | 14 sensitive vars (API keys, guard vars, policy path) unset before agent shell entry. |
| `aishell.ps1` guard + PATH | P0 | PowerShell agent loop now guard-gated; '.' removed from PATH. |
| `agentd` fail-closed | P1 | Default deny on inject. `|| true` fallbacks removed. Socket handler guard-gated. |
| Docker `no-new-privileges` | P1 | Container runs `--user 1000:1000`, `apparmor:unconfined` removed. |
| `aido` fail-closed fallback | P2 | Deny when bun unavailable (was T1 allow). |

28 regression tests added to prevent re-introduction of these vectors.

---

## Dependencies

Agence's security-critical path uses minimal dependencies:
- **bash 4+**: TCB shell (no external shell interpreters)
- **bun**: TypeScript runtime for guard.ts, signal.ts, memory.ts
- **jq/yq**: JSON/YAML parsing (no eval)
- **tmux**: Session isolation and observability
- **git**: State persistence and audit (no database)

No Python. No pip. No npm install of untrusted packages in the critical path.

---

## Disclosure Timeline

| Date | Event |
|------|-------|
| 2026-04-19 | @aleph (internal red team) filed 7 security findings via @peers consensus |
| 2026-04-20 | All 7 findings fixed: SEC-001..006 (critical shell injection, API key exposure, signal forgery, injection hardening) |
| 2026-04-20 | 275 security + boundary tests added |
| 2026-04-20 | v0.6.0-alpha public release |
