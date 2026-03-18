#!/usr/bin/env bash

################################################################################
# router.sh: Agence Agent/Model Routing Library  v0.1.0
#
# Multi-provider LLM backend for bin/agence and other entry points.
# Providers: Anthropic (Claude), OpenAI, Azure OpenAI, Ollama (local)
#
# Provider auto-detection order:
#   1. AGENCE_LLM_PROVIDER env var  (highest priority)
#   2. ~/.agence/config.yaml  provider: field
#   3. ANTHROPIC_API_KEY present → anthropic
#   4. OPENAI_API_KEY present    → openai
#   5. AZURE_OPENAI_API_KEY present → azure
#   6. Ollama reachable at localhost:11434 → ollama
#   7. Error (no provider available)
#
# Model auto-detection order:
#   1. AGENCE_LLM_MODEL env var
#   2. ~/.agence/config.yaml  model: field
#   3. Provider-specific default (see DEFAULTS below)
#
# Context injection:
#   When ROUTER_INJECT_CODEX=1 (default), system prompt includes:
#     codex/LAWS.md, codex/PRINCIPLES.md, codex/RULES.md
#   Limited by ROUTER_CODEX_MAX_LINES (default 120 lines per file).
#
# Usage (sourced by bin/agence):
#   router_load_config             → detect + export provider/model
#   router_chat "query"            → send query, print response
#   router_plan_action "request"   → return ACTION/CONFIDENCE/STEPS block
#   router_list_providers          → show provider availability
#
# Config file: ~/.agence/config.yaml (see docs/config.yaml.example)
#
# Required external tools: curl, jq
#
# Author: Agence Project
# License: MIT License with Commons Clause
################################################################################

# ============================================================================
# DEFAULTS
# ============================================================================

ROUTER_CONFIG_PATH="${ROUTER_CONFIG_PATH:-${HOME}/.agence/config.yaml}"

# Default models per provider (override via env or config.yaml)
ROUTER_DEFAULT_MODEL_ANTHROPIC="${ROUTER_DEFAULT_MODEL_ANTHROPIC:-claude-sonnet-4-5}"
ROUTER_DEFAULT_MODEL_OPENAI="${ROUTER_DEFAULT_MODEL_OPENAI:-gpt-4o}"
ROUTER_DEFAULT_MODEL_OLLAMA="${ROUTER_DEFAULT_MODEL_OLLAMA:-llama3.2}"
ROUTER_DEFAULT_MODEL_AZURE="${ROUTER_DEFAULT_MODEL_AZURE:-gpt-4o}"

# Context injection controls
ROUTER_INJECT_CODEX="${ROUTER_INJECT_CODEX:-1}"
ROUTER_CODEX_MAX_LINES="${ROUTER_CODEX_MAX_LINES:-120}"   # lines per codex file
ROUTER_MAX_TOKENS="${ROUTER_MAX_TOKENS:-4096}"

# Internal state (prevent duplicate loading)
_ROUTER_LOADED="${_ROUTER_LOADED:-0}"

# ============================================================================
# DEPENDENCY CHECK
# ============================================================================

_router_check_deps() {
  local missing=()
  command -v curl &>/dev/null || missing+=("curl")
  command -v jq   &>/dev/null || missing+=("jq")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[router] ERROR: Missing required tools: ${missing[*]}" >&2
    echo "[router]        Install them and retry." >&2
    return 1
  fi
  return 0
}

# ============================================================================
# CONFIG LOADING
# ============================================================================

# _yaml_get <key> <file>
# Reads a top-level scalar value from a YAML file without a full parser.
# Handles: plain values, single-quoted, double-quoted.
_yaml_get() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 1
  grep -m1 "^${key}:[[:space:]]*" "$file" 2>/dev/null \
    | sed 's/^[^:]*:[[:space:]]*//' \
    | tr -d '"'"'" \
    | xargs 2>/dev/null
}

