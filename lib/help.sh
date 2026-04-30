#!/usr/bin/env bash
# lib/help.sh — Help, version, and symbols display
# Sourced by bin/agence.
[[ -n "${_AGENCE_HELP_LOADED:-}" ]] && return 0
_AGENCE_HELP_LOADED=1

show_help() {
  cat << 'EOF'
Agence: Agentic Engineering Collaboration Environment

USAGE:
  agence [COMMAND] [OPTIONS]
  agence "<query>"               Chat with LLM (default mode)
  agence +<request>              AI-routed autonomous action
  agence /<cmd>                  External command (AIPOLICY tier gated)
  agence !<tool>                 Launch system tool / agent shell
  agence ^<cmd>                  Init, workflow, knowledge commands
  agence ~recall <pattern>       Grep private memory

────────────────────────────────────────────────────────────────────────

AGENT ROUTING:
  agence @ralph "query"          Route to specific agent
  agence !aider.opus             Launch tool with model qualifier
  agence @peers "query"          Fan-out to 3-tangent peer ensemble
  agence @pair "query"           Fan-out to 2-tangent pair (copilot + aider)
  Grammar: [prefix] target [.qualifier]* [payload]

SYSTEM TOOLS (!):
  !bash                          Agentic bash session (current agent)
  !shell                         PowerShell session
  !swarm [agent...]              Tmux 1+1 swarm session (via bin/swarm)
  !aider                         Aider CLI (pip install aider-chat)
  !claude                        Claude Code CLI (npm i -g @anthropic-ai/claude-code)
  !pilot                         GitHub Copilot CLI (gh copilot)
  !aish                          Microsoft AI Shell
  !peers                         Peer ensemble (multi-provider fan-out)
  !ralph, !sonya, !copilot       Agent-specific aibash sessions

DAEMON (agentd — call directly):
  agentd start [agent...]        Start swarm + write PID file
  agentd stop                    Kill session + cleanup tangents
  agentd status                  Show daemon + tangent state
  agentd attach [agent]          Attach to tmux session
  agentd tangent create|destroy|list  Manage agent worktrees + sockets

WORKFLOW (^):
  ^status                        Agence + repo status
  ^save                          Checkpoint: commit + session snapshot
  ^commit                        Stage + commit with message
  ^push                          Push to remote
  ^stash / ^fetch / ^rebase      Git workflow shortcuts
  ^sync                          Fetch + rebase + push
  ^handoff <agent>               Transfer session to another agent
  ^pickup <session-id>           Resume a handed-off session
  ^pause / ^resume               Session checkpoint / restore
  ^install                       Install agence into a repo
  ^init                          Initialize agence submodule
  ^aido <tool> [args...]         Safe whitelisted command executor (read-only)

KNOWLEDGE (^):
  ^lesson list|add|show          Lesson management
  ^plan list|add|show            Plan management
  ^todo list|add|show            Todo management
  ^task list|add|show            Organic task management
  ^job list|add|show             Job/workflow management
  ^workflow list|add|show        Workflow management (organic)
  ^project list|add|show         Project management (organic)
  ^fault list|add|show           Fault log management
  ^issue list|add|show           Issue tracking
  ^log list|show                 Session log viewer
  ^learn                         Extract lesson from current context

LIST SHORTCUTS (^):
  ^tasks                         → task list
  ^projects                      → project list
  ^workflows                     → workflow list
  ^faults                        → fault list
  ^issues                        → issue list
  ^sessions                      → session list
  ^swarms                        → swarm list
  ^jobs                          → job list
  ^logs                          → log list

OUTPUT FLAGS (any list command):
  -j, --json                     JSON output
  -y, --yaml                     YAML output (requires yq)
  -t, --table                    Tabular output (default for TTY)

LEDGER & AUDIT (^):
  ^ledger append|verify|tail|count|list|init  Merkle-chained decision ledger
  ^audit trail|show|agent|session|diff|stats  Decision audit trail
  ^session list|view|prune       Session lifecycle
  ^session prune --days 3        Archive + remove old sessions

INDEX (^):
  ^index                         Scan for missing INDEX.json files
  ^reindex                       Regenerate INDEX.json via bin/indexer
  ^regen                         Regenerate organic/dashboards/ from JSON

MEMORY (^):
  ^retain <source> <tags> <text> Store a memory row (shared/private)
  ^recall <tags> [--source X]    Query memories by tags (comma-separated)
  ^recall <pattern>              Legacy: grep knowledge/private/ (plain text fallback)
  ^cache  <tags> [--max N]       Hydrate working memory cache
  ^forget <id> <source>          Remove a memory row
  ^promote <id> <from> <to>      Move row between cognitive stores
  ^distill <from> <to> [opts]    Batch promote by importance/age/tags
  ^memory stats                  Row counts per store
  ^memory list <source>          List all rows in a store

SWARM (agentd + !swarm):
  ^state                         Aggregate view: tasks + workflows + daemon
  !swarm [agent...]              Launch tmux 1+1 swarm tiles
  agentd start [agent...]        Start swarm daemon + PID file
  agentd stop                    Kill session + cleanup tangents
  agentd status                  Show daemon + tangent state
  agentd attach [agent]          Attach to tmux session
  agentd tangent create|destroy|list  Manage agent worktrees + sockets
  ^swarms                        List running swarm sessions (alias)

SHORTCUT:
  ^                              Symlink to agence (created by ^init)
  ^ tasks                        Same as: agence tasks / agence ^tasks

TOOLS (bin/):
  airun <module> [args...]       Run a Bun TypeScript module by name
  airun audit trail              → bun run lib/audit.ts trail
  airun ledger list              → bun run lib/ledger.ts list
  airun --list                   List all available modules

GIT SHORTCUTS (/):                            Tier
  /status  /log  /diff  /remote               T0 (auto)
  /add  /stash  /branch                       T0
  /commit  /fetch  /pull  /checkout            T2 (confirm)
  /push  /rebase  /merge  /cherry-pick         T2
  /reset  /clean                               T3 (blocked)

GITHUB CLI SHORTCUTS (/):                     Tier
  /ghremote  /ghpull  /ghlog  /ghrun           T0 (auto)
  /ghflow  /ghissue  /ghorg  /ghauth           T0
  /ghcommit  /ghpush  /ghmerge  /ghlogin       T2 (confirm)
  /gh <subcmd> [args]                          Tier-routed

TERRAFORM SHORTCUTS (/):                      Tier
  /tfvalidate  /tfplan  /tfinit  /tflint       T0 (auto)
  /tfauth  /precommit                          T0
  /tfupgrade  /tfapply                         T2 (confirm)
  /tfdestroy                                   T3 (blocked)
  /tf <subcmd> [args]                          Tier-routed

ENVIRONMENT:
  GIT_REPO                       Parent repo (auto-detected)
  AGENCE_REPO                    Agence submodule root
  AGENCE_DEBUG=1                 Show routing decisions
  AGENCE_TRACE=1                 Trace mode (no LLM call)
  AGENCE_QUIET=1                 Suppress non-essential output
  AGENCE_LLM_PROVIDER            LLM provider (anthropic, openai, ollama)
  ANTHROPIC_API_KEY              API key for Claude

TIER MODEL (AIPOLICY):
  T0  Auto-execute               Read-only, non-destructive
  T1  Soft-confirm               Show effect, single keypress
  T2  Warn + confirm             State mutation, requires approval
  T3  Blocked                    Destructive — must run manually

CONFIG:
  ~/.agence/config.yaml          Global configuration
  .agence/config.yaml            Project-specific overrides

SEE ALSO:
  agence ^status                 Current state overview
  agence ^symbols                Show prefix/state symbol reference
  bin/COMMANDS.md                Full command routing reference
  bin/airun --list               List Bun TypeScript modules
  agentd --help                  Swarm daemon help (start/stop/status)
  codex/AIPOLICY.yaml            Policy tiers and guardrails
  codex/agents/registry.json     Agent definitions and model map
EOF
}

