# ^Todo: Multi-Phase Development Roadmap

**Version**: v0.2.3.1 (Architecture Locked)  
**Last Updated**: 2026-03-31  
**Status**: 🟢 READY FOR HANDOFF TO SONNET  
**Handoff Document**: synthetic/l-agence.org/docs/HANDOFF-HAIKU-TO-SONNET.md  
**Status Tracking**: Use `^todo` command (synthetic/l-agence.org/plans/ for team reference)

---

## 📍 PHASE COMPLETE: v0.2.3.1 — Architecture & Stabilization ✅ LOCKED

### ✅ All Completed (2026-03-31)
- [x] PATH validation hardening (codex/LAWS.md § Law 8)
- [x] Symbol hierarchy redesign (synthetic/l-agence.org/docs/SYMBOLS.md + Agent/Swarm scopes)
- [x] Scope model documentation (codex/TAXONOMY.md + HERMETIC/NEXUS/SYNTHETIC/ORGANIC)
- [x] Matrix math clarification (docs/MATRICES.md, SHARDING.md updated)
- [x] Shell environment standardization (codex/SETUP.md + WSL-Ubuntu default)
- [x] **Strategic plans created** (synthetic/l-agence.org/plans/ + 5-phase roadmap)
- [x] **Command router implemented** (8 commands: ^lesson, ^log, ^plan, ^todo, ^fault, ^issue, ^task, ^job)
- [x] **Knowledge skeleton created** (plans/, issues/, tasks/, jobs/ indices + INDEX.md/JSON)
- [x] **Fault relocation** (nexus/faults/ as local scope; lessons extracted and sanitized)
- [x] **Lesson extraction** (Catastrophic failure root cause analysis: [`synthetic/l-agence.org/lessons/2026-03-31-catastrophic-failure-root-cause-and-fix.md`](synthetic/l-agence.org/lessons/2026-03-31-catastrophic-failure-root-cause-and-fix.md))
- [x] **Session saved** ([`nexus/sessions/2026-03-31-design-milestone-v0.2.3.1.meta.json`](nexus/sessions/2026-03-31-design-milestone-v0.2.3.1.meta.json))

### Final Before v0.2.3.1 Release
- [ ] `.gitignore` final review (local symlinks, build artifacts)
- [ ] Smoke tests: version bump to v0.2.3.1 + verify all commands work
- [ ] Git commit: `^commit "v0.2.3.1: Architecture locked, design milestone complete"`

---

## 🚀 NEXT PHASE: v0.2.4 — Docker + Matrix Math (READY FOR SONNET)

**Owner**: Claude Sonnet 4 (or stronger)  
**Estimated Duration**: 3–4 weeks (Docker 1–2 weeks, Matrix Math 2–3 weeks parallel)  
**Handoff Document**: [`synthetic/l-agence.org/docs/HANDOFF-HAIKU-TO-SONNET.md`](synthetic/l-agence.org/docs/HANDOFF-HAIKU-TO-SONNET.md)

### Docker Foundations (Week 1–2)
- [ ] Dockerfile (WSL-Ubuntu LTS base)
  - Node.js (restricted, no npm)
  - TypeScript compiler only
  - `/workspace` mount point (POSIX-only paths)
  - `/run/secrets/{agent-id}` injection support
- [ ] Session metadata schema (TypeScript)
  - Captures both shell streams (left human + right agent)
  - File: `${NEXUS}/sessions/{sessionid}.json`
- [ ] aibash/aishell container adapters
  - Detect: container vs. local mode
  - Signal handlers: SIGKILL/SIGSTOP propagate
  - Exit hooks: flush metadata before death
- [ ] Integration test: spin container → run aibash → verify paths are `/workspace`-relative

### Matrix Math + Git Locking (Week 2–3, Parallel)
- [ ] Complexity evaluator (task scope → category: trivial | small | medium | large)
- [ ] Priority calculation (DAG + overrides → scores 1–10)
- [ ] Agent routing table (4×4 matrix: priority × complexity → model)
- [ ] Git merge strategy (resolve conflicts by agent priority + security labels)
- [ ] Cost tracking (per-task audit trail)

---

