#!/usr/bin/env bash
# lib/detect-env.sh — Shell environment detection, path normalization, security validators
# Sourced by bin/agence at startup before any other module.
# Guards against double-sourcing.
[[ -n "${_AGENCE_DETECT_ENV_LOADED:-}" ]] && return 0
_AGENCE_DETECT_ENV_LOADED=1

detect_shell_environment() {
  # Default values
  export AGENCE_SHELL_ENV="unknown"
  export AGENCE_PATH_STYLE="posix"  # Default: posix paths
  export AGENCE_OS_WINDOWS=0
  export AGENCE_OS_LINUX=0
  export AGENCE_OS_MACOS=0
  
  # Detect OS layer
  case "${OSTYPE:-}" in
    msys|mingw*)
      # Git-bash (MinGW/MSYS2)
      export AGENCE_SHELL_ENV="git-bash"
      export AGENCE_OS_WINDOWS=1
      export AGENCE_PATH_STYLE="mingw"
      ;;
    cygwin*)
      # Cygwin
      export AGENCE_SHELL_ENV="cygwin"
      export AGENCE_OS_WINDOWS=1
      export AGENCE_PATH_STYLE="cygwin"
      ;;
    linux*)
      # Check if WSL
      if [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
        export AGENCE_SHELL_ENV="wsl"
        export AGENCE_PATH_STYLE="posix"
      else
        export AGENCE_SHELL_ENV="linux"
        export AGENCE_PATH_STYLE="posix"
      fi
      export AGENCE_OS_LINUX=1
      ;;
    darwin*)
      export AGENCE_SHELL_ENV="macos"
      export AGENCE_OS_MACOS=1
      export AGENCE_PATH_STYLE="posix"
      ;;
  esac
  
  # Additional detection for git-bash (MSYSTEM variable)
  if [[ -n "${MSYSTEM:-}" ]]; then
    export AGENCE_SHELL_ENV="git-bash"
    export AGENCE_OS_WINDOWS=1
    export AGENCE_PATH_STYLE="mingw"
  fi
  
  # Additional detection for PowerShell
  if [[ -n "${PSVersionTable+x}" ]] || [[ "$SHELL" == *"powershell"* ]]; then
    export AGENCE_SHELL_ENV="powershell"
    export AGENCE_PATH_STYLE="windows"
  fi
  
  [[ "${AGENCE_DEBUG:-0}" == "1" ]] && \
    echo "[DEBUG] Shell: $AGENCE_SHELL_ENV, Path style: $AGENCE_PATH_STYLE, OS: W=$AGENCE_OS_WINDOWS L=$AGENCE_OS_LINUX" >&2
}

detect_shell_environment

# ============================================================================
# CONFIGURATION & PATHS
# ============================================================================

