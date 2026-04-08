#!/usr/bin/env bash
# lib/env.sh — Canonical Agence environment bootstrap
#
# Source from any bin/ script:
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/env.sh"
#
# Provides:
#   AGENCE_ROOT        — Root of the agence installation
#   AGENCE_BIN         — bin/ directory
#   AGENCE_LIB         — lib/ directory
#   AI_ROOT / AI_BIN   — Legacy aliases (aido, aisession, aicmd compat)
#   GIT_ROOT           — Legacy alias (ibash, aibash compat)
#   AGENCE_SESSION_DIR — nexus/.aisessions
#   AGENCE_LEDGER_DIR  — nexus/.ailedger
#   source_if_exists() — Source a file only if it exists

# Guard: only load once
[[ -n "${_AGENCE_ENV_LOADED:-}" ]] && return 0
_AGENCE_ENV_LOADED=1

# Resolve root from this file's location: lib/ is one level below AGENCE_ROOT
if [[ -z "${AGENCE_ROOT:-}" ]]; then
    AGENCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

AGENCE_BIN="${AGENCE_BIN:-$AGENCE_ROOT/bin}"
AGENCE_LIB="${AGENCE_LIB:-$AGENCE_ROOT/lib}"

# Legacy/compat aliases (used by aido, aisession, aicmd, ibash, aibash)
AI_ROOT="${AI_ROOT:-$AGENCE_ROOT}"
AI_BIN="${AI_BIN:-$AGENCE_BIN}"
GIT_ROOT="${GIT_ROOT:-$AGENCE_ROOT}"

export AGENCE_ROOT AGENCE_BIN AGENCE_LIB AI_ROOT AI_BIN GIT_ROOT

# Standard directories
AGENCE_SESSION_DIR="${AGENCE_SESSION_DIR:-$AI_ROOT/nexus/.aisessions}"
AGENCE_LEDGER_DIR="${AGENCE_LEDGER_DIR:-$AI_ROOT/nexus/.ailedger}"
export AGENCE_SESSION_DIR AGENCE_LEDGER_DIR

# Pager suppression: prevent gh/git/less from hanging agentic shells
export GIT_PAGER=cat
export GH_PAGER=cat
export PAGER=cat
export LESS="-FRX"  # auto-exit if fits screen, raw control chars, no init

# Source a file only if it exists
source_if_exists() {
    [[ -f "$1" ]] && source "$1"
}
