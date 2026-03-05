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

### `agence ^learn`

**Purpose**: Scan and absorb changes to Agence files without restarting.

**What it does**:
- Scans all monitored Agence files for modifications since last scan
- Compares file timestamps against internal checkpoint
- Lists all changed files with modification dates and sizes
- Re-reads and ingests updated context
- Summarizes knowledge base state (principles, laws, rules, lessons)
- Updates internal timestamp for next incremental scan

**Monitored files**:

```
codex/PRINCIPLES.md          - Maxims and core philosophy
codex/LAWS.md                - Hard constraints
codex/RULES.md               - Best practices
codex/agents/*.md            - Agent personas (Claudia, Ralph, Sonny, Lima, Haiku)
synthesis/lessons/*.json     - Captured insights and lessons learned
.github/CLAUDE.md            - Agent context and instructions
.github/copilot-*.md         - Copilot integration files
```

**Usage**:

```bash
# After manually updating Agence markdown files
vi codex/RULES.md              # Update some rules
agence ^learn                  # Agent re-reads changes

# Output:
# [LEARN] Scanning for modified Agence files...
# ==========================================
# ✓ UPDATED: codex/RULES.md
#   Modified: 2026-03-05 10:23:45
#   Size: 17250 bytes
#
# Summary:
#   Files changed: 1
#   Changed files:
#     - codex/RULES.md
#
# Re-reading context files...
#   ✓ Principles: 4 maxims
#   ✓ Laws: 4 constraints
#   ✓ Rules: 14 practices
#   ✓ Lessons: 3 captured
#
# ==========================================
# ✓ Context updated successfully!
```

**Why use it**:

- **After local edits**: Update agent knowledge without session restart
- **Team collaboration**: Pull changes from git and have agent absorb them
- **Rapid iteration**: Fix rules/principles and see effect immediately
- **No downtime**: Agent can continue with updated context in same session

**Incremental scanning**:
- First run: Scans all files
- Subsequent runs: Only checks files modified since last `^learn`
- Timestamp stored in `.agence_learn_timestamp` (not version controlled)

---

### `agence ^save [notes]`

**Purpose**: Persist current session state for later resumption or handoff.

**What it does**:
- Captures agent context, execution state, and memory
- Generates unique session ID (8-char hex timestamp)
- Saves to `nexus/sessions/session-saved.jsonl`
- Updates `nexus/sessions/INDEX.md` with session metadata
- Allows resumption via `agence ^resume SESSION_ID`

**Session data captured**:

```
session_id         - Unique 8-char hex identifier
created_at         - ISO 8601 timestamp
status             - Current status (saved|paused|handoff|completed)
agent              - Which agent manages this session
notes              - User-provided context about session
runstate           - Execution state details:
  ├─ agent_context     - Current agent memory/context
  ├─ execution_stack   - Current working directory, file states
  ├─ memory_state      - Shell env, history, variables
  ├─ cursor_position   - Active file and line
  ├─ last_command      - Previous command executed
  └─ todo_list         - Outstanding tasks/checkpoints
metadata           - Session metadata:
  ├─ task_description  - What this session was working on
  ├─ repo              - Git repository path
  ├─ priority          - Task priority (low|normal|high)
  └─ tags              - Topic tags (#deployment, #bug-fix, etc.)
```

**Usage**:

```bash
# Save with notes (interactive or direct)
agence ^save "Implementing OAuth2, halfway through Step 2"

# Save with just timestamp (user prompted for notes)
agence ^save

# Output:
# ✓ Session saved!
#   Session ID:   69a8f74c
#   Status:       saved
#   Location:     .agence/nexus/sessions/session-saved.jsonl
#   Index:        .agence/nexus/sessions/INDEX.md
#
# Resume with: agence ^resume 69a8f74c
```

**Session lifecycle**:

```
^save (create)
  ↓
session-saved.jsonl (persisted)
  ├─ ^resume (continue)
  ├─ ^handoff (transfer)
  └─ ^archive (aged out)
```

**Finding sessions**:

```bash
# List all saved sessions
grep "saved" .agence/nexus/sessions/INDEX.md

# Find sessions for specific agent
grep "@claudia" .agence/nexus/sessions/INDEX.md

# Find by date range
grep "2026-03-0" .agence/nexus/sessions/INDEX.md
```

**Why save sessions**:

- **Interruption recovery**: Resume context after system reboot
- **Context handoff**: Pass work to another agent with full state
- **Work tracking**: Historical record of what was being worked on
- **Institutional memory**: Lessons and decisions captured with context

---

### `agence ^commit [message]`

**Purpose**: Commit all changed Agence files to git (respects .gitignore).

**What it does**:
- Detects modified files in .agence/
- Respects .gitignore (excludes nexus/, secrets, etc.)
- Shows summary of what will be committed
- Prompts for commit message if not provided
- Uses `git add -A` and `git commit`

**Key principle (LAW 5)**: Never ignore .gitignore - ephemeral state (NEXUS) is never version controlled.

**Usage**:

