#!/usr/bin/env bash

################################################################################
# router.sh: Agence Agent/Model Routing Library  v0.3.0
#
# Multi-provider LLM backend for bin/agence and other entry points.
#
# Providers supported:
#   Direct APIs (custom format):
#     anthropic   — Claude (api.anthropic.com)
#     gemini      — Google Gemini (generativelanguage.googleapis.com)
#     ollama      — Local Ollama (localhost:11434)
#     azure       — Azure OpenAI (your-resource.openai.azure.com)
#
#   OpenAI-compatible (shared helper, different base URL + key):
#     openai      — OpenAI GPT (api.openai.com)
#     mistral     — Mistral AI / Codestral (api.mistral.ai)
#     copilot     — GitHub Copilot (api.githubcopilot.com)
#     grok        — xAI Grok (api.x.ai)
#     qwen        — Alibaba Qwen (dashscope.aliyuncs.com)
#     groq        — Groq Cloud (api.groq.com)
#     openrouter  — OpenRouter aggregator (openrouter.ai)
#     cline       — Cline AI (meta-alias → CLINE_API_KEY or ANTHROPIC_API_KEY)
#
# Provider auto-detection order:
#   1. AGENCE_LLM_PROVIDER env var  (highest priority)
#   2. ~/.agence/config.yaml  provider: field
#   3. ANTHROPIC_API_KEY      → anthropic
#   4. OPENAI_API_KEY         → openai
#   5. AZURE_OPENAI_API_KEY   → azure
#   6. GEMINI_API_KEY         → gemini
#   7. MISTRAL_API_KEY        → mistral
#   8. GROQ_API_KEY           → groq
#   9. OPENROUTER_API_KEY     → openrouter
#  10. GROK_API_KEY           → grok
#  11. DASHSCOPE_API_KEY      → qwen
#  12. GITHUB_TOKEN           → copilot
#  13. Ollama running         → ollama
#  14. Error
#
# Key environment variables:
#   AGENCE_LLM_PROVIDER   — provider name
#   AGENCE_LLM_MODEL      — model name
#   ANTHROPIC_API_KEY     — Anthropic Claude
#   OPENAI_API_KEY        — OpenAI GPT
#   AZURE_OPENAI_API_KEY  — Azure OpenAI
#   AZURE_OPENAI_ENDPOINT — Azure endpoint URL
#   GEMINI_API_KEY        — Google Gemini
#   MISTRAL_API_KEY       — Mistral / Codestral
#   GROK_API_KEY          — xAI Grok
#   DASHSCOPE_API_KEY     — Alibaba Qwen
#   GROQ_API_KEY          — Groq Cloud
#   OPENROUTER_API_KEY    — OpenRouter
#   GITHUB_TOKEN          — GitHub Copilot
#   CLINE_API_KEY         — Cline (falls back to ANTHROPIC_API_KEY)
#   OLLAMA_HOST           — Ollama host (default http://localhost:11434)
#
# Usage (sourced by bin/agence):
#   router_load_config             → detect + export provider/model
#   router_chat "query"            → send query, print response on stdout
#   router_plan_action "request"   → return ACTION/CONFIDENCE/STEPS block
#   router_list_providers          → show provider availability table
#
# Config file: ~/.agence/config.yaml (see docs/config.yaml.example)
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
ROUTER_DEFAULT_MODEL_AZURE="${ROUTER_DEFAULT_MODEL_AZURE:-gpt-4o}"
ROUTER_DEFAULT_MODEL_GEMINI="${ROUTER_DEFAULT_MODEL_GEMINI:-gemini-2.0-flash}"
ROUTER_DEFAULT_MODEL_MISTRAL="${ROUTER_DEFAULT_MODEL_MISTRAL:-codestral-latest}"
ROUTER_DEFAULT_MODEL_GROQ="${ROUTER_DEFAULT_MODEL_GROQ:-llama-3.3-70b-versatile}"
ROUTER_DEFAULT_MODEL_OPENROUTER="${ROUTER_DEFAULT_MODEL_OPENROUTER:-anthropic/claude-3.5-sonnet}"
ROUTER_DEFAULT_MODEL_GROK="${ROUTER_DEFAULT_MODEL_GROK:-grok-3-mini-fast}"
ROUTER_DEFAULT_MODEL_QWEN="${ROUTER_DEFAULT_MODEL_QWEN:-qwen-plus}"
ROUTER_DEFAULT_MODEL_COPILOT="${ROUTER_DEFAULT_MODEL_COPILOT:-auto}"
ROUTER_DEFAULT_MODEL_CLINE="${ROUTER_DEFAULT_MODEL_CLINE:-kwaipilot/kat-coder-latest}"
ROUTER_DEFAULT_MODEL_OLLAMA="${ROUTER_DEFAULT_MODEL_OLLAMA:-llama3.2}"

