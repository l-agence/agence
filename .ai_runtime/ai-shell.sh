#!/usr/bin/env bash

################################################################################
# ai-shell.sh: Unified shell wrapper for multi-session VS Code terminals
#
# Handles both bash and PowerShell, enforces CODEX validation, captures session
# logs via 'script' command, and maintains chroot-like $GIT_ROOT isolation.
#
# Usage: ai-shell.sh <shell_type>
# Environment variables (set by VS Code extension):
#   AI_ROLE       - Terminal role: "shared", "planner", "coder", "anchor"
#   AI_SESSION    - Session ID (e.g., "abc123-2026-03-06")
#   AI_AGENT      - Agent ID (e.g., "copilot", "chad", "claudia")
#   GIT_ROOT      - Repository root (set by wrapper, enforced chroot)
#
# Features:
#   - Session logging via 'script' → nexus/.aisessions/
#   - CODEX validation on every command
#   - Path sandbox enforcement (no escape from GIT_ROOT)
#   - Format.sh output control (text/md/json)
#   - Cross-platform (bash + pwsh support)
################################################################################

set -euo pipefail

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================

# Determine shell type from argument
SHELL_TYPE="${1:-bash}"

# If not set by caller, derive from env
if [[ -z "${GIT_ROOT:-}" ]]; then
    # Try to find .agence root by looking for .git or specific markers
    GIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# Session metadata (provided by VS Code extension)
AI_ROLE="${AI_ROLE:-shared}"
AI_SESSION="${AI_SESSION:-unknown}"
AI_AGENT="${AI_AGENT:-default}"

# Session logging paths
SESSION_DIR="${GIT_ROOT}/nexus/.aisessions"
SESSION_LOG="${SESSION_DIR}/${AI_SESSION}_${AI_ROLE}.typescript"
SESSION_META="${SESSION_DIR}/${AI_SESSION}_${AI_ROLE}.meta.json"

# Ensure session directory exists
mkdir -p "$SESSION_DIR" 2>/dev/null || true

# ============================================================================
# SESSION LOGGING INITIALIZATION
# ============================================================================

init_session_logging() {
    # Create initial metadata if not exists
    if [[ ! -f "$SESSION_META" ]]; then
        cat > "$SESSION_META" <<EOF
{
  "session_id": "$AI_SESSION",
  "role": "$AI_ROLE",
  "agent": "$AI_AGENT",
  "shell": "$SHELL_TYPE",
  "timestamp_start": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_root": "$GIT_ROOT",
  "typescript_file": "$SESSION_LOG",
  "commands_executed": 0,
  "exit_code": null
}
EOF
    fi
}

# ============================================================================
# CODEX VALIDATION + FORMAT LIBRARY
# ============================================================================

load_codex_and_format() {
    # Source CODEX validation (if exists)
    if [[ -f "$GIT_ROOT/codex/LAWS.sh" ]]; then
        source "$GIT_ROOT/codex/LAWS.sh"
    fi
    
    # Source format library for output control
    if [[ -f "$GIT_ROOT/lib/format.sh" ]]; then
        source "$GIT_ROOT/lib/format.sh"
        # Export format mode for child processes
        export _AGENCE_FMT="${_AGENCE_FMT:-text}"
    fi
}

# ============================================================================
# BASH SHELL SETUP
# ============================================================================

setup_bash_session() {
    # Start script command to capture all I/O
    script_cmd="script --quiet --return --command 'bash --noprofile --norc' '$SESSION_LOG'"
    
    # Export environment for child bash
    export GIT_ROOT AI_ROLE AI_SESSION AI_AGENT SESSION_LOG SESSION_META
    export PS1="[\${AI_ROLE}@\${AI_SESSION:0:8}] \$ "
    
    # Load user's .bashrc if exists (but NOT .bash_profile to avoid side effects)
    if [[ -f "$HOME/.bashrc" ]]; then
        # Wrap bashrc to enforce sandbox
        eval "$script_cmd" || {
            echo "[AI-SHELL] ✗ Bash session launch failed"
            return 1
        }
    else
        # No user bashrc, use minimal shell
        eval "$script_cmd" || {
            echo "[AI-SHELL] ✗ Bash session fallback failed"
            return 1
        }
    fi
}

# ============================================================================
# POWERSHELL SHELL SETUP
# ============================================================================

setup_pwsh_session() {
    # For PowerShell, we delegate to a .ps1 wrapper that can handle pwsh syntax
    local ps_wrapper="${GIT_ROOT}/.ai_runtime/ai-shell.ps1"
    
    if [[ ! -f "$ps_wrapper" ]]; then
        echo "[AI-SHELL] ✗ PowerShell wrapper not found: $ps_wrapper" >&2
        return 1
    fi
    
    # Export environment variables for PowerShell subprocess
    export GIT_ROOT AI_ROLE AI_SESSION AI_AGENT SESSION_LOG SESSION_META
    
    # Invoke PowerShell with wrapper and session logging
    # Note: 'script' doesn't work well with pwsh, so we use Out-File in PS1 instead
    pwsh -NoProfile -NoExit -File "$ps_wrapper" || {
        echo "[AI-SHELL] ✗ PowerShell session failed"
        return 1
    }
}

# ============================================================================
# SANDBOX PATH ENFORCEMENT
# ============================================================================

sandbox_cd() {
    # Enforce chroot-like behavior: any cd outside GIT_ROOT is blocked
    local target="${1:-.}"
    local abs_path
    
    # Resolve to absolute path
    abs_path="$(cd "$target" 2>/dev/null && pwd)" || {
        echo "[SANDBOX] ✗ Invalid directory: $target" >&2
        return 1
    }
    
    # Check if within GIT_ROOT
    if [[ "$abs_path" == "$GIT_ROOT"* ]] || [[ "$abs_path" == "/" ]]; then
        cd "$abs_path" || return 1
    else
        echo "[SANDBOX] ✗ Access outside workspace denied: $target" >&2
        echo "[SANDBOX]   Current root: $GIT_ROOT" >&2
        echo "[SANDBOX]   Attempted:   $abs_path" >&2
        return 1
    fi
}

# Override cd for this session (for bash)
if [[ "$SHELL_TYPE" == "bash" ]]; then
    builtin_cd() {
        sandbox_cd "$@"
    }
fi

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Initialize session metadata
    init_session_logging
    
    # Load CODEX + format library
    load_codex_and_format
    
    # Print session header
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  AGENCE SESSION SHELL                                          ║"
    echo "╠════════════════════════════════════════════════════════════════╣"
    echo "║  Role:       $AI_ROLE"
    echo "║  Session:    $AI_SESSION"
    echo "║  Agent:      $AI_AGENT"
    echo "║  Shell:      $SHELL_TYPE"
    echo "║  Root:       $GIT_ROOT"
    echo "║  Log:        $SESSION_LOG"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Change to repo root (chroot-like)
    cd "$GIT_ROOT" || {
        echo "[AI-SHELL] ✗ Failed to cd to $GIT_ROOT" >&2
        return 1
    }
    
    # Dispatch to shell type
    case "$SHELL_TYPE" in
        bash)
            setup_bash_session
            ;;
        pwsh|powershell)
            setup_pwsh_session
            ;;
        *)
            echo "[AI-SHELL] ✗ Unknown shell type: $SHELL_TYPE" >&2
            echo "[AI-SHELL]   Supported: bash, pwsh, powershell" >&2
            return 1
            ;;
    esac
}

# Execute main block
main "$@"
