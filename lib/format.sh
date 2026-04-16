#!/usr/bin/env bash
# lib/format.sh — Agence terminal output formatting helpers
# Sourced by bin/agence via source_if_exists "$AGENCE_LIB/format.sh"
# All agence_format_* functions respect _AGENCE_FMT (text|plain|json)

# Global: _AGENCE_FMT — text (TTY, decorations), plain (pipe/redirect), json (-j flag)
: "${_AGENCE_FMT:=}"

# -- Format detection ----------------------------------------------------------

# agence_detect_format
# Sets _AGENCE_FMT if not already set (e.g. by -j flag in mode_init).
# text  = interactive TTY with ANSI decorations
# plain = non-interactive (pipe/redirect/CI) — no escape codes
# json  = machine-readable JSON, set explicitly via -j
agence_detect_format() {
  [[ -n "$_AGENCE_FMT" ]] && return   # already set; honour the caller
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    _AGENCE_FMT="text"
  else
    _AGENCE_FMT="plain"
  fi
}

# -- Section chrome ------------------------------------------------------------

# agence_format_header "TITLE"
# Prints a bold section header. Silent in json mode.
agence_format_header() {
  local title="$1"
  case "$_AGENCE_FMT" in
    text)  printf '\033[1;36m━━━ %s ━━━\033[0m\n' "$title" ;;
    plain) printf '=== %s ===\n' "$title" ;;
    json)  ;;   # json callers emit their own structure
  esac
}

# agence_format_footer "TITLE"
# Prints a success footer. Silent in json mode.
agence_format_footer() {
  local title="$1"
  case "$_AGENCE_FMT" in
    text)  printf '%s\n' $'\033[1;32m'"✔ $title"$'\033[0m' ;;
    plain) printf '%s\n' "--- $title ---" ;;
    json)  ;;
  esac
}

# -- Key-value & steps ---------------------------------------------------------

# agence_format_kv "key" "value"
# Prints a dim-labelled key: value pair. Silent in json mode.
agence_format_kv() {
  local key="$1" val="$2"
  case "$_AGENCE_FMT" in
    text)  printf '  \033[2m%-14s\033[0m %s\n' "${key}:" "$val" ;;
    plain) printf '  %-14s %s\n' "${key}:" "$val" ;;
    json)  ;;
  esac
}

# agence_format_step "N/M" "description"
# Prints a numbered step. Silent in json mode.
agence_format_step() {
  local step="$1" desc="$2"
  case "$_AGENCE_FMT" in
    text)  printf '\033[1m  [%s]\033[0m %s\n' "$step" "$desc" ;;
    plain) printf '  [%s] %s\n' "$step" "$desc" ;;
    json)  ;;
  esac
}

# agence_format_detail "text"
# Prints an indented dim detail line. Silent in json mode.
agence_format_detail() {
  local text="$1"
  case "$_AGENCE_FMT" in
    text)  printf '        \033[2m%s\033[0m\n' "$text" ;;
    plain) printf '        %s\n' "$text" ;;
    json)  ;;
  esac
}

# -- List items ----------------------------------------------------------------

# agence_format_list_item "label" "id" "metadata"
# metadata: pipe-separated key=value pairs, e.g. "From=agent|At=2026-03-29"
# Silent in json mode.
agence_format_list_item() {
  local label="$1" id="$2" meta="${3:-}"
  case "$_AGENCE_FMT" in
    text)
      printf '  \033[1m• %s\033[0m \033[2m(%s)\033[0m\n' "$label" "$id"
      if [[ -n "$meta" ]]; then
        local IFS='|'
        for pair in $meta; do
          printf '      \033[2m%s\033[0m\n' "$pair"
        done
      fi
      ;;
    plain)
      printf '  • %s (%s)\n' "$label" "$id"
      if [[ -n "$meta" ]]; then
        local IFS='|'
        for pair in $meta; do
          printf '      %s\n' "$pair"
        done
      fi
      ;;
    json) ;;
  esac
}

# -- JSON output ---------------------------------------------------------------

# agence_format_json "json_string"
# Pretty-prints JSON if jq is available, otherwise raw.
# Intended as the sole output path when _AGENCE_FMT=json.
agence_format_json() {
  local json="$1"
  if command -v jq &>/dev/null; then
    printf '%s\n' "$json" | jq .
  else
    printf '%s\n' "$json"
  fi
}

# -- YAML output ---------------------------------------------------------------

# agence_format_yaml "json_string"
# Converts JSON to YAML via yq, falls back to JSON if yq unavailable.
agence_format_yaml() {
  local json="$1"
  if command -v yq &>/dev/null; then
    printf '%s\n' "$json" | yq -P .
  elif command -v python3 &>/dev/null; then
    printf '%s\n' "$json" | python3 -c 'import sys,json,yaml; yaml.dump(json.load(sys.stdin),sys.stdout,default_flow_style=False)' 2>/dev/null || printf '%s\n' "$json"
  else
    echo "# yq not installed — showing JSON" >&2
    agence_format_json "$json"
  fi
}

# -- Table output ---------------------------------------------------------------

# agence_format_table "json_array" "col1,col2,col3" [widths]
# Renders a JSON array of objects as a fixed-width text table.
# Columns are comma-separated field names. Widths are optional comma-separated ints.
agence_format_table() {
  local json="$1"
  local cols="$2"
  local widths="${3:-}"

  if ! command -v jq &>/dev/null; then
    echo "(jq required for table output)" >&2
    printf '%s\n' "$json"
    return
  fi

  # Build header + separator
  IFS=',' read -ra _cols <<< "$cols"
  IFS=',' read -ra _widths <<< "$widths"
  local header="" sep=""
  for i in "${!_cols[@]}"; do
    local w="${_widths[$i]:-20}"
    local col="${_cols[$i]}"
    local upper; upper=$(echo "$col" | tr '[:lower:]' '[:upper:]')
    header+="$(printf "%-${w}s " "$upper")"
    sep+="$(printf '%-*s ' "$w" '' | tr ' ' '-')"
  done

  case "$_AGENCE_FMT" in
    text)  printf '\033[1m%s\033[0m\n' "$header" ;;
    *)     printf '%s\n' "$header" ;;
  esac
  printf '%s\n' "$sep"

  # Build jq expression for each row
  local jq_expr='(.[] | ['
  for i in "${!_cols[@]}"; do
    [[ $i -gt 0 ]] && jq_expr+=','
    jq_expr+="(.${_cols[$i]} // \"\")"
  done
  jq_expr+='] | @tsv)'

  printf '%s\n' "$json" | jq -r "$jq_expr" | while IFS=$'\t' read -r -a vals; do
    local row=""
    for i in "${!_cols[@]}"; do
      local w="${_widths[$i]:-20}"
      row+="$(printf "%-${w}s " "${vals[$i]:-}")"
    done
    printf '%s\n' "$row"
  done
}

# -- Format flag parser --------------------------------------------------------

# agence_parse_format_flags args...
# Extracts -j/--json, -y/--yaml, -t/--table from args.
# Sets _AGENCE_FMT and prints remaining args (with flags stripped).
agence_parse_format_flags() {
  local remaining=()
  for arg in "$@"; do
    case "$arg" in
      -j|--json)  _AGENCE_FMT="json" ;;
      -y|--yaml)  _AGENCE_FMT="yaml" ;;
      -t|--table) _AGENCE_FMT="table" ;;
      *)          remaining+=("$arg") ;;
    esac
  done
  echo "${remaining[*]}"
}
