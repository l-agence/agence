#!/usr/bin/env bash
# lib/ailedger.sh — Append-only Merkle-chained decision ledger for agence
#
# Usage:
#   source lib/ailedger.sh
#   ailedger_append <decision_type> <rationale_tag> [task_id] [command] [exit_code]
#
# Fields (JSONL, one object per line, append-only, never rewritten):
#   seq            Monotonic sequence number (1-based, per ledger file)
#   timestamp      ISO-8601 UTC
#   session_id     from AI_SESSION_ID or generated once per shell
#   decision_type  route|launch|fault|plan|commit|push|policy|verify|inject
#   agent          from AI_AGENT env (default: "unknown")
#   rationale_tag  short slug — why this decision was made
#   task_id        optional — organic task id or ""
#   command        optional — the command that was executed
#   exit_code      optional — numeric exit code (-1 = not applicable)
#   prev_hash      SHA-256 of the previous line ("genesis" for first entry)
#
# Storage: nexus/.ailedger/YYYY-MM.jsonl (monthly rotation, gitignored)
# Integrity: Each entry's prev_hash = SHA-256 of the previous raw line.
#            Verify with: ailedger_verify [file]

# Resolve ledger directory
_AILEDGER_DIR="${AGENCE_LEDGER_DIR:-${AGENCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/nexus/.ailedger}"

# Current month's ledger file
_ailedger_current_file() {
  echo "$_AILEDGER_DIR/$(date -u '+%Y-%m').jsonl"
}

# Get SHA-256 of a string (portable: sha256sum or shasum)
_ailedger_hash() {
  if command -v sha256sum &>/dev/null; then
    printf '%s' "$1" | sha256sum | cut -d' ' -f1
  elif command -v shasum &>/dev/null; then
    printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1
  else
    echo "no-hash-tool"
  fi
}

ailedger_append() {
  local decision_type="${1:-unknown}"
  local rationale_tag="${2:-}"
  local task_id="${3:-}"
  local command_str="${4:-}"
  local exit_code="${5:--1}"

  # ── Bun delegation (preferred — two-tier with shard + filter) ─────────────
  local _ailedger_ts="${AGENCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/ailedger.ts"
  if [[ "${AGENCE_LEDGER_NO_BUN:-0}" != "1" ]] && \
     command -v bun &>/dev/null && [[ -f "$_ailedger_ts" ]]; then
    local _bun_result
    _bun_result=$(AI_SESSION_ID="${AI_SESSION_ID:-${_AILEDGER_SESSION_ID:-$(printf '%08x' $$)}}" \
      AI_AGENT="${AI_AGENT:-unknown}" \
      bun run "$_ailedger_ts" append \
        "$decision_type" "$rationale_tag" "$task_id" "$command_str" "$exit_code" \
      2>/dev/null)
    if [[ $? -eq 0 ]]; then
      eval "$_bun_result" 2>/dev/null
      return 0
    fi
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[ailedger] Bun delegation failed, falling back to bash" >&2
  fi

  # ── Bash fallback (local-only, no shard) ──────────────────────────────────

  # Lazy session ID — stable for the shell's lifetime
  if [[ -z "${_AILEDGER_SESSION_ID:-}" ]]; then
    _AILEDGER_SESSION_ID="${AI_SESSION_ID:-$(printf '%08x' $$)}"
  fi

  local ledger_file seq prev_hash ts agent entry
  ledger_file="$(_ailedger_current_file)"
  mkdir -p "$(dirname "$ledger_file")"

  # Sequence number: line count + 1
  if [[ -f "$ledger_file" ]]; then
    seq=$(( $(wc -l < "$ledger_file") + 1 ))
    prev_hash="$(_ailedger_hash "$(tail -n 1 "$ledger_file")")"
  else
    seq=1
    prev_hash="genesis"
  fi

  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo 'unknown')"
  agent="${AI_AGENT:-unknown}"

  # Escape strings for JSON (backslash, double-quote, control chars)
  local cmd_esc
  cmd_esc="$(printf '%s' "$command_str" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g')"
  local tag_esc
  tag_esc="$(printf '%s' "$rationale_tag" | sed 's/\\/\\\\/g; s/"/\\"/g')"

  entry=$(printf '{"seq":%d,"timestamp":"%s","session_id":"%s","decision_type":"%s","agent":"%s","rationale_tag":"%s","task_id":"%s","command":"%s","exit_code":%s,"prev_hash":"%s"}' \
    "$seq" "$ts" "$_AILEDGER_SESSION_ID" "$decision_type" "$agent" "$tag_esc" "$task_id" "$cmd_esc" "$exit_code" "$prev_hash")

  printf '%s\n' "$entry" >> "$ledger_file"
}

