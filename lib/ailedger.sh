#!/usr/bin/env bash
# lib/ailedger.sh — Thin bash glue for the canonical Bun ledger implementation
#
# All business logic lives in lib/ailedger.ts. This file provides bash-callable
# wrappers for shell integration (PS1 hooks, trap handlers, etc.).
#
# Storage: nexus/.ailedger/YYYY-MM.jsonl (monthly rotation, gitignored)

# Resolve ledger directory
_AILEDGER_DIR="${AGENCE_LEDGER_DIR:-${AGENCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/nexus/.ailedger}"
_AILEDGER_TS="${AGENCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/ailedger.ts"

# Current month's ledger file (used by callers for path resolution)
_ailedger_current_file() {
  echo "$_AILEDGER_DIR/$(date -u '+%Y-%m').jsonl"
}

# ── All functions delegate to bun run lib/ailedger.ts ──────────────────────

ailedger_append() {
  local decision_type="${1:-unknown}"
  local rationale_tag="${2:-}"
  local task_id="${3:-}"
  local command_str="${4:-}"
  local exit_code="${5:--1}"

  if [[ -z "${_AILEDGER_SESSION_ID:-}" ]]; then
    _AILEDGER_SESSION_ID="${AI_SESSION_ID:-$(printf '%08x' $$)}"
  fi

  local _bun_result
  _bun_result=$(AI_SESSION_ID="${AI_SESSION_ID:-${_AILEDGER_SESSION_ID}}" \
    AI_AGENT="${AI_AGENT:-unknown}" \
    bun run "$_AILEDGER_TS" append \
      "$decision_type" "$rationale_tag" "$task_id" "$command_str" "$exit_code" \
    2>/dev/null) && eval "$_bun_result" 2>/dev/null
}

ailedger_verify() {
  local target="${1:---both}"
  bun run "$_AILEDGER_TS" verify "$target"
}

ailedger_tail() {
  bun run "$_AILEDGER_TS" tail "${1:-20}"
}

ailedger_count() {
  bun run "$_AILEDGER_TS" count
}

ailedger_list() {
  bun run "$_AILEDGER_TS" list
}

ailedger_query() {
  bun run "$_AILEDGER_TS" query "$@"
}

ailedger_prune() {
  bun run "$_AILEDGER_TS" prune "$@"
}
