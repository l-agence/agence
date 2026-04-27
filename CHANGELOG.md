# Changelog

All notable changes to l'Agence are documented here.

## [0.7.0-alpha] — 2026-04-27

### Security — SEC-010: Guard Perimeter Hardening
- **P0**: Remove `AGENCE_GUARD_PERMISSIVE` — unknown commands always T2 (fail-closed)
- **P0**: Guard gate on `aicmd` — all commands through guard.ts
- **P0**: Env sanitization in `aibash` — unset 14 sensitive vars (API keys, guard vars, policy path)
- **P0**: Guard + PATH hardening in `aishell.ps1` — guard-gated loop, '.' removed from PATH
- **P1**: Fail-closed `agentd` inject — default deny, `|| true` removed, socket handler guarded
- **P1**: Container hardening — `no-new-privileges`, `--user 1000:1000`, removed `apparmor:unconfined`
- **P2**: Fail-closed `aido` fallback — deny when bun unavailable (was T1 allow)

### Added
- MCP server (`lib/mcp.ts`): 10 tools + 3 resources over stdio
- `^ken` orchestrator (`lib/skill.ts`): grasp+glimpse+distill pipeline
- `bin/loop` backpressure: `--backpressure-mode progressive`, sha256 stall detection
- Integration tests: guard→shell eval round-trip, socket→guard flow (9 tests)
- `bunfig.toml`: global 60s test timeout (prevents CI hangs)
- `package.json` `test` script: `bun test --timeout 60000`
- CI workflow: `bun test` step added to `.github/workflows/ci.yml`

### Changed
- Dockerfile: Bun 1.2.9 → 1.3.12
- All test `spawnSync` helpers: 15s timeout added (defense in depth)
- SECURITY.md: updated for v0.7.0-alpha with SEC-010 resolved items
- README: version bump, test counts updated (321 tests, 822 expect())

### Fixed
- 28 regression tests for SEC-010 bypass vectors

### Test Coverage
- 321 tests, 0 failures, 822 expect() calls across 6 files

## [0.6.0-alpha] — 2026-04-20

### Security — SEC-004/005/006
- SEC-004: HMAC-SHA256 signal envelope signing, 0o600 file perms, signal ID validation
- SEC-005: `shellSafe()` strips control chars, pane target validation, ask restricted to y/n
- SEC-006: Agent name regex, path traversal guard, 64KB size limit, PERSONA-BEGIN/END markers

### Added
- MEM-001/002: COGNOS 6-tier memory (`lib/memory.ts`) — retain/recall/cache/forget/promote
- MEM-003/004: Skill integration — `^grasp`, `^glimpse`, `^distill` with Jaccard dedup
- MEM-005: `^ken` orchestrator (grasp+glimpse+distill pipeline)
- WIRE-005: Mixed agent routing — tool/loop/ensemble/persona dispatch via registry
- HARNESS-001: `bin/loop` generic iteration primitive (Ralph Wiggum pattern)
- Modular `bin/agence` split: 4617-line monolith → 384-line router + 9 lib modules
- `lib/recon.ts`: 704-line crawler/indexer
- `lib/org.ts`: canonical `resolveOrg()` for TS
- `lib/peers.ts`: consolidated 3 consensus algos (winner/judge/merge)

### Changed
- Knowledge model: 7 dirs → 4 (`knowledge/{cache,derived,global,hermetic}`)
- `lib/init.sh`: decomposed into `lib/setup.sh` (652 lines)
- Routing: registry.json-backed model, deleted `dispatch.ts`
- Pre-push hook for `.ailedger` auto-commit

### Removed
- `bin/agence.bak`, `bin/agence.monolith` — 7955 dead lines
- `dispatch.ts` — 214 lines (replaced by registry.json + jq)

### Test Coverage
- 312 tests, 0 failures, 804 expect() calls across 5 files