# Context injection controls
ROUTER_INJECT_CODEX="${ROUTER_INJECT_CODEX:-1}"
ROUTER_CODEX_MAX_LINES="${ROUTER_CODEX_MAX_LINES:-120}"
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

# _yaml_get <key> <file>  — reads a top-level scalar from YAML (no full parser).
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

  # ── Provider ────────────────────────────────────────────────────────────────
  if [[ -z "${AGENCE_LLM_PROVIDER:-}" ]]; then
    local _p; _p=$(_yaml_get "provider" "$cfg" 2>/dev/null || true)
    if   [[ -n "$_p" ]];                              then export AGENCE_LLM_PROVIDER="$_p"
    elif [[ -n "${ANTHROPIC_API_KEY:-}" ]];            then export AGENCE_LLM_PROVIDER="anthropic"
    elif [[ -n "${OPENAI_API_KEY:-}" ]];               then export AGENCE_LLM_PROVIDER="openai"
    elif [[ -n "${AZURE_OPENAI_API_KEY:-}" ]];         then export AGENCE_LLM_PROVIDER="azure"
    elif [[ -n "${GEMINI_API_KEY:-}" ]];               then export AGENCE_LLM_PROVIDER="gemini"
    elif [[ -n "${MISTRAL_API_KEY:-}" ]];              then export AGENCE_LLM_PROVIDER="mistral"
    elif [[ -n "${GROQ_API_KEY:-}" ]];                 then export AGENCE_LLM_PROVIDER="groq"
    elif [[ -n "${OPENROUTER_API_KEY:-}" ]];           then export AGENCE_LLM_PROVIDER="openrouter"
    elif [[ -n "${GROK_API_KEY:-}" ]];                 then export AGENCE_LLM_PROVIDER="grok"
    elif [[ -n "${DASHSCOPE_API_KEY:-}" ]];            then export AGENCE_LLM_PROVIDER="qwen"
    elif [[ -n "${GITHUB_TOKEN:-}" ]];                 then export AGENCE_LLM_PROVIDER="copilot"
    elif curl -sf --max-time 1 \
         "${OLLAMA_HOST:-http://localhost:11434}/api/tags" &>/dev/null; then
      export AGENCE_LLM_PROVIDER="ollama"
    else
      echo "[router] ERROR: No LLM provider available." >&2
      echo "[router]        Supported: anthropic openai azure gemini mistral groq openrouter grok qwen copilot cline ollama" >&2
      echo "[router]        Set AGENCE_LLM_PROVIDER or configure: $cfg" >&2
      return 1
    fi
  fi

  # ── Model ──────────────────────────────────────────────────────────────────
  if [[ -z "${AGENCE_LLM_MODEL:-}" ]]; then
    local _m; _m=$(_yaml_get "model" "$cfg" 2>/dev/null || true)
    if [[ -n "$_m" ]]; then
      export AGENCE_LLM_MODEL="$_m"
    else
      case "$AGENCE_LLM_PROVIDER" in
        anthropic)  export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_ANTHROPIC"  ;;
        openai)     export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_OPENAI"     ;;
        azure)      export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_AZURE"      ;;
        gemini)     export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_GEMINI"     ;;
        mistral)    export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_MISTRAL"    ;;
        groq)       export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_GROQ"       ;;
        openrouter) export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_OPENROUTER" ;;
        grok)       export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_GROK"       ;;
        qwen)       export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_QWEN"       ;;
        copilot)    export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_COPILOT"    ;;
        cline)      export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_CLINE"      ;;
        ollama)     export AGENCE_LLM_MODEL="$ROUTER_DEFAULT_MODEL_OLLAMA"     ;;
      esac
    fi
  fi

  # ── Azure-specific ──────────────────────────────────────────────────────────
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
      echo "[router] ERROR: Azure requires AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY" >&2
      return 1
    fi
  fi

  # ── Cline: resolve underlying key (prefer OpenRouter free tier) ────────────
  if [[ "$AGENCE_LLM_PROVIDER" == "cline" ]]; then
    # Priority: OPENROUTER_API_KEY (free kwaipilot) > CLINE_API_KEY > ANTHROPIC_API_KEY
    if [[ -z "${CLINE_API_KEY:-}" && -n "${ANTHROPIC_API_KEY:-}" ]]; then
      export CLINE_API_KEY="$ANTHROPIC_API_KEY"
    fi
    if [[ -z "${OPENROUTER_API_KEY:-}" && -z "${CLINE_API_KEY:-}" ]]; then
      echo "[router] ERROR: cline: set OPENROUTER_API_KEY (free) or CLINE_API_KEY / ANTHROPIC_API_KEY" >&2
      return 1
    fi
  fi

  # ── Ollama host ─────────────────────────────────────────────────────────────
  if [[ "$AGENCE_LLM_PROVIDER" == "ollama" && -z "${OLLAMA_HOST:-}" ]]; then
    local _oh; _oh=$(_yaml_get "ollama_host" "$cfg" 2>/dev/null || true)
    export OLLAMA_HOST="${_oh:-http://localhost:11434}"
  fi

  export _ROUTER_LOADED=1
  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] Provider=${AGENCE_LLM_PROVIDER}  Model=${AGENCE_LLM_MODEL}" >&2
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
# INTERNAL HELPER: OpenAI-compatible /v1/chat/completions
# Used by: openai, mistral, copilot, grok, qwen, groq, openrouter, cline
# ============================================================================