```bash
# Commit with inline message
agence ^commit "Updated rules and agent personas"

# Commit interactively (prompted for message)
agence ^commit

# Output on success:
# [COMMIT] Agence Files Summary
# ==========================================
# M  codex/RULES.md
# M  synthesis/l-agence.org/lessons/abc123.json
# ?? .github/README.md
# 
# ==========================================
#
# ✓ Committed successfully!
#   Commit message: Updated rules and agent personas
#
# Next: agence ^push (to push to origin)
```

**What gets committed**:
- ✅ codex/ - Knowledge (principles, laws, rules, agents)
- ✅ synthesis/ - Learning and documentation
- ✅ .github/ - Integration files  
- ✅ bin/ - Commands and scripts
- ❌ nexus/ - Excluded (operational state, not tracked)

**What doesn't get committed** (.gitignore):
```
nexus/                    # Logs, faults, sessions
.agence_learn_timestamp   # Context scan checkpoint
.env, .env.local         # Local secrets
.vscode/settings.json    # Editor overrides
```

**Requirements**:
- Must be in git repository
- Must have uncommitted changes
- Must provide commit message (or be prompted)

---

### `agence ^push`

**Purpose**: Push committed Agence changes to origin (defaults to current branch, falls back to main).

**What it does**:
- Detects current git branch
- Shows push summary (repo, branch, target)
- Requests confirmation before pushing
- Pushes to origin with tracking (`git push -u`)
- Defaults to main on detached HEAD

**Usage**:

```bash
# Push current branch to origin
agence ^push

# Output on success:
# [PUSH] Preparing to push
# ==========================================
# Repository: https://github.com/l-agence/agence-master.git
# Branch:     main
# Target:     origin/main
# 
# This will push to origin/main
# Continue push? [y/N] y
#
# Pushing to origin/main...
#
# ✓ Pushed successfully!
#   Branch: main
#   Remote: origin
```

**Branch handling**:
- Current branch: Auto-detected via `git rev-parse --abbrev-ref HEAD`
- Detached HEAD: Defaults to main
- Tracking: Uses `git push -u` to set upstream on first push
- No hardcoded branch: Always uses current (or main)

**Typical workflow**:

```bash
# Edit files
vi codex/RULES.md
agence ^learn                              # Re-absorb context

# Commit
agence ^commit "Added new rule about error handling"

# Push to origin
agence ^push

# Next session (other machine/agent):
git pull origin main
agence ^learn                              # Syncs knowledge
```

**Requirements**:
- Must be in git repository
- Must have committed changes to push
- Must have origin remote configured
- User confirmation required

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

#### 4. GitHub CLI Commands  
Safe operations (read-only queries and non-destructive):

```bash
# Repository lookup
agence ^aido gh repo view owner/name
agence ^aido gh repo list --owner stefuss
agence ^aido gh repo search terraform
agence ^aido gh repo clone --dry-run owner/name

# Pull Request queries
agence ^aido gh pr list
agence ^aido gh pr view 42
agence ^aido gh pr status
agence ^aido gh pr checks 42

# Issue queries
agence ^aido gh issue list
agence ^aido gh issue view 123

# Actions & Workflows
agence ^aido gh run list
agence ^aido gh run view run-id
agence ^aido gh run download run-id
agence ^aido gh workflow list
agence ^aido gh workflow view workflow-id

# Auth & Org
agence ^aido gh auth status
agence ^aido gh org list

# API (read-only)
agence ^aido gh api GET /repos/owner/repo
agence ^aido gh api GET /user
```

**Blocked** (any mutation):
```
repo create       - Destructive
repo delete       - Destructive
pr create         - Mutates
pr merge          - Mutates
issue create      - Mutates
workflow enable   - Mutates
api POST/PUT/PATCH/DELETE  - Any mutation
```

---

## Repo Commands (External Mode)

Quick shortcuts for common repository operations using `agence /<command>` pattern.

All repo commands act on `$GIT_REPO` and include safety confirmations for mutations.

### `/ghauth`

**Purpose**: Check GitHub CLI authentication status.

**What it does**:
- Shows current logged-in account
- Displays token scopes and protocol
- Uses `aido` for read-only safety

**Usage**:

```bash
agence /ghauth

# Output:
# github.com
#   ✓ Logged in to github.com account stefuss (keyring)
#   - Active account: true
#   - Git operations protocol: https
#   - Token: gho_****...
```

**Equivalent**: `aido gh auth status`

---

### `/ghlogin`

**Purpose**: Authenticate with GitHub CLI.

**What it does**:
- Interactive GitHub CLI login
- Sets up token and credentials
- No guardrail (user confirms interactively)

**Usage**:

```bash
agence /ghlogin

# Will prompt for authentication method (browser/token)
```

**Security**: Requires user interaction; cannot be automated.

---

### `/gitstatus`

**Purpose**: Quick git status check in repository.

**What it does**:
- Shows branch, staged, and unstaged changes
- Read-only operation (safe)
- Uses `aido` for whitelisting

**Usage**:

```bash
agence /gitstatus

# Output:
# On branch main
# Changes not staged for commit:
#   (use "git add <file>..." to update the staged version)
#   (use "git restore <file>..." to discard changes)
#         modified:   bin/agence
#         modified:   lib/aido.sh
```

