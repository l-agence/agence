#!/usr/bin/env bash
# lib/shell-ui.sh — Shell UI: colors, PS1, tmux titles, state rendering
#
# Canonical color/state mapping for all Agence shells.
# Sourced by bin/aibash, bin/swarm, bin/ibash.
#
# ECONOMY PRINCIPLE: Spawn reluctantly, reap aggressively.
#   - AGENCE_MAX_SHELLS (default 4) caps concurrent agent shells
#   - swarm launch reaps completed panes before spawning
#   - aibash marks pane "-" on exit so swarm reap can reclaim
#   - Prefer reusing idle panes over creating new ones
#
# State legend (canonical — from synthetic/l-agence.org/docs/SYMBOLS.md):
#   +  pending/todo    &  agent-assigned     (BLUE)   — queued, not yet running
#   %  in-progress                           (AMBER)  — actively working
#   _  paused/deferred #  held-by-human      (PURPLE) — blocked
#   -  completed                             (GREEN)  — terminal
#   !  failed          ?  awaiting-input     (RED)    — needs attention
#   ~  swarm-queued    $  swarm-coordinating (CYAN)   — reserved v0.3.2+

# ── ANSI Color Codes ─────────────────────────────────────────────────────────

# Raw escape (works in PS1 and echo -e)
_C_RED='\033[31m'
_C_GREEN='\033[32m'
_C_AMBER='\033[33m'      # yellow/amber
_C_BLUE='\033[34m'
_C_PURPLE='\033[35m'
_C_CYAN='\033[36m'
_C_WHITE='\033[37m'
_C_BOLD='\033[1m'
_C_DIM='\033[2m'
_C_RESET='\033[0m'

# PS1-safe (wrapped in \[ \] so readline calculates width correctly)
_P_RED='\[\033[31m\]'
_P_GREEN='\[\033[32m\]'
_P_AMBER='\[\033[33m\]'
_P_BLUE='\[\033[34m\]'
_P_PURPLE='\[\033[35m\]'
_P_CYAN='\[\033[36m\]'
_P_WHITE='\[\033[37m\]'
_P_BOLD='\[\033[1m\]'
_P_DIM='\[\033[2m\]'
_P_RESET='\[\033[0m\]'

# tmux #{} style strings — used in status-left/right, window-status-format
_TMUX_RED='#[fg=red]'
_TMUX_GREEN='#[fg=green]'
_TMUX_AMBER='#[fg=yellow]'
_TMUX_BLUE='#[fg=blue]'
_TMUX_PURPLE='#[fg=magenta]'
_TMUX_CYAN='#[fg=cyan]'
_TMUX_WHITE='#[fg=white]'
_TMUX_BOLD='#[bold]'
_TMUX_RESET='#[default]'

# ── State → Color Mapping ────────────────────────────────────────────────────

# Returns ANSI color escape for a given state symbol.
# Usage: _state_color "%" → prints \033[33m (amber)
_state_color() {
  case "${1:-+}" in
    '+'|'&')      printf '%s' "$_C_BLUE"   ;;  # pending / agent-assigned
    '%')          printf '%s' "$_C_AMBER"  ;;  # in-progress
    '_'|'#')     printf '%s' "$_C_PURPLE" ;;  # paused / held-by-human
    '-')          printf '%s' "$_C_GREEN"  ;;  # completed
    '!'|'?')     printf '%s' "$_C_RED"    ;;  # failed / awaiting-input
    '~'|'$')     printf '%s' "$_C_CYAN"   ;;  # swarm (reserved)
    *)            printf '%s' "$_C_WHITE"  ;;  # unknown
  esac
}

# PS1-safe variant (with \[\] wrappers)
_state_color_ps1() {
  case "${1:-+}" in
    '+'|'&')      printf '%s' "$_P_BLUE"   ;;
    '%')          printf '%s' "$_P_AMBER"  ;;
    '_'|'#')     printf '%s' "$_P_PURPLE" ;;
    '-')          printf '%s' "$_P_GREEN"  ;;
    '!'|'?')     printf '%s' "$_P_RED"    ;;
    '~'|'$')     printf '%s' "$_P_CYAN"   ;;
    *)            printf '%s' "$_P_WHITE"  ;;
  esac
}