show_version() {
  echo "Agence version 1.0.0"
  echo "[VERSION]: 1.0.0"
  echo "[RELEASE]: v1.0.0"
}

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

mode_symbols() {
  cat << 'EOF'
╔══════════════════════════════════════════════════════╗
║  Agence Symbol Reference  (^symbols)                 ║
╚══════════════════════════════════════════════════════╝

TASK STATE  (agent-level, matrix-signed)
  +task          pending / todo            (positive, unstarted)
  &task@agent    assigned to agent         (positive, queued)
  %task@agent    in-progress — agent       (positive, running)
  %task@user     in-progress — human       (positive, running)
  -task          completed                 (negative, done)
  _task          paused / deferred         (neutral)
  #task          held by human             (neutral, locked)

  RESERVED (swarm, v0.3.2+)
  ~task          swarm-queued              (not yet delegated)
  $task          swarm-coordinating        (merging across agents)

PRIORITY  (independent of state)
  *task          low priority
  **task         medium priority
  ***task        high priority

  Compose:  ***&task@ralph  (urgent + agent-assigned)

ROUTING
  @agent         Route to agent            @ralph, @aider, @copilot
  @org           Route to org context      @acme.tld, @l-agence.org
  @user          Route to human            @steff
  --org ORG      CLI override for org      agence ^plan list --org acme.tld

COMMAND MODES  (first character of argument)
  ^cmd           Init / lifecycle          ^init, ^save, ^commit, ^push
  !cmd           System command            !git status, !bash
  /cmd           External command          /deploy, /build
  ~cmd           (reserved, swarm)
  query          Plain text → LLM chat     agence "what is the status?"
  +query         AI-routed action          +refactor this module

WORKFLOW NOTATION
  WF = [task1, task2; task3]
        ↑ parallel  ↑ pause/sequential
  WF = [(repo1:+task1@ralph) + (repo2:%task2@aider)]
  
  ,   parallel execution (no ordering)
  ;   sequential pause (must complete before next)
  ^   hard dependency (blocks downstream)
  <   precedes (task1 < task2 = task1 before task2)

COMPLETION MATH  (signed addition)
  net_work   = sum(all signed tasks)
  remaining  = sum(positive tasks only)
  done       = |sum(negative tasks)|
  %done      = done / (done + remaining)

SCOPES
  knowledge/private/  personal, never committed    ^todo, ^note (~todo, ~note)
  nexus/              local-only, sensitive        ^fault, ^log, ^session
  knowledge/@/        team-shared, git-committed   ^plan, ^lesson, ^issue
  organic/            team work, agent-routable    ^task, ^job

See also: codex/TAXONOMY.md · knowledge/@/docs/SYMBOLS.md · MATRICES.md
EOF
  return 0
}