## 📊 Future Phases (Queued)
- validate_execution_context: Validates working directory context.
- show_help: Prints help and usage.
- mode_chat: Handles chat mode.
- mode_ai_routed: Handles AI-routed mode.
- router_chat: Stub for LLM chat.
- router_load_config: Stub for router config.
- mode_external: Handles external command mode.
- mode_init: Handles special initialization commands.
- init_agence_environment: Loads profile, copies skeleton files.
- reload_agence_context: Loads and summarizes context files.
- create_windows_symlink: Creates symlinks (platform-specific).
- mode_system: Handles system commands.
- repair_agence_symlinks: Repairs broken symlinks.
- install_agence_packages: Installs required packages.
- install_windows_packages: Windows-specific package install.
- install_macos_packages: macOS-specific package install.
- install_linux_packages: Linux-specific package install.

### Command-Line Modes to Test
- help: `agence help`
- version: `agence version`
- chat (default): `agence "query"`
- ai-routed: `agence +plan`
- external: `agence /terraform-plan`
- system: `agence !help`
- special init: `agence ^init`, `agence ^session-list`, etc.

### Test Coverage Goals
- Each function is invoked and validated for expected output and side effects.
- Each command-line mode is tested for correct routing and output.
- Edge cases: invalid arguments, missing files, context errors, permission errors.
- Platform-specific logic (Windows, macOS, Linux) is exercised where possible.

---

**Next Steps:**  
- Update shellspec spec file to cover all above functions and modes.
- Run `shellspec` and review results.
- Address any failures or missing coverage.

---

# ^Todo: Audit /slash Command Conflicts and Namespace Decision

## Context

Agence command prefix model (canonical):
| Prefix | Context                     | Example                          |
|--------|-----------------------------|----------------------------------|
| `^`    | Agence module (shared/synthetic context) | `^reload`, `^learn`, `^commit`  |
| `~`    | Agence hermetic context     | `~reload`, `~snapshot`           |
| `!`    | Shell launchers / tool invocation | `!bash`, `!aider`, `!cursor`, `!pilot` |
| `/`    | Pass-through to external tools + agence shortcuts | `/git status`, Claude Code `/loop` |
| `+`    | AI-routed autonomous mode   | `+plan-vpc`                      |

The `/` prefix is intentionally **permeable** — external tool slash commands (Claude Code, aider, etc.) should pass through agence unobstructed where possible. This means agence `/` shortcuts must not shadow tool commands users need.

## Problem

Current `/` shortcuts registered in agence:
- `/git`, `/status`, `/log`, `/remote`, `/fetch`, `/pull`, `/push`, `/commit`
- `/ghauth`, `/ghlogin`, `/gitstatus`, `/ghstatus`, `/ghcommit`, `/ghpush`
- `/terraform-*`, `/git-*`, `/aws-*`

Known conflicts with other tools using `/` in their own REPL:
| Tool        | Conflicting agence commands            | Risk level |
|-------------|---------------------------------------|------------|
| aider       | `/git`, `/commit`, `/diff`            | Low (different shell context) |
| Claude Code | `/status`, `/loop`, `/clear`, `/exit` | Medium (same terminal possible) |
| Cursor      | None detected yet                     | Low        |
| Copilot CLI | None detected yet                     | Low        |

## Decision Required

Option A: Keep current naming, document conflicts, rely on tool-context separation.  
Option B: Prefix agence git shortcuts as `/g<cmd>` (`/gstatus`, `/glog`, `/gpull`).  
Option C: Prefix agence git shortcuts as `/git-<cmd>` (`/git-status`, `/git-log`).  
Option D: Allow `/` passthrough for unknown commands to the active tool context.

**Recommended direction**: Option D + document Option B as a future migration.  
Unknown `/cmd` should try to delegate to active tool context before erroring.

## Action Items
- [ ] Enumerate all known slash commands for: Claude Code, aider, Cursor, Copilot CLI
- [ ] Determine which agence `/` shortcuts collide with common tool commands
- [ ] Decide on namespace strategy (A/B/C/D or hybrid)
- [ ] Consider `/g<cmd>` migration path for git shortcuts (non-breaking, keep aliases)
- [ ] Update COMMANDS.md EBNF and conflict documentation
- [ ] Add spec tests for passthrough behavior

---

# ^Todo: Integrate Claude Code — /loop + /btw + Tool Invocation

## Context

