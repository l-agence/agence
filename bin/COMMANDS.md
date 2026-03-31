
# Agence Commands (Canonical Routing)

All command modes and grammars must conform to the canonical universal `@` routing and state prefix model. See codex/agents/ROUTING.md for the canonical table and glossary.

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

### `agence ^reindex`

**Purpose**: Reindex all knowledge bases and update cached semantic formtags.

**What it does**:
- Scans all knowledge bases in `globalcache/`
- Expires old cache entries (checksums, formtags)
- Runs semantic indexer on each knowledge base
- Generates/updates formtags for semantic navigation
- Reports summary of reindexing activity

**Knowledge bases** (automatically discovered in globalcache/):
```
globalcache/
├── acme.tld/          ← Indexed
└── l-agence.org/      ← Indexed
    ├── docs/
    ├── lessons/
    └── *.md
```

**Usage**:

```bash
# Reindex all knowledge bases
agence ^reindex

# Output:
# ==============================================
#   AGENCE KNOWLEDGE BASE REINDEX (^reindex)
# ==============================================
#
# Knowledge Base Root: /path/to/.agence/globalcache
#
# Step 1/3: Scanning knowledge bases...
#   Found: acme.tld
#   Found: l-agence.org
#
# Step 2/3: Expiring cached metadata...
#   Expiring cache: acme.tld
#     ✓ Expired
#   Expiring cache: l-agence.org
#     ✓ Expired
#
# Step 3/3: Reindexing knowledge bases...
#   Indexing: acme.tld
#     ✓ Indexed (formtags generated)
#   Indexing: l-agence.org
#     ✓ Indexed (42 files, formtags generated)
#
# ==============================================
#   REINDEX COMPLETE
# ==============================================
#
# Summary:
#   Knowledge bases processed: 2
#   Cache entries expired: 15
#   Formtags updated: 2
```

**Why use it**:

- **After adding new knowledge**: Refresh semantic indexes
- **After modifying markdown files**: Update formtags and checksums
- **Cache corruption**: Clear and rebuild all cached metadata
- **Periodic maintenance**: Keep knowledge bases searchable and tagged
- **Multi-agent coordination**: Sync knowledge across agent instances

**How it works**:

1. **Scanning**: Discovers all directories in `globalcache/`
2. **Cache expiration**: Removes old `.index_cache/*.json` files
3. **Indexing**: Calls `bin/indexer` on each knowledge base
4. **Formtagging**: Generates semantic formtags using Dewey-like hierarchy
5. **Reporting**: Shows count of updated indexes and cached entries

**Dependencies**:

- `bin/indexer` (Python script for semantic indexing)
- Markdown files with frontmatter/metadata support
- Write access to knowledge base directories

---

### `agence ^learn`

**Purpose**: Extract and synthesize knowledge from session history and recorded faults.

**What it does**:
- Scans all recorded sessions in `nexus/.aisessions/`
- Reviews fault records in `nexus/faults/`
- Synthesizes lessons learned in `synthetic/l-agence.org/lessons/`
- Updates knowledge synthetic indexes

**Workflow**:

1. **Session review**: Counts and analyzes session metadata
2. **Fault analysis**: Extracts insights from fault records
3. **Lesson synthetic**: Updates synthetic directory with learnings

**Usage**:

```bash
# Learn from recent sessions and faults
agence ^learn

# Output:
# ==============================================
#   AGENCE LEARNING (^learn)
# ==============================================
#
# Step 1/3: Scanning session history...
#   Found 12 sessions
#
# Step 2/3: Reviewing recorded faults...
#   Found 2 fault records
#   Processing fault insights...
#     - Reviewed: symlink-false-success
#     - Reviewed: agent-truncation-lie
#
# Step 3/3: Synthesizing lessons learned...
#   Active lessons: 5
#   Synthesis destination: /path/to/.agence/synthetic/l-agence.org/lessons/
#
# ==============================================
#   LEARNING COMPLETE
# ==============================================
#
# Summary:
#   Sessions reviewed: 12
#   Faults analyzed: 2
#   Lessons in synthetic: 5
#
# Next: Use ^commit to save knowledge changes
```

