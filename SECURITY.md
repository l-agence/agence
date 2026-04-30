# Security Policy

**Version**: v1.0.0 · April 29, 2026

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

413 unit tests (989 expect() assertions) covering security boundaries:
- 132 guard boundary tests (tier escalation, AIPOLICY parsing, eval safety)
- 134 security hardening tests (HMAC, signal forgery, injection prevention, SEC-010/012/013/014/015 regressions)
- 62 memory operation tests (tier isolation, store boundaries)
- 53 peer dispatch tests (agent routing, consensus validation)
- 10 MCP client tests (guard-gating, env sanitization, config validation)
- 10 MCP server tests (tool/resource surface verification)
- 12 sequent tests (compilation, CLI dispatch, delegation)

---

## Known Limitations (v1.0.0)

These are documented here for transparency. They are tracked via the perpetual security improvement loop.

### 1. Perpetual Security Loop

Security is a process, not a product. The following probes are designed to run continuously against released versions:

- **`^break`**: Non-destructive stress testing of guard bypass paths
- **`^hack`**: Red-team privilege escalation and self-modification probes
- **`^integrate`**: Fix, verify, and regression test findings

These are perpetual tasks — they intentionally never complete. Each cycle feeds the next.

### 2. AIPOLICY Rules Are Code-Defined

Guard rules are currently defined in `lib/guard.ts` source code, not dynamically loaded from `AIPOLICY.yaml`. The YAML file serves as the config anchor (existence check) but content is not parsed. Dynamic policy loading is planned for a future version.

---

## Resolved in v0.9.2 (SEC-014/015)

SEC-014 fixed 4 P1 findings from `^break` targeting new v0.9.x code. SEC-015 fixed 7 findings from `^hack` red-team (3×P1, 4×P2) targeting MCP client, ^stream, ^input guard bypass, and AGENCE.md injection surfaces.

| Fix | Severity | Detail |
|-----|----------|--------|
| `doStream` agent name unvalidated | P1 | `^stream` passed user-controlled agent name directly to tmux `-t` target. Fixed: same SEC-014 regex as `doInput`. |
| `AI_ROLE` not readonly | P1 | Agent could `unset AI_ROLE` to bypass `^input` guard gate. Fixed: `readonly AI_ROLE` in aibash. |
| MCP no response size limit | P2 | Hostile MCP server could return unbounded data, causing OOM. Fixed: 1MB cap with truncation. |
| MCP no call timeout | P2 | Hostile MCP server could hang `callTool` forever. Fixed: 30s AbortController timeout. |
| router.sh no boundary markers | P2 | AGENCE.md injected into prompt without delimiters — LLM prompt injection surface. Fixed: `[PROJECT-INSTRUCTIONS-BEGIN/END]` markers. |
| Marker injection in AGENCE.md | P2 | Content containing boundary marker strings could confuse LLM parsing. Fixed: marker strings stripped/replaced before embedding (both skill.ts and router.sh). |
| GIT_ROOT `..` traversal | P1 | `loadProjectInstructions` and router.sh could load AGENCE.md from outside repo via `../` in GIT_ROOT. Fixed: reject `..` in path. |

22 regression tests added (11 for SEC-014 + 11 for SEC-015).

---

## Resolved in v0.8.0-alpha (SEC-012/013)

SEC-012 fixed 10 findings from SEC-011 `^break`. SEC-013 fixed 8 findings from `^hack` red-team probes — including 3 confirmed P0 RCE vectors where **the denial/logging path itself executed attacker payloads** via shell expansion.

| Fix | Severity | Detail |
|-----|----------|--------|
| `logDecision` shell injection | P0 | `guard.ts` used `execSync` template literal to log denied commands — `$()` and backticks expanded during logging. Fixed: `spawnSync` argument array. |
| `ledger cmdAdd` shell injection | P0 | `ledger.ts` interpolated caller args into `execSync` template. Fixed: `spawnSync` argument array. |
| `awk system()` / `sed e` / `find -fls` T0 bypass | P0 | Commands whitelisted as "read-only" that can execute arbitrary code or write files. Fixed: T2 deny rules for dangerous subcommands. |
| MCP `bash -c` shell injection | P0 | MCP tool execution used `spawnSync("bash", ["-c", cmd])` with template interpolation. Fixed: `runSafe()` argument arrays + input validation. |
| `watch.ts fireSignal` injection | P1 | Same `execSync` template pattern in watch match notification. Fixed: `spawnSync` argument array. |
| Process substitution `<()` bypass | P1 | `cat <(id)` passed guard as T0. Fixed: `<(`, `>(` added to globalBlocks. |
| Guard newline bypass | P1 | `\n`/`\r` not in globalBlocks allowed command separator injection. Fixed: added to globalBlocks. |
| Signal inject bypass | P1 | `doInject()` had no guard gate for agentic callers. Fixed: guard classify check with fail-closed. |
| Docker capability exposure | P1 | SYS_ADMIN without cap-drop, writable root, exec-capable tmpfs. Fixed: `--cap-drop ALL`, `--read-only`, `noexec` tmpfs. |
| `shellSafe` newline passthrough | P2 | `\n` preserved in tmux `send-keys` → command splitting. Fixed: strip `\n` (0x0a). |
| Heredoc `<<` passes guard | P2 | Added to globalBlocks. |

40 regression tests added (21 for SEC-012 + 19 for SEC-013).

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
| 2026-04-21 | v0.7.0-alpha release (MCP server, ^ken orchestrator, SEC-010 fixes, 312 tests) |
| 2026-04-27 | SEC-011 `^break` audit: 10 findings (1×P0, 3×P1, 6×P2) |
| 2026-04-27 | SEC-012 `^integrate`: all 10 findings fixed, 21 regression tests |
| 2026-04-28 | `^hack` red-team probe: 31 probes, 8 findings (3×P0 RCE, 2×P1, 3×P2) |
| 2026-04-28 | SEC-013 `^integrate`: all 8 findings fixed, 19 regression tests |
| 2026-04-28 | v0.8.0-alpha release (361 tests, 893 assertions) |
| 2026-04-29 | v0.9.0–0.9.2: MCP client, ^input/^stream, AGENCE.md convention (390 tests) |
| 2026-04-29 | SEC-014 `^break` audit: 13 probes, 4×P1 findings fixed, 11 regression tests |
| 2026-04-29 | SEC-015 `^hack` red-team: 22 probes, 7 findings (3×P1, 4×P2), all fixed, 11 regression tests |
| 2026-04-29 | v0.9.2 hardened (401 tests, 968 assertions) |
| 2026-04-30 | v1.0.0 release: tournament tangents (sequent), 413 tests, 989 assertions |