_router_call_oai_compat() {
  local base_url="$1"          # e.g. https://api.mistral.ai/v1
  local api_key="$2"           # Bearer token
  local system_prompt="$3"
  local user_message="$4"
  local model="$5"
  local max_tokens="${6:-${ROUTER_MAX_TOKENS:-4096}}"
  local extra_header="${7:-}"  # optional e.g. "HTTP-Referer: https://l-agence.org"
  local provider_label="${8:-openai-compat}"

  if [[ -z "$api_key" ]]; then
    echo "[router] ERROR: ${provider_label}: API key not set" >&2
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
    }') || { echo "[router] ERROR: ${provider_label}: jq payload error" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[router] → ${provider_label}  url=${base_url}  model=${model}" >&2

  local curl_args=(-sf --max-time 120
    -w "\n__HTTP_CODE__:%{http_code}"
    -X POST "${base_url}/chat/completions"
    -H "Authorization: Bearer ${api_key}"
    -H "Content-Type: application/json"
  )
  [[ -n "$extra_header" ]] && curl_args+=(-H "$extra_header")
  curl_args+=(-d "$payload")

  local response http_code
  response=$(curl "${curl_args[@]}" 2>&1) || {
    echo "[router] ERROR: ${provider_label}: curl failed" >&2; return 1; }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: ${provider_label} HTTP ${http_code}" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
  if [[ -z "$text" ]]; then
    echo "[router] ERROR: ${provider_label}: empty response" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi
  echo "$text"
}

# ============================================================================
# PROVIDER: ANTHROPIC (Claude) — custom Messages API
# ============================================================================

router_call_anthropic() {
  local system_prompt="$1"
  local user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_ANTHROPIC}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"

  [[ -z "${ANTHROPIC_API_KEY:-}" ]] && { echo "[router] ERROR: ANTHROPIC_API_KEY not set" >&2; return 1; }

  local payload
  payload=$(jq -n \
    --arg     model      "$model" \
    --argjson max_tokens "$max_tokens" \
    --arg     system     "$system_prompt" \
    --arg     content    "$user_message" \
    '{ model: $model, max_tokens: $max_tokens, system: $system,
       messages: [{ role: "user", content: $content }] }') \
    || { echo "[router] ERROR: anthropic: jq error" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] → Anthropic  model=${model}" >&2

  local response http_code
  response=$(curl -sf --max-time 120 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "https://api.anthropic.com/v1/messages" \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$payload" 2>&1) || { echo "[router] ERROR: anthropic: curl failed" >&2; return 1; }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Anthropic HTTP ${http_code}" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.content[0].text // empty' 2>/dev/null)
  [[ -z "$text" ]] && { echo "[router] ERROR: Anthropic: empty response" >&2; return 1; }
  echo "$text"
}

