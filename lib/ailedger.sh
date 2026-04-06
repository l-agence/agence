#!/usr/bin/env bash
# lib/ailedger.sh — Append-only decision ledger for agence
#
# Usage:
#   source lib/ailedger.sh
#   ailedger_append <decision_type> <rationale_tag> [task_id]
#
# Fields (JSONL):
#   timestamp      ISO-8601 UTC
#   session_id     from AI_SESSION_ID or generated once per shell
#   decision_type  route|launch|fault|plan|commit|push|policy
#   agent          from AI_AGENT env (default: "unknown")
#   rationale_tag  short slug — why this decision was made
#   task_id        optional — organic task id or ""
#
# File: nexus/.ailedger  (gitignored via nexus/.ai*)
# Format: JSONL (one JSON object per line, append-only, never rewritten)

_AILEDGER_FILE="${AGENCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/nexus/.ailedger"

ailedger_append() {
  local decision_type="${1:-unknown}"
  local rationale_tag="${2:-}"
  local task_id="${3:-}"

  # Lazy session ID — stable for the shell's lifetime
  if [[ -z "${_AILEDGER_SESSION_ID:-}" ]]; then
    _AILEDGER_SESSION_ID="${AI_SESSION_ID:-$(printf '%08x' $$)}"
  fi

  local ts agent entry
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo 'unknown')"
  agent="${AI_AGENT:-unknown}"

  entry=$(printf '{"timestamp":"%s","session_id":"%s","decision_type":"%s","agent":"%s","rationale_tag":"%s","task_id":"%s"}\n' \
    "$ts" "$_AILEDGER_SESSION_ID" "$decision_type" "$agent" "$rationale_tag" "$task_id")

  # Ensure nexus/ exists (it always should, but be safe)
  mkdir -p "$(dirname "$_AILEDGER_FILE")"
  printf '%s' "$entry" >> "$_AILEDGER_FILE"
}

# Read/display helpers (non-destructive)
ailedger_tail() {
  local n="${1:-20}"
  if [[ -f "$_AILEDGER_FILE" ]]; then
    tail -n "$n" "$_AILEDGER_FILE"
  else
    echo "[ailedger] No entries yet: $_AILEDGER_FILE" >&2
  fi
}

ailedger_count() {
  if [[ -f "$_AILEDGER_FILE" ]]; then
    wc -l < "$_AILEDGER_FILE"
  else
    echo 0
  fi
}