Claude Code (via GitHub Copilot Pro) is now installed and available. Agence should:
1. **Integrate Claude Code's `/loop` command** — enable persistent autonomous agentic loops from agence context
2. **Add `/btw` non-blocking instruction** — a "by the way" async/side-channel instruction that queues context without blocking the current task
3. **Enable `!<tool>` shell invocation** — consistent launcher pattern for all AI tools

## Claude Code Integration

### `/loop` passthrough
Claude Code's `/loop` runs an autonomous agentic loop. Agence should:
- Detect when `/loop` is invoked via agence
- Pass through to Claude Code with agence context (AGENCE_REPO, GIT_ROOT, codex/ loaded)
- Consider pre-loading agence context (PRINCIPLES.md, LAWS.md, RULES.md) into Claude Code session

### `/btw <instruction>` — Non-Blocking Side-Channel
A new agence meta-command for non-blocking context injection:
- `agence /btw fix the linting warnings in router.sh when you get a chance`
- Stores instruction in `nexus/.aitodo/btw.queue` (append-only)
- Does NOT interrupt current task or agent loop
- Agents poll `btw.queue` at natural checkpoints
- Cleared after acknowledgement or session end

Example use cases:
```bash
agence /btw "also update the CHANGELOG when done"
agence /btw "remember to add tests for anything you write"  
agence /btw "the deadline for this sprint is Friday"
```

## `!<tool>` Shell Launcher Pattern

Consistent invocation for all AI coding tools via `!`:
```bash
agence !aider          # launch aider in current repo context
agence !cursor         # launch Cursor
agence !pilot          # launch GitHub Copilot CLI
agence !ralph          # launch Ralph (if configured)
agence !claude         # launch Claude Code (cc / claude)
agence !claude /loop   # launch Claude Code in /loop mode
```

Each launcher should:
1. Verify the tool is installed (command -v check)
2. Pre-export agence context vars (GIT_ROOT, AGENCE_REPO, etc.)
3. Pass any trailing args to the tool
4. Return tool exit code to agence

## Action Items
- [ ] Implement `/btw <instruction>` handler in mode_external
  - Appends to `nexus/.aitodo/btw.queue` with timestamp
  - Success response: `[BTW] Queued: "<instruction>"`
- [ ] Implement `!claude` / `!aider` / `!cursor` / `!pilot` launchers in mode_system
  - Each checks tool availability, exports context, passes args
- [ ] Implement `/loop` passthrough to Claude Code
  - Pre-load agence codex context into session
  - Consider `^loop` as alternative prefix for agence-native loop
- [ ] Add `btw.queue` reader to agent checkpoint logic (nexus/.aitodo/)
- [ ] Add spec tests for /btw (unit-testable, no TTY needed)
- [ ] Add spec tests for !<tool> availability checks (can mock with false/true)
- [ ] Document in COMMANDS.md
- [ ] Consider whether agence should replicate Claude Code /loop natively (`^loop`)

---

# ^Todo: ARCHITECTURE — Multi-Agent Swarm with WSL/Docker & 2-Column Tiles (v0.2.4+)

## Vision (2026-Q2/Q3)

**Unified agent execution model** across local dev and future distributed environments:
- **Container**: Each agent runs in isolated WSL-Ubuntu Docker container
- **Tile interface**: 2-column VSCode layout (human control plane + agent execution plane)
- **Job control**: POSIX signals + shell `%jobs` for coordination
- **Real-time observability**: Both tiles logged simultaneously
- **Path normalization**: Container mount point = single source of truth

## Phase 1: v0.2.3.1 — Harden Current System & Document Architecture (IN PROGRESS)

**Finalize path validation + document constraints + symbol hierarchy** (blocks Phase 2)

