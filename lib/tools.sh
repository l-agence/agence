#!/usr/bin/env bash
# lib/tools.sh — Tool launcher (!aider, !claude etc.), route parser, model resolver,
#               agent registry lookup, mode_system dispatch.
# Sourced by bin/agence.
[[ -n "${_AGENCE_TOOLS_LOADED:-}" ]] && return 0
_AGENCE_TOOLS_LOADED=1

# ============================================================================
# MODE: SYSTEM COMMAND
# ============================================================================
# Built-in system utilities
# Example: agence !help
# Example: agence !bash (open new shell)

# ============================================================================
# TOOL LAUNCHER — !aider, !claude, !pilot
# ============================================================================
# Checks installation, sets env, execs the tool directly.
# Data-driven from codex/agents/registry.json — reads type, binary, flags.
# Usage: launch_tool <tool> [extra-args...]

_AGENT_REGISTRY="${AGENCE_ROOT}/codex/agents/registry.json"

# ── Unified Route Parser ───────────────────────────────────────────────────
# EBNF: target ('.' qualifier)*
# Normalizes @ → . inside qualifiers, splits base + tier + model string.
# Sets: _ROUTE_BASE, _ROUTE_TIER, _ROUTE_QUALS, AGENCE_LLM_MODEL (if tier found)
#
# Examples:
#   aider.opus       → base=aider  tier=opus   model=claude-opus-4-5
#   ralph.haiku.3.5  → base=ralph  tier=haiku  model=claude-haiku-3-5
#   aider@opus       → base=aider  tier=opus   model=claude-opus-4-5
#   peers.light      → base=peers  tier=light  (flavor, not model)
#   bash             → base=bash   tier=""     (no override)

_parse_route() {
  local input="$1"
  # Normalize: treat @ as . inside route qualifiers
  input="${input//@/.}"
  _ROUTE_BASE="${input%%.*}"
  _ROUTE_QUALS="${input#"$_ROUTE_BASE"}"
  _ROUTE_QUALS="${_ROUTE_QUALS#.}"  # strip leading dot
  _ROUTE_TIER="${_ROUTE_QUALS%%.*}" # first qualifier segment

  # Resolve tier → full model name (via registry or known aliases)
  if [[ -n "$_ROUTE_TIER" ]]; then
    local _resolved=""
    _resolved=$(_resolve_model_alias "$_ROUTE_TIER")
    if [[ -n "$_resolved" ]]; then
      export AGENCE_LLM_MODEL="${AGENCE_MODEL:-$_resolved}"
      echo "[agence] Model override: AGENCE_LLM_MODEL=$AGENCE_LLM_MODEL" >&2
    fi
  elif [[ -n "${AGENCE_MODEL:-}" ]]; then
    export AGENCE_LLM_MODEL="$AGENCE_MODEL"
    echo "[agence] Model override: AGENCE_LLM_MODEL=$AGENCE_LLM_MODEL" >&2
  fi
}

# Resolve short model alias → full model string
# Reads from registry.json .models map, falls back to hardcoded essentials.
_resolve_model_alias() {
  local alias="$1"
  # Try registry.json (fast jq or python3 lookup)
  if [[ -f "$_AGENT_REGISTRY" ]]; then
    local _reg_model=""
    if command -v python3 &>/dev/null; then
      _reg_model=$(python3 -c "
import json,sys
r=json.load(open('$_AGENT_REGISTRY'))
a='$alias'
print(r.get('models',{}).get(a,''))
" 2>/dev/null)
    fi
    if [[ -n "$_reg_model" ]]; then
      echo "$_reg_model"
      return 0
    fi
  fi
  # Hardcoded fallback (always works, even without registry)
  case "$alias" in
    opus)    echo "claude-opus-4-5" ;;
    sonnet)  echo "claude-sonnet-4-5" ;;
    haiku)   echo "claude-haiku-3-5" ;;
    gpt4)    echo "gpt-4-turbo" ;;
    gpt4o)   echo "gpt-4o" ;;
    mini)    echo "gpt-4o-mini" ;;
    gemini)  echo "gemini-2-pro" ;;
    flash)   echo "gemini-2-flash" ;;
    *)       echo "" ;;  # unknown alias — not a model name
  esac
}

# ── Registry Lookup ────────────────────────────────────────────────────────
# Read a field from an agent's registry entry.
# Usage: _reg_lookup <agent> <field>  → prints value or ""
_reg_lookup() {
  local agent="$1" field="$2"
  [[ -f "$_AGENT_REGISTRY" ]] || return 1
  python3 -c "
import json
r=json.load(open('$_AGENT_REGISTRY'))
a=r.get('agents',{}).get('$agent',{})
v=a.get('$field','')
if isinstance(v,list): print(v[0])
elif v is None: print('')
else: print(v)
" 2>/dev/null
}

# ── Data-Driven Tool Launcher ─────────────────────────────────────────────
# Replaces hardcoded case blocks. Reads binary, flags, model_flag from registry.

