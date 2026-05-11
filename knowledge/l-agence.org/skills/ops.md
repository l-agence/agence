# ^deploy — Deployment & Release Operations

## Purpose
Plan and execute deployments safely: pre-flight checks, rollback strategy, health verification, and post-deploy validation.

## Inputs
- Deployment target (environment, service, infrastructure)
- Change description (what's being deployed)
- Optional: rollback plan, health check endpoints

## Outputs
- Pre-flight checklist
- Deployment plan with steps
- Rollback strategy
- Post-deploy verification steps

## Agent Routing
- Default: @chad (DevOps/infra)
- Peer: @peers ^deploy for consensus on risky deploys

## Artifact
- Type: result
- Scope: organic/results/

---

# ^brainstorm — Ideation & Divergent Thinking

## Purpose
Generate diverse ideas, explore unconventional approaches, challenge assumptions, and map possibility space. Organize ideas by feasibility and impact.

## Inputs
- Topic or problem statement
- Optional: constraints, goals, prior art

## Outputs
- Idea list organized by theme
- Feasibility × impact matrix
- Unconventional approaches section
- Recommended next steps

## Agent Routing
- Default: @feynman (explainer, creative thinker)
- Peer: @pair ^brainstorm for 2-way creative synthesis

## Artifact
- Type: analysis
- Scope: knowledge/analyses/ (or hermetic if sensitive)

## Notes
- Brainstorms are directional, not authoritative
- Per user preference: treat as tentative vision, not gospel

---

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

---

# Skill: Terminal Operations via aicmd

## When to Use

ALWAYS use `aicmd` when executing commands that produce significant output:
- Docker builds (`docker build`, `docker compose`)
- Test suites (`shellspec`, `bun test`, `npm test`)
- Package installs (`apt-get`, `bun install`, `pip install`)
- Long-running processes (servers, watchers, CI pipelines)
- Any command where output exceeds ~50 lines

## Why

VS Code's terminal integration has a **16KB output buffer**. When output exceeds this:
- The agent sees empty/truncated output and starts hallucinating results
- Token waste from repeated polling (`get_terminal_output` returning blanks)
- Costly mistakes from acting on imaginary build results
- Minutes of wall-clock time lost to polling loops

`aicmd` wraps commands with `script(1)` (Unix typescript) or tmux `pipe-pane` — full I/O capture to a file in `nexus/.aisessions/DD/`. The file is always readable even while the command runs.

## Usage

```bash
# Instead of running directly:
docker build -t agence/agent:latest --progress=plain .

# Wrap with aicmd:
bin/aicmd docker build -t agence/agent:latest --progress=plain .
```

## Reading Output

After launching via aicmd, read the typescript file instead of polling the terminal:

```bash
# Find the latest typescript (day-sharded under DD = day of month)
ls -lt nexus/.aisessions/$(date +%d)/*.typescript | head -1

# Tail last N lines of output
tail -30 nexus/.aisessions/$(date +%d)/copilot-*.typescript

# Check if build succeeded (search for keywords)
grep -i 'error\|fail\|done\|success' nexus/.aisessions/$(date +%d)/copilot-*.typescript | tail -10
```

## Pattern: Fire and Read

1. **Fire**: `bin/aicmd <command>` in async terminal mode
2. **Read**: `tail -N` or `grep` on the typescript file (fast, no buffer limit)
3. **Verify**: Check `.meta.json` for exit code after completion

This pattern eliminates:
- Terminal buffer truncation
- Polling loops that waste tokens
- Hallucinated command output
- False success/failure conclusions

## When NOT to Use

- Quick one-liners that produce <10 lines (e.g., `git status`, `ls`, `wc -l`)
- Interactive commands that need stdin (e.g., `read`, `vim`)
- Commands already inside tmux with pipe-pane active (`AGENCE_PIPE_PANE=1`)

## Prerequisites

- `bin/.agencerc` sourced (sets `AI_ROOT`, `AI_BIN`)
- `lib/env.sh` sourced (provides `agence_session_day_dir`)
- `script` command available (standard on Linux/macOS/WSL)
