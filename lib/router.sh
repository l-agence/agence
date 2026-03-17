#!/usr/bin/env bash

################################################################################
# router.sh: Agence Agent/Model Routing Library
# Provides agent/model/persona resolution, context injection, and LLM client wiring.
# Intended for sourcing by entry points (bin/agence, bin/aicmd, etc).
#
# Author: Agence Project
# License: MIT License with Commons Clause
################################################################################

# ROUTER CONFIG (stub, to be expanded)
ROUTER_CONFIG_PATH="${ROUTER_CONFIG_PATH:-$HOME/.agence/config.yaml}"

# Load router config (stub)
router_load_config() {
  # TODO: Load YAML config, agent definitions, model aliases, etc.
  # For now, just echo stub
  echo "[router_load_config] (stub) Loading config from: $ROUTER_CONFIG_PATH" >&2
  return 0
}

# Main chat routing function (stub)
router_chat() {
  local query="${1:-}"
  # TODO: Implement agent/model resolution, context injection, LLM client call
  echo "[router_chat] (stub) Received query: $query" >&2
  echo "router_chat: $query"
  return 0
}

# (Future) Add: router_resolve_agent, router_resolve_model, router_inject_context, etc.