# tmux style string variant
_state_color_tmux() {
  case "${1:-+}" in
    '+'|'&')      printf '%s' "$_TMUX_BLUE"   ;;
    '%')          printf '%s' "$_TMUX_AMBER"  ;;
    '_'|'#')     printf '%s' "$_TMUX_PURPLE" ;;
    '-')          printf '%s' "$_TMUX_GREEN"  ;;
    '!'|'?')     printf '%s' "$_TMUX_RED"    ;;
    '~'|'$')     printf '%s' "$_TMUX_CYAN"   ;;
    *)            printf '%s' "$_TMUX_WHITE"  ;;
  esac
}

# ── Agent Color (fixed per agent — not state-dependent) ──────────────────────
# Gives each agent a consistent color for its name in titles/prompts.

_agent_color() {
  case "${1:-@}" in
    copilot|pilot)  printf '%s' "$_C_CYAN"   ;;
    ralph)          printf '%s' "$_C_GREEN"  ;;
    sonya|sonny)    printf '%s' "$_C_PURPLE" ;;
    aider)          printf '%s' "$_C_AMBER"  ;;
    peers)          printf '%s' "$_C_BLUE"   ;;
    claude|claudia) printf '%s' "$_C_WHITE"  ;;
    haiku)          printf '%s' "$_C_BLUE"   ;;
    *)              printf '%s' "$_C_WHITE"  ;;
  esac
}

_agent_color_ps1() {
  case "${1:-@}" in
    copilot|pilot)  printf '%s' "$_P_CYAN"   ;;
    ralph)          printf '%s' "$_P_GREEN"  ;;
    sonya|sonny)    printf '%s' "$_P_PURPLE" ;;
    aider)          printf '%s' "$_P_AMBER"  ;;
    peers)          printf '%s' "$_P_BLUE"   ;;
    claude|claudia) printf '%s' "$_P_WHITE"  ;;
    haiku)          printf '%s' "$_P_BLUE"   ;;
    *)              printf '%s' "$_P_WHITE"  ;;
  esac
}

_agent_color_tmux() {
  case "${1:-@}" in
    copilot|pilot)  printf '%s' "$_TMUX_CYAN"   ;;
    ralph)          printf '%s' "$_TMUX_GREEN"  ;;
    sonya|sonny)    printf '%s' "$_TMUX_PURPLE" ;;
    aider)          printf '%s' "$_TMUX_AMBER"  ;;
    peers)          printf '%s' "$_TMUX_BLUE"   ;;
    claude|claudia) printf '%s' "$_TMUX_WHITE"  ;;
    haiku)          printf '%s' "$_TMUX_BLUE"   ;;
    *)              printf '%s' "$_TMUX_WHITE"  ;;
  esac
}

# ── PS1 Builder ──────────────────────────────────────────────────────────────
# Format: [state]:[tangent>]@agent$
#
# Usage: agence_ps1 <agent> <state> [tangent]
#   agence_ps1 "copilot" "~"           → ~:@copil$
#   agence_ps1 "sonya" "$"             → $:@sonya$
#   agence_ps1 "ralph" "!" "t1"        → !:t1>@ralph$
#   agence_ps1 "human" "+"             → +:@steff$   (uses $USER)

agence_ps1() {
  local agent="${1:-@}"
  local state="${2:-+}"
  local tangent="${3:-}"

  # human → $USER
  local display_agent="$agent"
  [[ "$agent" == "human" ]] && display_agent="${USER:-human}"

  # Truncate agent display to 5 chars
  display_agent="${display_agent:0:5}"

  local ac; ac="$(_agent_color_ps1 "$agent")"
  local sc; sc="$(_state_color_ps1 "$state")"

  # Build tangent segment: "t1>" or ""
  local tseg=""
  if [[ -n "$tangent" ]]; then
    tseg="${_P_DIM}${tangent}>${_P_RESET}"
  fi

  printf '%s%s%s:%s%s@%s%s%s\$ ' \
    "$sc" "$state" "$_P_RESET" \
    "$tseg" \
    "$ac" "$display_agent" "$_P_RESET"
}

# ── Terminal Title (OSC escape) ──────────────────────────────────────────────
# Sets the terminal window/tab title via OSC escape sequence.
# Works in xterm, iTerm2, Windows Terminal, VS Code integrated terminal.
#
# Usage: agence_set_title <agent> <state>

