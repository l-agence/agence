#!/usr/bin/env bash
# lib/knowledge.sh — Task/workflow/project/knowledge management (organic matrix model)
#
# Implements the 3-tier matrix: Tasks → Workflows → Projects
# State stored in organic/*.json, scored by: score = 10P + 25S + 100H
# This is the default task system (no GitHub required).
# When GitHub is available, organic/*.json bridges to GitHub Issues/Projects.
#
# Sourced by bin/agence.
[[ -n "${_AGENCE_KNOWLEDGE_LOADED:-}" ]] && return 0
_AGENCE_KNOWLEDGE_LOADED=1

mode_knowledge() {
  local cmd_type="$1"    # lesson, log, plan, todo, fault, issue, task, job, workflow, project
  local input="$2"       # Remaining arguments
  
  local sub_cmd="${input%% *}"     # list, show, add
  sub_cmd="${sub_cmd:-list}"       # Default to list
  
  local args="${input#$sub_cmd}"
  args="${args# }"  # Trim leading space

  # Parse output format flags (-j/--json, -y/--yaml, -t/--table) from args
  agence_detect_format
  args=$(agence_parse_format_flags $args)
  
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Knowledge mode: $cmd_type/$sub_cmd args='$args' fmt=$_AGENCE_FMT" >&2
  
  # Delegate to Bun when available (lib/commands.ts)
  # Exception: task/workflow/project status uses bash functions for
  # grouped display, color output, and stderr headers
  local _bun
  _bun=$(_bun_cmd 2>/dev/null) || _bun=""
  local _skip_bun=0
  if [[ "$sub_cmd" == "status" ]]; then
    case "$cmd_type" in
      task|workflow|project) _skip_bun=1 ;;
    esac
  fi
  if [[ -n "$_bun" && -f "$AGENCE_LIB/commands.ts" && "$_skip_bun" -eq 0 ]]; then
    "$_bun" run "$AGENCE_LIB/commands.ts" "$cmd_type" "$sub_cmd" $args
    return $?
  fi

  # ============================================================================
  # DETERMINE SCOPE & PATHS (bash fallback)
  # ============================================================================
  
  local scope_type  # HERMETIC, NEXUS, SYNTHETIC, ORGANIC
  local base_path
  local default_org="l-agence.org"
  local org="$default_org"
  
  # Parse command-specific options
  case "$cmd_type" in
    "lesson"|"plan"|"issue")
      # SYNTHETIC scope (team-shared)
      scope_type="SYNTHETIC"
      # Support --org flag: agence ^lesson list --org acme.tld
      if [[ "$args" == *"--org"* ]]; then
        org=$(echo "$args" | sed -n 's/.*--org[= ]\([^ ]*\).*/\1/p')
        base_path="$AGENCE_ROOT/synthetic/@$org"
      else
        # Routing inheritance: prefer @ symlink (user-set org context)
        # Falls back to explicit l-agence.org if @ symlink missing
        base_path=$(resolve_org_path "$AGENCE_ROOT/synthetic" "$default_org")
      fi
      ;;
    "log"|"fault")
      # NEXUS scope (local, operational)
      scope_type="NEXUS"
      base_path="$AGENCE_ROOT/nexus"
      ;;
    "todo"|"note")
      # HERMETIC scope (local, personal)
      scope_type="HERMETIC"
      # Use @ symlink if present in hermetic
      base_path=$(resolve_org_path "$AGENCE_ROOT/hermetic" "$default_org")
      ;;
    "task"|"job"|"workflow"|"project")
      # ORGANIC scope (team-assigned work)
      scope_type="ORGANIC"
      if [[ "$args" == *"--org"* ]]; then
        org=$(echo "$args" | sed -n 's/.*--org[= ]\([^ ]*\).*/\1/p')
        base_path="$AGENCE_ROOT/organic/@$org"
      else
        base_path="$AGENCE_ROOT/organic"
      fi
      ;;
  esac
  
  # Create scope-specific subdirectory
  local data_dir="$base_path/${cmd_type}s"  # lessons/, logs/, plans/, todos/, faults/, issues/, tasks/, jobs/
  mkdir -p "$data_dir" 2>/dev/null
  
  # Create INDEX file if missing
  local index_file="$data_dir/INDEX.md"
  if [[ ! -f "$index_file" ]]; then
    cat > "$index_file" << EOF
# $cmd_type Index ($scope_type/$org)

Scope: $scope_type
Org: $org
Last Updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Entries