**Why use it**:

- **After critical sessions**: Distill insights while fresh
- **After a fault**: Record what went wrong and how to avoid it
- **Periodic reflection**: Review lessons and update synthetic
- **Knowledge consolidation**: Prepare changes for team sharing

---

### `agence ^commit`

**Purpose**: Save all synthetic knowledge changes to git repository.

**What it does**:
- Stages all knowledge base changes (`globalcache/`)
- Stages synthetic updates (`synthetic/`)
- Stages fault records (`nexus/faults/`)
- Creates git commit with knowledge metadata

**Workflow**:

1. **Staging**: Marks all knowledge files for commit
2. **Counting**: Reports number of changed files
3. **Committing**: Creates atomic knowledge commit

**Usage**:

```bash
# Commit knowledge changes
agence ^commit

# Output:
# ==============================================
#   AGENCE KNOWLEDGE COMMIT (^commit)
# ==============================================
#
# Step 1/2: Staging knowledge changes...
#   ✓ Staged 23 files
#
# Step 2/2: Creating commit...
#   ✓ Committed: a7f3b2e
#
# ==============================================
#   KNOWLEDGE COMMIT COMPLETE
# ==============================================
#
# Commit: a7f3b2e
# Files changed: 23
#
# Next: Use ^push to sync with upstream
```

**Commit message template**:

```
[KNOWLEDGE] Synthetic learning update

- Updated knowledge bases (globalcache/)
- Recorded lessons learned (synthetic/)
- Fault analysis and insights (nexus/faults/)

Automated knowledge synthetic and consolidation.
```

**Why use it**:

- **Track knowledge evolution**: Every update is versioned
- **Revert capability**: Can restore previous knowledge states
- **Attribution**: Git history shows when knowledge changed
- **Team sharing**: Prepares knowledge for `^push`

---

### `agence ^push`

**Purpose**: Synchronize synthetic knowledge with upstream repository.

**What it does**:
- Checks for unpushed commits on current branch
- Shows commits ready to push
- Pushes knowledge updates to `origin`
- Reports synchronization status

**Workflow**:

1. **Detection**: Counts unpushed commits
2. **Preview**: Shows commits to be pushed
3. **Pushing**: Syncs to remote repository
4. **Reporting**: Confirms successful synchronization

**Usage**:

```bash
# Push knowledge to upstream
agence ^push

# Output:
# ==============================================
#   AGENCE KNOWLEDGE PUSH (^push)
# ==============================================
#
# Preparing to push knowledge updates...
#   Branch: main
#   Unpushed commits: 2
#
# Commits to push:
#   - a7f3b2e [KNOWLEDGE] Synthetic learning update
#   - c9e1d5f [FAULT] Agent integrity violation (symlink success claim)
#
# Pushing to upstream...
#
# ==============================================
#   KNOWLEDGE PUSH COMPLETE
# ==============================================
#
# ✓ Knowledge synchronized to upstream
#   Remote: origin
#   Branch: main
#   Commits pushed: 2
```

**Typical workflow**:

```bash
# 1. Learn from sessions/faults
agence ^learn

# 2. Commit knowledge changes
agence ^commit

# 3. Push to upstream
agence ^push

# All three can run sequentially:
agence ^learn && agence ^commit && agence ^push
```

**Why use it**:

- **Knowledge sharing**: Distribute learnings across team
- **Distributed learning**: Other agents can pull your insights
- **Accountability**: Changes are attributed via git history
- **Synchronization**: Prevents knowledge drift in multi-agent setups

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

---

## Terraform / IaC Commands (External Mode)

Terraform shortcuts use `agence /tf*` pattern. All commands are tier-classified per `codex/AIPOLICY.yaml`.

