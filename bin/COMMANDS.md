# Agence Commands

**Comprehensive reference for all Agence initialization and special commands.**

All commands are routed through `agence` script for validation and logging.

---

## Command Modes

### Chat Mode (Default)
```bash
agence "<query>"
agence "How do I deploy to AWS?"
```
Send arbitrary query to LLM via default agent.

### AI-Routed Mode
```bash
agence +<request>
agence +plan-vpc-infrastructure
```
LLM analyzes request and determines appropriate action (autonomous).

### External Command Mode
```bash
agence /<command>
agence /terraform-plan
agence /git-status
agence /aws-list-buckets
```
Execute pre-validated external commands.

### System Utility Mode
```bash
agence !<command>
agence !help
agence !version
agence !config
agence !status
agence !bash
agence !shell
```
Built-in system utilities and shell launchers.

### Initialization Mode (Special)
```bash
agence ^<command>
agence ^init
```
Special initialization and setup commands.

---

## Initialization Commands

### `agence ^init`

**Purpose**: Initialize Agence environment for a new workspace.

**What it does**:
- Creates Git symbolic links (mode 120000) for cross-platform symlinks
- Links Agence managed files to parent repository
- ONLY creates links if target files do not already exist
- Safe to run multiple times

**Symlinks created** (only if targets don't exist):

```bash
$AGENCE_REPO/.github/copilot.md → $GIT_REPO/.github/copilot-instructions.md
$AGENCE_REPO/.github/CLAUDE.md → $GIT_REPO/CLAUDE.md
```

**Configuration**:

- `$AGENCE_REPO`: Agence submodule root (defaults to ~/.agence)
- `$GIT_REPO`: Parent repository root (auto-detected or set manually)

**Special case**: In this Agence instance, `$GIT_REPO == $AGENCE_REPO` (standalone). In general deployments, they differ:
- Agence is a submodule in `parent-repo/.agence/`
- GIT_REPO points to `parent-repo/`
- Commands link Agence knowledge to parent repo

**Usage**:

```bash
# First time setup (from anywhere in repo)
cd /path/to/repo
agence ^init

# Output:
# [INFO] Created symlink: /path/to/repo/.github/copilot-instructions.md → ...
# [INFO] Created symlink: /path/to/repo/CLAUDE.md → ...
# [OK] Agence initialization complete
```

**Error Handling**:

- If `$AGENCE_REPO/.github/copilot.md` doesn't exist → Error (source file missing)
- If target symlink already exists → Skipped (already initialized)

**Platform Support**:

- **Windows (Git-Bash/Cygwin/WSL)**: Uses git-native symlink mode 120000
- **Linux/macOS**: Uses git-native symlink mode 120000

---

### `agence ^reload`

**Purpose**: Load and acknowledge the entire Agence knowledge hierarchy.

**What it does**:
- Parses all context files in proper order
- Reports file sizes and line counts
- Summarizes active knowledge (principles, laws, rules, lessons)
- Verifies context is consistent and complete

**Context hierarchy** (in load order):

```
1. CLAUDE.md (LLM integration guide)
   ↓
2. copilot-instructions.md (Copilot/IDE integration)
   ↓
3. PRINCIPLES.md (Philosophical maxims)
   ↓
4. LAWS.md (Hard constraints)
   ↓
5. RULES.md (Best practices)
   ↓
6. COMMANDS.md (Command reference)
   ↓
7. FAULTS.md (Recorded faults)
   ↓
8. LESSONS.md (Lessons learned)
```

**Usage**:

```bash
# Reload all context
agence ^reload

# Output:
# [RELOAD] Agence Context Loading
# ==========================================
# ✓ Claude Integration              | 6079 bytes | 120 lines
# ✓ Copilot Instructions            | 11129 bytes | 240 lines
# ✓ Principles (Maxims)             | 2340 bytes | 45 lines
# ✓ Laws (Hard Constraints)         | 3210 bytes | 65 lines
# ✓ Rules (Best Practices)          | 4560 bytes | 98 lines
# ✓ Commands Reference              | 5340 bytes | 120 lines
# ✓ Faults Index                    | 890 bytes | 20 lines
# ✓ Lessons Learned                 | 1120 bytes | 25 lines
#
# ==========================================
#
# Context Summary:
#   Total files loaded: 8 / 8
#
# Active Knowledge:
#   Principles/Maxims: 4
#   Laws (Constraints): 2
#   Rules (Practices): 12
#   Lessons Learned: 1
#
# Status: ✓ Agence context fully loaded and acknowledged
```

**Why use it**:

- **After initialization**: Verify all context files are present
- **In a new session**: Acknowledge the current knowledge state
- **Before critical work**: Ensure context is fresh and consistent
- **Debugging**: Identify missing or outdated context files

**Error Messages**:

- `✗ [NOT FOUND]` → Context file is missing, may need to run `^init`
- File sizes → Can help identify corrupted or truncated files

---

### `agence ^aido <command>`

**Purpose**: Execute whitelisted read-only and idempotent commands (opposite of sudo).

**Philosophy**: Where `sudo` grants privilege escalation, `aido` grants *constraint reduction* - only allowing safe, non-destructive operations.

**What it does**:
- Validates command against family-specific whitelists
- Blocks destructive operations (write, delete, push, etc.)
- Only allows read-only and query operations
- Minimal prompts (just execute or block)

**Three command families supported**:

#### 1. Git Commands
Safe subcommands (read-only, inspection only):
```bash
agence ^aido git status
agence ^aido git log --oneline
agence ^aido git diff HEAD~1
agence ^aido git branch -a
agence ^aido git tag
agence ^aido git reflog
agence ^aido git describe
agence ^aido git config --list
agence ^aido git remote -v
agence ^aido git rev-parse HEAD
agence ^aido git show HEAD
agence ^aido git ls-files
agence ^aido git ls-tree HEAD
agence ^aido git grep "pattern"
agence ^aido git cat-file -t HEAD
agence ^aido git ls-remote origin
```

**Blocked** (even though technically safe in some contexts):
```
push      - Remote mutation
pull      - Remote state change
merge     - Destructive in conflict
commit    - Mutates repository
reset     - Destructive
rebase    - Destructive
checkout  - Could lose work
```

#### 2. AWS Operations
Safe patterns (describe, get, list, query only):
```bash
agence ^aido aws describe-instances
agence ^aido aws describe-vpcs
agence ^aido aws get-caller-identity
agence ^aido aws list-buckets
agence ^aido aws list-instances --region us-east-1
agence ^aido aws head-bucket --bucket my-bucket
agence ^aido aws auth status
agence ^aido aws sts get-session-token
```

**Blocked** (any mutation):
```
create-*  - Infrastructure mutation
delete-*  - Destructive
modify-*  - State change
update-*  - State change
put-*     - Write operations
```

#### 3. PowerShell Verbs
Safe verb-noun pairs (Get/Test/Measure/etc only):
```bash
# When in PowerShell context:
Get-Service
Get-Process
Test-Path C:\logs
Measure-Object -InputObject $data
Select-Object -Property Name, Id
Where-Object { $_.Status -eq 'Running' }
Sort-Object -Property Created
Group-Object -Property Key
Compare-Object $list1 $list2
```

**Blocked verbs**: Set, New, Remove, Update, Clear, Start, Stop, Restart, etc.

**Usage**:

```bash
# Git inspection
agence ^aido git log --oneline -10

# AWS query
agence ^aido aws describe-instances --region us-west-2

# Enable debug output
AIDO_DEBUG=1 agence ^aido git status
```

**Output examples**:

Allowed:
```
$ agence ^aido git status
[AIDO] ✓ Executing: git status
On branch master
nothing to commit, working tree clean
```

Blocked:
```
$ agence ^aido git push
[AIDO] ✗ BLOCKED: Git command not whitelisted: push

Allowed git commands:
  • status
  • log
  • diff
  • branch
  • tag
  ... (full list)
```

**Why aido matters**:

- **Reduced cognitive load**: No prompts for safe operations
- **Muscle memory**: Can shell-pipe aido commands in scripts safely
- **Audit trail**: All allowed operations are obviously safe
- **Learning tool**: Shows what operations are "blessed" as safe

**Error codes**:
- `0` = Command executed successfully
- `1` = Command blocked (not whitelisted)

---

## Command Structure

All commands follow this validation pipeline:

```
Input: agence ^init
  ↓
[CODEX Check] Verify command is allowed
  ↓
[Execution] Route to appropriate handler (mode_init)
  ↓
[Logging] Log result to nexus/logs/
  ↓
[Output] Return status and message
```

---

## Command Safety & Safeguards

### Dangerous Operators

Agence detects and blocks the following shell metacharacters unless explicitly approved:

```
>       Redirect STDOUT (file overwrite)
>>      Redirect STDOUT (file append)
|       Pipe to another command
&&      AND operator (conditional execution)
;       Command separator
$()     Command substitution
```

**Why blocked**: Silent file overwrites, unintended command chaining, information leaks.

**Example**:

```bash
$ agence /something > output.txt
[WARN] Dangerous operator detected: '>'
[PROMPT] Confirm? [y/N] y
```

---

## Environment Variables

### Required

- `AGENCE_REPO`: Path to Agence root (auto-set from script location)
- `GIT_REPO`: Path to parent repository (auto-detected from `.git` search)

### Optional

- `AGENCE_DEBUG=1`: Enable debug output
- `AGENCE_QUIET=1`: Suppress non-error output
- `AGENCE_LLM_PROVIDER`: LLM provider (default: claude)
- `ANTHROPIC_API_KEY`: API key for Claude
- `AGENCE_SKIP_OPERATOR_CHECK=1`: Disable dangerous operator checks (not recommended)

### Execution Context

Before any command runs:

1. Shell environment is detected (git-bash, WSL, cygwin, etc.)
2. Paths are normalized to current shell
3. GIT_REPO and AGENCE_REPO are initialized
4. Current working directory is validated (must be in one of the repos)
5. Dangerous operators are detected and blocked (requires user confirmation)

If validation fails → Command aborts (CODEX LAW 2).

---

## Exit Codes

```
0       Command succeeded
1       Command failed or validation error
2       Configuration missing
3       Permission denied
```

---

## Examples

### Basic initialization
```bash
agence ^init
# Creates symlinks for first time
```

### With debug output
```bash
AGENCE_DEBUG=1 agence ^init
# Shows file paths and symlink creation details
```

### Quiet mode (no output unless error)
```bash
AGENCE_QUIET=1 agence ^init /path/to/repo
# Only shows errors, no info messages
```

### Manual repo specification
```bash
export GIT_REPO=/path/to/other/repo
agence ^init
# Links Agence files to /path/to/other/repo instead of auto-detected repo
```

---

## See Also

- [PRINCIPLES.md](../codex/PRINCIPLES.md) - Philosophical maxims
- [LAWS.md](../codex/LAWS.md) - Hard constraints
- [RULES.md](../codex/RULES.md) - Best practices
- [bin/agence](./agence) - Main script

