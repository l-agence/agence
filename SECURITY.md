# Security Policy

**Version**: v0.6.0-alpha · April 20, 2026

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

275 unit tests covering security boundaries:
- 126 guard boundary tests (tier escalation, AIPOLICY parsing, eval safety)
- 36 security hardening tests (HMAC, signal forgery, injection prevention)
- 56 memory operation tests (tier isolation, store boundaries)
- 57 peer dispatch tests (agent routing, consensus validation)

---

## Known Limitations (v0.6.0-alpha)

These are documented here for transparency. They are tracked as SEC-007..010 (perpetual security improvement loop) and targeted for v0.7+.

### 1. `aicmd` Unguarded Execution Path

`aicmd` is a direct command execution utility that **does not pass through guard.ts**. In the current architecture, agents with shell access could bypass the tiered command policy via `aicmd`.

**Mitigation**: `aicmd` is not on the default agent PATH. Agents use `aido` (which routes through the guard) for all command execution.

**Planned**: AppArmor/SELinux profile to restrict `aicmd` access, or removal from the agent plane entirely.

### 2. `agentd` Fail-Open Default

The agent daemon (`agentd`) uses `|| true` fallbacks and defaults to "approved" if the guard is unreachable. This is a liveness-over-safety tradeoff for development.

**Mitigation**: In production deployments, set `AGENCE_GUARD_STRICT=1` to fail-closed.

**Planned**: Default to fail-closed in v0.7, with explicit opt-in for fail-open mode.

### 3. `AGENCE_GUARD_PERMISSIVE` Environment Variable

An agent with env access can set `AGENCE_GUARD_PERMISSIVE=1` to bypass guard enforcement.

**Mitigation**: The variable is not set by any agence code. Docker container agents run with a sanitized environment.

**Planned**: Remove this variable entirely, or require it to be set only by the TCB.

### 4. Perpetual Security Loop (SEC-007..010)

Security is a process, not a product. The following probes are designed to run continuously against released versions:

- **SEC-008** (`^break`): Non-destructive stress testing of guard bypass paths
- **SEC-009** (`^hack`): Red-team privilege escalation and self-modification probes
- **SEC-010** (`^integrate`): Fix, verify, and regression test findings

These are perpetual tasks — they intentionally never complete. Each cycle feeds the next.

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