| Command | Tier | Maps to | Notes |
|---------|------|---------|-------|
| `/tf <subcmd> [args]` | router | `terraform <subcmd> [args]` | Generic — full tier routing |
| `/tfvalidate` | T0 ✅ | `terraform validate` | Auto-execute |
| `/tfauth` | T0 ✅ | `terraform login` | Auth check / registry login |
| `/tflogin` | T0 ✅ | `terraform login` | Alias for `/tfauth` |
| `/tfplan [args]` | T0 ✅ | `terraform plan [args]` | Non-destructive preview |
| `/tfinit [args]` | T0 ✅ | `terraform init` | No `--upgrade` |
| `/tflint [args]` | T0 ✅ | `tflint [args]` | Terraform linter |
| `/tfupgrade` | T2 ⚠️ | `terraform init --upgrade` | warn+confirm |
| `/tfapply [args]` | T2 ⚠️ | `terraform apply [args]` | warn+confirm |
| `/tfdestroy` | T3 🔴 | `terraform apply --destroy` | **HIGHEST ESCALATION — BLOCKED** |
| `/precommit [args]` | T0 ✅ | `pre-commit run [args]` | Code quality hooks |

**Tier legend:**
- **T0** — auto-execute (non-destructive, read-only or idempotent)
- **T1** — light confirm (unclassified subcommands via `/tf`)
- **T2** — warn + confirm (infrastructure state mutation)
- **T3** — BLOCKED: HIGHEST ESCALATION (destroy operations; copy printed command and run manually)

### `/tf`

Generic terraform router. All subcommands pass through `route_tf_command()` for AIPOLICY tier classification.

```bash
agence /tf validate
agence /tf fmt --check
agence /tf plan -out=tfplan
agence /tf state list
agence /tf apply          # T2: prompts for confirm
agence /tf apply --destroy  # T3: BLOCKED
```

### `/tfvalidate`

```bash
agence /tfvalidate
# → terraform validate
```

### `/tfplan`

```bash
agence /tfplan
agence /tfplan -out=tfplan.out
# → terraform plan [args]  (T0: non-destructive, auto-execute)
```

### `/tfinit`

```bash
agence /tfinit
# → terraform init  (no --upgrade)
```

### `/tfauth` / `/tflogin`

```bash
agence /tfauth
# → terraform login  (T0: auth check / Terraform Cloud login)
```

### `/tfupgrade` ⚠️

```bash
agence /tfupgrade
# → terraform init --upgrade
# [AIPOLICY T2] warn+confirm required
```

### `/tfapply` ⚠️

```bash
agence /tfapply
agence /tfapply -auto-approve   # still prompts via agence
# [AIPOLICY T2] warn+confirm required
```

### `/tfdestroy` 🔴 HIGHEST ESCALATION

```bash
agence /tfdestroy
# [AIPOLICY T3] BLOCKED — will NOT execute.
# Prints the exact command to run manually after reviewing /tfplan output.
```

### `/tflint`

```bash
agence /tflint
agence /tflint --format compact
# → tflint [args]  (T0: auto-execute; requires tflint installed)
```

### `/precommit`

Runs git pre-commit hooks via the `pre-commit` tool (or falls back to `.git/hooks/pre-commit`).

```bash
agence /precommit
agence /precommit --all-files
# → pre-commit run [args]  (T0: auto-execute)
```

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

---

## Agence Command Grammar (EBNF)

A robust, extensible grammar for all Agence task, routing, and metadata constructs:

```
<command>      ::= <task_expr> { ";" <task_expr> }
<task_expr>    ::= [<priority>] <repo> ":" <task> { ":" <metadata> } [<dependency>]
<priority>     ::= "*" | "**" | "***"
<repo>         ::= <identifier>
<task>         ::= <identifier>
<metadata>     ::= <key> "=" <value>
<key>          ::= "agent" | "sec" | "org" | "shard" | "team" | "token_cost" | ...
<value>        ::= <identifier> | <string>
<dependency>   ::= "^" <task_expr> | ";" <task_expr>
<identifier>   ::= (letter | digit | "_" | "-")+ 
<string>       ::= '"' { any character except '"' } '"'
```

- Prefixes: `*`, `**`, `***` for priority; `$`, `~`, `%`, `&`, `_`, `#`, `+`, `-`, `!`, `?` for state (see canonical table).
- Routing: `@` is the universal routing prefix for agent, org, team, repo, security, etc. (see canonical table).
- Multiple tasks can be chained with `;`.
- Metadata is extensible: any key-value pair separated by `:`.
- Dependencies: `^` for hard, `;` for soft.

