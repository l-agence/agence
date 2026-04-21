#!/usr/bin/env bash
# lib/init.sh — Initialization commands (^init, ^reload, ^recon etc.), environment setup,
#              repair, install, knowledge-base scan/reindex, org path resolution.
# Sourced by bin/agence.
[[ -n "${_AGENCE_INIT_LOADED:-}" ]] && return 0
_AGENCE_INIT_LOADED=1

mode_init() {
  local input="$*"
  local init_cmd="${input%% *}"       # First word is the command
  local init_args="${input#$init_cmd}" # Rest is arguments
  init_args="${init_args# }"           # Trim leading space

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Init mode: $init_cmd, args: $init_args" >&2

  case "$init_cmd" in
    "init"|"")
      init_agence_environment
      ;;
    "reload")
      reload_agence_context
      ;;
    "install")
      install_agence_packages
      ;;
    "save")
      # Save session state: agence ^save [optional notes]
      save_session "$init_args"
      return $?
      ;;
    "learn")
      # Scan and re-read modified CODEX/context files
      learn_agence_changes
      return $?
      ;;
    "commit")
      # Commit changed Agence files: agence ^commit [message]
      commit_agence_changes "$init_args"
      return $?
      ;;
    "push")
      # Push committed Agence changes to origin
      push_agence_changes
      return $?
      ;;
    "help")
      # Show detailed command help: agence ^help
      mode_help
      return $?
      ;;
    "symbols")
      # Show symbols reference table: agence ^symbols
      mode_symbols
      return $?
      ;;
    "session")
      # Session management: agence ^session <subcommand> [args]
      mode_session "$init_args"
      return $?
      ;;
    "lesson")
      # Knowledge: lessons learned (team-shared, synthetic)
      # Usage: agence ^lesson [list|show|add] [--org ORG]
      mode_knowledge "lesson" "$init_args"
      return $?
      ;;
    "log")
      # Operational logs (local, nexus)
      # Usage: agence ^log [list|show|add] [--filter=agent|session|timeline]
      mode_knowledge "log" "$init_args"
      return $?
      ;;
    "plan")
      # Strategic plans (team-shared, synthetic)
      # Usage: agence ^plan [list|show|add] [--org ORG]
      mode_knowledge "plan" "$init_args"
      return $?
      ;;
    "todo")
      # Personal todos (hermetic, local only)
      # Usage: agence ^todo [list|show|add] [--owner NAME]
      mode_knowledge "todo" "$init_args"
      return $?
      ;;
    "fault")
      # Faults/incidents (local, nexus, sanitize before sharing)
      # Usage: agence ^fault [list|show|add] [--sanitize]
      [[ "${init_args%% *}" == "add" ]] && ailedger_append "fault" "fault-logged" ""
      mode_knowledge "fault" "$init_args"
      return $?
      ;;
    "issue")
      # Issues/discoveries (team-shared, synthetic)
      # Usage: agence ^issue [list|show|add]
      mode_knowledge "issue" "$init_args"
      return $?
      ;;
    "task")
      # Team tasks (shared, organic)
      # Usage: agence ^task [list|show|add] [--assign AGENT|HUMAN]
      mode_knowledge "task" "$init_args"
      return $?
      ;;
    "job")
      # Robot jobs (shared, organic)
      # Usage: agence ^job [list|show|add] [--agent NAME]
      mode_knowledge "job" "$init_args"
      return $?
      ;;
    "workflow")
      # Workflows (shared, organic)
      # Usage: agence ^workflow [list|show|add]
      mode_knowledge "workflow" "$init_args"
      return $?
      ;;
    "project")
      # Projects (shared, organic)
      # Usage: agence ^project [list|show|add]
      mode_knowledge "project" "$init_args"
      return $?
      ;;
    "audit")
      # Ledger audit & decision review
      # Usage: agence ^audit trail|show|agent|session|diff|stats [args]
      local _audit_ts="${AGENCE_ROOT}/lib/audit.ts"
      if command -v bun &>/dev/null && [[ -f "$_audit_ts" ]]; then
        bun run "$_audit_ts" $init_args
      else
        echo "Error: ^audit requires bun + lib/audit.ts" >&2
        return 1
      fi
      return $?
      ;;
    "handoff")
      # Transfer session context to another agent
      # Usage: agence ^handoff @ralph [context message]
      handoff_to_agent $init_args
      return $?
      ;;
    "pickup")
      # Accept a pending handoff: agence ^pickup [handoff_id]
      pickup_handoff $init_args
      return $?
      ;;
    "pause")
      # Suspend session with checkpoint (Ctrl+Z semantics)
      pause_session $init_args
      return $?
      ;;
    "resume")
      # Resume a paused session: agence ^resume [pause_id]
      resume_session $init_args
      return $?
      ;;
    "index")
      # Scan for INDEX.md / INDEX.json pairs
      scan_knowledge_bases
      return $?
      ;;
    "reindex")
      # Run bin/indexer (formtag + checksum) on knowledge bases
      reindex_knowledge_bases $init_args
      return $?
      ;;
    "regen")
      # Regenerate organic/dashboards/ from JSON sources
      # Usage: agence ^regen
      local _matrix_ts="${AGENCE_ROOT}/lib/matrix.ts"
      if command -v bun &>/dev/null && [[ -f "$_matrix_ts" ]]; then
        bun run "$_matrix_ts" dashboard
      else
        echo "Error: ^regen requires bun + lib/matrix.ts" >&2
        return 1
      fi
      return $?
      ;;
    "state")
      # Aggregate swarm state: tasks + agents + tangents
      # Usage: agence ^state
      cmd_state
      return $?
      ;;
    "recall")
      # Query cognitive memory stores by tags (new memory engine)
      # Falls back to figrep for plain text patterns (backward compat)
      # Usage: agence ^recall <tags> [--source X] [--max N]
      #        agence ^recall <pattern>  (legacy figrep fallback)
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^recall <tags> [--source X] [--max N]" >&2
        echo "  Tags: comma-separated (e.g. jwt,auth)" >&2
        echo "  Sources: eidetic, semantic, episodic, kinesthetic, masonic" >&2
        echo "  Legacy: plain text falls back to hermetic/ grep" >&2
        return 1
      fi
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      # If first arg looks like comma-separated tags or has --source, use memory engine
      if [[ "$init_args" == *","* || "$init_args" == *"--source"* || "$init_args" == *"--max"* ]] \
         && command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" recall $init_args
      else
        # Legacy fallback: figrep against hermetic/
        "$AGENCE_BIN/figrep" "$AGENCE_ROOT/hermetic" $init_args
      fi
      return $?
      ;;
    "retain")
      # Store a memory row in a persistent cognitive store
      # Usage: agence ^retain <source> <tags> <content>
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^retain <source> <tags> <content>" >&2
        echo "  Sources: eidetic, semantic, episodic, kinesthetic, masonic" >&2
        return 1
      fi
      if command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" retain $init_args
      else
        echo "Error: ^retain requires bun + lib/memory.ts" >&2
        return 1
      fi
      return $?
      ;;
    "cache")
      # Hydrate mnemonic working-set cache from all persistent stores
      # Usage: agence ^cache <tags> [--max N] [--masonic]
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^cache <tags> [--max N] [--masonic]" >&2
        return 1
      fi
      if command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" cache $init_args
      else
        echo "Error: ^cache requires bun + lib/memory.ts" >&2
        return 1
      fi
      return $?
      ;;
    "forget")
      # Remove a memory row from a store
      # Usage: agence ^forget <id> <source>
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^forget <id> <source>" >&2
        return 1
      fi
      if command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" forget $init_args
      else
        echo "Error: ^forget requires bun + lib/memory.ts" >&2
        return 1
      fi
      return $?
      ;;
    "promote")
      # Move a memory row between cognitive stores
      # Usage: agence ^promote <id> <from> <to>
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^promote <id> <from> <to>" >&2
        return 1
      fi
      if command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" promote $init_args
      else
        echo "Error: ^promote requires bun + lib/memory.ts" >&2
        return 1
      fi
      return $?
      ;;
    "memory")
      # Full memory subsystem CLI
      # Usage: agence ^memory <command> [args...]
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      if command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" $init_args
      else
        echo "Error: ^memory requires bun + lib/memory.ts" >&2
        return 1
      fi
      return $?
      ;;
    "distill")
      # Batch promote rows between cognitive stores
      # Usage: agence ^distill <from> <to> [--min-importance N] [--tags T] [--dry-run]
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^distill <from> <to> [--min-importance N] [--min-age-days N] [--tags T] [--dry-run]" >&2
        echo "  Paths: episodic→eidetic, episodic→kinesthetic, kinesthetic→semantic, masonic→eidetic" >&2
        return 1
      fi
      if command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" distill $init_args
      else
        echo "Error: ^distill requires bun + lib/memory.ts" >&2
        return 1
      fi
      return $?
      ;;
    "session-restore")
      # Restore a session from a snapshot: ^session-restore <session_id> <snapshot_dir>
      local restore_session_id="${init_args%% *}"
      local restore_snapshot_dir="${init_args#* }"
      if [[ -z "$restore_session_id" || "$restore_session_id" == "$restore_snapshot_dir" ]]; then
        echo "Usage: agence ^session-restore <session_id> <snapshot_dir>" >&2
        return 1
      fi
      echo "[INFO] Restoring session $restore_session_id from $restore_snapshot_dir" >&2
      bash "$AGENCE_ROOT/bin/aisession" resume "$restore_session_id"
      return $?
      ;;
    "aido")
      # Safe whitelisted command executor: agence ^aido <tool> [args...]
      # Allows only read-only / idempotent operations (git, gh, aws, tf)
      if [[ -z "$init_args" ]]; then
        echo "Usage: agence ^aido <tool> [args...]" >&2
        echo "  e.g. agence ^aido git status" >&2
        echo "  e.g. agence ^aido gh pr list" >&2
        echo "See bin/COMMANDS.md §aido for full allowlist." >&2
        return 1
      fi
      bash "$AGENCE_ROOT/bin/aido" $init_args
      return $?
      ;;
    # ── Plural shortcuts ───────────────────────────────────────────────────
    # Status-bearing types: plural → status
    "tasks")      mode_knowledge "task" "status $init_args"; return $? ;;
    "projects")   mode_knowledge "project" "status $init_args"; return $? ;;
    "workflows")  mode_knowledge "workflow" "status $init_args"; return $? ;;
    "todos")      mode_knowledge "todo" "status $init_args"; return $? ;;
    "notes")      mode_knowledge "note" "status $init_args"; return $? ;;
    "jobs")       mode_knowledge "job" "status $init_args"; agence_format_legend; return $? ;;
    "issues")     mode_knowledge "issue" "status $init_args"; return $? ;;
    "plans")      mode_knowledge "plan" "status $init_args"; return $? ;;
    "sessions")   mode_session "status $init_args"; return $? ;;
    "swarms")     bash "$AGENCE_ROOT/bin/swarm" status $init_args 2>/dev/null || echo "(swarm status not yet implemented)"; agence_format_legend; return $? ;;
    # List-only types: plural → list
    "faults")     mode_knowledge "fault" "list $init_args"; return $? ;;
    "logs")       mode_knowledge "log" "list $init_args"; return $? ;;
    "lessons")    mode_knowledge "lesson" "list $init_args"; return $? ;;
    "swarm")
      # Swarm management: agence ^swarm [launch|list|status|shells|...]
      local _swarm_sub="${init_args%% *}"
      local _swarm_rest="${init_args#$_swarm_sub}"
      _swarm_rest="${_swarm_rest# }"
      case "${_swarm_sub:-list}" in
        "status"|"list"|"shells"|"launch"|"attach"|"kill"|"reap"|"focus"|"signal"|"title")
          bash "$AGENCE_ROOT/bin/swarm" "${_swarm_sub:-list}" $_swarm_rest
          ;;
        *)
          bash "$AGENCE_ROOT/bin/swarm" ${init_args}
          ;;
      esac
      return $?
      ;;
    *)
      # ── Skill command dispatch ───────────────────────────────────────────
      # If init_cmd matches a known skill, route through lib/skill.ts
      local _skill_ts="${AGENCE_ROOT}/lib/skill.ts"
      local _skill_names="fix|build|feature|refactor|solve|review|precommit|simplify|analyse|analyze|design|pattern|scope|spec|split|deploy|brainstorm|peer-design|peer-review|peer-solve|peer-analyse|peer-analyze|hack|break|document|test|recon|grasp|glimpse"
      if [[ "$init_cmd" =~ ^(${_skill_names})$ ]] && command -v bun &>/dev/null && [[ -f "$_skill_ts" ]]; then
        # Normalize spelling: analyze → analyse (canonical)
        local _skill_cmd="$init_cmd"
        [[ "$_skill_cmd" == "analyze" ]] && _skill_cmd="analyse"
        [[ "$_skill_cmd" == "peer-analyze" ]] && _skill_cmd="peer-analyse"

        # Pass through @agent if set (skip bare "@" sentinel = no agent)
        local _skill_agent_flag=""
        local _skill_peers_flag=""
        if [[ -n "${AGENCE_AGENT_PARAM:-}" && "${AGENCE_AGENT_PARAM}" != "@" ]]; then
          if [[ "${AGENCE_AGENT_PARAM}" == "peers" ]]; then
            # WIRE-001: @peers → --peers mode (fan-out to 3 LLMs)
            _skill_peers_flag="--peers"
          elif [[ "${AGENCE_AGENT_PARAM}" == "pair" ]]; then
            # @pair → --peers mode with pair flavor (2-tangent consensus)
            _skill_peers_flag="--peers --flavor pair"
          else
            _skill_agent_flag="--agent @${AGENCE_AGENT_PARAM}"
          fi
        fi
        bun run "$_skill_ts" "$_skill_cmd" $_skill_peers_flag $_skill_agent_flag $init_args
        return $?
      fi

      echo "Error: Unknown init command: $init_cmd" >&2
      echo "Available: help, init, reload, install, save, learn, commit, push, session," >&2
      echo "           lesson, log, plan, todo, note, fault, issue, task, job, workflow, project," >&2
      echo "           swarm, audit, recall, retain, cache, forget, promote, distill, memory," >&2
      echo "           handoff, pickup, pause, resume, index, reindex, regen, state, aido," >&2
      echo "           fix, build, feature, refactor, solve, review, precommit, simplify, deploy, brainstorm," >&2
      echo "           analyse, analyze, design, pattern, scope, spec, split, hack, break, document, test, recon, grasp, glimpse" >&2
      return 1
      ;;
  esac

  return $?
}

