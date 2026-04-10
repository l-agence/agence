#!/usr/bin/env bash
# lib/drivers/contract.sh — Driver Interface Contract
#
# Every agentd container driver MUST implement these 5 functions.
# This file documents the contract and provides validation.
#
# Interface:
#   _driver_spawn   <tangent_id> <worktree_path> <agent>  → 0=ok, 1=fail
#   _driver_destroy <tangent_id>                           → 0=ok, 1=fail
#   _driver_exec    <tangent_id> <command...>              → command exit code
#   _driver_status  <tangent_id>                           → 0=running, 1=stopped
#   _driver_logs    <tangent_id>                           → streams stdout (blocking)
#
# Drivers:
#   stub    — no isolation, runs directly on host (development)
#   docker  — Docker container per tangent (production, local)
#   nomad   — Nomad job per tangent (production, cluster) [future]
#
# Selection:
#   AGENTD_DRIVER=stub|docker|nomad (default: stub)
#
# Validation:
#   _driver_validate checks that the selected driver's prerequisites are met
#   before any tangent operations. Called once on `agentd start`.

# ── Driver Loader ──────────────────────────────────────────────────────────

_driver_load() {
  local driver="${1:-$DRIVER}"
  local driver_file="$AGENCE_ROOT/lib/drivers/${driver}.sh"

  if [[ ! -f "$driver_file" ]]; then
    echo "✗ Driver file not found: $driver_file" >&2
    echo "  Available drivers: stub, docker, nomad" >&2
    return 1
  fi

  source "$driver_file"
}

# ── Driver Validation ──────────────────────────────────────────────────────

_driver_validate() {
  local driver="${1:-$DRIVER}"

  # Load the driver
  _driver_load "$driver" || return 1

  # Check that all 5 interface functions exist
  local required=( _driver_spawn _driver_destroy _driver_exec _driver_status _driver_logs )
  local missing=()

  for fn in "${required[@]}"; do
    if ! declare -f "$fn" &>/dev/null; then
      missing+=("$fn")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "✗ Driver '$driver' missing required functions:" >&2
    for fn in "${missing[@]}"; do
      echo "    • $fn" >&2
    done
    echo "  See: lib/drivers/contract.sh for interface spec" >&2
    return 1
  fi

  # Driver-specific prerequisite check
  if declare -f _driver_check_prereqs &>/dev/null; then
    _driver_check_prereqs || return 1
  fi

  return 0
}