This grammar ensures all Agence commands and task expressions are robust, extensible, and easy to parse. All routing and state prefixes must match the canonical definitions in codex/agents/ROUTING.md.

---

## Knowledge Management Commands (v0.2.3.2+)

**Unified command family for managing team and personal knowledge across scopes.**

These commands provide access to knowledge stored in different scopes (HERMETIC, NEXUS, SYNTHETIC, ORGANIC), with implicit routing and consistent interfaces.

### Scope Model

| Scope | Command | Visibility | Git | Use Case |
|-------|---------|-----------|-----|----------|
| **HERMETIC** | `^todo` | Personal | ❌ | Personal task lists |
| **NEXUS** | `^log`, `^fault` | Local | ❌ | Operational logs, incidents |
| **SYNTHETIC** | `^lesson`, `^plan`, `^issue` | Team | ✅ | Shared knowledge, strategy |
| **ORGANIC** | `^task`, `^job` | Team | ✅ | Assigned work (human/agent) |

### `agence ^lesson [list|show|add]`

**Scope**: SYNTHETIC (team-shared)  
**Storage**: `synthetic/@ORG/lessons/`

Manage lessons learned (extracted from faults, best practices).

**Usage**:
```bash
agence ^lesson list                          # List all lessons
agence ^lesson list --org acme.tld           # List org-specific lessons
agence ^lesson show "Never auto-heal paths"  # Show specific lesson
agence ^lesson add "New learning title"      # Create lesson entry
```

**Entry format** (Markdown):
```markdown
# Lesson Title

**Created**: 2026-03-31T14:30:00Z  
**ID**: 1743595200_never  
**Extracted from**: fault-catastrophic-failure.md

## Problem

Brief description of what we learned.

## Impact

How this affects future decisions.
```

---

### `agence ^log [list|show|add]`

**Scope**: NEXUS (local operational)  
**Storage**: `nexus/logs/`

Operational logs, timeline records, system events.

**Usage**:
```bash
agence ^log list                      # List all logs
agence ^log show session-001          # Show specific log
agence ^log add "Manual event entry"  # Record event
agence ^log list --filter=agent       # Filter by agent
agence ^log list --filter=timeline    # Sort by timeline
```

---

### `agence ^plan [list|show|add]`

**Scope**: SYNTHETIC (team-shared)  
**Storage**: `synthetic/@ORG/plans/`

Strategic plans, roadmaps, phase definitions.

**Usage**:
```bash
agence ^plan list                     # List all plans
agence ^plan list --org l-agence.org  # List for specific org
agence ^plan show "v0.3.0 roadmap"    # Show plan details
agence ^plan add "Phase 4: Orchestrator"  # Create plan
```

---

### `agence ^todo [list|show|add]`

**Scope**: HERMETIC (local personal)  
**Storage**: `hermetic/@/todos/`

Personal task lists (NEVER committed to git).

**Usage**:
```bash
agence ^todo list              # My personal todos
agence ^todo show "path-validation"  # Show todo
agence ^todo add "Document LAWS.md"  # Create todo
```

**Notes**:
- Always local (not shared, never upstream)
- User-specific, not org-routed
- Ideal for daily work tracking

---

### `agence ^fault [list|show]`

**Scope**: NEXUS (local, sensitive)  
**Storage**: `nexus/faults/`

Incident records and failure analysis (NEVER shared raw—sanitize first).

**Usage**:
```bash
agence ^fault list                # Show all faults
agence ^fault show "2026-03-06-catastrophic-failure"  # Examine fault
agence ^fault list --sanitize     # Flags: extract as lesson first
```

**Important**: 
- Faults contain sensitive data (secrets, stack traces, user context)
- Do NOT commit to synthetic unless sanitized as ^lesson
- Use `^fault ... --sanitize` to extract learnings safely

---

### `agence ^issue [list|show|add]`

