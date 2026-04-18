#!/usr/bin/env bash
# agent-entrypoint.sh — Container init: overlay mount for .git + exec CMD
#
# Creates a union mount over the read-only .git object store so agents
# can write new objects (git add/commit) without modifying the host repo.
#
#   lower  = /repo/.git-lower  (bind-mounted :ro from host .git)
#   upper  = /tmp/.git-upper   (ephemeral writable layer)
#   merged = /repo/.git        (what git sees — reads from lower, writes to upper)
#
# Uses fuse-overlayfs (requires --cap-add SYS_ADMIN, dropped after mount).
# agentd cherry-picks resultant commits from the worktree after tangent wins.

set -euo pipefail

LOWER="/repo/.git-lower"
UPPER="/tmp/.git-upper"
WORK="/tmp/.git-work"
MERGED="/repo/.git"

if [[ -d "$LOWER" ]]; then
  mkdir -p "$UPPER" "$WORK" "$MERGED"

  if command -v fuse-overlayfs &>/dev/null; then
    fuse-overlayfs \
      -o "lowerdir=${LOWER},upperdir=${UPPER},workdir=${WORK}" \
      "$MERGED"
    echo "[agent-entrypoint] overlay: /repo/.git  (lower=${LOWER}, upper=${UPPER})" >&2
  else
    echo "[agent-entrypoint] WARNING: fuse-overlayfs not found — .git is read-only" >&2
    # Fallback: symlink so git at least finds the objects
    ln -sfn "$LOWER" "$MERGED"
  fi
fi

# Fix worktree .git pointer if tangent_id is set
if [[ -n "${AGENCE_TANGENT_ID:-}" && -f "/workspace/.git" ]]; then
  echo "gitdir: /repo/.git/worktrees/${AGENCE_TANGENT_ID}" > /workspace/.git
fi

# Allow git operations on mounted workspace (ownership differs from container user)
git config --global --add safe.directory /workspace 2>/dev/null || true

# Drop SYS_ADMIN now that fuse mount is done — layered security
# capsh drops the capability for PID 1 and its children.
# Note: docker exec still inherits container-level caps (guard.ts is the real TCB).
if command -v capsh &>/dev/null; then
  exec capsh --drop=cap_sys_admin -- -c 'exec "$@"' -- "$@"
fi

exec "$@"