(entries will be listed here)
EOF
  fi
  
  # ============================================================================
  # ROUTE SUBCOMMANDS
  # ============================================================================
  
  case "$sub_cmd" in
    "list")
      knowledge_list "$cmd_type" "$data_dir" "$index_file" "$args"
      ;;
    "status")
      knowledge_status "$cmd_type" "$args" "$data_dir"
      ;;
    "show")
      local item; item=$(echo "$args" | awk '{print $1}')
      if [[ -z "$item" ]]; then
        echo "Usage: agence ^$cmd_type show <name/id>" >&2
        return 1
      fi
      knowledge_show "$cmd_type" "$data_dir" "$item"
      ;;
    "add")
      local title; title=$(echo "$args" | sed 's/--[^ ]*[= ][^ ]*//g' | xargs)
      if [[ -z "$title" ]]; then
        echo "Usage: agence ^$cmd_type add <title> [--org ORG] [other options]" >&2
        return 1
      fi
      knowledge_add "$cmd_type" "$data_dir" "$index_file" "$title" "$args"
      ;;
    *)
      echo "Error: Unknown subcommand: $sub_cmd" >&2
      echo "Available subcommands: list, status, show, add" >&2
      return 1
      ;;
  esac
  
  return $?
}

# ============================================================================
# KNOWLEDGE COMMAND HELPERS
# ============================================================================

