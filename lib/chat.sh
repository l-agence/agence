#!/usr/bin/env bash
# lib/chat.sh — Chat mode, AI-routed mode, provider resolution, peers consensus
# Sourced by bin/agence.
[[ -n "${_AGENCE_CHAT_LOADED:-}" ]] && return 0
_AGENCE_CHAT_LOADED=1

resolve_provider() {
  # 1. Explicit agent routing
  if [[ -n "${AGENCE_AGENT_PARAM:-}" ]]; then
    echo "${AGENCE_AGENT_PARAM#@}"
    return 0
  fi

  # 2. Explicit env override
  if [[ -n "${AGENCE_DEFAULT_PROVIDER:-}" ]]; then
    echo "$AGENCE_DEFAULT_PROVIDER"
    return 0
  fi

  # 3. Auto-detect: standalone copilot CLI (snap) or gh copilot extension
  if command -v copilot &>/dev/null; then
    echo "pilot"
    return 0
  fi
  if command -v gh &>/dev/null && gh copilot --version &>/dev/null 2>&1; then
    echo "pilot"
    return 0
  fi

  # 3b. Auto-detect: gh authenticated (use GitHub Copilot API via GITHUB_TOKEN)
  if command -v gh &>/dev/null && gh auth token &>/dev/null 2>&1; then
    echo "copilot"
    return 0
  fi

  # 4. Auto-detect: Anthropic
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "claude"
    return 0
  fi

  # 5. Auto-detect: OpenAI
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    echo "openai"
    return 0
  fi

  # 6. No provider available
  echo "none"
  return 1
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

  # ── @peers ensemble: fan-out to multiple providers ────────────────────────
  if [[ "$provider" == "peers" ]]; then
    _peers_consensus "$query"
    return $?
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
# PEERS: Multi-provider consensus ensemble
# ============================================================================
# Fan-out query to N providers in parallel, collect responses, synthesize.
# Flavor (code/light/heavy) selects which models to call.
# Output: per-agent results + synthesized consensus.

_peers_consensus() {
  local query="$1"
  local flavor="${AGENCE_PEERS_FLAVOR:-code}"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  @peers consensus (flavor: $flavor)"
  echo "  Query: ${query:0:80}${query:80:+...}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Trace mode shortcut
  if [[ "${AGENCE_TRACE:-0}" == "1" ]]; then
    echo "[peers_consensus] flavor=${flavor} query=${query}"
    return 0
  fi

  # Resolve flavor → model list from registry
  local models_csv=""
  if [[ -f "$_AGENT_REGISTRY" ]]; then
    models_csv=$(python3 -c "
import json
r=json.load(open('$_AGENT_REGISTRY'))
f=r.get('agents',{}).get('peers',{}).get('flavors',{}).get('$flavor',[])
m=r.get('models',{})
print(','.join(m.get(a,a) for a in f))
" 2>/dev/null)
  fi

  # Fallback defaults if registry unavailable
  if [[ -z "$models_csv" ]]; then
    case "$flavor" in
      code)  models_csv="claude-opus-4-5,gpt-4-turbo,gemini-2-pro" ;;
      light) models_csv="claude-haiku-3-5,gpt-4o-mini,gemini-2-flash" ;;
      heavy) models_csv="claude-opus-4-5,gpt-4-turbo,o1-pro" ;;
      *)     models_csv="claude-opus-4-5,gpt-4-turbo,gemini-2-pro" ;;
    esac
  fi

  IFS=',' read -ra _peer_models <<< "$models_csv"
  local _peer_count=${#_peer_models[@]}

  # Map model → provider
  _model_to_provider() {
    case "$1" in
      claude-*) echo "anthropic" ;;
      gpt-*)    echo "openai" ;;
      o1-*)     echo "openai" ;;
      gemini-*) echo "gemini" ;;
      *)        echo "openai" ;; # fallback
    esac
  }

  echo ""
  echo "Models: ${_peer_models[*]}"
  echo ""

  router_load_config

  local system_prompt
  system_prompt=$(router_build_system_prompt)

  # Fan-out: call each provider in background, collect to temp files
  local _tmpdir
  _tmpdir=$(mktemp -d)
  local _pids=()

  for i in "${!_peer_models[@]}"; do
    local _model="${_peer_models[$i]}"
    local _provider
    _provider=$(_model_to_provider "$_model")
    (
      export AGENCE_LLM_PROVIDER="$_provider"
      export AGENCE_LLM_MODEL="$_model"
      local _response
      _response=$(router_chat "$query" 2>/dev/null) || _response="[ERROR: ${_provider}/${_model} failed]"
      echo "$_response" > "$_tmpdir/peer_${i}.txt"
    ) &
    _pids+=($!)
  done

  # Wait for all peers
  echo "Waiting for ${_peer_count} peers..."
  for pid in "${_pids[@]}"; do
    wait "$pid" 2>/dev/null
  done

  # Collect and display responses
  echo ""
  for i in "${!_peer_models[@]}"; do
    local _model="${_peer_models[$i]}"
    echo "┌─ Peer $((i+1)): $_model"
    echo "│"
    if [[ -f "$_tmpdir/peer_${i}.txt" ]]; then
      sed 's/^/│  /' "$_tmpdir/peer_${i}.txt"
    else
      echo "│  [NO RESPONSE]"
    fi
    echo "│"
    echo "└─────────────────────────────────────────────────────────────"
    echo ""
  done

  # Synthesize consensus (use the first available provider)
  if [[ $_peer_count -gt 1 ]]; then
    echo "━━━ SYNTHESIS ━━━"
    echo ""
    local _synth_input="You are a consensus synthesizer. Below are ${_peer_count} independent responses to the same query. Identify common ground, highlight valuable disagreements, and produce a concise synthesized answer."
    _synth_input="${_synth_input}\n\nOriginal query: ${query}\n"
    for i in "${!_peer_models[@]}"; do
      _synth_input="${_synth_input}\n--- Response from ${_peer_models[$i]} ---\n"
      if [[ -f "$_tmpdir/peer_${i}.txt" ]]; then
        _synth_input="${_synth_input}$(cat "$_tmpdir/peer_${i}.txt")\n"
      fi
    done

    local _synth_provider="$(_model_to_provider "${_peer_models[0]}")"
    export AGENCE_LLM_PROVIDER="$_synth_provider"
    export AGENCE_LLM_MODEL="${_peer_models[0]}"
    local _synthesis
    _synthesis=$(router_chat "$(echo -e "$_synth_input")" 2>/dev/null) || _synthesis="[Synthesis unavailable]"
    echo "$_synthesis"
    echo ""
  fi

  # Cleanup
  rm -rf "$_tmpdir"

  # Log to ailedger
  ailedger_append "route" "peers-consensus-${flavor}" "" "@peers ${_peer_count} models" "0"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
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

