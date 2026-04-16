#!/usr/bin/env bash
# lib/drivers/docker.sh — Docker Driver (container isolation)
#
# Production-grade driver. Each tangent gets its own Docker container:
#   - Read-only .git object store (shared)
#   - Writable worktree volume (isolated per tangent)
#   - Labeled for agentd management
#
# Prerequisites: docker CLI + daemon running

AGENTD_IMAGE="${AGENTD_IMAGE:-agence/agent:latest}"

# ── Prerequisites ──────────────────────────────────────────────────────────

_driver_check_prereqs() {
  if ! command -v docker &>/dev/null; then
    echo "✗ docker CLI not found" >&2
    echo "  Install: https://docs.docker.com/get-docker/" >&2
    return 1
  fi

  if ! docker info &>/dev/null 2>&1; then
    echo "✗ Docker daemon not running" >&2
    echo "  Start: sudo systemctl start docker  (or Docker Desktop)" >&2
    return 1
  fi

  return 0
}

# ── Interface Implementation ───────────────────────────────────────────────

_driver_spawn() {
  local tangent_id="$1" worktree_path="$2" agent="$3"
  local container_name="agence-${tangent_id}"

  # Check for existing container
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qxF "$container_name"; then
    echo "[agentd:docker] container $container_name already exists — removing stale" >&2
    docker rm -f "$container_name" &>/dev/null
  fi

  docker run -d \
    --name "$container_name" \
    --hostname "$tangent_id" \
    -v "${AGENCE_ROOT}/.git:/repo/.git:ro" \
    -v "${worktree_path}:/workspace" \
    -e "AI_AGENT=${agent}" \
    -e "AI_ROLE=agentic" \
    -e "GIT_ROOT=/workspace" \
    -e "AGENCE_ROOT=/agence" \
    -e "AI_ROOT=/workspace" \
    -w /workspace \
    --label "agence.tangent=${tangent_id}" \
    --label "agence.agent=${agent}" \
    --label "agence.driver=docker" \
    "$AGENTD_IMAGE" \
    sleep infinity

  if [[ $? -ne 0 ]]; then
    echo "✗ Failed to start container for tangent $tangent_id" >&2
    return 1
  fi
  echo "[agentd:docker] started $container_name"
}

_driver_destroy() {
  local tangent_id="$1"
  local container_name="agence-${tangent_id}"

  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qxF "$container_name"; then
    docker rm -f "$container_name" &>/dev/null
    echo "[agentd:docker] removed $container_name"
  fi
}

_driver_exec() {
  local tangent_id="$1"
  shift
  local cmd="$*"
  local container_name="agence-${tangent_id}"

  # All commands inside the container are gated by guard.ts
  docker exec -i "$container_name" \
    bash -c 'eval "$(/agence/bin/airun guard check "$@")" && [ "$_GUARD_APPROVED" = "1" ] && eval "$@" || echo "[guard] ✗ Denied: $*" >&2' _ "$cmd"
}

_driver_status() {
  local tangent_id="$1"
  local container_name="agence-${tangent_id}"

  local state
  state=$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null)

  case "$state" in
    running)
      echo "running"
      return 0
      ;;
    exited|dead|created)
      echo "$state"
      return 1
      ;;
    *)
      echo "unknown"
      return 1
      ;;
  esac
}

_driver_logs() {
  local tangent_id="$1"
  local container_name="agence-${tangent_id}"

  # Stream container logs (blocking — use with tmux pipe-pane)
  docker logs -f "$container_name" 2>&1
}