**Scope**: SYNTHETIC (team-shared)  
**Storage**: `synthetic/@ORG/issues/`

Team discoveries, bugs, design questions (discoverable by team).

**Usage**:
```bash
agence ^issue list              # List all issues
agence ^issue show "path-normalization-gotchas"  # Show issue
agence ^issue add "Git Bash symlink behavior"    # File issue
```

**Difference from task**:
- Issues = discoveries, problems, questions (start of workflow)
- Tasks = assignments, work items (explicit allocation to human/agent)

---

### `agence ^task [list|show|add]`

**Scope**: ORGANIC (team-assigned)  
**Storage**: `organic/tasks/`

Team task assignments (human or agent executable).

**Usage**:
```bash
agence ^task list                      # List all tasks
agence ^task list --org acme.tld       # Org-specific tasks
agence ^task show "implement-matrix-math"  # Show task details
agence ^task add "New feature" --assign @ralph  # Assign to agent ralph
agence ^task add "Review PR" --assign @steff    # Assign to human steff
```

**Task format**:
```json
{
  "id": "task-001",
  "title": "Implement matrix-math.ts",
  "priority": "***",
  "complexity": "large",
  "assigned_to": "@ralph",
  "assigned_type": "agent",
  "status": "+",
  "created": "2026-03-31T14:30:00Z"
}
```

---

### `agence ^job [list|show|add]`

**Scope**: ORGANIC (team-assigned)  
**Storage**: `organic/jobs/`

Robot/agent job assignments (automated execution only).

**Usage**:
```bash
agence ^job list                # List all jobs
agence ^job show ralph          # Jobs assigned to ralph agent
agence ^job add "Refactor lib" --agent @ralph  # Create agent job
```

**Difference from task**:
- Jobs = executable only by agents (robot work)
- Tasks = can be human or agent (flexible assignment)

---

## Command Router Routing (Implicit Via @org)

All knowledge commands support optional `--org ORG` flag:

```bash
agence ^lesson list                    # Default: l-agence.org
agence ^lesson list --org acme.tld     # Specific org subdirectory
agence ^plan add "Roadmap" --org ops   # Creates: synthetic/@ops/plans/
```

If `--org` is omitted:
- Defaults to `l-agence.org` (SYNTHETIC/ORGANIC)
- For HERMETIC/NEXUS, org flag is ignored (scope-based only)

---

## Knowledge Entry Format

All entries follow a unified pattern:

**Markdown** (default):
```
# Entry Title

**Created**: YYYY-MM-DDTHH:MM:SSZ  
**ID**: {timestamp}_{short_title}  
**Metadata**: key=value pairs

## Summary

Content here.
```

**JSON** (optional, for structured data):
```json
{
  "id": "entry-001",
  "title": "Entry Title",
  "scope": "SYNTHETIC",
  "org": "l-agence.org",
  "created": "2026-03-31T14:30:00Z",
  "content": "..."
}
```

---

## Workflow Example

**Scenario**: Extract learning from a faults, publish to team

```bash
# 1. Review fault (stays local)
agence ^fault show "catastrophic-failure"

# 2. Extract lesson (publish to team)
agence ^lesson add "Never auto-heal paths" --org l-agence.org

# 3. Plan fix (add to roadmap)
agence ^plan add "Path validation hardening (v0.2.3.1)"

# 4. Assign work (create tasks)
agence ^task add "Implement realpath() validation" --assign @ralph
agence ^task add "Update LAWS.md" --assign @steff

# 5. Verify (all published, team can see)
agence ^lesson list
agence ^plan list
agence ^task list
```

---

## See Also

- [TAXONOMY.md](../codex/TAXONOMY.md) - Scope definitions (HERMETIC, NEXUS, SYNTHETIC, ORGANIC)
- [SYMBOLS.md](../synthetic/l-agence.org/docs/SYMBOLS.md) - State prefixes (+, &, %, -, ~, $)
- [LAWS.md](../codex/LAWS.md) - Scope & privacy constraints (Law 7: Scope Boundaries)
- [bin/agence ^session](./agence) - Session management (complementary)