router_load_config() {
  [[ "$_ROUTER_LOADED" == "1" ]] && return 0

  _router_check_deps || return 1

  local cfg="$ROUTER_CONFIG_PATH"
  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] Loading config: $cfg" >&2

  # ── Provider ──────────────────────────────────────────────────────────────
  if [[ -z "${AGENCE_LLM_PROVIDER:-}" ]]; then
    local _p
    _p=$(_yaml_get "provider" "$cfg" 2>/dev/null || true)
    if   [[ -n "$_p" ]];                              then export AGENCE_LLM_PROVIDER="$_p"
    elif [[ -n "${ANTHROPIC_API_KEY:-}" ]];            then export AGENCE_LLM_PROVIDER="anthropic"
    elif [[ -n "${OPENAI_API_KEY:-}" ]];               then export AGENCE_LLM_PROVIDER="openai"
    elif [[ -n "${AZURE_OPENAI_API_KEY:-}" ]];         then export AGENCE_LLM_PROVIDER="azure"
    elif curl -sf --max-time 1 \
         "${OLLAMA_HOST:-http://localhost:11434}/api/tags" &>/dev/null; then
      export AGENCE_LLM_PROVIDER="ollama"
    else
      echo "[router] ERROR: No LLM provider available." >&2
      echo "[router]        Set AGENCE_LLM_PROVIDER=anthropic|openai|azure|ollama" >&2
      echo "[router]        Or configure: $cfg" >&2
      return 1
    fi
  fi

  # ── Model ──────────────────────────────────────────────────────────────────
  if [[ -z "${AGENCE_LLM_MODEL:-}" ]]; then
    local _m
    _m=$(_yaml_get "model" "$cfg" 2>/dev/null || true)
    if [[ -n "$_m" ]]; then
      export AGENCE_LLM_MODEL="$_m"
    else
      case "$AGENCE_LLM_PROVIDER" in
        anthropic) export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_ANTHROPIC" ;;
        openai)    export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_OPENAI"    ;;
        azure)     export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_AZURE"     ;;
        ollama)    export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_OLLAMA"    ;;
      esac
    fi
  fi

  # ── Azure-specific ─────────────────────────────────────────────────────────
  if [[ "$AGENCE_LLM_PROVIDER" == "azure" ]]; then
    [[ -z "${AZURE_OPENAI_ENDPOINT:-}" ]] && {
      local _e; _e=$(_yaml_get "azure_endpoint" "$cfg" 2>/dev/null || true)
      [[ -n "$_e" ]] && export AZURE_OPENAI_ENDPOINT="$_e"
    }
    [[ -z "${AZURE_OPENAI_DEPLOYMENT:-}" ]] && {
      local _d; _d=$(_yaml_get "azure_deployment" "$cfg" 2>/dev/null || true)
      export AZURE_OPENAI_DEPLOYMENT="${_d:-$AGENCE_LLM_MODEL}"
    }
    [[ -z "${AZURE_OPENAI_API_VERSION:-}" ]] && {
      local _av; _av=$(_yaml_get "azure_api_version" "$cfg" 2>/dev/null || true)
      export AZURE_OPENAI_API_VERSION="${_av:-2024-02-01}"
    }
    if [[ -z "${AZURE_OPENAI_ENDPOINT:-}" || -z "${AZURE_OPENAI_API_KEY:-}" ]]; then
      echo "[router] ERROR: Azure provider requires AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY" >&2
      return 1
    fi
  fi

  # ── Ollama host ────────────────────────────────────────────────────────────
  if [[ "$AGENCE_LLM_PROVIDER" == "ollama" && -z "${OLLAMA_HOST:-}" ]]; then
    local _oh; _oh=$(_yaml_get "ollama_host" "$cfg" 2>/dev/null || true)
    export OLLAMA_HOST="${_oh:-http://localhost:11434}"
  fi

  export _ROUTER_LOADED=1
  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] ✓ Provider=${AGENCE_LLM_PROVIDER}  Model=${AGENCE_LLM_MODEL}" >&2
  return 0
}

# ============================================================================
# SYSTEM PROMPT / CONTEXT INJECTION
# ============================================================================