**Equivalent**: `aido git status`

---

### `/commit`

**Purpose**: Commit all staged changes with a message.

**What it does**:
- Prompts for commit message
- Commits all staged files
- **Requires confirmation** (safety guardrail)

**Usage**:

```bash
agence /commit

# Prompts:
# Enter commit message: Fixed aido GitHub CLI whitelisting
# [main ef3a921] Fixed aido GitHub CLI whitelisting
#  2 files changed, 118 insertions(+)
```

**Requirements**:
- Files must already be staged (`git add`)
- Commit message required (non-empty)
- Acts on `$GIT_REPO`

**Safety**: 
- [WARN] message displayed before execution
- User provides commit message
- Cannot be piped/automated

---

### `/push`

**Purpose**: Push changes to remote repository using upstream branch tracking.

**What it does**:
- Pushes current branch commits to origin
- Uses upstream tracking (respects local→remote mapping)
- Works with any local branch name
- **Requires explicit confirmation** (safety guardrail)

**Usage**:

```bash
agence /push

# Output:
# [WARN] This will push changes from /path/to/repo to origin
# Confirm push to origin? [y/N] y
# 
# Enumerating objects: 3, done.
# Counting objects: 100% (3/3), done.
# Delta compression using up to 8 threads.
# Compressing objects: 100% (2/2), done.
# Writing objects: 100% (2/2), 500 bytes | 500.00 KiB/s, done.
# Total 2 (delta 1), reused 0 (delta 0), reused 1 (delta 0)
# remote: Resolving deltas: 100% (1/1), done.
# To github.com:l-agence/agence-master.git
#    abc1234..def5678  master -> main
```

**Requirements**:
- Authentication must be set up (`agence /ghauth` or `agence /ghlogin`)
- Commits must be staged locally
- Upstream tracking must be configured (or command will fail on first push)

**Safety**:
- [WARN] displayed before prompt
- User must explicitly confirm with 'y'
- Default is 'N' (no push)
- Acts on `$GIT_REPO`
- Uses standard git push (respects .git/config tracking)

---

### `/ghstatus`

**Purpose**: Display repository and pull request status using GitHub CLI.

**What it does**:
- Shows repository information (visibility, description, fork status)
- Lists recent pull requests
- Uses GitHub CLI authentication (not git credentials)
- Read-only operation (safe)

**Usage**:

```bash
agence /ghstatus

# Output:
# [INFO] Repository status:
# name:             agence-master
# owner:            l-agence
# description:      Agence AI Agentic Engineering Toolkit
# url:              https://github.com/l-agence/agence-master
# fork:             false
# 
# [INFO] Pull requests:
# Showing 5 of 0 pull requests in l-agence/agence-master
```

**Requirements**:
- GitHub CLI must be authenticated (`agence /ghlogin`)

**Safety**: Read-only (uses `aido` whitelisting)

---

### `/ghcommit`

**Purpose**: Commit staged changes with GitHub CLI auth verification.

**What it does**:
- Verifies GitHub CLI authentication
- Prompts for commit message
- Commits all staged files
- Similar to `/commit` but checks gh auth first

**Usage**:

```bash
agence /ghcommit

# Prompts:
# [WARN] This will commit all staged changes using gh auth
# Enter commit message: Added GitHub CLI commands
# [main 8f4a2c1] Added GitHub CLI commands
#  2 files changed, 52 insertions(+)
```

**Requirements**:
- GitHub CLI must be authenticated (`agence /ghlogin`) 
- Files must already be staged (`git add`)

**Safety**:
- [WARN] message before prompt
- Auth check before execution
- Reversible (git reset can undo)

---

### `/ghpush`

**Purpose**: Push changes to remote using GitHub CLI authentication.

**What it does**:
- Verifies GitHub CLI authentication  
- Pushes current branch to origin
- Sets upstream tracking on first push
- **Requires explicit confirmation**

**Usage**:

```bash
agence /ghpush

# Output:
# [WARN] This will push changes using GitHub CLI auth
# Confirm push to origin? [y/N] y
# Enumerating objects: 5, done.
# Counting objects: 100% (5/5), done.
# Delta compression using up to 8 threads.
# Compressing objects: 100% (2/2), done.
# Writing objects: 100% (3/3), 256 bytes | 256.00 KiB/s, done.
# Total 3 (delta 2), reused 0 (delta 0), reused 1 (delta 0)
# remote: Resolving deltas: 100% (2/2), done.
# To github.com:l-agence/agence-master.git
#    5b7c8a9..8f4a2c1  main -> main
# branch 'main' set up to track 'origin/main'.
```

**Requirements**:
- GitHub CLI must be authenticated (`agence /ghlogin`)
- Commits must be staged locally (via `/ghcommit` or `/commit`)
- Push target is current branch to origin

**Safety**:
- [WARN] displayed before prompt
- Auth check before execution
- User must explicitly confirm with 'y'
- Default is 'N' (no push)
- Sets upstream tracking automatically
- **Uses GitHub CLI auth instead of git credentials** (more reliable)

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

test commit at Wed, Mar  4, 2026  7:23:14 PM
