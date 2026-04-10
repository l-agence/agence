#!/usr/bin/env bash
# lib/drivers/nomad.sh — Nomad Driver (cluster orchestration) [SKELETON]
#
# Future driver for Hashicorp Nomad-based flock orchestration.
# Each tangent becomes a Nomad job with:
#   - Task group: agent container + sidecar (socat socket relay)
#   - Volume mount: git worktree (CSI or host volume)
#   - Service: registered in Consul for discovery
#
# Prerequisites: nomad CLI + Nomad cluster accessible
#
# STATUS: Not yet implemented. All functions return structured errors
#         indicating what would need to happen.

NOMAD_ADDR="${NOMAD_ADDR:-http://127.0.0.1:4646}"
NOMAD_NAMESPACE="${NOMAD_NAMESPACE:-agence}"

# ── Prerequisites ──────────────────────────────────────────────────────────

_driver_check_prereqs() {
  if ! command -v nomad &>/dev/null; then
    echo "✗ nomad CLI not found" >&2
    echo "  Install: https://developer.hashicorp.com/nomad/install" >&2
    return 1
  fi

  if ! nomad status -address="$NOMAD_ADDR" &>/dev/null 2>&1; then
    echo "✗ Nomad cluster not reachable at $NOMAD_ADDR" >&2
    return 1
  fi

  return 0
}

# ── Interface Implementation ───────────────────────────────────────────────

_driver_spawn() {
  local tangent_id="$1" worktree_path="$2" agent="$3"

  echo "✗ [nomad] spawn not yet implemented" >&2
  echo "  Would submit Nomad job: agence-${tangent_id}" >&2
  echo "  Task group: agent ($agent) + socat sidecar" >&2
  echo "  Volume: $worktree_path → /workspace" >&2
  echo "  Image: ${AGENTD_IMAGE:-agence/agent:latest}" >&2

  # TODO: Generate HCL job spec and submit via nomad job run
  # nomad job run -detach -var="tangent_id=$tangent_id" -var="agent=$agent" \
  #   "$AGENCE_ROOT/lib/drivers/nomad-tangent.hcl"

  return 1
}

_driver_destroy() {
  local tangent_id="$1"

  echo "✗ [nomad] destroy not yet implemented" >&2
  echo "  Would stop Nomad job: agence-${tangent_id}" >&2

  # TODO: nomad job stop -purge "agence-${tangent_id}"

  return 1
}

_driver_exec() {
  local tangent_id="$1"
  shift
  local cmd="$*"

  echo "✗ [nomad] exec not yet implemented" >&2
  echo "  Would run: nomad alloc exec -task agent agence-${tangent_id} -- $cmd" >&2

  # TODO: Find allocation ID from job, then:
  # local alloc_id=$(nomad job status -json "agence-${tangent_id}" | jq -r '.Allocations[0].ID')
  # nomad alloc exec -task agent "$alloc_id" -- bash -c "$cmd"

  return 1
}

_driver_status() {
  local tangent_id="$1"

  echo "✗ [nomad] status not yet implemented" >&2
  echo "  Would check: nomad job status agence-${tangent_id}" >&2

  # TODO: nomad job status -json "agence-${tangent_id}" | jq -r '.Status'

  return 1
}

_driver_logs() {
  local tangent_id="$1"

  echo "✗ [nomad] logs not yet implemented" >&2
  echo "  Would stream: nomad alloc logs -f -task agent agence-${tangent_id}" >&2

  # TODO: Find allocation, then:
  # local alloc_id=$(nomad job status -json "agence-${tangent_id}" | jq -r '.Allocations[0].ID')
  # nomad alloc logs -f -task agent "$alloc_id"

  return 1
}