- [x] Kill auto-healing junction creation (no security layer path patching)
- [x] Use `realpath()` before scope validation
- [x] Document in LAWS.md: "Symlinks/junctions for routing only, never for security"
- [x] Add PATH validation constraints to LAWS.md (Law 8)
- [x] Add symbol scope constraints to LAWS.md (Law 8)
- [x] Create TAXONOMY.md: HERMETIC, NEXUS, SYNTHETIC, ORGANIC scope model
- [x] Rewrite SYMBOLS.md with hierarchical state model (Agent + Swarm reserved)
- [x] Update MATRICES.md with Agent/Swarm scope clarification
- [x] Update SHARDING.md with future swarm bridge notes
- [ ] Update `.gitignore` to exclude local user symlinks (synthetic/@, hermetic/@/*)
- [ ] Add comment blocks to security validation functions: "Never create paths"
- [ ] Verify in local smoke tests: path validation rejects escapes (without junctions)
- [ ] Stabilize branch `rel_0.2.2_agence_swarm_sessions` → merge to `main`

**v0.2.3.1 Completed**: LAWS.md hardened, TAXONOMY.md created, SYMBOLS.md hierarchical model locked

**Remaining**: .gitignore updates, comment blocks, smoke tests, merge to main

**Estimate**: 1–2 weeks (command router implementation + smoke tests)

---

## Phase 1.5: v0.2.3.2 — Command Router Implementation (QUEUED)

**Implement scope-aware command routing** (enables TAXONOMY, consolidates CLI)

- [ ] Implement `^lesson [list|show|add]` → synthetic/@/lessons/
- [ ] Implement `^log [list|show|add]` → nexus/logs/ (local-only)
- [ ] Implement `^plan [list|show|add]` → synthetic/@/plans/ (default routing)
- [ ] Implement `^todo [list|show|add]` → hermetic/@/todos/ (always local)
- [ ] Implement `^fault [list|show]` → nexus/faults/ (local-only)
- [ ] Implement `^issue [list|show|add]` → synthetic/@/issues/
- [ ] Implement `^task [list|show|add] --assign AGENT` → organic/tasks/
- [ ] Implement `^job [list|show|add] --agent NAME` → organic/jobs/
- [ ] Add routing inheritance logic: `--org NAME` override, fallback to default
- [ ] Add shell completion for all 8 commands
- [ ] Wire to command router (bin/^)
- [ ] Update COMMANDS.md with new command grammar
- [ ] Smoke tests: all 8 commands with defaults + overrides

**Estimate**: 1–2 weeks (boilerplate + integration)

---

## Phase 2: v0.2.4 — Docker Foundations & Matrix Math

**Build container + session layer + matrix math foundation** (prerequisite for Phase 3 tiles)

- [ ] Create Dockerfile: WSL-Ubuntu LTS (22.04+) + Node.js (restricted, no npm) + TypeScript
- [ ] Copy aishell + aibash into container (adapt for container environment)
- [ ] Session metadata format: JSON structure capturing both tiles
  ```json
  {
    "session_id": "ralph-20260401_120000-12345-abc123",
    "agent": "ralph",
    "container": "agence-ralph-001",
    "started_at": "2026-04-01T12:00:00Z",
    "tiles": {
      "left": {
        "stream": "human_console",
        "command": ["docker", "exec", "-it", "agence-ralph-001", "/bin/bash"],
        "tty": true
      },
      "right": {
        "stream": "agent_shell",
        "command": ["/usr/local/bin/aibash"],
        "subjell": true,
        "parent_pid": "TBD"
      }
    },
    "secrets": {
      "path": "/run/secrets",
      "available": ["agent-creds", "api-tokens"]
    }
  }
  ```
- [ ] Docker entrypoint: spawn left shell (docker exec bash) + seed aibash in background
- [ ] Implement aibash signal handlers (`trap 'flush_metadata; exit 143' SIGKILL`)
- [ ] Session JSON written to `/tmp/agence-session.json` (inside container, human reads via left tile)
- [ ] Test: manual docker run + 2-tile simulation (bash in left, aibash in right via bg job)

### Matrix Math & Git-Based Coordination

**Estimated 1–2 weeks (parallel with Docker work)**

- [ ] Document: Complexity metrics schema (LOC, modules, categories: trivial/small/medium/large)
- [ ] Document: Priority calculation (blocking impact + human overrides)
- [ ] Create: organic/matrix-state.json schema (signed tasks + workflow dependencies)
- [ ] Implement: matrix-math.ts core algorithm
  - `calculatePriority(task, dag, human_overrides)`
  - `evaluateComplexity(task_scope)`
  - `routeAgent(priority, complexity, cost_budget)`
  - `applyHumanOverride(task, override)`
- [ ] Implement: Custom Git merge strategy for agent conflict resolution
- [ ] Test: Simple DAG with 3 tasks, priority matrix ordering

**v0.2.4 Estimate**: 2–3 weeks overall (Docker + Matrix Math in parallel)

---

## Phase 3: v0.3.0 — VSCode Tile Integration

**2-column layout + job control surface**

- [ ] VSCode extension: agent row layout (N agents = N rows, each 2 columns)
  ```
  ┌─────────────────────┬─────────────────────┐
  │ Agent: ralph        │ ralph's aibash      │
  │ (L: docker exec)    │ (R: agent plane)    │
  ├─────────────────────┼─────────────────────┤
  │ Agent: claudia      │ claudia's aishell   │
  │ (L: docker exec)    │ (R: agent plane)    │
  └─────────────────────┴─────────────────────┘
  ```
- [ ] Left tile: `docker exec -it` terminal (human has full control)
- [ ] Right tile: subjell inside left tile (background job, `%jobs` visible)
- [ ] Hotkey `Ctrl+K`: SIGKILL aibash (human stop, tracked in session)
- [ ] Hotkey `Ctrl+Z`: SIGSTOP aibash (pause, then `fg` resumes)
- [ ] Command `%jobs`: inspect all running tasks in agent row
- [ ] Session capture: Both tiles logged simultaneously
  - Left: console I/O (human decisions, commands issued)
  - Right: aibash metadata (agent actions, decisions)
- [ ] Test: N agents running, human controls left tiles, agents run tasks in right tiles

**Estimate**: 3–4 weeks (VSCode extension dev + terminal API)

---

## Phase 4: v0.3.1 — Multi-Agent Orchestrator

**Collision prevention + task queue + DWM integration**

- [ ] Orchestrator core: task queue + idle agent pool
- [ ] Task contract format: `{ scope, max_steps, constraints, inputs, approval_level }`
- [ ] Execution bridge: validates scope (realpath against allowed roots), enforces max_steps, blocks network/subprocess
- [ ] Collision avoidance: no two agents touch same `scope` simultaneously
- [ ] DWM gateway: agents write lessons → human reviews → merged if approved
- [ ] Session consolidation: read N `agence-session.json` files → merge into nexus/sessions/ entry
- [ ] Test: 3 agents, 2 tasks (one should queue, one execute; roles swap after first completes)

**Estimate**: 4+ weeks (orchestrator logic + DWM gating)

---

## Phase 5: Future — Multi-Cloud Distribution via Skupper

**Scale to distributed agents** (after local proven stable)

- [ ] Skupper networking: virtual application network across remote containers
- [ ] Reuse same orchestrator + execution bridge logic (only networking changes)
- [ ] Non-negotiable constraints:
  - Policy authority stays centralized (one DWM)
  - No auto-healing in security layer (validated at container mount time)
  - Task queue routed through central orchestrator (not agent-to-agent messages)
  - Append-only audit ledger (all agent actions logged with timestamp + decisions)
- [ ] Test: agents on separate VMs/clouds, orchestrator can schedule across both

**Estimate**: TBD (depends on Phase 4 maturity)

---

## Action Items (By Phase)

### Phase 1 (v0.2.3 — NOW)
- [ ] Read + implement LAWS.md constraint docs
- [ ] Update `.gitignore` for local symlinks
- [ ] Add "No path creation" comment blocks

### Phase 2 (v0.2.4)
- [ ] Build Dockerfile (start from `docker.io/ubuntu:22.04`)
- [ ] Port aibash + aishell to container
- [ ] Implement session JSON schema
- [ ] Signal handlers in aibash

### Phase 3 (v0.3.0)
- [ ] Research VSCode terminal split API (proposed API?)
- [ ] Prototype row layout (mock data)
- [ ] Implement hotkey handlers

### Phase 4 (v0.3.1)
- [ ] Spec orchestrator task contract
- [ ] Build execution bridge (scope validator)
- [ ] Implement DWM approval gate

### Phase 5 (Future)
- [ ] Skupper proof-of-concept
- [ ] Append-only ledger design

---

## Key Constraints (Hard Rules)

1. **Path validation**: NEVER create symlinks/junctions in security layer (only validate)
2. **Session capture**: Both tiles logged, human can see everything
3. **Job control**: Use POSIX signals + shell `%jobs`, no custom coordination protocol
4. **Secrets**: `/run/secrets` mounted at container start-time only
5. **Authority**: Human always has override (left tile has full control)
6. **Knowledge": Only humans route lessons to shared DWM (no auto-publish)
