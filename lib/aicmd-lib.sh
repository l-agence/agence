#!/usr/bin/env bash

################################################################################
# aicmd-lib: AI Command Validation Library
# Provides validation functions for redirects, pipes, and environment safety
# Intended for sourcing by agentic shells (aibash, aishell, aido, etc.)
#
# Author: Stephane Korning 2026
# License: MIT License with Commons Clause
################################################################################

set -euo pipefail

# SAFE REDIRECT TARGETS
SAFE_REDIRECT_TARGETS=(
    "/dev/null"
    "/dev/stderr"
    "/dev/stdout"
    "/dev/stdin"
)

# SAFE PIPE COMMANDS
SAFE_PIPE_COMMANDS=(
    "grep" "head" "tail" "sort" "uniq" "wc" "cut" "awk" "sed" "jq" "tr" "column" "less" "more" "tee" "xargs" "paste" "join" "comm"
)

validate_redirect() {
    local target="$1"
    for safe in "${SAFE_REDIRECT_TARGETS[@]}"; do
        [[ "$target" == "$safe" ]] && return 0
    done
    return 1
}

validate_pipe_command() {
    local cmd="$1"
    for safe in "${SAFE_PIPE_COMMANDS[@]}"; do
        [[ "$cmd" == "$safe" ]] && return 0
    done
    return 1
}

sanitize_env() {
    unset HISTFILE HISTSIZE HISTCONTROL HISTIGNORE PROMPT_COMMAND BASH_ENV ENV CDPATH
    export PATH="/usr/bin:/bin:${AI_BIN:-.}"
}
