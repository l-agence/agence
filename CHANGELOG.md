# Changelog

All notable changes to l'Agence are documented here.

## [1.0.0] — 2026-05-01

### Added
- `^setup` interactive onboarding wizard — 6-step guided setup (org namespace, repo/wiki recon, LLM keys, artifact registry, project tracking)
- `^btw` steering notes — persistent JSONL context injection for active sessions (`addNote`, `readNotes`, `clearNotes`)
- `^queue dashboard` — rich overview with active task, pending queue, recent completions, elapsed time, session counts
- `^queue import/link/unlink` — GitHub Issues ↔ task bridge (import issue as task, link/unlink, auto-close on done)
- `^verify` MANUAL_VERIFY queue — structured verification lifecycle (`add`, `ack`, `reject`, `ingest`, `compact`)
- `^diff` colored diff — unified diff output for file comparison
- `^routes` task-ID routing — session→task linkage with hex-validated IDs
- `^redoc` doc versioning — save/version/publish pipeline with manifest tracking
- `^integrate` → `^verify` auto-pipe — post-hook ingests findings into MANUAL_VERIFY queue
- Session `end` command — `sessionEnd()` with exit code, status, verification tracking
- `.airuns/` per-task session index — `updateAirunsIndex()`, `listTaskSessions()` for task→session aggregation
- `sequent` tournament tangent orchestrator — parallel agent tournament execution with ranked output
- Scope collision prevention with horde lock
- Circular buffer GC for ephemeral directories
- Cost tracking module with matrix scorer integration
- Dynamic AIPOLICY cascade loader (4-layer policy merge)
- `watch.ts` wired into agentd tangent create
- Ledger-first task-session linkage with SWE stats
- `Task.github_issue` field for issue tracking integration
- 12 new modules: `btw.ts`, `setup.ts`, `verify.ts`, `diff.ts`, `queue.ts`, `router.ts`, `redoc.ts`, `cost.ts`, `scope.ts`, `gc.ts`, `watch.ts`, `runs.ts`

### Security
- SEC-014/015: 11 P0/P1 findings fixed (guard bypass, shell injection, traversal hardening)
- Hex validation on `.airuns/` task IDs (`/^[a-f0-9]{4,16}$/`)
- Null-byte rejection on `^diff` file paths
- Context ID sanitization on `^btw` (`/[^a-zA-Z0-9\-_.]/g`)
- JIRA project key format validation in `^setup`
- GitHub issue ref parsing with URL/slug/short format validation

### Test Coverage
- 723 tests, 1705 expect() calls across 20 test files (28 test suites)
- 310 new tests since v0.9.2

---

## [1.0.0-rc] — 2026-04-30

### Added
- `sequent` tournament tangent orchestrator — parallel agent tournament execution with ranked output
- 12 sequent tests (compilation, CLI dispatch, delegation)

### Security
- SEC-014 (`^break` audit): 4 P1 findings fixed — `doStream` agent name validation, `AI_ROLE` readonly enforcement, MCP response size cap (1MB), MCP call timeout (30s AbortController)
- SEC-015 (`^hack` red-team): 7 findings fixed — `router.sh` AGENCE.md boundary markers, marker injection stripping, `GIT_ROOT ../` traversal guard, `^input`/`^stream` guard bypass hardening

### Test Coverage
- 413 tests, 0 failures, 989 expect() calls across 7 files (22 new regression tests for SEC-014/015)

---

## [0.9.2] — 2026-04-29

### Added
- MCP client (`lib/mcp-client.ts`): guard-gated tool execution, env sanitization, config validation
- `^input` / `^stream` commands for real-time agent I/O
- `AGENCE.md` project instructions convention (`[PROJECT-INSTRUCTIONS-BEGIN/END]` boundary markers)
- 10 MCP client tests

### Security — SEC-014/015
- 22 regression tests for SEC-014 (4 findings) and SEC-015 (7 findings)

### Test Coverage
- 401 tests, 0 failures, 968 expect() calls across 6 files

---

## [0.8.0-alpha] — 2026-04-28

### Security — SEC-012/013
- **P0**: `logDecision` shell injection — `execSync` template replaced with `spawnSync` argument array
- **P0**: `ledger cmdAdd` shell injection — same fix
- **P0**: `awk system()` / `sed e` / `find -fls` T0 bypass — demoted to T2
- **P0**: MCP `bash -c` shell injection — `runSafe()` argument arrays + input validation
- **P1**: `watch.ts fireSignal` injection — `spawnSync` fix
- **P1**: Process substitution `<()` / `>()` bypass — added to globalBlocks
- **P1**: Guard newline bypass (`\n`/`\r`) — added to globalBlocks
- **P1**: `doInject()` guard gate — fail-closed for agentic callers
- **P1**: Docker capability exposure — `--cap-drop ALL`, `--read-only`, `noexec` tmpfs
- **P2**: `shellSafe` newline passthrough (`\n` → `send-keys` splitting) fixed
- **P2**: Heredoc `<<` passes guard — added to globalBlocks

### Test Coverage
- 361 tests, 0 failures, 893 expect() calls (40 new regression tests: 21 for SEC-012, 19 for SEC-013)

---

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