agence_set_title() {
  local agent="${1:-@}"
  local state="${2:-+}"

  local display_agent="$agent"
  [[ "$agent" == "human" ]] && display_agent="${USER:-human}"
  display_agent="${display_agent:0:5}"

  local icon=""
  case "$state" in
    '+'|'&')  icon="📋" ;;  # pending/assigned
    '%')      icon="⚙️" ;;   # in-progress
    '_'|'#')  icon="⏸" ;;   # paused/held
    '-')      icon="✅" ;;  # done
    '!'|'?')  icon="🔴" ;;  # needs attention
    '~'|'$')  icon="🔗" ;;  # swarm
    *)        icon="🤖" ;;
  esac

  # OSC 0 = set window title
  printf '\033]0;%s %s:@%s\007' "$icon" "$state" "$display_agent" 2>/dev/null || true
}

# ── tmux Window/Pane Title ───────────────────────────────────────────────────
# Sets tmux pane title (visible in status bar if automatic-rename is off).
#
# Usage: agence_tmux_title <pane-target> <agent> <state>

agence_tmux_title() {
  local pane_target="$1"
  local agent="${2:-@}"
  local state="${3:-+}"

  local display_agent="$agent"
  [[ "$agent" == "human" ]] && display_agent="${USER:-human}"
  display_agent="${display_agent:0:5}"

  # Rename the pane's parent window to show state:@agent
  local window="${pane_target%%.*}"
  tmux rename-window -t "$window" "${state}:@${display_agent}" 2>/dev/null || true

  # Also set pane title (visible with pane-border-format)
  tmux select-pane -t "$pane_target" -T "${state}:@${display_agent}" 2>/dev/null || true
}

# ── State Transition: Update PS1 + Title in one call ─────────────────────────
# Called when task state changes. Updates PS1, terminal title, and tmux title.
#
# Usage: agence_state_update <new-state>
# Reads: AI_SESSION, AI_AGENT, TMUX_PANE (if inside tmux)

agence_state_update() {
  local state="${1:-+}"
  local agent="${AI_AGENT:-@}"

  # Export for child processes / PROMPT_COMMAND
  export AGENCE_TASK_STATE="$state"

  # Update PS1
  local tangent="${AGENCE_TANGENT_ID:-}"
  PS1="$(agence_ps1 "$agent" "$state" "$tangent")"
  export PS1

  # Update terminal title
  agence_set_title "$agent" "$state"

  # Update tmux if inside tmux
  if [[ -n "${TMUX_PANE:-}" ]]; then
    agence_tmux_title "$TMUX_PANE" "$agent" "$state"
  fi
}

# ── tmux Status Bar Styling ──────────────────────────────────────────────────
# Configures the tmux status bar for an agence session.
# Called once during swarm_launch.
#
# Usage: agence_tmux_status_bar <session-name>

agence_tmux_status_bar() {
  local session="$1"

  # Global status bar style
  tmux set-option -t "$session" status-style "bg=#1a1a2e,fg=white"
  tmux set-option -t "$session" status-left-length 30
  tmux set-option -t "$session" status-right-length 60

  # Left: session name in bold cyan
  tmux set-option -t "$session" status-left \
    "#[fg=cyan,bold] ⬡ #{session_name} #[default]│ "

  # Right: time
  tmux set-option -t "$session" status-right \
    "#[fg=white,dim]%H:%M #[default]"

  # Window format: show window name (which we set to "[state] agent")
  # Colors come from per-window window-status-style set by _set_window_color
  tmux set-option -t "$session" window-status-format \
    " #I:#W "
  tmux set-option -t "$session" window-status-current-format \
    " #I:#W "

  # Default inactive style (overridden per-window by _set_window_color)
  tmux set-option -t "$session" window-status-style "fg=white,dim"
  tmux set-option -t "$session" window-status-current-style "fg=cyan,bold,underscore"

  # Pane borders: show pane title
  tmux set-option -t "$session" pane-border-format \
    " #{pane_title} "
  tmux set-option -t "$session" pane-border-status "top"

  # Don't auto-rename windows (we manage titles ourselves)
  tmux set-option -t "$session" -w automatic-rename off
  tmux set-option -t "$session" -w allow-rename off
}