# ============================================================================
# ROUTING: ORG PATH RESOLUTION (@ symlink inheritance)
# ============================================================================
# Resolves scope path using @ symlink if present, falls back to explicit org dir.
# Law 8: Use realpath() ONLY for validation — never create symlinks here.
#
# Usage: resolve_org_path "/path/to/synthetic" "l-agence.org"
# Returns: /path/to/synthetic/@l-agence.org (via symlink) or /path/to/synthetic/l-agence.org
resolve_org_path() {
  local scope_root="$1"      # e.g. $AGENCE_ROOT/synthetic
  local fallback_org="$2"    # e.g. l-agence.org

  local symlink_path="$scope_root/@"
  local named_org_path="$scope_root/@$fallback_org"
  local canonical_path="$scope_root/$fallback_org"

  # Tier 1: @ symlink (user-set org context via jlink / system setup)
  # e.g. synthetic/@ -> l-agence.org
  if [[ -L "$symlink_path" ]]; then
    echo "$symlink_path"
    return 0
  fi

  # Tier 2: named @org SYMLINK only (explicit org routing via jlink)
  # e.g. synthetic/@l-agence.org -> ../l-agence.org (user-created symlink)
  # NOTE: a plain @org directory is NOT a routing symlink (skip it)
  if [[ -L "$named_org_path" ]]; then
    echo "$named_org_path"
    return 0
  fi

  # Tier 3: canonical org directory (e.g. synthetic/l-agence.org) — most common
  echo "$canonical_path"
  return 0
}

