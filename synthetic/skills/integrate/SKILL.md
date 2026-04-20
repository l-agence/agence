# ^integrate — CI/CD Integration Loop

> "Security is a Process, not a Product." — Bruce Schneier

## Purpose

Continuous integration loop that discovers, tests, and hardens system
boundaries. The cycle never fully completes — each pass feeds the next.

## The Loop

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   ┌──────────┐   ┌──────────┐   ┌──────────┐       │
  │   │ DISCOVER │──▶│  BREAK   │──▶│   FIX    │       │
  │   │ ^recon   │   │ ^break   │   │ ^fix     │       │
  │   └──────────┘   └──────────┘   └──────────┘       │
  │        ▲                              │             │
  │        │         ┌──────────┐         │             │
  │        │         │  REPORT  │         │             │
  │        │         │ ^integrate│         │             │
  │        │         └──────────┘         │             │
  │        │              ▲               │             │
  │        │         ┌──────────┐         │             │
  │        └─────────│  VERIFY  │◀────────┘             │
  │                  │ ^test    │                        │
  │                  └──────────┘                        │
  │                                                     │
  │  ─ ─ ─ CYCLE NEVER ENDS ─ ─ ─                      │
  └─────────────────────────────────────────────────────┘
```

## Phases

### Phase 1: DISCOVER (`^recon` / `^grasp`)
- Map integration points, boundaries, contracts
- Identify what talks to what, through what gate
- Output: component inventory + boundary map

### Phase 2: BREAK (`^break` — SEC-008)
- Non-destructive stress testing of each boundary
- Edge cases, malformed input, race conditions
- Verify fail-closed behavior under fault injection
- **CONSTRAINT: Read-only. No writes. No deletes. Dry-run only.**
- Output: failure modes + reproduction steps

### Phase 3: FIX (`^fix`)
- Minimal, targeted patches for each finding
- Ranked by severity (P0 → P2)
- Each fix includes rollback strategy

### Phase 4: VERIFY (`^test`)
- Run test suite confirming each fix
- Regression check: existing tests still pass
- New tests for each finding become permanent fixtures

### Phase 5: REPORT (`^integrate`)
- Structured findings with status
- Feed remaining gaps back to Phase 1
- Update organic tasks for next cycle

## Output Schema

```json
[
  {
    "id": "INT-001",
    "severity": "P0|P1|P2",
    "component": "bin/aicmd",
    "finding": "No guard integration — trivial bypass",
    "fix": "Add guard check before exec",
    "verify": "bun test tests/unit/guard.test.ts",
    "status": "open|fixed|verified|deferred"
  }
]
```

## Non-Destructive Constraint

ALL probes MUST be non-destructive:
- ✅ Read files, classify commands, check exit codes
- ✅ Run with `--dry-run`, `--check`, `--plan` flags
- ✅ Inspect env vars, parse configs, trace code paths
- ✅ Spawn isolated tangent for sandboxed probe
- ❌ Never write to production files
- ❌ Never execute destructive commands
- ❌ Never modify guard.ts, AIPOLICY.yaml, or codex/ during probe
- ❌ Never send real API calls during security probes

If a probe requires write access, mark it `MANUAL_VERIFY` for human execution.

## Integration with SEC-007 Workflow

SEC-007 is a **perpetual workflow** — it never completes.
Each cycle produces findings that become the next cycle's input.

```
Cycle N:  DISCOVER → BREAK → FIX → VERIFY → REPORT
                                                 │
Cycle N+1: DISCOVER ◀────────────────────────────┘
```

## Agents

| Phase | Default Agent | Tier |
|-------|--------------|------|
| DISCOVER | @chad, @aleph | T1 |
| BREAK | @ralph, @aleph | T1-T3 |
| FIX | @copilot, @haiku | T2 |
| VERIFY | @ralph | T1 |
| REPORT | @chad | T1 |