router_build_system_prompt() {
  local ai_root="${AI_ROOT:-${AGENCE_ROOT:-$(dirname "$(dirname "${BASH_SOURCE[0]}")")}}"
  local git_root="${GIT_ROOT:-$(pwd)}"
  local codex_dir="$ai_root/codex"

  local prompt
  prompt="You are an expert AI software engineering assistant embedded in Agence — an agentic engineering collaboration environment.

EXECUTION CONTEXT:
  Agence root : $ai_root
  Git repo    : $git_root
  Shell       : ${AGENCE_SHELL_ENV:-posix}
  Provider    : ${AGENCE_LLM_PROVIDER:-unknown}
  Model       : ${AGENCE_LLM_MODEL:-unknown}

"

  # Inject codex context (capped at ROUTER_CODEX_MAX_LINES per file)
  if [[ "${ROUTER_INJECT_CODEX:-1}" == "1" ]]; then
    local _lim="${ROUTER_CODEX_MAX_LINES:-120}"

    _inject_codex_file() {
      local label="$1" file="$2"
      [[ -f "$file" ]] || return 0
      prompt+="## ${label}
$(head -n "$_lim" "$file")

"
    }

    _inject_codex_file "Agence Laws (hard constraints — always obey)"  "$codex_dir/LAWS.md"
    _inject_codex_file "Agence Principles (philosophical maxims)"       "$codex_dir/PRINCIPLES.md"
    _inject_codex_file "Agence Rules (best practices)"                  "$codex_dir/RULES.md"
  fi

  prompt+="Respond clearly and concisely. Obey the Laws above without exception. Apply Principles and Rules where relevant."

  echo "$prompt"
}

# ============================================================================
# PROVIDER BACKEND: ANTHROPIC (Claude)
# ============================================================================

router_call_anthropic() {
  local system_prompt="$1"
  local user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_ANTHROPIC}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"

  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "[router] ERROR: ANTHROPIC_API_KEY not set" >&2
    return 1
  fi

  local payload
  payload=$(jq -n \
    --arg     model      "$model" \
    --argjson max_tokens "$max_tokens" \
    --arg     system     "$system_prompt" \
    --arg     content    "$user_message" \
    '{
      model:      $model,
      max_tokens: $max_tokens,
      system:     $system,
      messages:   [{ role: "user", content: $content }]
    }') || { echo "[router] ERROR: Failed to build Anthropic payload (jq error)" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] → Anthropic  model=$model  max_tokens=$max_tokens" >&2

  local response http_code
  response=$(curl -sf --max-time 120 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "https://api.anthropic.com/v1/messages" \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$payload" 2>&1) || {
      echo "[router] ERROR: Anthropic API call failed (curl error)" >&2
      return 1
    }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Anthropic API returned HTTP $http_code" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    # Surface API error message if present
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.content[0].text // empty' 2>/dev/null)
  if [[ -z "$text" ]]; then
    echo "[router] ERROR: Empty response from Anthropic" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi
  echo "$text"
}

# ============================================================================
# PROVIDER BACKEND: OPENAI
# ============================================================================

router_call_openai() {
  local system_prompt="$1"
  local user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_OPENAI}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"

  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "[router] ERROR: OPENAI_API_KEY not set" >&2
    return 1
  fi

  local payload
  payload=$(jq -n \
    --arg     model      "$model" \
    --argjson max_tokens "$max_tokens" \
    --arg     system     "$system_prompt" \
    --arg     content    "$user_message" \
    '{
      model:      $model,
      max_tokens: $max_tokens,
      messages: [
        { role: "system", content: $system  },
        { role: "user",   content: $content }
      ]
    }') || { echo "[router] ERROR: Failed to build OpenAI payload (jq error)" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] → OpenAI  model=$model  max_tokens=$max_tokens" >&2

  local response http_code
  response=$(curl -sf --max-time 120 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "https://api.openai.com/v1/chat/completions" \
    -H "Authorization: Bearer ${OPENAI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || {
      echo "[router] ERROR: OpenAI API call failed (curl error)" >&2
      return 1
    }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: OpenAI API returned HTTP $http_code" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
  if [[ -z "$text" ]]; then
    echo "[router] ERROR: Empty response from OpenAI" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi
  echo "$text"
}