mode_help() {
  local version; version="1.0.0"

  cat << EOF
╔══════════════════════════════════════════════════════════════════╗
║  Agence v${version} — Agentic Engineering Collaboration Environment  ║
╚══════════════════════════════════════════════════════════════════╝

SHELL ENVIRONMENT
  Default:   WSL-Ubuntu bash (required)
  AGENCE_ROOT: ${AGENCE_ROOT:-unset}
  GIT_REPO:    ${GIT_REPO:-unset (auto-detect)}
  Shell:       ${AGENCE_SHELL_ENV:-unknown}

KNOWLEDGE COMMANDS (^ prefix)

  PRIVATE — Local only, never committed (personal)
  ──────────────────────────────────────────────────
  ^todo  [list|status|show|add]       Personal todos     → knowledge/private/todos/
  ^note  [list|status|show|add]       Personal notes     → knowledge/private/notes/

  NEXUS — Local only (sensitive: faults, logs, sessions)
  ───────────────────────────────────────────────────────
  ^fault [list|show]                  Incidents          → nexus/faults/
  ^log   [list|show|add]              Ops logs           → nexus/logs/
  ^audit [trail|show|agent|session|diff|stats]  Ledger audit → .ailedger

  KNOWLEDGE — Team-shared via Git (committed)
  ─────────────────────────────────────────────
  ^lesson [list|show|add] [--org ORG]  Lessons learned  → knowledge/@/lessons/
  ^plan   [list|show|add] [--org ORG]  Strategic plans  → knowledge/@/plans/
  ^issue  [list|show|add] [--org ORG]  Discoveries      → knowledge/@/issues/

  ORGANIC — Team work, agent-routable
  ─────────────────────────────────────
  ^task  [list|show|add] [--assign @agent|@user]  Tasks → organic/tasks/
  ^job   [list|show|add] [--agent NAME]           Jobs  → organic/jobs/

WORKFLOW COMMANDS
  ^init                     Initialize Agence environment
  ^reload                   Reload context files
  ^save  [notes]            Save session checkpoint
  ^learn                    Extract lessons from changes
  ^commit [message]         Commit Agence changes
  ^push                     Push committed changes
  ^session [list|view|...]  Manage agent sessions
  ^stash                    Stash local changes
  ^sync                     Sync with remote

ROUTING INHERITANCE
  Commands inherit org context from @ symlink (e.g. knowledge/@→l-agence.org)
  Override with --org flag:  agence ^plan list --org acme.tld

SYMBOLS (quick ref)
  +task   pending    &task@agent  assigned    %task@agent  in-progress
  -task   completed  _task        paused      #task        held
  */**/*** priority  ~,\$          reserved (swarm, v0.3.2+)

See also: codex/TAXONOMY.md (scopes), codex/LAWS.md (constraints)
EOF
  return 0
}

# ============================================================================
# BASH COMPLETION
# ============================================================================
# Source this file or add to ~/.bashrc:
#   source /path/to/agence
# Or install standalone:
#   agence !completion >> ~/.bashrc