knowledge_list() {
  local cmd_type="$1"
  local data_dir="$2"
  local index_file="$3"
  local args="$4"
  
  # ── Structured output: json/yaml/table via INDEX.json or root .json ──────
  # Check for root-level organic data files (tasks.json, workflows.json, etc.)
  local root_json="${AGENCE_ROOT}/organic/${cmd_type}s.json"
  local index_json="${data_dir}/INDEX.json"
  local json_source=""

  if [[ -f "$root_json" ]] && command -v jq &>/dev/null; then
    json_source="$root_json"
  elif [[ -f "$index_json" ]] && command -v jq &>/dev/null; then
    json_source="$index_json"
  fi

  # For machine-readable formats, emit structured data and return
  case "${_AGENCE_FMT:-text}" in
    json)
      if [[ -n "$json_source" ]]; then
        agence_format_json "$(cat "$json_source")"
      else
        echo "[]"
      fi
      return 0
      ;;
    yaml)
      if [[ -n "$json_source" ]]; then
        agence_format_yaml "$(cat "$json_source")"
      else
        echo "# (no data)"
      fi
      return 0
      ;;
    table)
      if [[ -n "$json_source" ]]; then
        local _json_content
        _json_content=$(cat "$json_source")
        # Auto-detect columns based on cmd_type
        case "$cmd_type" in
          task)     agence_format_table "$_json_content" "id,title,state,agent,priority" "12,40,6,12,8" ;;
          job)      agence_format_table "$_json_content" "id,title,state,agent" "12,40,6,12" ;;
          workflow) agence_format_table "$_json_content" "id,title,completed,total,completion_pct" "12,35,10,8,12" ;;
          project)  agence_format_table "$_json_content" "id,title,status,completion_pct" "16,35,14,12" ;;
          fault)    agence_format_table "$(jq '.entries' "$json_source" 2>/dev/null || echo '[]')" "fault_id,title,severity,status" "12,40,10,10" ;;
          lesson)   agence_format_table "$(jq '.entries' "$json_source" 2>/dev/null || echo '[]')" "id,title,date" "12,45,12" ;;
          *)        agence_format_table "$(jq 'if type == "array" then . elif .entries then .entries else [.] end' "$json_source" 2>/dev/null || echo '[]')" "id,title" "16,50" ;;
        esac
      else
        echo "(no structured data for table output)"
      fi
      return 0
      ;;
  esac

  # ── Default text output ──────────────────────────────────────────────────
  echo "[${cmd_type}]"
  
  # If jq is available, try to parse JSON files
  if [[ -n "$json_source" ]]; then
    local parsed
    parsed=$(jq -r '
      (if type == "array" then . elif .entries then .entries else [.] end)[]
      | [(.id // .lesson_id // .fault_id // "?"), (.title // "(untitled)"), (.date // .date_extracted // .timestamp // "")]
      | "\(.[0]): \(.[1])\(if .[2] != "" then " (\(.[2]))" else "" end)"
    ' "$json_source" 2>/dev/null)
    if [[ -n "$parsed" ]]; then
      echo "$parsed" | sed 's/^/  /'
      return 0
    fi
  fi
  
  # Fallback: list markdown files
  local count=0
  for entry in "$data_dir"/*.md; do
    [[ ! -f "$entry" ]] && continue
    [[ "$(basename "$entry")" == "INDEX.md" ]] && continue
    
    local name; name=$(basename "$entry" .md)
    local title; title=$(head -n 1 "$entry" | sed 's/^# //')
    echo "  - $name: $title"
    ((count++)) || true
  done
  
  if [[ $count -eq 0 ]]; then
    echo "  (no entries)"
  fi
  
  return 0
}

knowledge_show() {
  local cmd_type="$1"
  local data_dir="$2"
  local item="$3"
  
  # Try structured JSON first
  if [[ -f "${data_dir}/${item}.json" ]]; then
    jq '.' "${data_dir}/${item}.json"
    return 0
  fi
  
  # Fall back to markdown
  if [[ -f "${data_dir}/${item}.md" ]]; then
    cat "${data_dir}/${item}.md"
    return 0
  fi
  
  echo "Error: $cmd_type '$item' not found" >&2
  return 1
}

knowledge_add() {
  local cmd_type="$1"
  local data_dir="$2"
  local index_file="$3"
  local title="$4"
  local args="$5"
  
  # Generate short ID: timestamp + first 4 chars of title
  local ts; ts=$(date +%s)
  local short_id; short_id=$(echo "$title" | tr ' ' '_' | cut -c1-8 | tr -cd '[:alnum:]_')
  local entry_id="${ts}_${short_id}"
  local entry_file="${data_dir}/${entry_id}.md"
  
  # Create entry
  cat > "$entry_file" << EOF
# $title

**Created**: $(date -u +%Y-%m-%dT%H:%M:%SZ)  
**ID**: $entry_id

## Content

Add your content here.
EOF
  
  echo "✓ $cmd_type entry created: $entry_id"
  echo "  File: $entry_file"
  
  # Update INDEX if JSON format exists
  if [[ -f "${data_dir}/INDEX.json" ]]; then
    jq ".entries += [{id: \"$entry_id\", title: \"$title\", date: \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]" \
      "${data_dir}/INDEX.json" > "${data_dir}/INDEX.json.tmp" && \
      mv "${data_dir}/INDEX.json.tmp" "${data_dir}/INDEX.json"
  fi
  
  return 0
}

# ============================================================================
# ^STATE — AGGREGATE SWARM STATE
# ============================================================================
# Shows: task summary + agent/tangent status + daemon health
# Differs from ^swarm list (just running swarms) or ^tasks (just task list)

cmd_state() {
  local tasks_json="${AGENCE_ROOT}/organic/tasks.json"
  local wf_json="${AGENCE_ROOT}/organic/workflows.json"
  local proj_json="${AGENCE_ROOT}/organic/projects.json"

  echo "[state] $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2

  # ── Tasks ──
  if [[ -f "$tasks_json" ]] && command -v jq &>/dev/null; then
    local t_total t_done t_pending t_blocked t_running t_failed
    t_total=$(jq '.tasks | length' "$tasks_json")
    t_done=$(jq '[.tasks[] | select(.state == "-")] | length' "$tasks_json")
    t_pending=$(jq '[.tasks[] | select(.state == "+" or .state == "~" or .state == "?")] | length' "$tasks_json")
    t_running=$(jq '[.tasks[] | select(.state == "%" or .state == "&" or .state == "$")] | length' "$tasks_json")
    t_failed=$(jq '[.tasks[] | select(.state == "!")] | length' "$tasks_json")
    local t_pct=0; [[ $t_total -gt 0 ]] && t_pct=$(( t_done * 100 / t_total ))

    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '\n  \033[1mTasks\033[0m  %s/%s (%s%%)\n' "$t_done" "$t_total" "$t_pct"
      printf '    \033[32m-\033[0m done:%-4s  \033[34m+\033[0m pending:%-4s  \033[33m%%\033[0m running:%-4s  \033[31m!\033[0m failed:%-4s\n' \
        "$t_done" "$t_pending" "$t_running" "$t_failed"
    else
      printf '\n  Tasks  %s/%s (%s%%)\n' "$t_done" "$t_total" "$t_pct"
      printf '    done:%-4s  pending:%-4s  running:%-4s  failed:%-4s\n' \
        "$t_done" "$t_pending" "$t_running" "$t_failed"
    fi
  fi

  # ── Workflows ──
  if [[ -f "$wf_json" ]] && command -v jq &>/dev/null; then
    local wf_count wf_done=0
    wf_count=$(jq '.workflows | length' "$wf_json")
    local wi=0
    while [[ $wi -lt $wf_count ]]; do
      local wf_task_ids d=0 t=0
      wf_task_ids=$(jq -r ".workflows[$wi].tasks[]" "$wf_json" 2>/dev/null)
      for tid in $wf_task_ids; do
        ((t++))
        local ts
        ts=$(jq -r ".tasks[] | select(.id==\"$tid\") | .state" "$tasks_json" 2>/dev/null)
        [[ "$ts" == "-" ]] && ((d++))
      done
      [[ $t -gt 0 && $d -eq $t ]] && ((wf_done++))
      ((wi++))
    done
    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '  \033[1mWorkflows\033[0m  %s/%s completed\n' "$wf_done" "$wf_count"
    else
      printf '  Workflows  %s/%s completed\n' "$wf_done" "$wf_count"
    fi
  fi

  # ── Daemon (agentd) ──
  local agentd_bin="${AGENCE_ROOT}/bin/agentd"
  if [[ -x "$agentd_bin" ]]; then
    local pid_file="${AGENCE_ROOT}/.agentd.pid"
    local session="agentd"
    local daemon_status="stopped"
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file" 2>/dev/null)" 2>/dev/null; then
      daemon_status="running (PID $(cat "$pid_file"))"
    fi
    local tmux_status="detached"
    if tmux has-session -t "$session" 2>/dev/null; then
      local win_count
      win_count=$(tmux list-windows -t "$session" 2>/dev/null | wc -l)
      tmux_status="${win_count} windows"
    else
      tmux_status="no session"
    fi
    # Tangents
    local tangent_file="${AGENCE_ROOT}/.agentd-tangents.json"
    local tangent_count=0
    if [[ -f "$tangent_file" ]] && command -v jq &>/dev/null; then
      tangent_count=$(jq '.tangents | length' "$tangent_file" 2>/dev/null || echo 0)
    fi

    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '  \033[1mDaemon\033[0m  %s  tmux:%s  tangents:%s\n' \
        "$daemon_status" "$tmux_status" "$tangent_count"
    else
      printf '  Daemon  %s  tmux:%s  tangents:%s\n' \
        "$daemon_status" "$tmux_status" "$tangent_count"
    fi
  fi

  echo ""
  agence_format_legend
  return 0
}

# ============================================================================
# KNOWLEDGE STATUS VIEWS
# ============================================================================
# Rich status display for task, workflow, project
# Uses state symbols from shell-ui.sh and organic/*.json data
# Headers go to stderr so stdout stays pipe-clean.

# Helper: convert priority int to star string
_prio_stars() {
  local p="${1:-0}"
  case "$p" in
    1) echo "★" ;;
    2) echo "★★" ;;
    3) echo "★★★" ;;
    4) echo "★★★★" ;;
    5) echo "★★★★★" ;;
    *) echo "-" ;;
  esac
}

# Helper: state symbol with ANSI color (if TTY)
_colored_state() {
  local s="${1:--}"
  if [[ "${_AGENCE_FMT:-text}" == "text" ]] && type -t _state_color &>/dev/null; then
    printf '%b%s\033[0m' "$(_state_color "$s")" "$s"
  else
    printf '%s' "$s"
  fi
}

# Helper: short repo name (strip path, .git suffix)
_short_repo() {
  local r="$1"
  r="${r##*/}"        # basename
  r="${r%.git}"       # strip .git
  echo "$r"
}

# Helper: build workflow membership map (task_id → "WF-X,WF-Y")
_build_wf_membership() {
  local wf_json="${AGENCE_ROOT}/organic/workflows.json"
  # Outputs lines: TASK_ID<tab>WF-ID1,WF-ID2
  [[ -f "$wf_json" ]] && jq -r '
    [.workflows[] | .id as $wid | .tasks[] | {task: ., wf: $wid}]
    | group_by(.task)[]
    | "\(.[0].task)\t\([.[] | .wf] | join(","))"
  ' "$wf_json" 2>/dev/null
}

# Helper: compute live workflow stats from tasks.json
_wf_live_stats() {
  # Reads tasks.json to compute done/total for a workflow's task list
  local tasks_json="$1"
  shift
  local task_ids=("$@")
  local done=0 total=${#task_ids[@]}
  for tid in "${task_ids[@]}"; do
    local st
    st=$(jq -r ".tasks[] | select(.id==\"$tid\") | .state" "$tasks_json" 2>/dev/null)
    [[ "$st" == "-" ]] && ((done++))
  done
  echo "$done $total"
}

# ── task status ──────────────────────────────────────────────────────────────
# Grouped by workflow, sorted by priority (highest first).
# Shows: [state] [prio] [id] [repo] [workflows] [title]
knowledge_status_task() {
  local tasks_json="${AGENCE_ROOT}/organic/tasks.json"
  local wf_json="${AGENCE_ROOT}/organic/workflows.json"
  if [[ ! -f "$tasks_json" ]] || ! command -v jq &>/dev/null; then
    echo "[task status] No data or jq unavailable" >&2
    return 1
  fi

  local total done
  total=$(jq '.tasks | length' "$tasks_json")
  done=$(jq '[.tasks[] | select(.state == "-")] | length' "$tasks_json")
  local pct=0; [[ $total -gt 0 ]] && pct=$(( done * 100 / total ))

  echo "[tasks] ${done}/${total} completed (${pct}%)" >&2

  # Build workflow membership lookup
  declare -A wf_map
  while IFS=$'\t' read -r tid wfs; do
    wf_map["$tid"]="$wfs"
  done < <(_build_wf_membership)

  # Get workflows in order for grouping
  local wf_ids=()
  if [[ -f "$wf_json" ]]; then
    mapfile -t wf_ids < <(jq -r '.workflows[].id' "$wf_json" 2>/dev/null)
  fi

  # Track which tasks we've printed (for ungrouped at end)
  declare -A printed

  for wfid in "${wf_ids[@]}"; do
    local wf_title
    wf_title=$(jq -r ".workflows[] | select(.id==\"$wfid\") | .title" "$wf_json" 2>/dev/null)
    local wf_task_ids
    mapfile -t wf_task_ids < <(jq -r ".workflows[] | select(.id==\"$wfid\") | .tasks[]" "$wf_json" 2>/dev/null)

    # Compute live stats
    local wf_done=0 wf_total=${#wf_task_ids[@]}
    for tid in "${wf_task_ids[@]}"; do
      local st
      st=$(jq -r ".tasks[] | select(.id==\"$tid\") | .state" "$tasks_json" 2>/dev/null)
      [[ "$st" == "-" ]] && ((wf_done++))
    done
    local wf_pct=0; [[ $wf_total -gt 0 ]] && wf_pct=$(( wf_done * 100 / wf_total ))

    # Workflow group header
    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '\n  \033[1;36m%s\033[0m \033[2m(%s) [%s/%s %s%%]\033[0m\n' \
        "$wfid" "$wf_title" "$wf_done" "$wf_total" "$wf_pct"
    else
      printf '\n  %s (%s) [%s/%s %s%%]\n' "$wfid" "$wf_title" "$wf_done" "$wf_total" "$wf_pct"
    fi

    # Sort tasks by priority descending (jq builds sorted list)
    # Use pipe delimiter (not @tsv) to preserve empty fields in bash read
    local sorted_tasks
    sorted_tasks=$(jq -r --argjson ids "$(printf '%s\n' "${wf_task_ids[@]}" | jq -R . | jq -s .)" '
      [.tasks[] | select(.id as $id | $ids | index($id))]
      | sort_by(-.priority)[]
      | [.state, (.priority|tostring), .id, .repo, (.agent // ""), .title] | join("|")
    ' "$tasks_json" 2>/dev/null)

    while IFS='|' read -r state prio id repo agent title; do
      [[ -z "$id" ]] && continue
      local prio_str; prio_str=$(_prio_stars "$prio")
      local short_repo; short_repo=$(_short_repo "$repo")
      local wfs="${wf_map[$id]:-}"
      local agent_str=""
      [[ -n "$agent" ]] && agent_str="@${agent}"

      if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
        printf '    %s %-5s %-12s \033[2m%-8s %-12s\033[0m %s\n' \
          "$(_colored_state "$state")" "$prio_str" "$id" "$short_repo" "$agent_str" "$title"
      else
        printf '    %s %-5s %-12s %-8s %-12s %s\n' \
          "$state" "$prio_str" "$id" "$short_repo" "$agent_str" "$title"
      fi
      printed["$id"]=1
    done <<< "$sorted_tasks"
  done

  # Any orphan tasks not in a workflow
  local orphans
  orphans=$(jq -r --argjson printed "$(printf '%s\n' "${!printed[@]}" | jq -R . | jq -s .)" '
    [.tasks[] | select(.id as $id | $printed | index($id) | not)]
    | sort_by(-.priority)[]
    | [.state, (.priority|tostring), .id, .repo, (.agent // ""), .title] | join("|")
  ' "$tasks_json" 2>/dev/null)

  if [[ -n "$orphans" ]]; then
    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '\n  \033[1;33m(ungrouped)\033[0m\n'
    else
      printf '\n  (ungrouped)\n'
    fi
    while IFS='|' read -r state prio id repo agent title; do
      [[ -z "$id" ]] && continue
      local prio_str; prio_str=$(_prio_stars "$prio")
      local short_repo; short_repo=$(_short_repo "$repo")
      local agent_str=""
      [[ -n "$agent" ]] && agent_str="@${agent}"
      printf '    %s %-5s %-12s %-8s %-12s %s\n' \
        "$(_colored_state "$state")" "$prio_str" "$id" "$short_repo" "$agent_str" "$title"
    done <<< "$orphans"
  fi

  echo ""
  agence_format_legend
  return 0
}

# ── workflow status ──────────────────────────────────────────────────────────
# Shows: [state] WF-ID (title) [done/total pct%] with task detail
# Sorted by: incomplete first, then highest priority tasks
knowledge_status_workflow() {
  local wf_json="${AGENCE_ROOT}/organic/workflows.json"
  local tasks_json="${AGENCE_ROOT}/organic/tasks.json"
  if [[ ! -f "$wf_json" ]] || ! command -v jq &>/dev/null; then
    echo "[workflow status] No data or jq unavailable" >&2
    return 1
  fi

  local wf_count wf_done_count=0
  wf_count=$(jq '.workflows | length' "$wf_json")

  # Pre-compute all workflow stats (live from tasks.json)
  declare -A wf_done wf_total wf_pct wf_max_prio
  local wi=0
  while [[ $wi -lt $wf_count ]]; do
    local wfid
    wfid=$(jq -r ".workflows[$wi].id" "$wf_json")
    local task_ids_str
    task_ids_str=$(jq -r ".workflows[$wi].tasks[]" "$wf_json" 2>/dev/null)
    local d=0 t=0 max_p=0
    for tid in $task_ids_str; do
      ((t++))
      local ts tp
      ts=$(jq -r ".tasks[] | select(.id==\"$tid\") | .state" "$tasks_json" 2>/dev/null)
      tp=$(jq -r ".tasks[] | select(.id==\"$tid\") | .priority" "$tasks_json" 2>/dev/null)
      [[ "$ts" == "-" ]] && ((d++))
      [[ "${tp:-0}" -gt "$max_p" ]] && max_p="$tp"
    done
    wf_done[$wfid]=$d
    wf_total[$wfid]=$t
    local p=0; [[ $t -gt 0 ]] && p=$(( d * 100 / t ))
    wf_pct[$wfid]=$p
    wf_max_prio[$wfid]=$max_p
    [[ $p -eq 100 ]] && ((wf_done_count++))
    ((wi++))
  done

  echo "[workflows] ${wf_done_count}/${wf_count} completed" >&2

  # Sort workflows: incomplete first (by max priority desc), then completed
  local sorted_wfids
  mapfile -t sorted_wfids < <(
    for wfid in $(jq -r '.workflows[].id' "$wf_json"); do
      local is_done=0
      [[ "${wf_pct[$wfid]}" -eq 100 ]] && is_done=1
      printf '%s\t%s\t%s\n' "$is_done" "${wf_max_prio[$wfid]}" "$wfid"
    done | sort -t$'\t' -k1,1n -k2,2rn | cut -f3
  )

  for wfid in "${sorted_wfids[@]}"; do
    local wf_title
    wf_title=$(jq -r ".workflows[] | select(.id==\"$wfid\") | .title" "$wf_json" 2>/dev/null)
    local d="${wf_done[$wfid]}" t="${wf_total[$wfid]}" p="${wf_pct[$wfid]}"

    local wf_state="+"
    if [[ "$p" -eq 100 ]]; then wf_state="-"
    elif [[ "$d" -gt 0 ]]; then wf_state="%"
    fi

    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '\n  %s \033[1m%-12s\033[0m \033[2m(%s)\033[0m [%s/%s %s%%]\n' \
        "$(_colored_state "$wf_state")" "$wfid" "$wf_title" "$d" "$t" "$p"
    else
      printf '\n  %s %-12s (%s) [%s/%s %s%%]\n' \
        "$wf_state" "$wfid" "$wf_title" "$d" "$t" "$p"
    fi

    # Tasks in this workflow, sorted by priority desc
    local sorted_tasks
    sorted_tasks=$(jq -r --arg wfid "$wfid" '
      (.workflows[] | select(.id==$wfid) | .tasks) as $ids |
      [.tasks[] | select(.id as $id | $ids | index($id))]
      | sort_by(-.priority)[]
      | [.state, (.priority|tostring), .id, (.agent // ""), .title] | join("|")
    ' <(jq -s '.[0] * .[1]' "$wf_json" "$tasks_json") 2>/dev/null)

    while IFS='|' read -r state prio id agent title; do
      [[ -z "$id" ]] && continue
      local prio_str; prio_str=$(_prio_stars "$prio")
      local agent_str=""
      [[ -n "$agent" ]] && agent_str="@${agent}"
      printf '    %s %-5s %-12s %-12s %s\n' \
        "$(_colored_state "$state")" "$prio_str" "$id" "$agent_str" "$title"
    done <<< "$sorted_tasks"
  done

  echo ""
  agence_format_legend
  return 0
}

# ── project status ───────────────────────────────────────────────────────────
# Shows: [state] PROJ-ID (title) [wf_done/wf_total pct%]
#   → child workflows with [done/total pct%]
# Sorted by highest priority workflows first
knowledge_status_project() {
  local proj_json="${AGENCE_ROOT}/organic/projects.json"
  local wf_json="${AGENCE_ROOT}/organic/workflows.json"
  local tasks_json="${AGENCE_ROOT}/organic/tasks.json"
  if [[ ! -f "$proj_json" ]] || ! command -v jq &>/dev/null; then
    echo "[project status] No data or jq unavailable" >&2
    return 1
  fi

  local proj_count
  proj_count=$(jq '.projects | length' "$proj_json")
  echo "[projects] ${proj_count} total" >&2

  local pi=0
  while [[ $pi -lt $proj_count ]]; do
    local p_id p_title
    p_id=$(jq -r ".projects[$pi].id" "$proj_json")
    p_title=$(jq -r ".projects[$pi].title" "$proj_json")

    # Compute live stats across all workflows
    local p_wf_ids
    mapfile -t p_wf_ids < <(jq -r ".projects[$pi].workflows[]" "$proj_json" 2>/dev/null)
    local p_task_done=0 p_task_total=0 p_wf_done=0 p_wf_total=${#p_wf_ids[@]}

    # Pre-compute per-workflow stats
    declare -A _pw_done _pw_total _pw_pct _pw_maxprio
    for wfid in "${p_wf_ids[@]}"; do
      local task_ids_str d=0 t=0 max_p=0
      task_ids_str=$(jq -r ".workflows[] | select(.id==\"$wfid\") | .tasks[]" "$wf_json" 2>/dev/null)
      for tid in $task_ids_str; do
        ((t++))
        local ts tp
        ts=$(jq -r ".tasks[] | select(.id==\"$tid\") | .state" "$tasks_json" 2>/dev/null)
        tp=$(jq -r ".tasks[] | select(.id==\"$tid\") | .priority" "$tasks_json" 2>/dev/null)
        [[ "$ts" == "-" ]] && ((d++))
        [[ "${tp:-0}" -gt "$max_p" ]] && max_p="$tp"
      done
      _pw_done[$wfid]=$d; _pw_total[$wfid]=$t
      local p=0; [[ $t -gt 0 ]] && p=$(( d * 100 / t ))
      _pw_pct[$wfid]=$p; _pw_maxprio[$wfid]=$max_p
      [[ $p -eq 100 ]] && ((p_wf_done++))
      p_task_done=$((p_task_done + d)); p_task_total=$((p_task_total + t))
    done

    local p_pct=0; [[ $p_task_total -gt 0 ]] && p_pct=$(( p_task_done * 100 / p_task_total ))
    local p_state="+"
    if [[ $p_pct -eq 100 ]]; then p_state="-"
    elif [[ $p_task_done -gt 0 ]]; then p_state="%"
    fi

    if [[ "${_AGENCE_FMT:-text}" == "text" ]]; then
      printf '\n  %s \033[1m%s\033[0m (%s) wf:[%s/%s] tasks:[%s/%s %s%%]\n' \
        "$(_colored_state "$p_state")" "$p_id" "$p_title" \
        "$p_wf_done" "$p_wf_total" "$p_task_done" "$p_task_total" "$p_pct"
    else
      printf '\n  %s %s (%s) wf:[%s/%s] tasks:[%s/%s %s%%]\n' \
        "$p_state" "$p_id" "$p_title" \
        "$p_wf_done" "$p_wf_total" "$p_task_done" "$p_task_total" "$p_pct"
    fi

    # Sort workflows: incomplete first, then by max priority desc
    local sorted_wfids
    mapfile -t sorted_wfids < <(
      for wfid in "${p_wf_ids[@]}"; do
        local is_done=0
        [[ "${_pw_pct[$wfid]}" -eq 100 ]] && is_done=1
        printf '%s\t%s\t%s\n' "$is_done" "${_pw_maxprio[$wfid]}" "$wfid"
      done | sort -t$'\t' -k1,1n -k2,2rn | cut -f3
    )

    for wfid in "${sorted_wfids[@]}"; do
      local wf_title d t p wf_state
      wf_title=$(jq -r ".workflows[] | select(.id==\"$wfid\") | .title" "$wf_json" 2>/dev/null)
      d="${_pw_done[$wfid]}"; t="${_pw_total[$wfid]}"; p="${_pw_pct[$wfid]}"
      wf_state="+"; [[ $p -eq 100 ]] && wf_state="-"; [[ $d -gt 0 && $p -lt 100 ]] && wf_state="%"

      printf '    %s %-12s %-25s [%s/%s %s%%]\n' \
        "$(_colored_state "$wf_state")" "$wfid" "$wf_title" "$d" "$t" "$p"
    done

    unset _pw_done _pw_total _pw_pct _pw_maxprio
    ((pi++))
  done

  echo ""
  agence_format_legend
  return 0
}

# Generic INDEX-based status (for types without rich root JSON)
knowledge_status_index() {
  local cmd_type="$1"
  local data_dir="$2"

  local index_json="$data_dir/INDEX.json"
  local count=0

  if [[ -f "$index_json" ]] && command -v jq &>/dev/null; then
    # Try .entries[] first (standard INDEX.json), fall back to other keys
    count=$(jq '(.entries // []) | length' "$index_json" 2>/dev/null || echo 0)
    echo "[$cmd_type status] ($count entries)"
    echo ""
    if [[ $count -gt 0 ]]; then
      jq -r '(.entries // [])[] | "  ~ \(.id // .title // .source // "?")  \(.title // .description // .date // "")"' "$index_json" 2>/dev/null
    else
      echo "  (no entries)"
    fi
  else
    # Count .md files (exclude INDEX.md)
    count=$(find "$data_dir" -maxdepth 1 -name "*.md" ! -name "INDEX.md" 2>/dev/null | wc -l)
    echo "[$cmd_type status] ($count entries)"
    echo ""
    if [[ $count -gt 0 ]]; then
      for f in "$data_dir"/*.md; do
        [[ "$(basename "$f")" == "INDEX.md" ]] && continue
        local name; name=$(basename "$f" .md)
        local title; title=$(head -1 "$f" | sed 's/^#\s*//')
        echo "  ~ $name  $title"
      done
    else
      echo "  (no entries)"
    fi
  fi
  echo ""
  return 0
}

# plan status — reads phases.json for roadmap phase tracking
knowledge_status_plan() {
  local data_dir="$1"
  local phases_json="$data_dir/phases.json"

  if [[ -f "$phases_json" ]] && command -v jq &>/dev/null; then
    local phase_count
    phase_count=$(jq '.phases | length' "$phases_json" 2>/dev/null || echo 0)
    echo "[plan status] ($phase_count phases)"
    echo ""
    local i=0
    while [[ $i -lt $phase_count ]]; do
      local p_id p_name p_status p_ver
      p_id=$(jq -r ".phases[$i].id" "$phases_json")
      p_name=$(jq -r ".phases[$i].name" "$phases_json")
      p_status=$(jq -r ".phases[$i].status // \"unknown\"" "$phases_json")
      p_ver=$(jq -r ".phases[$i].version // \"\"" "$phases_json")
      local sym="~"
      case "$p_status" in
        complete|done) sym="-" ;;
        in-progress|active) sym="%" ;;
        queued|pending) sym="~" ;;
        blocked|failed) sym="!" ;;
      esac
      printf '  %s %-6s %-30s %s (%s)\n' \
        "$(_colored_state "$sym")" "$p_ver" "$p_name" "[$p_status]" "phase $p_id"
      ((i++))
    done
  else
    # Fall back to generic index
    knowledge_status_index "plan" "$data_dir"
    return $?
  fi
  echo ""
  return 0
}

# Router: knowledge_status
knowledge_status() {
  local cmd_type="$1"
  local args="$2"
  local data_dir="$3"

  case "$cmd_type" in
    "task")     knowledge_status_task "$args" ;;
    "workflow") knowledge_status_workflow "$args" ;;
    "project")  knowledge_status_project "$args" ;;
    "plan")     knowledge_status_plan "$data_dir" ;;
    "todo"|"note"|"job"|"issue")
      knowledge_status_index "$cmd_type" "$data_dir"
      ;;
    *)
      echo "Error: 'status' subcommand not supported for $cmd_type" >&2
      echo "Supported: task, workflow, project, todo, job, issue, plan, session" >&2
      return 1
      ;;
  esac
}


# ============================================================================
# INDEX: Scan for knowledge base INDEX.md / INDEX.json pairs (^index)
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
# REINDEX: Run bin/indexer on knowledge bases (^reindex)
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
    python3 "$indexer" "${args[@]}"
  fi
}
