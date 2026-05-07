#!/usr/bin/env bash
# lib/session.sh — Session management: list/view/handoff/assign/attach/export/import,
#                 save/learn/commit/push, shell launchers (bash, powershell),
#                 handoff/pickup between agents, pause/resume.
# Sourced by bin/agence.
[[ -n "${_AGENCE_SESSION_LOADED:-}" ]] && return 0
_AGENCE_SESSION_LOADED=1

mode_session() {
  local input="$*"
  local sub_cmd="${input%% *}"
  local args="${input#$sub_cmd}"; args="${args# }"

  local sessions_dir="$AGENCE_ROOT/nexus/.aisessions"
  mkdir -p "$sessions_dir" 2>/dev/null

  case "$sub_cmd" in
    "status")
      echo "[session status]"
      local s_total=0
      for meta in "$sessions_dir"/*.meta.json; do
        [[ ! -f "$meta" ]] && continue
        local sid; sid=$(jq -r '.session_id // .sessionID // "unknown"' "$meta" 2>/dev/null)
        local agent; agent=$(jq -r '.agent // .agent_id // .agentID // "unknown"' "$meta" 2>/dev/null)
        local role; role=$(jq -r '.role // "unknown"' "$meta" 2>/dev/null)
        local ts; ts=$(jq -r '.timestamp // "unknown"' "$meta" 2>/dev/null)
        printf '  %s %s  agent=%s  role=%s  started=%s\n' \
          "$(_colored_state "%")" "$sid" "$agent" "$role" "$ts"
        ((s_total++)) || true
      done
      echo ""
      echo "  $s_total session(s)"
      [[ $s_total -eq 0 ]] && echo "  (no sessions found)"
      return 0
      ;;
    "list"|"")
      echo "[SESSION LIST] Active sessions:"
      local count=0
      for meta in "$sessions_dir"/*.meta.json; do
        [[ ! -f "$meta" ]] && continue
        local sid; sid=$(jq -r '.session_id // .sessionID // "unknown"' "$meta" 2>/dev/null)
        local agent; agent=$(jq -r '.agent // .agent_id // .agentID // "unknown"' "$meta" 2>/dev/null)
        local role; role=$(jq -r '.role // "unknown"' "$meta" 2>/dev/null)
        local ts; ts=$(jq -r '.timestamp // "unknown"' "$meta" 2>/dev/null)
        echo "  - $sid  agent=$agent  role=$role  started=$ts"
        ((count++)) || true
      done
      [[ $count -eq 0 ]] && echo "  (no sessions found)"
      return 0
      ;;
    "view")
      if [[ -z "$args" ]]; then
        echo "Usage: agence ^session view <session_id>" >&2; return 1
      fi
      local meta="$sessions_dir/$args.meta.json"
      if [[ -f "$meta" ]]; then
        jq '.' "$meta"
      else
        echo "Session $args not found." >&2; return 1
      fi
      ;;
    "handoff")
      # Local agent assignment: ^session handoff <id> @agent
      local sid; sid=$(echo "$args" | awk '{print $1}')
      local target; target=$(echo "$args" | awk '{print $2}')
      if [[ -z "$sid" || -z "$target" || "$target" != @* ]]; then
        echo "Usage: agence ^session handoff <session_id> <@agent>" >&2; return 1
      fi
      local meta="$sessions_dir/$sid.meta.json"
      if [[ -f "$meta" ]]; then
        local from_agent; from_agent=$(jq -r '.agent // .agent_id // "unknown"' "$meta" 2>/dev/null)
        jq --arg a "$target" '.assigned = $a' "$meta" > "$meta.tmp" && mv "$meta.tmp" "$meta"
        echo "Session $sid handed off to $target."
        # Record handoff in ledger (cross-shard ref)
        if command -v bun &>/dev/null && [[ -f "$AGENCE_ROOT/lib/ailedger.ts" ]]; then
          "$AGENCE_ROOT/bin/airun" ailedger append \
            "handoff" \
            "session-handoff:${from_agent}→${target}" \
            "$sid" \
            "handoff:${from_agent}→${target}:session:${sid}" \
            "0" >/dev/null 2>&1 || true
          echo "  ✓ Ledger entry recorded (handoff ${from_agent} → ${target})"
        fi
      else
        echo "Session $sid not found." >&2; return 1
      fi
      ;;
    "assign")
      # Remote human assignment — exports sanitized metadata: ^session assign <id> @user
      local sid; sid=$(echo "$args" | awk '{print $1}')
      local target; target=$(echo "$args" | awk '{print $2}')
      if [[ -z "$sid" || -z "$target" || "$target" != @* ]]; then
        echo "Usage: agence ^session assign <session_id> <@user>" >&2; return 1
      fi
      local meta="$sessions_dir/$sid.meta.json"
      local export_dir="$GIT_REPO/.agence-sessions"
      mkdir -p "$export_dir"
      if [[ -f "$meta" ]]; then
        jq --arg t "$target" \
          '{session_id, agent_id, role, timestamp, owner, assigned: $t,
            summary: (.summary // ""), exported_at: now | todate}' \
          "$meta" > "$export_dir/$sid.export.json"
        echo "Session $sid assigned to $target (export: $export_dir/$sid.export.json)"
      else
        echo "Session $sid not found." >&2; return 1
      fi
      ;;
    "attach")
      if [[ -z "$args" ]]; then
        echo "Usage: agence ^session attach <session_id>" >&2; return 1
      fi
      local meta="$sessions_dir/$args.meta.json"
      if [[ -f "$meta" ]]; then
        export AGENCE_SESSION_ID="$args"
        export AI_AGENT; AI_AGENT=$(jq -r '.agent // .agent_id // "unknown"' "$meta" 2>/dev/null)
        export AGENCE_SESSION_TYPE; AGENCE_SESSION_TYPE=$(jq -r '.role // "unknown"' "$meta" 2>/dev/null)
        echo "Attached to session $args (agent=$AI_AGENT role=$AGENCE_SESSION_TYPE)"
      else
        echo "Session $args not found." >&2; return 1
      fi
      ;;
    "export")
      # Export sanitized session for handoff: ^session export <id> @user
      local sid; sid=$(echo "$args" | awk '{print $1}')
      local target; target=$(echo "$args" | awk '{print $2}')
      if [[ -z "$sid" || -z "$target" ]]; then
        echo "Usage: agence ^session export <session_id> <@user>" >&2; return 1
      fi
      local meta="$sessions_dir/$sid.meta.json"
      local export_dir="$GIT_REPO/.agence-sessions"
      mkdir -p "$export_dir"
      if [[ -f "$meta" ]]; then
        jq --arg t "$target" \
          '{session_id, agent_id, role, timestamp, owner, assigned: $t,
            summary: (.summary // ""), exported_at: now | todate}' \
          "$meta" > "$export_dir/$sid.export.json"
        echo "Session $sid exported for $target: $export_dir/$sid.export.json"
      else
        echo "Session $sid not found." >&2; return 1
      fi
      ;;
    "import")
      local file="$args"
      if [[ -z "$file" || ! -f "$file" ]]; then
        echo "Usage: agence ^session import <exported_file.json>" >&2; return 1
      fi
      local sid; sid=$(jq -r '.session_id' "$file" 2>/dev/null)
      if [[ -z "$sid" || "$sid" == "null" ]]; then
        echo "Invalid session export file." >&2; return 1
      fi
      cp "$file" "$sessions_dir/$sid.meta.json"
      echo "Imported session $sid."
      ;;
    "push")
      local sid="$args"
      local export_dir="$GIT_REPO/.agence-sessions"
      if [[ -z "$sid" || ! -f "$export_dir/$sid.export.json" ]]; then
        echo "Usage: agence ^session push <session_id>  (must export first)" >&2; return 1
      fi
      git -C "$GIT_REPO" add ".agence-sessions/$sid.export.json"
      git -C "$GIT_REPO" commit -m "[session] Export session $sid for handoff" || echo "Nothing to commit."
      git -C "$GIT_REPO" push
      echo "Pushed session $sid to origin."
      ;;
    "pull")
      local sid="$args"
      local export_dir="$GIT_REPO/.agence-sessions"
      git -C "$GIT_REPO" pull
      if [[ -f "$export_dir/$sid.export.json" ]]; then
        cp "$export_dir/$sid.export.json" "$sessions_dir/$sid.meta.json"
        echo "Pulled and imported session $sid."
      else
        echo "Session $sid export not found after pull." >&2; return 1
      fi
      ;;
    "prune")
      # Delegate to session.ts prune — archive + remove old sessions
      if command -v bun &>/dev/null && [[ -f "$AGENCE_ROOT/lib/session.ts" ]]; then
        "$AGENCE_ROOT/bin/airun" session prune $args
      else
        echo "Error: ^session prune requires bun + lib/session.ts" >&2
        return 1
      fi
      ;;
    *)
      echo "Error: Unknown session subcommand: $sub_cmd" >&2
      echo "Available: status, list, view, handoff, assign, attach, export, import, push, pull, prune" >&2
      return 1
      ;;
  esac

  return $?
}

# ============================================================================
# MODE: KNOWLEDGE MANAGEMENT (lesson, log, plan, todo, fault, issue, task, job)
# ============================================================================
# Unified handler for all knowledge/work management commands
# Routes to appropriate scope: HERMETIC, NEXUS, SYNTHETIC, ORGANIC
# Example: agence ^lesson list
# Example: agence ^plan add "Phase 2 roadmap"
# Example: agence ^todo list

save_session() {
  bun run "$AGENCE_ROOT/lib/session.ts" save "$@"
}

# ============================================================================
# SESSION: LEARN (^learn) — richer version scanning sessions + faults + lessons
# ============================================================================

learn_agence_changes() {
  bun run "$AGENCE_ROOT/lib/session.ts" learn
}

# ============================================================================
# SESSION: COMMIT
# ============================================================================
# Stage and commit all Agence changes
# Usage: agence ^commit [message]

commit_agence_changes() {
  local commit_msg="${1:-}"

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Committing Agence changes..." >&2

  local status; status=$(git -C "$AGENCE_ROOT" status --short 2>/dev/null)

  if [[ -z "$status" ]]; then
    echo ""
    echo "✓ No changes to commit."
    return 0
  fi

  echo ""
  echo "[^COMMIT] Changed files:"
  echo "=============================================="
  echo "$status" | head -25
  local total; total=$(echo "$status" | wc -l)
  [[ $total -gt 25 ]] && echo "  ... and $(( total - 25 )) more"
  echo ""

  # Prompt if no message given
  if [[ -z "$commit_msg" ]]; then
    read -r -p "Commit message (Enter to show diff first): " commit_msg
    if [[ -z "$commit_msg" ]]; then
      git -C "$AGENCE_ROOT" diff --color=auto | head -80
      echo ""
      read -r -p "Commit message: " commit_msg
      [[ -z "$commit_msg" ]] && { echo "[CANCELLED]"; return 1; }
    fi
  fi

  git -C "$AGENCE_ROOT" add -A && git -C "$AGENCE_ROOT" commit -m "$commit_msg"

  if [[ $? -eq 0 ]]; then
    local _sha
    _sha=$(git -C "$AGENCE_ROOT" rev-parse --short HEAD 2>/dev/null)
    ailedger_append "commit" "agence-commit" "" "$commit_msg" "0"
    echo ""
    echo "✓ Committed."
    echo "  Next: agence ^push"
    return 0
  else
    echo "[ERROR] Commit failed." >&2
    return 1
  fi
}

# ============================================================================
# SESSION: PUSH
# ============================================================================
# Push committed Agence changes to origin (confirmation-gated)
# Usage: agence ^push

push_agence_changes() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Pushing Agence changes..." >&2

  local branch; branch=$(git -C "$AGENCE_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  [[ "$branch" == "HEAD" ]] && branch="main"

  echo ""
  echo "[^PUSH] Preparing push"
  echo "=============================================="
  echo "  Repo:   $(git -C "$AGENCE_ROOT" remote get-url origin 2>/dev/null || echo 'unknown')"
  echo "  Branch: $branch → origin/$branch"
  echo ""
  read -r -p "Continue? [y/N] " confirm
  [[ "$confirm" != "y" && "$confirm" != "Y" ]] && { echo "[CANCELLED]"; return 1; }

  echo ""
  git -C "$AGENCE_ROOT" push -u origin "$branch"

  if [[ $? -eq 0 ]]; then
    ailedger_append "push" "agence-push" "" "git push origin $branch" "0"
    echo ""
    echo "✓ Pushed to origin/$branch"
    return 0
  else
    echo "[ERROR] Push failed." >&2
    return 1
  fi
}

# ============================================================================
# SHELL SESSIONS: Bash and PowerShell with session/agent pinning
# ============================================================================

generate_shell_session_id() {
  local shell_type="$1"
  local timestamp; timestamp=$(date +%Y%m%d_%H%M%S)
  local pid=$$
  local hexid; hexid=$(printf '%x' $((RANDOM * RANDOM)))
  echo "${shell_type}-${timestamp}-${pid}-${hexid}"
}

set_vscode_terminal_title() {
  printf '\033]0;%s\007' "$1"
}

shell_bash_session() {
  local agent_id="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local session_id; session_id=$(generate_shell_session_id "bash")
  local vscode_title="bash:${session_id}@${agent_id}"
  local sessions_dir="${AGENCE_ROOT}/nexus/.aisessions"
  mkdir -p "$sessions_dir" 2>/dev/null
  local session_meta="${sessions_dir}/${session_id}.meta.json"
  cat > "$session_meta" <<EOF
{
  "session_id": "$session_id",
  "session_type": "bash",
  "agent_id": "$agent_id",
  "model": "${AGENCE_LLM_MODEL:-default}",
  "shell": "bash",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pid": $$,
  "user": "$(whoami)",
  "cwd": "$(pwd)"
}
EOF
  local model_display="${AGENCE_LLM_MODEL:-${AGENCE_MODEL:-default}}"
  echo ""; echo "══════════════════════════════════════════════"
  echo "  BASH SESSION"
  echo "══════════════════════════════════════════════"
  echo "  Session:   $session_id"
  echo "  Agent:     $agent_id"
  echo "  Model:     $model_display"
  echo "  Dir:       $(pwd)"
  echo "  Metadata:  $session_meta"
  echo "══════════════════════════════════════════════"; echo ""
  set_vscode_terminal_title "$vscode_title"
  export AGENT="$agent_id" AI_AGENT="$agent_id" AGENCE_SESSION_ID="$session_id" AGENCE_SESSION_TYPE="bash" AGENCE_LLM_MODEL="$model_display"
  exec bash --rcfile "${AGENCE_ROOT}/bin/aibash" -i 2>/dev/null || exec bash --login
}

shell_powershell_session() {
  local agent_id="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local session_id; session_id=$(generate_shell_session_id "ps")
  local vscode_title="powershell:${session_id}@${agent_id}"
  local sessions_dir="${AGENCE_ROOT}/nexus/.aisessions"
  mkdir -p "$sessions_dir" 2>/dev/null
  cat > "${sessions_dir}/${session_id}.meta.json" <<EOF
{
  "session_id": "$session_id",
  "session_type": "powershell",
  "agent_id": "$agent_id",
  "shell": "powershell",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pid": $$,
  "user": "$(whoami)",
  "cwd": "$(pwd)"
}
EOF
  echo ""; echo "══════════════════════════════════════════════"
  echo "  POWERSHELL SESSION"
  echo "══════════════════════════════════════════════"
  echo "  Session:   $session_id"
  echo "  Agent:     $agent_id"
  echo "  Dir:       $(pwd)"
  echo "══════════════════════════════════════════════"; echo ""
  set_vscode_terminal_title "$vscode_title"
  export AI_AGENT="$agent_id" AGENCE_SESSION_ID="$session_id" AGENCE_SESSION_TYPE="powershell"
  if command -v pwsh &>/dev/null; then
    exec pwsh -NoExit -Command "\$env:AI_AGENT='$agent_id'; \$env:AGENCE_SESSION_ID='$session_id'; function prompt { return 'pwsh:${session_id}@${agent_id}: ' }"
  elif command -v powershell.exe &>/dev/null; then
    exec powershell.exe -NoExit -Command "\$env:AI_AGENT='$agent_id'; \$env:AGENCE_SESSION_ID='$session_id'"
  else
    echo "✗ PowerShell not found (tried pwsh and powershell.exe)"; return 1
  fi
}

# ============================================================================
# INDEX: Scan for knowledge base INDEX.md / INDEX.json pairs
# ============================================================================

handoff_to_agent() {
  bun run "$AGENCE_ROOT/lib/session.ts" handoff "$@"
}

# ============================================================================
# PICKUP: Accept a pending handoff
# ============================================================================

pickup_handoff() {
  bun run "$AGENCE_ROOT/lib/session.ts" pickup "$@"
}

# ============================================================================
# PAUSE / RESUME: Suspend and restore sessions (Unix job control semantics)
# ============================================================================

pause_session() {
  bun run "$AGENCE_ROOT/lib/session.ts" pause
}

resume_session() {
  bun run "$AGENCE_ROOT/lib/session.ts" resume "$@"
}

# ============================================================================
# ENTRY POINT
