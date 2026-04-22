#!/usr/bin/env bash
# lib/chat.sh — Chat mode, AI-routed mode (peers delegated to peers.ts)
# Sourced by bin/agence.
# Provider resolution is canonical in lib/router.ts (lib/router.sh is the bash
# wrapper).  This module delegates all provider detection to router_load_config().
[[ -n "${_AGENCE_CHAT_LOADED:-}" ]] && return 0
_AGENCE_CHAT_LOADED=1

# ── resolve_provider ──────────────────────────────────────────────────────────
# Thin shim: delegates to router.ts via router_load_config() (router.sh).
# Kept for backward compatibility with bin/agence _resolve_provider early-exit.
resolve_provider() {
  # router_load_config sets AGENCE_LLM_PROVIDER (delegates to router.ts when bun
  # is available, falls back to bash cascade in router.sh otherwise).
  router_load_config 2>/dev/null || true
  local _p="${AGENCE_LLM_PROVIDER:-none}"
  echo "$_p"
  [[ "$_p" != "none" ]]
}

# ============================================================================
# MODE: CHAT
# ============================================================================
# Normal conversation with LLM
# Example: agence "How do I create a VPC in Terraform?"

mode_chat() {
  local query="$1"

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Chat mode: $query" >&2

  # Resolve provider (never auto-call LLM without a provider)
  local provider
  provider=$(resolve_provider) || {
    echo "Error: No LLM provider configured." >&2
    echo "  Set AGENCE_DEFAULT_PROVIDER or configure gh auth." >&2
    echo "  Providers: copilot (gh), claude, openai, ollama" >&2
    echo "  Example: export AGENCE_DEFAULT_PROVIDER=copilot" >&2
    return 1
  }

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Provider: $provider" >&2

  # ── @peers ensemble: delegate to peers.ts (canonical consensus engine) ────
  if [[ "$provider" == "peers" ]]; then
    local _peers_ts="${AGENCE_ROOT}/lib/peers.ts"
    if command -v bun &>/dev/null && [[ -f "$_peers_ts" ]]; then
      local _peers_flavor="${AGENCE_PEERS_FLAVOR:-code}"
      local _peers_algo="${AGENCE_PEERS_ALGO:-winner}"
      # Default skill is "solve" for chat-mode queries
      bun run "$_peers_ts" solve --flavor "$_peers_flavor" --consensus "$_peers_algo" "$query"
      return $?
    else
      echo "Error: bun not found or lib/peers.ts missing. Run agence ^install" >&2
      return 1
    fi
  fi

  # ── Persona agent routing: resolve to real provider ──────────────────────
  # If provider is an agent name (ralph, sonya, etc.), look up its real provider
  local _agent_type=""
  _agent_type=$(_reg_lookup "$provider" "type" 2>/dev/null)
  if [[ "$_agent_type" == "persona" ]]; then
    local _real_provider
    _real_provider=$(_reg_lookup "$provider" "provider" 2>/dev/null)
    if [[ -n "$_real_provider" ]]; then
      export AI_AGENT="$provider"
      # Set model from registry default if not already overridden
      if [[ -z "${AGENCE_LLM_MODEL:-}" ]]; then
        local _default_model
        _default_model=$(_reg_lookup "$provider" "default_model" 2>/dev/null)
        if [[ -n "$_default_model" ]]; then
          export AGENCE_LLM_MODEL="$(_resolve_model_alias "$_default_model")"
        fi
      fi
      provider="$_real_provider"
    fi
  fi

  # Trace mode: print routing decision without calling LLM (for testing/CI)
  if [[ "${AGENCE_TRACE:-0}" == "1" ]]; then
    echo "[router_chat] provider=${provider} agent=${AI_AGENT:-@} model=${AGENCE_LLM_MODEL:-default} query=${query}"
    return 0
  fi

  # Load router
  router_load_config

  # Call LLM with context
  local response
  response=$(router_chat "$query" "$provider") || {
    echo "Error: Failed to contact LLM provider '$provider'" >&2
    return 1
  }

  echo "$response"
  return 0
}

# ============================================================================
# MODE: AI-ROUTED
# ============================================================================
# LLM analyzes request and decides action (autonomous)
# Example: agence +plan-terraform-module-for-vpc

mode_ai_routed() {
  local request="$1"

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] AI-routed mode: $request" >&2

  # Validate request for dangerous operators
  if ! validate_command "$request"; then
    return 1
  fi

  # Trace mode: print routing decision without calling LLM (for testing/CI)
  if [[ "${AGENCE_TRACE:-0}" == "1" ]]; then
    local provider; provider=$(resolve_provider 2>/dev/null || echo "none")
    echo "[router_plan_action] provider=${provider} request=${request}"
    return 0
  fi

  # Load router
  router_load_config

  # Call LLM in planning mode
  local plan
  plan=$(router_plan_action "$request") || {
    echo "Error: Failed to plan action" >&2
    return 1
  }

  # Parse plan (should contain: ACTION, CONFIDENCE, STEPS)
  local action confidence
  action=$(echo "$plan" | grep '^ACTION:' | awk '{print $2}')
  confidence=$(echo "$plan" | grep '^CONFIDENCE:' | awk '{print $2}')

  # Safety check: require human confirmation if confidence low
  if (( $(echo "$confidence < 0.65" | bc -l 2>/dev/null || echo 1) )); then
    echo "[WARN] Low confidence ($confidence). Showing plan:"
    echo "$plan"
    echo ""
    read -p "Proceed? [y/n] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      return 1
    fi
  fi

  # Route and execute
  case "$action" in
    git)
      router_execute git "$plan"
      ;;
    terraform)
      router_execute terraform "$plan"
      ;;
    cloud)
      router_execute cloud "$plan"
      ;;
    chat|"")
      # LLM decided a chat/explain action — route to mode_chat
      mode_chat "$request"
      ;;
    *)
      echo "Error: Unknown action type: $action" >&2
      return 1
      ;;
  esac

  return $?
}

# ============================================================================
# MODE: EXTERNAL COMMAND
# ============================================================================
# Execute pre-approved external commands
# Example: agence /terraform-plan