# Normalize paths to current shell environment
# Handles conversion between path styles based on detected environment
normalize_path() {
  local path="$1"
  
  # WSL-native (preferred): use realpath to canonicalize
  # This resolves symlinks, removes .., and gives true absolute path
  if [[ "$AGENCE_PATH_STYLE" == "posix" ]] || [[ "$AGENCE_PATH_STYLE" == "wsl" ]]; then
    if command -v realpath &>/dev/null; then
      path="$(realpath -m "$path" 2>/dev/null || echo "$path")"
    fi
    echo "$path"
    return
  fi

  # Legacy: cygwin /cygdrive/c/ → /c/
  if [[ "$AGENCE_PATH_STYLE" == "mingw" ]] && [[ "$path" == /cygdrive/* ]]; then
    path="${path/\/cygdrive\//\/}"
  fi

  # Legacy: PowerShell Windows-style conversion
  if [[ "$AGENCE_PATH_STYLE" == "windows" ]]; then
    if [[ "$path" == /* ]]; then
      local drive="${path:1:1}"
      local rest="${path:2}"
      path="${drive}:${rest//\//\\}"
    fi
  fi

  echo "$path"
}

# Agence-specific paths (extends lib/env.sh)
AGENCE_MODULES="$AGENCE_ROOT/modules"
AGENCE_CONFIG="${HOME}/.agence/config.yaml"

source_if_exists "$AGENCE_LIB/utils.sh"
source_if_exists "$AGENCE_LIB/logging.sh"
source_if_exists "$AGENCE_LIB/safeguards.sh"
source_if_exists "$AGENCE_LIB/format.sh"
source_if_exists "$AGENCE_LIB/shell-ui.sh"
source_if_exists "$AGENCE_LIB/router.sh"
source_if_exists "$AGENCE_LIB/ailedger.sh"

# ============================================================================
# BUN DELEGATION HELPER
# ============================================================================
_bun_cmd() {
    if command -v bun &>/dev/null; then
        command -v bun
    elif [[ -x "$HOME/.bun/bin/bun" ]]; then
        echo "$HOME/.bun/bin/bun"
    else
        return 1
    fi
}

# ============================================================================
# SECURITY: Command validation (injection guard)
# ============================================================================
# Rejects commands containing dangerous shell operators.
# Called BEFORE any external command execution.
# Per LAWS.md §8: security layer VALIDATES only — never creates paths.

validate_command() {
  local cmd="$1"
  # Reject shell injection patterns
  if echo "$cmd" | grep -qE '(\|\||&&|;[^;]|`|\$\(|>[^>]|<[^<])'; then
    echo "Error: Command contains disallowed shell operators: $cmd" >&2
    return 1
  fi
  return 0
}

# ============================================================================
# EXECUTION CONTEXT: Git Repo vs Agence Repo
# ============================================================================
# Critical: Prevent collisions when user and LLM share a shell window
# Both must be set and validated before any command execution

init_execution_context() {
  # Initialize GIT_REPO and AGENCE_REPO environment variables
  # These track which repos we're working in and prevent context collisions
  
  export AGENCE_REPO="${AGENCE_REPO:-$(normalize_path "$AGENCE_ROOT")}"
  export GIT_REPO="${GIT_REPO:-}"
  
  # Try to detect GIT_REPO by walking up directory tree from current pwd
  if [[ -z "$GIT_REPO" ]]; then
    local current_dir="$(normalize_path "$(pwd)")"
    local check_dir="$current_dir"
    
    while [[ "$check_dir" != "/" ]]; do
      if [[ -d "$check_dir/.git" ]]; then
        export GIT_REPO="$check_dir"
        break
      fi
      check_dir="$(dirname "$check_dir")"
    done
  else
    # Normalize GIT_REPO if it was manually set
    export GIT_REPO="$(normalize_path "$GIT_REPO")"
  fi
  
  # Special case: If both are same, we're in standalone mode (not yet a submodule)
  if [[ "$GIT_REPO" == "$AGENCE_REPO" ]]; then
    if [[ "$DEBUG" == "1" ]]; then
      echo "[DEBUG] Standalone mode (GIT_REPO == AGENCE_REPO)" >&2
    fi
  fi
  
  if [[ "$DEBUG" == "1" ]]; then
    echo "[DEBUG] AGENCE_REPO=$AGENCE_REPO" >&2
    echo "[DEBUG] GIT_REPO=$GIT_REPO" >&2
  fi
}

validate_execution_context() {
  # Pre-flight check: Ensure pwd matches expected repo context (CODEX LAW 2)
  # Handles both normal case (submodule in parent repo) and standalone case (same repo)
  
  local current_pwd="$(normalize_path "$(pwd)")"
  local in_agence=0
  local in_git=0
  
  # Check if we're in AGENCE_REPO
  if [[ "$current_pwd" == "$AGENCE_REPO"* ]]; then
    in_agence=1
  fi
  
  # Check if we're in GIT_REPO (if set and different from AGENCE_REPO)
  if [[ -n "$GIT_REPO" ]] && [[ "$GIT_REPO" != "$AGENCE_REPO" ]] && [[ "$current_pwd" == "$GIT_REPO"* ]]; then
    in_git=1
  fi
  
  # Special case: if they're the same, being in one is sufficient
  if [[ "$GIT_REPO" == "$AGENCE_REPO" ]] && [[ $in_agence -eq 1 ]]; then
    in_git=1
  fi
  
  # Validation: Must be in either GIT_REPO or AGENCE_REPO
  if [[ $in_agence -eq 0 && $in_git -eq 0 ]]; then
    echo "[ERROR] Execution context mismatch (CODEX LAW 2 violation)!" >&2
    echo "  pwd: $current_pwd" >&2
    echo "  AGENCE_REPO: $AGENCE_REPO" >&2
    if [[ -n "$GIT_REPO" ]] && [[ "$GIT_REPO" != "$AGENCE_REPO" ]]; then
      echo "  GIT_REPO: $GIT_REPO" >&2
    fi
    echo "" >&2
    echo "  You must be in one of:" >&2
    echo "    - $AGENCE_REPO/* (Agence system)" >&2
    if [[ -n "$GIT_REPO" ]] && [[ "$GIT_REPO" != "$AGENCE_REPO" ]]; then
      echo "    - $GIT_REPO/* (Parent project)" >&2
    fi
    echo "" >&2
    echo "  Recovery: cd to $AGENCE_REPO or your project root" >&2
    return 1
  fi
  
  return 0
}

# ============================================================================
# DEFAULTS
# ============================================================================

DEBUG="${AGENCE_DEBUG:-0}"
QUIET="${AGENCE_QUIET:-0}"

# Initialize and validate execution context before anything else
init_execution_context
if ! validate_execution_context; then
  exit 1
fi

# ============================================================================
# HELP / VERSION
# ============================================================================