# ============================================================================
# PROVIDER BACKEND: AZURE OPENAI
# ============================================================================

router_call_azure() {
  local system_prompt="$1"
  local user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_AZURE}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"

  local endpoint="${AZURE_OPENAI_ENDPOINT:-}"
  local deployment="${AZURE_OPENAI_DEPLOYMENT:-$model}"
  local api_key="${AZURE_OPENAI_API_KEY:-}"
  local api_version="${AZURE_OPENAI_API_VERSION:-2024-02-01}"

  if [[ -z "$endpoint" ]]; then
    echo "[router] ERROR: AZURE_OPENAI_ENDPOINT not set" >&2; return 1
  fi
  if [[ -z "$api_key" ]]; then
    echo "[router] ERROR: AZURE_OPENAI_API_KEY not set" >&2; return 1
  fi

  local url="${endpoint%/}/openai/deployments/${deployment}/chat/completions?api-version=${api_version}"

  local payload
  payload=$(jq -n \
    --argjson max_tokens "$max_tokens" \
    --arg     system     "$system_prompt" \
    --arg     content    "$user_message" \
    '{
      max_tokens: $max_tokens,
      messages: [
        { role: "system", content: $system  },
        { role: "user",   content: $content }
      ]
    }') || { echo "[router] ERROR: Failed to build Azure payload (jq error)" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] → Azure OpenAI  deployment=$deployment  api_version=$api_version" >&2

  local response http_code
  response=$(curl -sf --max-time 120 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "$url" \
    -H "api-key: ${api_key}" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || {
      echo "[router] ERROR: Azure OpenAI API call failed (curl error)" >&2
      return 1
    }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Azure OpenAI API returned HTTP $http_code" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
  if [[ -z "$text" ]]; then
    echo "[router] ERROR: Empty response from Azure OpenAI" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi
  echo "$text"
}

# ============================================================================
# PROVIDER BACKEND: OLLAMA (local)
# ============================================================================

router_call_ollama() {
  local system_prompt="$1"
  local user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_OLLAMA}}"
  local host="${OLLAMA_HOST:-http://localhost:11434}"

  local payload
  payload=$(jq -n \
    --arg model   "$model" \
    --arg system  "$system_prompt" \
    --arg content "$user_message" \
    '{
      model:  $model,
      stream: false,
      messages: [
        { role: "system", content: $system  },
        { role: "user",   content: $content }
      ]
    }') || { echo "[router] ERROR: Failed to build Ollama payload (jq error)" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] → Ollama  host=$host  model=$model" >&2

  local response http_code
  response=$(curl -sf --max-time 300 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "${host}/api/chat" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || {
      echo "[router] ERROR: Ollama API call failed — is ollama running at $host?" >&2
      return 1
    }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Ollama returned HTTP $http_code" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.message.content // empty' 2>/dev/null)
  if [[ -z "$text" ]]; then
    echo "[router] ERROR: Empty response from Ollama" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi
  echo "$text"
}

# ============================================================================
# MAIN DISPATCH: router_chat
# Sends a query to the configured provider, returns response text on stdout.
# ============================================================================

router_chat() {
  local query="${1:-}"

  [[ -z "$query" ]] && { echo "[router] ERROR: No query provided" >&2; return 1; }

  router_load_config || return 1

  local system_prompt
  system_prompt=$(router_build_system_prompt)

  case "${AGENCE_LLM_PROVIDER}" in
    anthropic) router_call_anthropic "$system_prompt" "$query" ;;
    openai)    router_call_openai    "$system_prompt" "$query" ;;
    azure)     router_call_azure     "$system_prompt" "$query" ;;
    ollama)    router_call_ollama    "$system_prompt" "$query" ;;
    *)
      echo "[router] ERROR: Unknown provider '${AGENCE_LLM_PROVIDER}'" >&2
      echo "[router]        Set AGENCE_LLM_PROVIDER=anthropic|openai|azure|ollama" >&2
      return 1
      ;;
  esac
}

