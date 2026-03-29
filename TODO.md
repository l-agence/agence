# ^Todo: ShellSpec Test Coverage for bin/agence

## Test Plan for bin/agence

### Functions to Test
- detect_shell_environment: Detects shell and OS environment variables.
- normalize_path: Normalizes file paths for different OS/shells.
- source_if_exists: Sources a file if it exists.
- init_execution_context: Initializes repo context variables.
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
