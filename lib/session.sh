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
  local notes="${1:-}"
  local agent_id="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local session_id="${AGENCE_SESSION_ID:-$(generate_shell_session_id save)}"
  local log_id="save-$(date +%Y%m%d_%H%M%S)-$(printf '%x' $((RANDOM * RANDOM)))"
  local saves_dir="${AGENCE_ROOT}/nexus/.aisaves"
  local sessions_dir="${AGENCE_ROOT}/nexus/sessions"
  local lessons_dir="$(resolve_org_path "${AGENCE_ROOT}/synthetic")/lessons"
  mkdir -p "$saves_dir" "$sessions_dir" 2>/dev/null

  local branch; branch=$(git -C "$AGENCE_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local commit; commit=$(git -C "$AGENCE_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  local dirty; dirty=$(git -C "$AGENCE_ROOT" status --short 2>/dev/null | wc -l | tr -d ' ')
  local staged; staged=$(git -C "$AGENCE_ROOT" diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
  local lessons; lessons=$(find "$lessons_dir" -name "*.md" -not -name "INDEX.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  local sessions; sessions=$(find "$saves_dir" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  local recent; recent=$(git -C "$AGENCE_ROOT" log --oneline -5 2>/dev/null | sed 's/"/\\"/g' | awk '{printf "    \"%s\",\n", $0}' | sed '$ s/,$//')
  local dirty_files; dirty_files=$(git -C "$AGENCE_ROOT" status --short 2>/dev/null | sed 's/"/\\"/g' | awk '{printf "    \"%s\",\n", $0}' | sed '$ s/,$//')
  local notes_esc; notes_esc=$(echo "$notes" | sed 's/"/\\"/g')

  if [[ -z "$notes" ]]; then
    echo ""
    echo "[^SAVE] Session: $session_id | Agent: $agent_id | Git: $branch @ $commit"
    read -r -p "Notes (optional, Enter to skip): " notes
    notes_esc=$(echo "$notes" | sed 's/"/\\"/g')
  fi

  local save_file="${saves_dir}/${log_id}.json"
  cat > "$save_file" <<EOF
{
  "log_id": "$log_id",
  "agent_id": "$agent_id",
  "session_id": "$session_id",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "user": "$(whoami)",
  "cwd": "$(pwd)",
  "notes": "$notes_esc",
  "git": { "branch": "$branch", "commit": "$commit", "dirty_files": $dirty, "staged_files": $staged },
  "knowledge": { "lessons_count": $lessons, "sessions_count": $sessions },
  "recent_commits": [
$recent
  ],
  "dirty_files": [
$dirty_files
  ]
}
EOF

  echo ""
  echo "✓ Saved: $log_id"
  echo "  Agent:   $agent_id | Session: $session_id"
  echo "  Git:     $branch @ $commit ($dirty dirty, $staged staged)"
  echo "  File:    $save_file"
  echo "  Next:    ^handoff @agent | ^commit | ^push"
  return 0
}

# ============================================================================
# SESSION: LEARN (^learn) — richer version scanning sessions + faults + lessons
# ============================================================================

learn_agence_changes() {
  echo ""; echo "══════════════════════════════════════════════"
  echo "  AGENCE LEARN (^learn)"; echo "══════════════════════════════════════════════"; echo ""

  local sessions_dir="${AGENCE_ROOT}/nexus/.aisessions"
  local saves_dir="${AGENCE_ROOT}/nexus/.aisaves"
  local faults_dir="${AGENCE_ROOT}/nexus/faults"
  local lessons_dir="$(resolve_org_path "${AGENCE_ROOT}/synthetic")/lessons"
  mkdir -p "$lessons_dir" 2>/dev/null

  local session_count=0; local save_count=0; local fault_count=0; local lesson_count=0

  echo "  Step 1/3: Session history..."
  [[ -d "$sessions_dir" ]] && session_count=$(find "$sessions_dir" -name "*.meta.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  [[ -d "$saves_dir" ]] && save_count=$(find "$saves_dir" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "    Sessions: $session_count | Saves: $save_count"

  echo "  Step 2/3: Reviewing faults..."
  if [[ -d "$faults_dir" ]]; then
    fault_count=$(find "$faults_dir" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "    Faults: $fault_count"
    find "$faults_dir" -name "*.md" -type f 2>/dev/null | while read -r f; do
      echo "      - $(basename "$f" .md)"
    done
  else
    echo "    No faults directory"
  fi

  echo "  Step 3/3: Current codex..."
  local p_count; p_count=$(grep -c "^## Maxim" "${AGENCE_ROOT}/codex/PRINCIPLES.md" 2>/dev/null || echo 0)
  local l_count; l_count=$(grep -c "^## Law" "${AGENCE_ROOT}/codex/LAWS.md" 2>/dev/null || echo 0)
  local r_count; r_count=$(grep -c "^## Rule" "${AGENCE_ROOT}/codex/RULES.md" 2>/dev/null || echo 0)
  lesson_count=$(find "$lessons_dir" -name "*.md" -not -name "INDEX.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "    Principles: $p_count | Laws: $l_count | Rules: $r_count"
  echo "    Shared lessons: $lesson_count"

  echo ""; echo "══════════════════════════════════════════════"
  echo "  LEARN COMPLETE"
  echo "  Sessions: $session_count | Faults: $fault_count | Lessons: $lesson_count"
  echo "  Next: ^lesson add \"<insight>\" | ^fault list | ^commit"; echo ""
  return 0
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
  local target="${1:-}"
  [[ $# -gt 0 ]] && shift
  local context_msg="$*"
  local source_agent="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local session_id="${AGENCE_SESSION_ID:-$(generate_shell_session_id handoff)}"
  local handoff_id="handoff-$(date +%Y%m%d_%H%M%S)-$(printf '%x' $((RANDOM * RANDOM)))"

  if [[ -z "$target" ]]; then
    echo ""; echo "Usage: agence ^handoff <target_agent> [context message]"
    echo "  agence ^handoff @ralph \"implement matrix-math.ts\""
    echo "  agence ^handoff user \"analysis complete, review results\""
    echo ""; echo "Available agents:"
    ls "${AGENCE_ROOT}/codex/agents/" 2>/dev/null | grep -v '\.md$' | sed 's/^/  @/'
    return 1
  fi

  local target_name="${target#@}"
  if [[ "$target_name" != "user" ]] && [[ ! -d "${AGENCE_ROOT}/codex/agents/$target_name" ]]; then
    echo "Error: Unknown agent: $target" >&2; return 1
  fi

  local handoffs_dir="${AGENCE_ROOT}/nexus/.aihandoffs"
  mkdir -p "$handoffs_dir" 2>/dev/null

  local branch; branch=$(git -C "$AGENCE_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local commit; commit=$(git -C "$AGENCE_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  local dirty; dirty=$(git -C "$AGENCE_ROOT" status --short 2>/dev/null | wc -l | tr -d ' ')
  local recent; recent=$(git -C "$AGENCE_ROOT" log --oneline -5 2>/dev/null | sed 's/"/\\"/g' | awk '{printf "    \"%s\",\n", $0}' | sed '$ s/,$//')
  local ctx_esc; ctx_esc=$(echo "$context_msg" | sed 's/"/\\"/g')

  local handoff_file="${handoffs_dir}/${handoff_id}.json"
  cat > "$handoff_file" <<EOF
{
  "handoff_id": "$handoff_id",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": { "agent": "$source_agent", "session_id": "$session_id" },
  "target": { "agent": "$target", "agent_dir": "$target_name" },
  "context": "$ctx_esc",
  "git": { "branch": "$branch", "commit": "$commit", "dirty_files": $dirty },
  "recent_commits": [
$recent
  ],
  "status": "pending"
}
EOF

  echo ""; echo "══════════════════════════════════════════════"
  echo "  AGENCE HANDOFF (^handoff)"
  echo "══════════════════════════════════════════════"
  echo "  From:    $source_agent"
  echo "  To:      $target"
  echo "  Session: $session_id"
  echo "  ID:      $handoff_id"
  [[ -n "$context_msg" ]] && echo "  Context: $context_msg"
  echo "  Git:     $branch @ $commit ($dirty dirty)"
  echo ""; echo "  File: $handoff_file"
  echo ""; echo "══════════════════════════════════════════════"
  echo "  HANDOFF COMPLETE"
  echo "  Next: agence @$target_name ^pickup $handoff_id"; echo ""
}

# ============================================================================
# PICKUP: Accept a pending handoff
# ============================================================================

pickup_handoff() {
  local pickup_arg="${1:-}"
  local current_agent="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local current_name="${current_agent#@}"
  local handoffs_dir="${AGENCE_ROOT}/nexus/.aihandoffs"

  if [[ ! -d "$handoffs_dir" ]]; then
    echo ""; echo "No handoffs directory found. Nothing to pick up."; return 0
  fi

  if [[ -z "$pickup_arg" ]]; then
    echo ""; echo "══════════════════════════════════════════════"
    echo "  AGENCE PICKUP (^pickup) — pending handoffs"
    echo "  Agent: $current_agent"
    echo "══════════════════════════════════════════════"; echo ""
    local found=0
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      local target_agent; target_agent=$(grep -o '"agent": *"[^"]*"' "$f" | tail -1 | sed 's/.*"agent": *"//;s/"//')
      local status; status=$(grep -o '"status": *"[^"]*"' "$f" | sed 's/.*"status": *"//;s/"//')
      local tclean="${target_agent#@}"
      if [[ "$status" == "pending" ]] && { [[ "$tclean" == "$current_name" ]] || [[ "$current_agent" == "@" ]]; }; then
        local hid; hid=$(grep -o '"handoff_id": *"[^"]*"' "$f" | sed 's/.*"handoff_id": *"//;s/"//')
        local source; source=$(grep -o '"agent": *"[^"]*"' "$f" | head -1 | sed 's/.*"agent": *"//;s/"//')
        local ctx; ctx=$(grep -o '"context": *"[^"]*"' "$f" | sed 's/.*"context": *"//;s/"//')
        found=$((found+1))
        echo "  [$found] $hid"
        echo "      From: $source | Context: ${ctx:-<none>}"
      fi
    done < <(find "$handoffs_dir" -name "handoff-*.json" -type f 2>/dev/null | sort -r)
    [[ $found -eq 0 ]] && echo "  No pending handoffs for $current_agent" || echo ""; echo "  Accept with: agence ^pickup <handoff_id>"
    echo ""; return 0
  fi

  local handoff_file
  if [[ -f "${handoffs_dir}/${pickup_arg}.json" ]]; then
    handoff_file="${handoffs_dir}/${pickup_arg}.json"
  else
    handoff_file=$(find "$handoffs_dir" -name "*${pickup_arg}*.json" -type f 2>/dev/null | head -1)
  fi
  [[ -z "$handoff_file" ]] && { echo "Error: Handoff not found: $pickup_arg" >&2; return 1; }

  local status; status=$(grep -o '"status": *"[^"]*"' "$handoff_file" | sed 's/.*"status": *"//;s/"//')
  [[ "$status" != "pending" ]] && { echo "Error: Handoff already $status" >&2; return 1; }

  local hid; hid=$(grep -o '"handoff_id": *"[^"]*"' "$handoff_file" | sed 's/.*"handoff_id": *"//;s/"//')
  local source; source=$(grep -o '"agent": *"[^"]*"' "$handoff_file" | head -1 | sed 's/.*"agent": *"//;s/"//')
  local ctx; ctx=$(grep -o '"context": *"[^"]*"' "$handoff_file" | sed 's/.*"context": *"//;s/"//')
  local hbranch; hbranch=$(grep -o '"branch": *"[^"]*"' "$handoff_file" | sed 's/.*"branch": *"//;s/"//')
  local hcommit; hcommit=$(grep -o '"commit": *"[^"]*"' "$handoff_file" | sed 's/.*"commit": *"//;s/"//')

  sed -i "s/\"status\": \"pending\"/\"status\": \"accepted\"/" "$handoff_file"

  echo ""; echo "══════════════════════════════════════════════"
  echo "  AGENCE PICKUP — handoff accepted"
  echo "  Transfer: $source → $current_agent"
  echo "  ID:       $hid"
  echo "  Context:  ${ctx:-<none>}"
  echo "  Git:      $hbranch @ $hcommit"
  echo ""; echo "  Status: pending → accepted"
  echo "══════════════════════════════════════════════"
  echo "  Use ^save to checkpoint | ^handoff to forward"; echo ""
}

# ============================================================================
# PAUSE / RESUME: Suspend and restore sessions (Unix job control semantics)
# ============================================================================

pause_session() {
  local agent_id="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local session_id="${AGENCE_SESSION_ID:-$(generate_shell_session_id pause)}"
  local pause_id="pause-$(date +%Y%m%d_%H%M%S)-$(printf '%x' $((RANDOM * RANDOM)))"
  local saves_dir="${AGENCE_ROOT}/nexus/.aisaves"
  mkdir -p "$saves_dir" 2>/dev/null

  local branch; branch=$(git -C "$AGENCE_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  local commit; commit=$(git -C "$AGENCE_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  local dirty; dirty=$(git -C "$AGENCE_ROOT" status --short 2>/dev/null | wc -l | tr -d ' ')
  local recent; recent=$(git -C "$AGENCE_ROOT" log --oneline -5 2>/dev/null | sed 's/"/\\"/g' | awk '{printf "    \"%s\",\n", $0}' | sed '$ s/,$//')

  local pause_file="${saves_dir}/${pause_id}.json"
  cat > "$pause_file" <<EOF
{
  "log_id": "$pause_id",
  "type": "pause",
  "agent_id": "$agent_id",
  "session_id": "$session_id",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "paused",
  "user": "$(whoami)",
  "cwd": "$(pwd)",
  "git": { "branch": "$branch", "commit": "$commit", "dirty_files": $dirty },
  "recent_commits": [
$recent
  ]
}
EOF

  echo ""; echo "══════════════════════════════════════════════"
  echo "  AGENCE PAUSE (^pause)"
  echo "  Agent:    $agent_id"
  echo "  Session:  $session_id"
  echo "  Pause ID: $pause_id"
  echo "  Git:      $branch @ $commit ($dirty dirty)"
  echo ""; echo "  File: $pause_file"
  echo "══════════════════════════════════════════════"
  echo "  SESSION PAUSED"
  echo "  Resume with: agence ^resume $pause_id"; echo ""
}

resume_session() {
  local resume_arg="${1:-}"
  local current_agent="${AGENCE_AGENT_PARAM:-${AI_AGENT:-@}}"
  local saves_dir="${AGENCE_ROOT}/nexus/.aisaves"

  if [[ ! -d "$saves_dir" ]]; then
    echo ""; echo "No saves directory found. Nothing to resume."; return 0
  fi

  if [[ -z "$resume_arg" ]]; then
    echo ""; echo "══════════════════════════════════════════════"
    echo "  AGENCE RESUME (^resume) — paused sessions"
    echo "  Agent: $current_agent"
    echo "══════════════════════════════════════════════"; echo ""
    local found=0
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      local status; status=$(grep -o '"status": *"[^"]*"' "$f" | sed 's/.*"status": *"//;s/"//')
      [[ "$status" != "paused" ]] && continue
      local lid; lid=$(grep -o '"log_id": *"[^"]*"' "$f" | sed 's/.*"log_id": *"//;s/"//')
      local aid; aid=$(grep -o '"agent_id": *"[^"]*"' "$f" | sed 's/.*"agent_id": *"//;s/"//')
      local ts; ts=$(grep -o '"timestamp": *"[^"]*"' "$f" | sed 's/.*"timestamp": *"//;s/"//')
      found=$((found+1))
      echo "  [$found] $lid"
      echo "      Agent: $aid | At: $ts"
    done < <(find "$saves_dir" -name "pause-*.json" -type f 2>/dev/null | sort -r)
    [[ $found -eq 0 ]] && echo "  No paused sessions found" || echo ""; echo "  Resume with: agence ^resume <pause_id>"
    echo ""; return 0
  fi

  local save_file
  if [[ -f "${saves_dir}/${resume_arg}.json" ]]; then
    save_file="${saves_dir}/${resume_arg}.json"
  else
    save_file=$(find "$saves_dir" -name "*${resume_arg}*.json" -type f 2>/dev/null | head -1)
  fi
  [[ -z "$save_file" ]] && { echo "Error: Save not found: $resume_arg" >&2; return 1; }

  local lid; lid=$(grep -o '"log_id": *"[^"]*"' "$save_file" | sed 's/.*"log_id": *"//;s/"//')
  local aid; aid=$(grep -o '"agent_id": *"[^"]*"' "$save_file" | sed 's/.*"agent_id": *"//;s/"//')
  local hbranch; hbranch=$(grep -o '"branch": *"[^"]*"' "$save_file" | sed 's/.*"branch": *"//;s/"//')
  local hcommit; hcommit=$(grep -o '"commit": *"[^"]*"' "$save_file" | sed 's/.*"commit": *"//;s/"//')

  sed -i "s/\"status\": \"paused\"/\"status\": \"resumed\"/" "$save_file"
  export AI_AGENT="$aid" AGENCE_SESSION_ID="$lid"

  echo ""; echo "══════════════════════════════════════════════"
  echo "  AGENCE RESUME — session restored"
  echo "  ID:     $lid"
  echo "  Agent:  $aid"
  echo "  Git:    $hbranch @ $hcommit"
  echo "  Status: paused → resumed"
  echo "══════════════════════════════════════════════"
  echo "  SESSION ACTIVE — use ^save to checkpoint"; echo ""
}

# ============================================================================
# ENTRY POINT