# ============================================================================
# PROVIDER: GEMINI (Google) — custom generateContent REST API
# ============================================================================

router_call_gemini() {
  local system_prompt="$1"
  local user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_GEMINI}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"

  [[ -z "${GEMINI_API_KEY:-}" ]] && { echo "[router] ERROR: GEMINI_API_KEY not set" >&2; return 1; }

  local url="https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}"

  local payload
  payload=$(jq -n \
    --arg     system     "$system_prompt" \
    --arg     content    "$user_message" \
    --argjson max_tokens "$max_tokens" \
    '{
      system_instruction: { parts: [{ text: $system }] },
      contents: [{ role: "user", parts: [{ text: $content }] }],
      generationConfig: { maxOutputTokens: $max_tokens }
    }') || { echo "[router] ERROR: gemini: jq error" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] → Gemini  model=${model}" >&2

  local response http_code
  response=$(curl -sf --max-time 120 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || { echo "[router] ERROR: gemini: curl failed" >&2; return 1; }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Gemini HTTP ${http_code}" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text // empty' 2>/dev/null)
  [[ -z "$text" ]] && { echo "[router] ERROR: Gemini: empty response" >&2; return 1; }
  echo "$text"
}

# ============================================================================
# PROVIDER: AZURE OPENAI — custom deployment endpoint
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

  [[ -z "$endpoint" ]] && { echo "[router] ERROR: AZURE_OPENAI_ENDPOINT not set" >&2; return 1; }
  [[ -z "$api_key"  ]] && { echo "[router] ERROR: AZURE_OPENAI_API_KEY not set" >&2; return 1; }

  local url="${endpoint%/}/openai/deployments/${deployment}/chat/completions?api-version=${api_version}"

  local payload
  payload=$(jq -n \
    --argjson max_tokens "$max_tokens" \
    --arg     system     "$system_prompt" \
    --arg     content    "$user_message" \
    '{ max_tokens: $max_tokens,
       messages: [{ role: "system", content: $system },
                  { role: "user",   content: $content }] }') \
    || { echo "[router] ERROR: azure: jq error" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] → Azure  deployment=${deployment}" >&2

  local response http_code
  response=$(curl -sf --max-time 120 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "$url" \
    -H "api-key: ${api_key}" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || { echo "[router] ERROR: azure: curl failed" >&2; return 1; }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Azure HTTP ${http_code}" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    echo "$response" | jq -r '.error.message // empty' 2>/dev/null >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
  [[ -z "$text" ]] && { echo "[router] ERROR: Azure: empty response" >&2; return 1; }
  echo "$text"
}

# ============================================================================
# PROVIDER: OLLAMA (local) — non-streaming /api/chat
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
    '{ model: $model, stream: false,
       messages: [{ role: "system", content: $system },
                  { role: "user",   content: $content }] }') \
    || { echo "[router] ERROR: ollama: jq error" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] → Ollama  host=${host}  model=${model}" >&2

  local response http_code
  response=$(curl -sf --max-time 300 \
    -w "\n__HTTP_CODE__:%{http_code}" \
    -X POST "${host}/api/chat" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || {
      echo "[router] ERROR: Ollama: curl failed (is ollama running at ${host}?)" >&2; return 1; }

  http_code=$(echo "$response" | grep -o '__HTTP_CODE__:[0-9]*' | cut -d: -f2)
  response=$(echo "$response" | sed 's/__HTTP_CODE__:[0-9]*$//')

  if [[ "$http_code" != "200" ]]; then
    echo "[router] ERROR: Ollama HTTP ${http_code}" >&2
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "$response" >&2
    return 1
  fi

  local text
  text=$(echo "$response" | jq -r '.message.content // empty' 2>/dev/null)
  [[ -z "$text" ]] && { echo "[router] ERROR: Ollama: empty response" >&2; return 1; }
  echo "$text"
}

# ============================================================================
# OPENAI-COMPATIBLE PROVIDER WRAPPERS
# All delegate to _router_call_oai_compat
# ============================================================================

