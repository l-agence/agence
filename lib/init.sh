#!/usr/bin/env bash
# lib/init.sh — ^-command dispatcher (mode_init) and org path resolution.
# Setup/install/reload logic lives in lib/setup.sh (sourced by bin/agence).
# Session lifecycle (save, handoff, pause, etc.) lives in lib/session.sh.
# Knowledge indexing (scan, reindex) lives in lib/knowledge.sh.
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
      # Knowledge: lessons learned (team-shared, knowledge)
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
      # Strategic plans (team-shared, knowledge)
      # Usage: agence ^plan [list|show|add] [--org ORG]
      mode_knowledge "plan" "$init_args"
      return $?
      ;;
    "todo")
      # Personal todos (knowledge/private, local only)
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
      # Issues/discoveries (team-shared, knowledge)
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
        echo "  Legacy: plain text falls back to knowledge/private/ grep" >&2
        return 1
      fi
      local _memory_ts="${AGENCE_ROOT}/lib/memory.ts"
      # If first arg looks like comma-separated tags or has --source, use memory engine
      if [[ "$init_args" == *","* || "$init_args" == *"--source"* || "$init_args" == *"--max"* ]] \
         && command -v bun &>/dev/null && [[ -f "$_memory_ts" ]]; then
        bun run "$_memory_ts" recall $init_args
      else
        # Legacy fallback: figrep against knowledge/private/
        "$AGENCE_BIN/figrep" "$AGENCE_ROOT/knowledge/private" $init_args
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
    "recon")
      # ── Direct primitive: ^recon → lib/recon.ts (crawler/indexer, no LLM) ──
      # Unlike skills that route through skill.ts → LLM, ^recon is a
      # deterministic filesystem operation: crawl + index + optional analysis.
      local _recon_ts="${AGENCE_ROOT}/lib/recon.ts"
      if command -v bun &>/dev/null && [[ -f "$_recon_ts" ]]; then
        bun run "$_recon_ts" $init_args
      else
        echo "Error: bun not found or lib/recon.ts missing. Run agence ^install" >&2
        return 1
      fi
      return $?
      ;;
    "btw")
      # Steering notes: agence ^btw <text>
      local _btw_ts="${AGENCE_ROOT}/lib/btw.ts"
      if command -v bun &>/dev/null && [[ -f "$_btw_ts" ]]; then
        bun run "$_btw_ts" $init_args
      else
        echo "Error: ^btw requires bun + lib/btw.ts" >&2
        return 1
      fi
      return $?
      ;;
    "queue")
      # Work queue: agence ^queue show|add|rm|done|next|switch|last|compact|status
      local _queue_ts="${AGENCE_ROOT}/lib/queue.ts"
      if command -v bun &>/dev/null && [[ -f "$_queue_ts" ]]; then
        bun run "$_queue_ts" $init_args
      else
        echo "Error: ^queue requires bun + lib/queue.ts" >&2
        return 1
      fi
      return $?
      ;;
    "routes")
      # Routing context: agence ^routes
      local _router_ts="${AGENCE_ROOT}/lib/router.ts"
      if command -v bun &>/dev/null && [[ -f "$_router_ts" ]]; then
        bun run "$_router_ts" routes $init_args
      else
        echo "Error: ^routes requires bun + lib/router.ts" >&2
        return 1
      fi
      return $?
      ;;
    "diff")
      # Colored diff: agence ^diff <file-a> <file-b>
      local _diff_ts="${AGENCE_ROOT}/lib/diff.ts"
      if command -v bun &>/dev/null && [[ -f "$_diff_ts" ]]; then
        bun run "$_diff_ts" $init_args
      else
        echo "Error: ^diff requires bun + lib/diff.ts" >&2
        return 1
      fi
      return $?
      ;;
    "verify")
      # MANUAL_VERIFY queue: agence ^verify list|show|ack|reject|add|ingest|compact|status
      local _verify_ts="${AGENCE_ROOT}/lib/verify.ts"
      if command -v bun &>/dev/null && [[ -f "$_verify_ts" ]]; then
        bun run "$_verify_ts" $init_args
      else
        echo "Error: ^verify requires bun + lib/verify.ts" >&2
        return 1
      fi
      return $?
      ;;
    *)
      # ── Skill command dispatch ───────────────────────────────────────────
      # If init_cmd matches a known skill, route through lib/skill.ts
      local _skill_ts="${AGENCE_ROOT}/lib/skill.ts"
      local _skill_names="fix|build|feature|refactor|solve|review|precommit|simplify|analyse|analyze|design|pattern|scope|spec|split|deploy|brainstorm|peer-design|peer-review|peer-solve|peer-analyse|peer-analyze|hack|break|document|test|grasp|glimpse|ken"
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
# Resolves scope path using @ symlink if present, falls back to explicit org.
# Law 8: Use realpath() ONLY for validation — never create symlinks here.
#
# Usage: resolve_org_path "/path/to/knowledge" ["fallback-org"]
# Returns: path to the active org directory under scope_root.
# Resolution order: AGENCE_ORG env > @ symlink > @<org> named symlink > canonical dir
resolve_org_path() {
  local scope_root="$1"
  # AGENCE_ORG env (set by ^init / .agencerc) has highest priority;
  # $2 is only a caller-supplied hint used when neither env nor @ symlink resolves.
  local fallback_org="${AGENCE_ORG:-${2:-l-agence.org}}"

  local symlink_path="$scope_root/@"
  local named_org_path="$scope_root/@$fallback_org"
  local canonical_path="$scope_root/$fallback_org"

  # Tier 1: @ symlink (user-set org context via jlink / system setup)
  # e.g. knowledge/@ -> l-agence.org
  if [[ -L "$symlink_path" ]]; then
    echo "$symlink_path"
    return 0
  fi

  # Tier 2: named @org SYMLINK only (explicit org routing via jlink)
  # e.g. knowledge/@l-agence.org -> ../l-agence.org (user-created symlink)
  # NOTE: a plain @org directory is NOT a routing symlink (skip it)
  if [[ -L "$named_org_path" ]]; then
    echo "$named_org_path"
    return 0
  fi

  # Tier 3: canonical org directory (e.g. knowledge/l-agence.org) — most common
  echo "$canonical_path"
  return 0
}