# ============================================================================
# MODE: HELP (^help)
# ============================================================================
# Structured command help with scope context
# Example: agence ^help

init_agence_environment() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Initializing Agence environment..." >&2

  echo ""
  echo "=============================================="
  echo "  AGENCE INIT (^init)"
  echo "=============================================="
  echo ""

  local ok=0 warn=0 created=0

  # ── Step 1: Verify agence root ────────────────────────────────────────────
  echo "Step 1/7: Verifying agence root..."
  if [[ -f "${AGENCE_ROOT}/bin/agence" ]]; then
    echo "  ✓ AGENCE_ROOT=${AGENCE_ROOT}"
    ((ok++))
  else
    echo "  ✗ AGENCE_ROOT not set correctly (expected bin/agence inside it)" >&2
    ((warn++))
  fi
  echo ""

  # ── Step 2: Create required directories ───────────────────────────────────
  echo "Step 2/7: Creating directory structure..."
  local -a required_dirs=(
    "nexus"
    "nexus/.aisessions"
    "nexus/.airuns"
    "nexus/faults"
    "nexus/logs"
    "organic/tasks"
    "organic/workflows"
    "organic/jobs"
    "globalcache"
    "objectcode"
  )
  for dir in "${required_dirs[@]}"; do
    if [[ -d "${AGENCE_ROOT}/$dir" ]]; then
      echo "  ✓ $dir/"
    else
      mkdir -p "${AGENCE_ROOT}/$dir" 2>/dev/null
      if [[ -d "${AGENCE_ROOT}/$dir" ]]; then
        echo "  + $dir/ (created)"
        ((created++))
      else
        echo "  ✗ $dir/ (failed to create)" >&2
        ((warn++))
      fi
    fi
  done
  echo ""

  # ── Step 3: Create .agencerc in parent repo if submodule ──────────────────
  echo "Step 3/7: Checking .agencerc..."
  if [[ -n "$GIT_REPO" && "$GIT_REPO" != "$AGENCE_ROOT" ]]; then
    # Submodule mode — parent repo needs .agencerc
    local rc_path="$GIT_REPO/.agencerc"
    if [[ -f "$rc_path" ]]; then
      echo "  ✓ $rc_path exists"
    else
      cat > "$rc_path" <<'AGENCERC'