# ============================================================================
# PLANNING DISPATCH: router_plan_action
# Returns structured ACTION/CONFIDENCE/STEPS/REASON block for mode_ai_routed.
# ============================================================================

router_plan_action() {
  local request="${1:-}"

  [[ -z "$request" ]] && { echo "[router] ERROR: No request provided" >&2; return 1; }

  router_load_config || return 1

  local system_prompt
  system_prompt=$(router_build_system_prompt)
  system_prompt+="

PLANNING MODE INSTRUCTIONS:
Analyze the user request and respond ONLY with the following structured format.
Do NOT add any other text before or after this block.

ACTION: <one of: git | terraform | cloud | code | chat>
CONFIDENCE: <float 0.0-1.0>
STEPS:
- <step 1>
- <step 2>
REASON: <one-line justification>

Action type definitions:
  git       → git/GitHub operations (commit, PR, branch, etc.)
  terraform → infrastructure-as-code operations
  cloud     → AWS / Azure / GCP cloud API operations
  code      → write, edit, refactor, or review code/files
  chat      → general analysis, question, advice, or explanation"

  local raw_plan
  raw_plan=$(case "${AGENCE_LLM_PROVIDER}" in
    anthropic) router_call_anthropic "$system_prompt" "$request" ;;
    openai)    router_call_openai    "$system_prompt" "$request" ;;
    azure)     router_call_azure     "$system_prompt" "$request" ;;
    ollama)    router_call_ollama    "$system_prompt" "$request" ;;
    *)
      # Safe default when no provider configured
      printf "ACTION: chat\nCONFIDENCE: 0.90\nSTEPS:\n- %s\nREASON: No LLM provider configured\n" "$request"
      ;;
  esac) || {
    # Return safe defaults on LLM error so callers don't crash
    printf "ACTION: chat\nCONFIDENCE: 0.50\nSTEPS:\n- %s\nREASON: LLM call failed\n" "$request"
    return 0
  }

  echo "$raw_plan"
}

# ============================================================================
# UTILITY: router_list_providers
# Shows which providers are currently available/configured.
# ============================================================================

router_list_providers() {
  router_load_config 2>/dev/null || true   # best-effort

  echo "LLM Provider Status:"
  echo "  Active: ${AGENCE_LLM_PROVIDER:-none}  Model: ${AGENCE_LLM_MODEL:-none}"
  echo ""
  printf "  %-14s %s\n" "anthropic" \
    "${ANTHROPIC_API_KEY:+✅ ANTHROPIC_API_KEY set}${ANTHROPIC_API_KEY:-❌ ANTHROPIC_API_KEY not set}"
  printf "  %-14s %s\n" "openai" \
    "${OPENAI_API_KEY:+✅ OPENAI_API_KEY set}${OPENAI_API_KEY:-❌ OPENAI_API_KEY not set}"
  printf "  %-14s %s\n" "azure" \
    "${AZURE_OPENAI_API_KEY:+✅ AZURE_OPENAI_API_KEY set}${AZURE_OPENAI_API_KEY:-❌ AZURE_OPENAI_API_KEY not set}"
  if curl -sf --max-time 1 "${OLLAMA_HOST:-http://localhost:11434}/api/tags" &>/dev/null; then
    local _models
    _models=$(curl -sf --max-time 2 "${OLLAMA_HOST:-http://localhost:11434}/api/tags" \
      | jq -r '[.models[].name] | join(", ")' 2>/dev/null || echo "?")
    printf "  %-14s ✅ running  models: %s\n" "ollama" "$_models"
  else
    printf "  %-14s ❌ not running at %s\n" "ollama" "${OLLAMA_HOST:-http://localhost:11434}"
  fi
}