router_call_openai() {
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_OPENAI}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${OPENAI_API_KEY:-}" ]] && { echo "[router] ERROR: OPENAI_API_KEY not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://api.openai.com/v1" "${OPENAI_API_KEY}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" "" "openai"
}

router_call_mistral() {
  # Mistral AI — OpenAI-compatible endpoint.
  # Default model: codestral-latest (code-specialized)
  # Alternatives: mistral-large-latest | mistral-small-latest | open-mistral-nemo
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_MISTRAL}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${MISTRAL_API_KEY:-}" ]] && { echo "[router] ERROR: MISTRAL_API_KEY not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://api.mistral.ai/v1" "${MISTRAL_API_KEY}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" "" "mistral"
}

router_call_groq() {
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_GROQ}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${GROQ_API_KEY:-}" ]] && { echo "[router] ERROR: GROQ_API_KEY not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://api.groq.com/openai/v1" "${GROQ_API_KEY}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" "" "groq"
}

router_call_openrouter() {
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_OPENROUTER}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${OPENROUTER_API_KEY:-}" ]] && { echo "[router] ERROR: OPENROUTER_API_KEY not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://openrouter.ai/api/v1" "${OPENROUTER_API_KEY}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" \
    "HTTP-Referer: https://l-agence.org" "openrouter"
}

router_call_grok() {
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_GROK}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${GROK_API_KEY:-}" ]] && { echo "[router] ERROR: GROK_API_KEY not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://api.x.ai/v1" "${GROK_API_KEY}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" "" "grok"
}

router_call_qwen() {
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_QWEN}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${DASHSCOPE_API_KEY:-}" ]] && { echo "[router] ERROR: DASHSCOPE_API_KEY not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://dashscope.aliyuncs.com/compatible-mode/v1" "${DASHSCOPE_API_KEY}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" "" "qwen"
}

router_call_copilot() {
  # GitHub Copilot — default model is "auto" (server picks best available).
  # Fallback: set AGENCE_LLM_MODEL=gpt-4.1 for explicit control.
  local system_prompt="$1" user_message="$2"
  local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_COPILOT}}"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"
  [[ -z "${GITHUB_TOKEN:-}" ]] && { echo "[router] ERROR: GITHUB_TOKEN not set" >&2; return 1; }
  _router_call_oai_compat \
    "https://api.githubcopilot.com" "${GITHUB_TOKEN}" \
    "$system_prompt" "$user_message" "$model" "$max_tokens" \
    "Editor-Version: agence/0.3" "copilot"
}

router_call_cline() {
  # Cline meta-provider — prefers free-tier models.
  # Route priority:
  #   1. OPENROUTER_API_KEY set → OpenRouter + kwaipilot/kat-coder-latest (free tier)
  #   2. CLINE_API_KEY / ANTHROPIC_API_KEY set → Anthropic claude-3-7-sonnet
  # Override model: export AGENCE_LLM_MODEL=<model>
  local system_prompt="$1" user_message="$2"
  local max_tokens="${4:-${ROUTER_MAX_TOKENS:-4096}}"

  # Prefer OpenRouter with free Kwaipilot model
  if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    local model="${3:-${AGENCE_LLM_MODEL:-$ROUTER_DEFAULT_MODEL_CLINE}}"
    [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] → Cline via OpenRouter  model=${model}" >&2
    _router_call_oai_compat \
      "https://openrouter.ai/api/v1" "${OPENROUTER_API_KEY}" \
      "$system_prompt" "$user_message" "$model" "$max_tokens" \
      "HTTP-Referer: https://l-agence.org" "cline/openrouter"
    return $?
  fi

  # Fallback: Anthropic API
  local model="${3:-${AGENCE_LLM_MODEL:-claude-3-7-sonnet-20250219}}"
  local key="${CLINE_API_KEY:-${ANTHROPIC_API_KEY:-}}"
  [[ -z "$key" ]] && { echo "[router] ERROR: cline: set OPENROUTER_API_KEY (free) or CLINE_API_KEY / ANTHROPIC_API_KEY" >&2; return 1; }

  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && echo "[router] → Cline via Anthropic  model=${model}" >&2
  local saved_key="${ANTHROPIC_API_KEY:-}"
  export ANTHROPIC_API_KEY="$key"
  router_call_anthropic "$system_prompt" "$user_message" "$model" "$max_tokens"
  local rc=$?
  export ANTHROPIC_API_KEY="$saved_key"
  return $rc
}

