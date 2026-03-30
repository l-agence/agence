# ^Todo: Backport remaining functions from ^.73aad08.nogit

## Context

Session 2026-03-29 recovered 4 missing functions and restored mode_session. The
larger caret file (^.73aad08.nogit, 2407L) still has functions not yet backported
into the current bin/agence (1569L). Ordered by priority:

## Action Items

- [ ] Backport `shell_bash_session()` + `shell_powershell_session()` — launch tracked shells, write meta JSON to nexus/.aisessions/
- [ ] Backport `generate_shell_session_id()` — format: `bash-YYYYMMDD_HHMMSS-PID-HEXID`
- [ ] Backport `set_vscode_terminal_title()` — `printf '\033]0;%s\007' "$title"`
- [ ] Backport `get_agent_id()` — `echo "${AIDO_AGENT:-ai-agent}"`
- [ ] Backport `parse_agent_prefix()` — parses `@agentname command` syntax, exports `AGENCE_AGENT_PARAM`
- [ ] Backport `stash_agence_changes()` + `sync_agence_changes()` from agence.stash.nogit — `^stash`, `^sync`
- [ ] Backport `fetch_agence_changes()` + `rebase_agence_changes()` from agence.stash.nogit
- [ ] Replace current `learn_agence_changes` with `learn_from_sessions()` — richer, scans sessions+faults+lessons
- [ ] Replace `commit_agence_changes` with `commit_knowledge_changes()` — targets globalcache+synthetic+nexus/faults
- [ ] Replace `save_session` with `save_session_context()` — captures full git state, uses format helpers
- [ ] Add `reindex_knowledge_bases()` — calls `bin/indexer`, `^reindex` command
- [ ] Add stub commands: `^handoff`, `^pickup`, `^pause` (stubs OK for now)
- [ ] Add `-j` JSON format flag support to `mode_init` (`agence_detect_format`)
- [ ] Fix `bin/aibash` — duplicate help block (copy-paste LLM artifact), missing execution body
- [ ] Integrate `lib/format.sh` into `bin/aisession` (replace inline banners with agence_format_*)

## Completed This Session (2026-03-29)

- [x] `.gitattributes` — LF policy enforced globally
- [x] CRLF fix — all scripts/text converted (dos2unix)
- [x] `bin/agence --help/version` dispatch fix (no router on non-LLM commands)
- [x] Restored `save_session`, `learn_agence_changes`, `commit_agence_changes`, `push_agence_changes`
- [x] Fixed `mode_init` arg parsing (`init_cmd` + `init_args`)
- [x] Added `mode_session()` — 9 subcommands
- [x] jq installed (WSL + Windows)
- [x] `lib/format.sh` implemented — 8 `agence_format_*` helpers (text/plain/json modes)
- [x] Smoke tests passing: `agence --help`, `agence version`, `lib/format.sh`, `bin/aisession list`
- [x] Commits: 21f31bc, 4398618, 9a389c9, 0667f3e

---

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