# .agencerc — Agence environment configuration
# Source this from your .bashrc/.zshrc, or agence sources it automatically.
# All values can be overridden by environment variables.

# Uncomment and set your preferred LLM provider:
# export AGENCE_LLM_PROVIDER="anthropic"   # anthropic|openai|copilot|ollama|...
# export AGENCE_DEFAULT_AGENT="ralph"       # default persona agent

# API keys (prefer env vars or a secrets manager over this file):
# export ANTHROPIC_API_KEY="sk-ant-..."
# export OPENAI_API_KEY="sk-..."
AGENCERC
      echo "  + Created $rc_path (edit to set API keys)"
      ((created++))
    fi
  else
    # Standalone mode
    if [[ -f "${AGENCE_ROOT}/.agencerc" ]]; then
      echo "  ✓ .agencerc exists (standalone mode)"
    else
      echo "  - .agencerc not found (standalone mode — optional)"
    fi
  fi
  echo ""

  # ── Step 4: Set up @ symlink routing ──────────────────────────────────────
  echo "Step 4/7: Checking @ symlink routing..."
  echo "  The '@' symlink inside synthetic/ and hermetic/ points to the"
  echo "  active org directory (e.g. hermetic/@ → hermetic/l-agence.org)."
  echo "  This lets commands resolve paths without hardcoding org names."
  echo ""
  local -a scope_dirs=("synthetic" "hermetic")
  for scope in "${scope_dirs[@]}"; do
    local scope_path="${AGENCE_ROOT}/$scope"
    local at_link="${scope_path}/@"
    if [[ -L "$at_link" ]]; then
      local target
      target="$(readlink "$at_link" 2>/dev/null || echo "?")"
      echo "  ✓ $scope/@ → $target"
    elif [[ -d "$scope_path" ]]; then
      # Try to find the first org directory to suggest
      local first_org=""
      for d in "$scope_path"/*/; do
        [[ -d "$d" ]] && first_org="$(basename "$d")" && break
      done
      if [[ -n "$first_org" ]]; then
        echo "  ⚠ $scope/@ missing — create with:"
        echo "      ln -s ${scope_path}/${first_org} ${at_link}"
      else
        echo "  - $scope/ exists but has no org directories yet"
      fi
      ((warn++))
    else
      echo "  - $scope/ not found (will be created when needed)"
    fi
  done
  echo ""

  # ── Step 5: PATH + ag alias ─────────────────────────────────────────────
  echo "Step 5/7: PATH + ^ shortcut..."
  # Ensure AI_BIN is on PATH for this session (idempotent)
  case ":${PATH}:" in
    *":${AI_BIN}:"*) ;;
    *) export PATH="${AI_BIN}:${PATH}" ;;
  esac

  if command -v agence &>/dev/null; then
    echo "  ✓ agence is on PATH ($(command -v agence))"
    ((ok++))
  else
    echo "  ⚠ agence is not on PATH in your current shell."
    echo "    To activate, run:"
    echo "      source ${AGENCE_ROOT}/bin/.agencerc"
    echo "    Or launch with:"
    echo "      bash --rcfile ${AGENCE_ROOT}/bin/.agencerc"
    ((warn++))
  fi

  # Create ^ → agence symlink in AI_BIN (idempotent)
  local caret_link="${AI_BIN}/^"
  if [[ -L "$caret_link" ]]; then
    echo "  ✓ ^ → agence symlink exists"
  else
    ln -s "agence" "$caret_link" 2>/dev/null && {
      echo "  + ^ → agence symlink created"
      ((created++))
    } || {
      echo "  ⚠ failed to create ^ → agence symlink in ${AI_BIN}" >&2
      ((warn++))
    }
  fi
  echo ""

  # ── Step 6: Check key dependencies ───────────────────────────────────────
  echo "Step 6/7: Checking dependencies..."
  local deps=(git bash tmux jq)
  local optional_deps=("script:session-logging" "bun:typescript-modules")
  for dep in "${deps[@]}"; do
    if command -v "$dep" &>/dev/null; then
      echo "  ✓ $dep"
      ((ok++))
    else
      echo "  ✗ $dep — required (sudo apt install $dep)"
      ((warn++))
    fi
  done
  for entry in "${optional_deps[@]}"; do
    local dep="${entry%%:*}" label="${entry##*:}"
    if command -v "$dep" &>/dev/null; then
      echo "  ✓ $dep ($label)"
    else
      echo "  - $dep not found ($label — optional)"
    fi
  done
  echo ""

  echo "=============================================="
  if [[ $warn -eq 0 ]]; then
    echo "✓ Agence ready!"
  else
    echo "⚠ Agence ready with $warn warning(s) — see above"
  fi
  [[ $created -gt 0 ]] && echo "  Created $created new item(s)"
  echo "  AGENCE_ROOT=${AGENCE_ROOT}"
  echo "  Run 'agence --help' to get started"
  echo "  Run 'agence ^install' to install AI tool dependencies"
  echo "=============================================="
  echo ""

  # ── Step 7: Upstream shard & ledger repo ─────────────────────────────────
  echo "Step 7/7: Upstream shard & ledger repos..."

  # Detect current git remote as default shard origin
  local _current_remote=""
  _current_remote=$(git -C "${AGENCE_ROOT}" remote get-url origin 2>/dev/null || true)

  # Infer defaults from git remote (e.g. github.com/l-agence/agence → l-agence)
  local _default_org=""
  if [[ "$_current_remote" =~ github\.com[:/]([^/]+)/ ]]; then
    _default_org="${BASH_REMATCH[1]}"
  fi
  local _default_shard="${_current_remote:-https://github.com/l-agence/agence.git}"
  local _default_ledger=""
  if [[ -n "$_default_org" ]]; then
    _default_ledger="https://github.com/${_default_org}/ailedger.git"
  else
    _default_ledger="https://github.com/l-agence/ailedger.git"
  fi

  echo "  Agence uses two upstream repos:"
  echo "    1. Shard repo  — the agence framework origin (this repo's remote)"
  echo "    2. Ledger repo — shared .ailedger for cross-shard audit trail"
  echo ""

  # Prompt for shard origin (Enter = accept default)
  local _shard_repo=""
  read -r -p "  Shard repo [${_default_shard}]: " _shard_repo </dev/tty 2>/dev/null || true
  _shard_repo="${_shard_repo:-$_default_shard}"
  echo "  → shard: ${_shard_repo}"

  # Prompt for ledger repo (Enter = accept default)
  local _ledger_repo=""
  read -r -p "  Ledger repo [${_default_ledger}]: " _ledger_repo </dev/tty 2>/dev/null || true
  _ledger_repo="${_ledger_repo:-$_default_ledger}"
  echo "  → ledger: ${_ledger_repo}"
  echo ""

  # Export AI_SHARD for ailedger.ts to use
  export AI_SHARD="${_ledger_repo}"

  # Init .ailedger nested repo (two-tier: local + shard)
  local _ailedger_ts="${AGENCE_ROOT}/lib/ailedger.ts"
  if command -v bun &>/dev/null && [[ -f "$_ailedger_ts" ]]; then
    echo "  Initializing .ailedger (two-tier Merkle ledger)..."
    bun run "$_ailedger_ts" init 2>&1
  else
    echo "  ⚠ bun not found — skipping .ailedger init"
    echo "    Run 'agence ^install' first, then 'agence ^init' again"
    ((warn++))
  fi
  echo ""

  return 0
}

reload_agence_context() {
  # Load and acknowledge the entire Agence knowledge hierarchy
  # This reloads all context files in proper order and summarizes what was loaded
  
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Reloading Agence context..." >&2
  
  local AGENCE_GITHUB="$AGENCE_REPO/.github"
  local context_files=(
    "$AGENCE_GITHUB/CLAUDE.md:Claude Integration"
    "$GIT_REPO/.github/copilot-instructions.md:Copilot Instructions"
    "$AGENCE_ROOT/codex/PRINCIPLES.md:Principles (Maxims)"
    "$AGENCE_ROOT/codex/LAWS.md:Laws (Hard Constraints)"
    "$AGENCE_ROOT/codex/RULES.md:Rules (Best Practices)"
    "$AGENCE_BIN/COMMANDS.md:Commands Reference"
    "$AGENCE_ROOT/nexus/faults/INDEX.md:Faults Index"
    "$AGENCE_ROOT/shared/lessons/INDEX.md:Lessons Learned"
  )
  
  echo "[RELOAD] Agence Context Loading"
  echo "=========================================="
  echo ""
  
  local loaded_count=0
  local failed_files=""
  
  for file_info in "${context_files[@]}"; do
    local file="${file_info%%:*}"
    local label="${file_info##*:}"
    
    if [[ -f "$file" ]]; then
      # Get file size and line count
      local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "?")
      local lines=$(wc -l < "$file" 2>/dev/null || echo "?")
      
      printf "✓ %-35s | %6s bytes | %4s lines\n" "$label" "$size" "$lines"
      ((loaded_count++))
    else
      printf "✗ %-35s | [NOT FOUND]\n" "$label"
      failed_files="$failed_files\n  - $file"
    fi
  done
  
  echo ""
  echo "=========================================="
  echo ""
  echo "Context Summary:"
  echo "  Total files loaded: $loaded_count / ${#context_files[@]}"
  
  if [[ -n "$failed_files" ]]; then
    echo ""
    echo "⚠ Missing files:$failed_files"
  fi
  
  # Load and count some key metrics
  local principles_count=$(grep -c "^## Maxim" "$AGENCE_ROOT/codex/PRINCIPLES.md" 2>/dev/null || echo 0)
  local laws_count=$(grep -c "^## Law" "$AGENCE_ROOT/codex/LAWS.md" 2>/dev/null || echo 0)
  local rules_count=$(grep -c "^## Rule" "$AGENCE_ROOT/codex/RULES.md" 2>/dev/null || echo 0)
  local lessons_count=$(jq -r '.total_lessons' "$AGENCE_ROOT/shared/lessons/INDEX.json" 2>/dev/null || echo 0)
  
  echo ""
  echo "Active Knowledge:"
  echo "  Principles/Maxims: $principles_count"
  echo "  Laws (Constraints): $laws_count"
  echo "  Rules (Practices): $rules_count"
  echo "  Lessons Learned: $lessons_count"
  
  echo ""
  echo "Status: ✓ Agence context fully loaded and acknowledged"
  echo ""
  
  return 0
}

create_windows_symlink() {
  local source="$1"
  local target="$2"
  
  # Determine if source is a file or directory
  local link_type="file"
  if [[ -d "$source" ]]; then
    link_type="dir"
  fi
  
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Creating symlink: $target → $source ($link_type)" >&2
  
  if [[ "$AGENCE_OS_WINDOWS" == "1" ]]; then
    # Windows: Use mklink command (requires admin on some systems)
    # Type 12019 is for file symlinks, type 12000 is for directory symlinks
    if [[ "$link_type" == "dir" ]]; then
      cmd /c mklink /D "$(cygpath -w "$target")" "$(cygpath -w "$source")" 2>/dev/null
    else
      cmd /c mklink /H "$(cygpath -w "$target")" "$(cygpath -w "$source")" 2>/dev/null || \
      cmd /c mklink "$(cygpath -w "$target")" "$(cygpath -w "$source")" 2>/dev/null
    fi
    
    if [[ $? -eq 0 ]]; then
      return 0
    else
      echo "[ERROR] mklink failed. Trying PowerShell method..." >&2
      # Fallback to PowerShell
      powershell -Command "New-Item -ItemType SymbolicLink -Path '$(cygpath -w "$target")' -Target '$(cygpath -w "$source")' -Force" 2>/dev/null
      return $?
    fi
  else
    # Unix/Linux/macOS: Use ln -s
    ln -s "$source" "$target" 2>/dev/null
    return $?
  fi
}

# ============================================================================
# MODE: SYSTEM COMMAND
# ============================================================================
# Built-in system utilities
# Example: agence !help
# Example: agence !bash (open new shell)

# ============================================================================
# TOOL LAUNCHER — !aider, !claude, !pilot
# ============================================================================
# Checks installation, sets env, execs the tool directly.
# Data-driven from codex/agents/registry.json — reads type, binary, flags.
# Usage: launch_tool <tool> [extra-args...]

_AGENT_REGISTRY="${AGENCE_ROOT}/codex/agents/registry.json"

# ── Unified Route Parser ───────────────────────────────────────────────────
# EBNF: target ('.' qualifier)*
# Normalizes @ → . inside qualifiers, splits base + tier + model string.
# Sets: _ROUTE_BASE, _ROUTE_TIER, _ROUTE_QUALS, AGENCE_LLM_MODEL (if tier found)
#
# Examples:
#   aider.opus       → base=aider  tier=opus   model=claude-opus-4-5
#   ralph.haiku.3.5  → base=ralph  tier=haiku  model=claude-haiku-3-5
#   aider@opus       → base=aider  tier=opus   model=claude-opus-4-5
#   peers.light      → base=peers  tier=light  (flavor, not model)
#   bash             → base=bash   tier=""     (no override)

repair_agence_symlinks() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Checking for broken symlinks..." >&2
  
  # Get list of symlinks from git
  local symlinks=$(git -C "$AGENCE_ROOT" ls-files -s 2>/dev/null | grep "^120000" | awk '{print $NF}')
  
  if [[ -z "$symlinks" ]]; then
    [[ "$DEBUG" == "1" ]] && echo "[DEBUG] No symlinks tracked in git" >&2
    return 0
  fi
  
  local count=0
  while IFS= read -r filepath; do
    [[ -z "$filepath" ]] && continue
    
    if [[ -L "$AGENCE_ROOT/$filepath" ]]; then
      # Already a symlink, skip
      continue
    fi
    
    if [[ ! -e "$AGENCE_ROOT/$filepath" ]]; then
      # Symlink doesn't exist, try to recreate it
      # Git stores symlinks as: "<path to target>"
      local target=$(git -C "$AGENCE_ROOT" ls-files -s 2>/dev/null | grep "^120000.*$filepath" | awk '{for(i=1;i<=NF;i++) printf "%s ", $i}' | sed 's/.*\s//')
      
      if [[ -n "$target" ]]; then
        mkdir -p "$(dirname "$AGENCE_ROOT/$filepath")" 2>/dev/null
        ln -sf "$target" "$AGENCE_ROOT/$filepath" 2>/dev/null
        if [[ $? -eq 0 ]]; then
          echo "[REPAIR] Created symlink: $filepath -> $target"
          ((count++))
        fi
      fi
    fi
  done <<< "$symlinks"
  
  if [[ $count -gt 0 ]]; then
    echo ""
    echo "✓ Repaired $count broken symlink(s)"
  fi
  
  return 0
}

# ============================================================================
# INSTALL: Package Manager Integration
# ============================================================================

install_agence_packages() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Installing Agence packages..." >&2
  
  echo ""
  echo "=============================================="
  echo "  AGENCE PACKAGE INSTALLATION (^install)"
  echo "=============================================="
  echo ""
  
  # Detect OS
  local os_type="unknown"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* ]]; then
    os_type="windows"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    os_type="macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    os_type="linux"
  fi
  
  echo "Detected OS: $os_type"
  echo ""
  
  case "$os_type" in
    windows)
      install_windows_packages
      ;;
    macos)
      install_macos_packages
      ;;
    linux)
      install_linux_packages
      ;;
    *)
      echo "[ERROR] Unsupported OS: $OSTYPE" >&2
      return 1
      ;;
  esac
  
  return $?
}

install_windows_packages() {
  echo "Installing AI tools via winget..."
  echo ""
  echo "  Core (required):"
  local -a winget_required=("GitHub.cli" "jqlang.jq" "GnuWin32.Gawk" "Anthropic.ClaudeCode" "GitHub.Copilot" "Microsoft.AIShell")
  for pkg in "${winget_required[@]}"; do
    echo -n "  [$pkg] "
    if winget list --id "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"
    elif winget install -e --id "$pkg" --accept-package-agreements --accept-source-agreements &>/dev/null 2>&1; then
      echo "✓ installed"
    else
      echo "✗ failed (try manually: winget install $pkg)"
    fi
  done
  echo ""
  echo "  Core (script installer):"
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif powershell -c 'irm bun.sh/install.ps1 | iex' &>/dev/null 2>&1; then
    echo "✓ installed (via PowerShell)"
  elif winget install -e --id Oven-sh.Bun --accept-package-agreements --accept-source-agreements &>/dev/null 2>&1; then
    echo "✓ installed (via winget fallback)"
  else
    echo "✗ failed (try: powershell -c \"irm bun.sh/install.ps1 | iex\")"
  fi
  echo ""
  echo "  Optional (Python):"
  if command -v pip &>/dev/null || command -v pip3 &>/dev/null; then
    local pip_cmd="pip"; command -v pip3 &>/dev/null && pip_cmd="pip3"
    echo -n "  [aider] "
    if command -v aider &>/dev/null; then echo "✓ already installed"
    elif $pip_cmd install aider-chat &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: pip install aider-chat)"; fi
  else
    echo "  - pip not found — install Python to get aider"
  fi
}

install_macos_packages() {
  echo "Installing AI tools via Homebrew..."
  echo ""
  if ! command -v brew &>/dev/null; then
    echo "  ✗ Homebrew not found. Install from: https://brew.sh" >&2
    return 1
  fi
  local -a brew_pkgs=("gh" "jq" "tmux" "socat")
  echo "  Core (required):"
  for pkg in "${brew_pkgs[@]}"; do
    echo -n "  [$pkg] "
    if brew list "$pkg" &>/dev/null 2>&1; then echo "✓ already installed"
    elif brew install "$pkg" &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed"; fi
  done
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif brew tap oven-sh/bun &>/dev/null 2>&1 && brew install bun &>/dev/null 2>&1; then
    echo "✓ installed"
  elif curl -fsSL https://bun.sh/install | bash &>/dev/null 2>&1; then
    echo "✓ installed (via bun.sh)"
  else
    echo "✗ failed (try: curl -fsSL https://bun.sh/install | bash)"
  fi
  echo ""
  echo "  Optional (npm):"
  if command -v npm &>/dev/null; then
    echo -n "  [claude] "
    if command -v claude &>/dev/null; then echo "✓ already installed"
    elif npm install -g @anthropic-ai/claude-code &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: npm install -g @anthropic-ai/claude-code)"; fi
  else
    echo "  - npm not found — install Node.js to get claude CLI"
  fi
  echo ""
  echo "  Optional (pip):"
  if command -v pip3 &>/dev/null; then
    echo -n "  [aider] "
    if command -v aider &>/dev/null; then echo "✓ already installed"
    elif pip3 install aider-chat &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: pip3 install aider-chat)"; fi
  fi
  echo ""
  echo "  GitHub Copilot CLI: https://github.com/github/copilot-cli"
  echo "    curl -fsSL https://gh.io/copilot-install | bash"
}

install_linux_packages() {
  echo "Installing AI tools (Linux/WSL)..."
  echo ""
  # Update package lists first (required before first install)
  echo "  Updating package lists..."
  if sudo apt-get update -qq &>/dev/null 2>&1; then
    echo "  ✓ apt-get update completed"
  else
    echo "  ⚠ apt-get update failed (continuing anyway)" >&2
  fi
  echo ""
  # System packages
  local -a apt_pkgs=("git" "jq" "gawk" "tmux" "socat" "util-linux" "gh" "npm" "curl" "unzip" "wslu")
  local pkg_ok=0 pkg_fail=0
  echo "  System (apt):"
  for pkg in "${apt_pkgs[@]}"; do
    echo -n "  [$pkg] "
    if command -v "$pkg" &>/dev/null || dpkg -l "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"; ((pkg_ok++))
    elif sudo apt-get install -y "$pkg" &>/dev/null 2>&1; then
      echo "✓ installed"; ((pkg_ok++))
    else
      echo "✗ failed (try: sudo apt-get install $pkg)"; ((pkg_fail++))
    fi
  done
  echo ""
  # bun — TypeScript runtime (core dependency for airun/aibash session management)
  echo "  Core (script installer):"
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif command -v npm &>/dev/null && npm install -g bun &>/dev/null 2>&1; then
    echo "✓ installed (via npm)"
  elif command -v snap &>/dev/null && sudo snap install bun-js &>/dev/null 2>&1; then
    echo "✓ installed (via snap)"
  elif curl -fsSL https://bun.sh/install | bash &>/dev/null 2>&1; then
    echo "✓ installed (via bun.sh)"
  else
    echo "✗ failed (try: npm install -g bun)"
  fi
  echo ""
  # npm claude
  echo "  Optional (npm — Claude Code CLI):"
  if command -v npm &>/dev/null; then
    echo -n "  [claude] "
    if command -v claude &>/dev/null; then echo "✓ already installed"
    elif sudo npm install -g @anthropic-ai/claude-code &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: sudo npm install -g @anthropic-ai/claude-code)"; fi
  else
    echo "  - npm not found (install node: sudo apt-get install nodejs)"
  fi
  echo ""
  # copilot
  echo "  Optional (GitHub Copilot CLI):"
  if command -v copilot &>/dev/null; then
    echo "  [copilot] ✓ already installed ($(command -v copilot))"
  else
    echo "  [copilot] not installed"
    echo "    Install: curl -fsSL https://gh.io/copilot-install | bash"
  fi
  echo ""
  # aider
  echo "  Optional (aider):"
  if command -v aider &>/dev/null; then
    echo "  [aider] ✓ already installed"
  else
    echo "  [aider] not installed"
    echo "    Install: pip install aider-chat"
  fi
}

# ============================================================================
# AGENT ROUTING: Parse @agent prefix and get agent identity
# ============================================================================

scan_knowledge_bases() {
  echo ""; echo "══════════════════════════════════════════════"
  echo "  AGENCE INDEX SCAN (^index)"
  echo "══════════════════════════════════════════════"; echo ""
  local dirs=("synthetic" "nexus" "globalcache" "organic")
  local scanned=0
  local missing=0
  for dir in "${dirs[@]}"; do
    local d="${AGENCE_ROOT}/$dir"
    [[ -d "$d" ]] || continue
    echo "  Scanning: $dir/"
    while IFS= read -r md; do
      local base; base=$(dirname "$md")
      local json="${base}/INDEX.json"
      if [[ ! -f "$json" ]]; then
        echo "    ⚠ Missing INDEX.json: ${base#$AGENCE_ROOT/}"
        ((missing++))
      else
        echo "    ✓ ${base#$AGENCE_ROOT/}"
      fi
      ((scanned++))
    done < <(find "$d" -name "INDEX.md" -type f 2>/dev/null | sort)
  done
  echo ""
  echo "  Scanned: $scanned INDEX.md files ($missing missing INDEX.json)"
  echo ""; echo "══════════════════════════════════════════════"
  echo "  INDEX SCAN COMPLETE"; echo ""
}

# ============================================================================
# REINDEX: Run bin/indexer (formtag + checksum) on knowledge bases
# ============================================================================

reindex_knowledge_bases() {
  local indexer="${AGENCE_ROOT}/bin/indexer"
  if [[ ! -f "$indexer" ]]; then
    echo "Error: bin/indexer not found" >&2; return 1
  fi
  if ! command -v python3 &>/dev/null; then
    echo "Error: python3 required for bin/indexer" >&2; return 1
  fi

  local args=("$@")
  # Default: reindex all knowledge bases
  if [[ ${#args[@]} -eq 0 ]]; then
    echo ""; echo "══════════════════════════════════════════════"
    echo "  AGENCE REINDEX (^reindex)"
    echo "══════════════════════════════════════════════"; echo ""
    local dirs=("synthetic" "globalcache" "organic")
    local count=0
    for dir in "${dirs[@]}"; do
      local d="${AGENCE_ROOT}/$dir"
      [[ -d "$d" ]] || continue
      while IFS= read -r md; do
        local base; base=$(dirname "$md")
        local json="${base}/INDEX.json"
        echo "  Indexing: ${base#$AGENCE_ROOT/}"
        python3 "$indexer" --source kb --input "$md" --output "$json" 2>&1 | sed 's/^/    /'
        ((count++))
      done < <(find "$d" -name "INDEX.md" -type f 2>/dev/null | sort)
    done
    echo ""
    echo "  Reindexed: $count knowledge bases"
    echo ""; echo "══════════════════════════════════════════════"
    echo "  REINDEX COMPLETE"; echo ""
  else
    # Pass args through to indexer directly
    python3 "$indexer" "${args[@]}"
  fi
}

# ============================================================================
# HANDOFF: Transfer session context to another agent
# ============================================================================