# ── Shell Economy Helpers ─────────────────────────────────────────────────────

# Count active agence panes (for cap enforcement)
agence_shell_count() {
  local prefix="${SWARM_SESSION_PREFIX:-agence}"
  tmux list-panes -a -F '#{session_name}' 2>/dev/null \
    | grep -c "^${prefix}" || echo "0"
}

# Check if an agent already has an idle/completed pane we can reuse
agence_shell_find_idle() {
  local target_agent="$1"
  local prefix="${SWARM_SESSION_PREFIX:-agence}"
  tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_title}' 2>/dev/null \
    | grep "^${prefix}" \
    | while IFS=' ' read -r pane title; do
        local state="${title##*:}"
        local agent="${title#*@}"
        agent="${agent%%:*}"
        if [[ "$agent" == "$target_agent" && ( "$state" == "-" || "$state" == "~" ) ]]; then
          echo "$pane"
          return 0
        fi
      done
}

# ── Shell Reap Helpers ────────────────────────────────────────────────────────
# List, focus, background, or kill agent shells.

# List all agence panes with agent/state info
agence_shell_list() {
  local prefix="${SWARM_SESSION_PREFIX:-agence}"
  if ! command -v tmux &>/dev/null || ! tmux list-sessions &>/dev/null 2>&1; then
    echo "[shell] No tmux sessions" >&2
    return 1
  fi

  printf '%-20s %-12s %-8s %-6s %s\n' "PANE" "AGENT" "STATE" "PID" "CMD"
  tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_title} #{pane_pid} #{pane_current_command}' 2>/dev/null \
    | grep "^${prefix}" \
    | while IFS=' ' read -r pane title pid cmd; do
        local agent state
        # Parse title format: "sid@agent:state" or just "agent"
        if [[ "$title" == *@*:* ]]; then
          agent="${title#*@}"
          agent="${agent%%:*}"
          state="${title##*:}"
        else
          agent="$title"
          state="~"
        fi
        printf '%-20s %-12s %-8s %-6s %s\n' "$pane" "$agent" "$state" "$pid" "$cmd"
      done
}

# Reap (kill) idle/completed panes — state "-" or no activity
agence_shell_reap() {
  local prefix="${SWARM_SESSION_PREFIX:-agence}"
  local reaped=0

  tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_title} #{pane_pid}' 2>/dev/null \
    | grep "^${prefix}" \
    | while IFS=' ' read -r pane title pid; do
        local state="${title##*:}"
        # Reap completed (-) panes
        if [[ "$state" == "-" ]]; then
          echo "[reap] Killing completed pane: $pane ($title)"
          tmux kill-pane -t "$pane" 2>/dev/null || true
          reaped=$((reaped + 1))
        fi
      done

  echo "[reap] Reaped $reaped pane(s)"
}

# Send signal to a specific agent's pane
agence_shell_signal() {
  local target_agent="$1"
  local signal="${2:-INT}"  # INT, KILL, STOP, CONT
  local prefix="${SWARM_SESSION_PREFIX:-agence}"

  tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_title} #{pane_pid}' 2>/dev/null \
    | grep "^${prefix}" \
    | while IFS=' ' read -r pane title pid; do
        local agent="${title#*@}"
        agent="${agent%%:*}"
        if [[ "$agent" == "$target_agent" ]]; then
          echo "[shell] Sending SIG${signal} to ${agent} (pid ${pid}, pane ${pane})"
          kill -"$signal" "$pid" 2>/dev/null || true
        fi
      done
}

# Focus (select) a specific agent's pane
agence_shell_focus() {
  local target_agent="$1"
  local prefix="${SWARM_SESSION_PREFIX:-agence}"

  tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_title}' 2>/dev/null \
    | grep "^${prefix}" \
    | while IFS=' ' read -r pane title; do
        local agent="${title#*@}"
        agent="${agent%%:*}"
        if [[ "$agent" == "$target_agent" ]]; then
          local window="${pane%%.*}"
          tmux select-window -t "$window" 2>/dev/null || true
          tmux select-pane -t "$pane" 2>/dev/null || true
          echo "[shell] Focused: $agent ($pane)"
          return 0
        fi
      done
}