# Verify Merkle chain integrity of a ledger file
# Returns 0 if valid, 1 if broken (prints break point)
ailedger_verify() {
  local file="${1:-$(_ailedger_current_file)}"
  if [[ ! -f "$file" ]]; then
    echo "[ailedger] No ledger file: $file" >&2
    return 1
  fi

  local prev_hash="genesis" line_num=0 actual_hash
  while IFS= read -r line; do
    line_num=$((line_num + 1))
    # Extract prev_hash from the JSON line
    local claimed_hash
    claimed_hash="$(printf '%s' "$line" | sed 's/.*"prev_hash":"\([^"]*\)".*/\1/')"

    if [[ "$claimed_hash" != "$prev_hash" ]]; then
      echo "[ailedger] CHAIN BROKEN at line $line_num: expected $prev_hash, got $claimed_hash" >&2
      return 1
    fi
    prev_hash="$(_ailedger_hash "$line")"
  done < "$file"

  echo "[ailedger] VERIFIED: $line_num entries, chain intact ($file)"
  return 0
}

# Read/display helpers (non-destructive)
ailedger_tail() {
  local n="${1:-20}"
  local file="$(_ailedger_current_file)"
  if [[ -f "$file" ]]; then
    tail -n "$n" "$file"
  else
    echo "[ailedger] No entries yet: $file" >&2
  fi
}

ailedger_count() {
  local file="$(_ailedger_current_file)"
  if [[ -f "$file" ]]; then
    wc -l < "$file"
  else
    echo 0
  fi
}

# List all ledger files with entry counts
ailedger_list() {
  if [[ ! -d "$_AILEDGER_DIR" ]] || ! ls "$_AILEDGER_DIR"/*.jsonl &>/dev/null; then
    echo "[ailedger] No ledger files in $_AILEDGER_DIR" >&2
    return 0
  fi
  local f
  for f in "$_AILEDGER_DIR"/*.jsonl; do
    printf '%s\t%d entries\n' "$(basename "$f")" "$(wc -l < "$f")"
  done
}

# Query ledger entries with jq filters
# Usage:
#   ailedger_query                          — all entries (current month)
#   ailedger_query --type commit            — filter by decision_type
#   ailedger_query --agent copilot          — filter by agent
#   ailedger_query --all                    — all months
#   ailedger_query --all --type route       — all months, type filter
ailedger_query() {
  local filter="."
  local all_months=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --type)  filter="$filter | select(.decision_type == \"$2\")"; shift 2 ;;
      --agent) filter="$filter | select(.agent == \"$2\")"; shift 2 ;;
      --tag)   filter="$filter | select(.rationale_tag == \"$2\")"; shift 2 ;;
      --all)   all_months=1; shift ;;
      *)       echo "ailedger_query: unknown flag $1" >&2; return 1 ;;
    esac
  done

  if ! command -v jq &>/dev/null; then
    echo "[ailedger] jq required for query" >&2
    return 1
  fi

  if [[ $all_months -eq 1 ]]; then
    cat "$_AILEDGER_DIR"/*.jsonl 2>/dev/null | jq -c "$filter"
  else
    local current
    current="$_AILEDGER_DIR/$(date -u +%Y-%m).jsonl"
    [[ -f "$current" ]] && jq -c "$filter" "$current" || echo "[]"
  fi
}

# Prune old monthly ledger files beyond retention period
# Usage: ailedger_prune [months] [--dry-run]
# Default retention: 6 months. Only prunes LOCAL files, never the shard.
ailedger_prune() {
  local months=6 dry_run=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) dry_run=1; shift ;;
      [0-9]*)    months="$1"; shift ;;
      *)         echo "Usage: ailedger_prune [months] [--dry-run]" >&2; return 1 ;;
    esac
  done

  # Prefer Bun implementation
  local _ts="${AGENCE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/lib/ailedger.ts"
  if command -v bun &>/dev/null && [[ -f "$_ts" ]]; then
    local _prune_args="--months $months"
    [[ $dry_run -eq 1 ]] && _prune_args="$_prune_args --dry-run"
    bun run "$_ts" prune $_prune_args
    return $?
  fi

  # Bash fallback
  if [[ ! -d "$_AILEDGER_DIR" ]]; then
    echo "[ailedger] No local ledger directory." >&2
    return 0
  fi

  local cutoff_y cutoff_m cutoff
  cutoff_y=$(date -u -d "$months months ago" '+%Y' 2>/dev/null) || cutoff_y=$(date -u '+%Y')
  cutoff_m=$(date -u -d "$months months ago" '+%m' 2>/dev/null) || cutoff_m=$(date -u '+%m')
  cutoff="${cutoff_y}-${cutoff_m}"

  local count=0
  for f in "$_AILEDGER_DIR"/????-??.jsonl; do
    [[ -f "$f" ]] || continue
    local fname
    fname="$(basename "$f" .jsonl)"
    if [[ "$fname" < "$cutoff" ]]; then
      if [[ $dry_run -eq 1 ]]; then
        echo "[ailedger] Would remove: $(basename "$f") ($(wc -l < "$f") entries)" >&2
      else
        rm "$f"
        echo "[ailedger] Removed: $(basename "$f")" >&2
      fi
      count=$((count + 1))
    fi
  done
  [[ $count -eq 0 ]] && echo "[ailedger] Nothing to prune (all within ${months}-month retention)." >&2
}