# ============================================================================
# MAIN DISPATCH: router_chat
# ============================================================================

router_chat() {
  local query="${1:-}"
  [[ -z "$query" ]] && { echo "[router] ERROR: No query provided" >&2; return 1; }

  router_load_config || return 1

  local system_prompt
  system_prompt=$(router_build_system_prompt)

  case "${AGENCE_LLM_PROVIDER}" in
    anthropic)  router_call_anthropic  "$system_prompt" "$query" ;;
    openai)     router_call_openai     "$system_prompt" "$query" ;;
    azure)      router_call_azure      "$system_prompt" "$query" ;;
    gemini)     router_call_gemini     "$system_prompt" "$query" ;;
    mistral)    router_call_mistral    "$system_prompt" "$query" ;;
    groq)       router_call_groq       "$system_prompt" "$query" ;;
    openrouter) router_call_openrouter "$system_prompt" "$query" ;;
    grok)       router_call_grok       "$system_prompt" "$query" ;;
    qwen)       router_call_qwen       "$system_prompt" "$query" ;;
    copilot)    router_call_copilot    "$system_prompt" "$query" ;;
    cline)      router_call_cline      "$system_prompt" "$query" ;;
    ollama)     router_call_ollama     "$system_prompt" "$query" ;;
    *)
      echo "[router] ERROR: Unknown provider '${AGENCE_LLM_PROVIDER}'" >&2
      echo "[router]        Supported: anthropic openai azure gemini mistral groq openrouter grok qwen copilot cline ollama" >&2
      return 1
      ;;
  esac
}

# ============================================================================
# PLANNING DISPATCH: router_plan_action
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
    anthropic)  router_call_anthropic  "$system_prompt" "$request" ;;
    openai)     router_call_openai     "$system_prompt" "$request" ;;
    azure)      router_call_azure      "$system_prompt" "$request" ;;
    gemini)     router_call_gemini     "$system_prompt" "$request" ;;
    mistral)    router_call_mistral    "$system_prompt" "$request" ;;
    groq)       router_call_groq       "$system_prompt" "$request" ;;
    openrouter) router_call_openrouter "$system_prompt" "$request" ;;
    grok)       router_call_grok       "$system_prompt" "$request" ;;
    qwen)       router_call_qwen       "$system_prompt" "$request" ;;
    copilot)    router_call_copilot    "$system_prompt" "$request" ;;
    cline)      router_call_cline      "$system_prompt" "$request" ;;
    ollama)     router_call_ollama     "$system_prompt" "$request" ;;
    *)
      printf "ACTION: chat\nCONFIDENCE: 0.90\nSTEPS:\n- %s\nREASON: No provider configured\n" "$request"
      ;;
  esac) || {
    printf "ACTION: chat\nCONFIDENCE: 0.50\nSTEPS:\n- %s\nREASON: LLM call failed\n" "$request"
    return 0
  }

  echo "$raw_plan"
}

# ============================================================================
# AUTO-ROUTING: router_auto_route  (v0.4.0 — planned)
# ============================================================================
#
# When AGENCE_LLM_PROVIDER=auto, select provider+model based on:
#   1. Task ACTION type + CONFIDENCE  (from router_plan_action output)
#   2. Cost tier of available providers  (cheapest capable model wins)
#   3. Configured keys  (only route to providers that have a key set)
#
# Cost tiers (approx $/1M input tokens, as of 2025-03):
#   T0 free  : ollama, groq/llama-3.3-70b, kwaipilot/kat-coder (openrouter)
#   T1 cheap : gemini-2.0-flash, mistral-small-latest, qwen-turbo, grok-3-mini-fast
#   T2 mid   : gpt-4o-mini, claude-haiku-3-5, codestral-latest, mistral-large-latest
#   T3 smart : gpt-4o, gpt-4.1, claude-sonnet-4-5, gemini-1.5-pro
#   T4 best  : claude-opus-4-5, gpt-o1, gpt-o3  (expensive — use sparingly)
#
# Complexity → tier:
#   chat  + confidence > 0.90  → T0   trivial Q&A
#   code  + confidence > 0.80  → T1   standard coding
#   git   + any                → T0   git ops are mechanical
#   cloud + any                → T2   cloud ops need accuracy
#   *     + confidence < 0.60  → T3   low confidence = hard problem
#   *     + confidence < 0.40  → T4   very hard / architectural
#
# Swarm integration:
#   bin/swarm already routes tasks by complexity at the swarm level.
#   router_auto_route() extends this to per-call granularity within a task.
#   Both use the same cost-tier table for consistency.
#
# TODO(v0.4): implement router_auto_route()
#   - parse ACTION/CONFIDENCE from router_plan_action()
#   - walk cost tiers lowest→highest
#   - call first provider that has a configured key at that tier
#   - export AGENCE_LLM_PROVIDER + AGENCE_LLM_MODEL for the selected backend
#   - log selection to nexus/.airuns/ for cost tracking

