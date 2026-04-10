#!/usr/bin/env bash
# lib/drivers/stub.sh — Stub Driver (no container isolation)
#
# Development driver. Tangents run directly on the host in their worktree.
# No process isolation, no filesystem sandboxing.
# Use for local development and testing. NOT for production swarms.

# ── Prerequisites ──────────────────────────────────────────────────────────

_driver_check_prereqs() {
  # Stub needs nothing — always available
  return 0
}

# ── Interface Implementation ───────────────────────────────────────────────

_driver_spawn() {
  local tangent_id="$1" worktree_path="$2" agent="$3"
  # No container — worktree is already created by agentd
  echo "[agentd:stub] tangent $tangent_id — no container (host-direct)"
  return 0
}

_driver_destroy() {
  local tangent_id="$1"
  # Nothing to tear down — worktree cleanup is handled by agentd
  return 0
}

_driver_exec() {
  local tangent_id="$1"
  shift
  local cmd="$*"
  local worktree_path="$AGENTD_WORKTREES/$tangent_id"

  if [[ -d "$worktree_path" ]]; then
    (cd "$worktree_path" && eval "$cmd")
  else
    eval "$cmd"
  fi
}

_driver_status() {
  local tangent_id="$1"
  local worktree_path="$AGENTD_WORKTREES/$tangent_id"

  # Stub: tangent is "running" if worktree exists and tmux window exists
  if [[ -d "$worktree_path" ]]; then
    local window="@${tangent_id}"
    if tmux has-session -t "$SESSION" 2>/dev/null && \
       tmux list-windows -t "$SESSION" -F "#{window_name}" 2>/dev/null | grep -qxF "$window"; then
      echo "running"
      return 0
    fi
  fi
  echo "stopped"
  return 1
}

_driver_logs() {
  local tangent_id="$1"
  # Stub: no container logs — show tmux pane capture instead
  local window="@${tangent_id}"
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux capture-pane -t "${SESSION}:${window}" -p 2>/dev/null
  else
    echo "[agentd:stub] No logs — session not running" >&2
    return 1
  fi
}