launch_tool() {
  local tool="$1"; shift
  local extra_args="$*"

  local binary install_cmd launch_flags model_flag description
  binary=$(_reg_lookup "$tool" "binary")
  install_cmd=$(_reg_lookup "$tool" "install")
  launch_flags=$(_reg_lookup "$tool" "launch_flags")
  model_flag=$(_reg_lookup "$tool" "model_flag")
  description=$(_reg_lookup "$tool" "description")

  [[ -z "$binary" ]] && binary="$tool"

  # Check installation
  if ! command -v "$binary" &>/dev/null; then
    # Fallback: check fallback_cmd (e.g. pilot → gh copilot)
    local fallback
    fallback=$(_reg_lookup "$tool" "fallback_cmd")
    if [[ -n "$fallback" ]]; then
      local fb_bin="${fallback%% *}"
      if command -v "$fb_bin" &>/dev/null; then
        binary="$fb_bin"
        launch_flags="${fallback#"$fb_bin"} $launch_flags"
        launch_flags="${launch_flags# }"
      else
        echo "✗ $tool not installed." >&2
        [[ -n "$install_cmd" ]] && echo "  Install: $install_cmd" >&2
        return 1
      fi
    else
      echo "✗ $tool not installed." >&2
      [[ -n "$install_cmd" ]] && echo "  Install: $install_cmd" >&2
      return 1
    fi
  fi

  echo "[agence] Launching ${tool}${description:+ — $description}"
  export AI_AGENT="$tool"
  ailedger_append "launch" "tool-${tool}" ""

  # Build model argument if qualifier was set and tool accepts --model
  local model_args=""
  if [[ -n "${AGENCE_LLM_MODEL:-}" && -n "$model_flag" ]]; then
    model_args="$model_flag $AGENCE_LLM_MODEL"
  fi

  exec $binary $launch_flags $model_args $extra_args
}

mode_system() {
  local sys_cmd="$1"

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] System mode: $sys_cmd" >&2

  # ── Unified route parsing ────────────────────────────────────────────────
  # EBNF: target ('.' qualifier)*  — @ normalised to . inside qualifiers
  # !aider.opus  !ralph@haiku  !peers.light  !bash  !aider@opus.3.5
  _parse_route "$sys_cmd"
  sys_cmd="$_ROUTE_BASE"

  # Trace mode: print routing decision without launching (for testing/CI)
  if [[ "${AGENCE_TRACE:-0}" == "1" ]]; then
    echo "[mode_system] base=${sys_cmd} tier=${_ROUTE_TIER:-@} quals=${_ROUTE_QUALS:-@} model=${AGENCE_LLM_MODEL:-default}"
    return 0
  fi

  case "$sys_cmd" in
    help)
      show_help
      return 0
      ;;
    version)
      show_version
      return 0
      ;;
    config)
      cat "$AGENCE_CONFIG" 2>/dev/null || echo "No config found: $AGENCE_CONFIG"
      return 0
      ;;
    status)
      echo "Agence Status:"
      echo "  Root: $AGENCE_ROOT"
      echo "  Config: $AGENCE_CONFIG"
      echo "  LLM Provider: $(grep 'provider:' "$AGENCE_CONFIG" 2>/dev/null | awk '{print $2}')"
      return 0
      ;;
    bash)
      shell_bash_session
      ;;
    shell)
      shell_powershell_session
      ;;
    # Swarm launcher — tmux 1+1 sessions
    swarm)
      "${AGENCE_BIN}/swarm" launch "${@:2}"
      ;;
    *)
      # ── Registry-driven dispatch ──────────────────────────────────────────
      # Look up agent type from registry: tool → launch_tool, persona → aibash,
      # ensemble → peers consensus, unknown → fallback to PATH check.
      local _agent_type=""
      _agent_type=$(_reg_lookup "$sys_cmd" "type" 2>/dev/null)

      case "$_agent_type" in
        tool)
          launch_tool "$sys_cmd" "${@:2}"
          ;;
        persona)
          local agent_name="$sys_cmd"
          export AI_AGENT="$agent_name" AGENCE_AGENT_PARAM="$agent_name"
          echo "[agence] Launching agent: @${agent_name}"
          ailedger_append "route" "persona-${agent_name}" ""
          shell_bash_session
          ;;
        ensemble)
          local agent_name="$sys_cmd"
          export AI_AGENT="$agent_name" AGENCE_AGENT_PARAM="$agent_name"
          local _flavor="${_ROUTE_TIER:-$(_reg_lookup "$sys_cmd" "default_flavor" 2>/dev/null)}"
          _flavor="${_flavor:-code}"
          echo "[agence] Launching ensemble: @${agent_name} (flavor: $_flavor)"
          ailedger_append "route" "ensemble-${agent_name}-${_flavor}" ""
          export AGENCE_PEERS_FLAVOR="$_flavor"
          shell_bash_session
          ;;
        "")
          # Not in registry — try as a direct system command (pass-through)
          if command -v "$sys_cmd" &>/dev/null; then
            shift
            "$sys_cmd" "$@"
          else
            echo "Unknown system command: $sys_cmd" >&2
            echo "  Known agents: $(python3 -c "
import json
r=json.load(open('$_AGENT_REGISTRY'))
print(' '.join(sorted(r.get('agents',{}).keys())))
" 2>/dev/null || echo '(registry unavailable)')" >&2
            return 1
          fi
          ;;
      esac
      ;;
  esac
}

# ============================================================================
# SESSION: SAVE (^save)
# ============================================================================
# Capture current runstate to nexus/.aisaves/
# Richer than simple session — includes git state, lessons count, dirty files
# Usage: agence ^save [notes]