# ============================================================================
# UTILITY: router_list_providers
# ============================================================================

router_list_providers() {
  router_load_config 2>/dev/null || true

  local active="${AGENCE_LLM_PROVIDER:-none}"
  local model="${AGENCE_LLM_MODEL:-none}"

  echo "╔══════════════════════════════════════════════════════════════════╗"
  echo "║  Agence LLM Providers                           v0.3.0           ║"
  echo "╠══════════════════════════════════════════════════════════════════╣"
  printf "║  Active : %-20s  Model : %-20s  ║\n" "$active" "$model"
  echo "╠══════════════════╤══════════════════════════════════════════════╣"
  printf "║  %-16s │ %-44s  ║\n" "Provider" "Status"
  echo "╠══════════════════╪══════════════════════════════════════════════╣"

  _prov_row() {
    local name="$1" key_var="$2"
    local key_val="${!key_var:-}"
    local icon status
    if [[ -n "$key_val" ]]; then
      icon="✅"; status="${key_var} set"
    else
      icon="❌"; status="${key_var} not set"
    fi
    local marker="  "; [[ "$name" == "$active" ]] && marker="→ "
    printf "║  %-16s │ %s%s %-40s  ║\n" "$name" "$marker" "$icon" "$status"
  }

  _prov_row "anthropic"  "ANTHROPIC_API_KEY"
  _prov_row "openai"     "OPENAI_API_KEY"
  _prov_row "azure"      "AZURE_OPENAI_API_KEY"
  _prov_row "gemini"     "GEMINI_API_KEY"
  _prov_row "mistral"    "MISTRAL_API_KEY"
  _prov_row "copilot"    "GITHUB_TOKEN"
  _prov_row "grok"       "GROK_API_KEY"
  _prov_row "qwen"       "DASHSCOPE_API_KEY"
  _prov_row "groq"       "GROQ_API_KEY"
  _prov_row "openrouter" "OPENROUTER_API_KEY"
  _prov_row "cline"      "CLINE_API_KEY"

  # Ollama: live check required
  local ollama_icon ollama_status ollama_marker="  "
  [[ "ollama" == "$active" ]] && ollama_marker="→ "
  if curl -sf --max-time 1 "${OLLAMA_HOST:-http://localhost:11434}/api/tags" &>/dev/null; then
    local _models
    _models=$(curl -sf --max-time 2 "${OLLAMA_HOST:-http://localhost:11434}/api/tags" \
      | jq -r '[.models[].name] | join(", ")' 2>/dev/null || echo "?")
    ollama_icon="✅"; ollama_status="running — ${_models:0:35}"
  else
    ollama_icon="❌"; ollama_status="not running at ${OLLAMA_HOST:-http://localhost:11434}"
  fi
  printf "║  %-16s │ %s%s %-40s  ║\n" "ollama" "$ollama_marker" "$ollama_icon" "$ollama_status"

  echo "╠══════════════════╧══════════════════════════════════════════════╣"
  echo "║  Set provider : export AGENCE_LLM_PROVIDER=<name>               ║"
  echo "║  Set model    : export AGENCE_LLM_MODEL=<model>                 ║"
  echo "║  Config file  : ~/.agence/config.yaml                           ║"
  echo "║  Example      : docs/config.yaml.example                        ║"
  echo "╚══════════════════════════════════════════════════════════════════╝"
}
