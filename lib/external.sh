#!/usr/bin/env bash
# lib/external.sh — External command mode (slash-commands, validated execution, git shortcuts)
# This is the pass-through layer for /command and tool-native slash-commands.
# Sourced by bin/agence.
[[ -n "${_AGENCE_EXTERNAL_LOADED:-}" ]] && return 0
_AGENCE_EXTERNAL_LOADED=1

mode_external() {
  local cmd_request="$1"

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] External mode: $cmd_request" >&2

  # ── Guard gate (TCB boundary) ──────────────────────────────────────────
  # If guard.ts is available, classify the command FIRST.
  # T3 = deny, T2 = escalate (prompt), T0/T1 = pass through.
  local _guard_ts="${AGENCE_ROOT}/lib/guard.ts"
  if command -v bun &>/dev/null && [[ -f "$_guard_ts" ]]; then
    local _guard_json
    _guard_json=$(bun run "$_guard_ts" classify $cmd_request 2>/dev/null) || true
    if [[ -n "$_guard_json" ]] && command -v jq &>/dev/null; then
      local _guard_tier _guard_action
      _guard_tier=$(echo "$_guard_json" | jq -r '.tier // "T1"')
      _guard_action=$(echo "$_guard_json" | jq -r '.action // "allow"')
      case "$_guard_action" in
        deny)
          echo "Error: BLOCKED by guard (${_guard_tier}) — $cmd_request" >&2
          echo "  $(echo "$_guard_json" | jq -r '.reason // ""')" >&2
          return 1
          ;;
        escalate)
          echo "[GUARD ${_guard_tier}] Requires approval: $cmd_request" >&2
          echo "  $(echo "$_guard_json" | jq -r '.reason // ""')" >&2
          if [[ -t 0 ]]; then
            read -p "Approve? [y/N] " _approve
            [[ "$_approve" != "y" && "$_approve" != "Y" ]] && { echo "[CANCELLED]" >&2; return 1; }
          else
            echo "Error: Non-interactive — cannot escalate" >&2
            return 1
          fi
          ;;
        # allow|flag → proceed
      esac
      [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Guard: ${_guard_tier}/${_guard_action} for $cmd_request" >&2
    fi
  fi

  # Validate command for dangerous operators (legacy fallback if guard unavailable)
  if ! validate_command "$cmd_request"; then
    return 1
  fi

  # =========================================================================
  # GENERIC PASSTHROUGHS: /git <subcmd>, /gh <subcmd>
  # These handle "agence /git log", "agence /gh pr list" etc.
  # Must be checked BEFORE the case statement (args include spaces)
  # =========================================================================
  local base_cmd="${cmd_request%% *}"        # e.g. "git" from "git log --oneline"
  local sub_args="${cmd_request#* }"         # e.g. "log --oneline" (empty if no space)
  [[ "$sub_args" == "$cmd_request" ]] && sub_args=""  # no space = no sub_args

  case "$base_cmd" in
    git)
      if [[ -z "$sub_args" ]]; then
        echo "Usage: agence /git <subcommand> [args]" >&2
        echo "  e.g. agence /git status" >&2
        echo "  e.g. agence /git log --oneline -5" >&2
        return 1
      fi
      # T3 blocklist check
      local git_sub="${sub_args%% *}"
      case "$git_sub" in
        filter-branch|gc|clean|reflog|reset|fsck)
          echo "Error: BLOCKED — git $git_sub requires T3 human approval" >&2
          return 1
          ;;
        merge|rebase|cherry-pick)
          echo "Error: git $git_sub requires T2 escalation (interactive)" >&2
          return 1
          ;;
      esac
      # T0/T1 passthrough
      git -C "$GIT_REPO" $sub_args
      return $?
      ;;
    gh)
      if [[ -z "$sub_args" ]]; then
        echo "Usage: agence /gh <subcommand> [args]" >&2
        echo "  e.g. agence /gh pr list" >&2
        echo "  e.g. agence /gh repo view" >&2
        return 1
      fi
      if ! command -v gh &>/dev/null; then
        echo "Error: gh CLI not installed" >&2
        return 1
      fi
      gh $sub_args
      return $?
      ;;
  esac

  # =========================================================================
  # REPO COMMANDS (act on $GIT_REPO)
  # =========================================================================
  case "$cmd_request" in
    # ----- Git shortcuts (T0: read-only, auto-execute) ---------------------
    status)
      git -C "$GIT_REPO" status
      return $?
      ;;
    log)
      git -C "$GIT_REPO" log --oneline -10
      return $?
      ;;
    remote)
      git -C "$GIT_REPO" remote -v
      return $?
      ;;
    diff)
      git -C "$GIT_REPO" diff
      return $?
      ;;
    stash)
      git -C "$GIT_REPO" stash
      return $?
      ;;
    ghauth)
      # GitHub CLI auth status
      bash "$AGENCE_ROOT/bin/aido" gh auth status
      return $?
      ;;
    ghlogin)
      # GitHub CLI login (interactive)
      echo "[INFO] Starting GitHub CLI login..." >&2
      gh auth login
      return $?
      ;;
    gitstatus)
      # Git status in $GIT_REPO (read-only, safe)
      bash "$AGENCE_ROOT/bin/aido" git status
      return $?
      ;;
    commit)
      # Commit all tracked changes in $GIT_REPO
      echo "[WARN] This will commit all staged changes to $GIT_REPO" >&2
      read -p "Enter commit message: " commit_msg
      if [[ -z "$commit_msg" ]]; then
        echo "Error: Commit message required" >&2
        return 1
      fi
      # Detect AIPOLICY.yaml changes before commit (for ledger entry)
      local _policy_changed=0
      if git -C "$GIT_REPO" diff --cached --name-only | grep -q 'codex/AIPOLICY.yaml'; then
        _policy_changed=1
      fi
      git -C "$GIT_REPO" commit -m "$commit_msg"
      local _rc=$?
      [[ $_rc -eq 0 ]] && ailedger_append "commit" "slash-commit" "" "$commit_msg" "$_rc"
      [[ $_rc -eq 0 && $_policy_changed -eq 1 ]] && \
        ailedger_append "policy" "aipolicy-changed" "" "codex/AIPOLICY.yaml modified" "0"
      return $_rc
      ;;
    push)
      # Push changes to origin (sets upstream on first push)
      echo "[WARN] This will push changes from $GIT_REPO to origin" >&2
      read -p "Confirm push to origin? [y/N] " confirm
      if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "[CANCELLED] Push aborted" >&2
        return 1
      fi
      git -C "$GIT_REPO" push -u origin
      local _rc=$?
      [[ $_rc -eq 0 ]] && ailedger_append "push" "slash-push" "" "git push -u origin" "$_rc"
      return $_rc
      ;;
    ghstatus)
      # GitHub CLI: show repo and PR status
      echo "[INFO] Repository status:" >&2
      bash "$AGENCE_ROOT/bin/aido" gh repo view
      echo && echo "[INFO] Pull requests:" >&2
      bash "$AGENCE_ROOT/bin/aido" gh pr list --limit 5
      return $?
      ;;
    ghcommit)
      # GitHub CLI: Commit changes (similar to /commit but with gh auth)
      echo "[WARN] This will commit all staged changes using gh auth" >&2
      read -p "Enter commit message: " commit_msg
      if [[ -z "$commit_msg" ]]; then
        echo "Error: Commit message required" >&2
        return 1
      fi
      # Verify gh is authenticated
      if ! bash "$AGENCE_ROOT/bin/aido" gh auth status &>/dev/null; then
        echo "Error: Not authenticated with gh. Run: agence /ghlogin" >&2
        return 1
      fi
      git -C "$GIT_REPO" commit -m "$commit_msg"
      return $?
      ;;
    ghpush)
      # GitHub CLI: Push changes (uses gh's authentication)
      echo "[WARN] This will push changes using GitHub CLI auth" >&2
      read -p "Confirm push to origin? [y/N] " confirm
      if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "[CANCELLED] Push aborted" >&2
        return 1
      fi
      # Verify gh is authenticated
      if ! bash "$AGENCE_ROOT/bin/aido" gh auth status &>/dev/null; then
        echo "Error: Not authenticated with gh. Run: agence /ghlogin" >&2
        return 1
      fi
      git -C "$GIT_REPO" push -u origin
      return $?
      ;;
    ghremote)
      # GitHub CLI: view repo info (T0: auto-execute)
      bash "$AGENCE_ROOT/bin/aido" gh repo view
      return $?
      ;;
    ghpull)
      # GitHub CLI: list PRs (T0: auto-execute)
      bash "$AGENCE_ROOT/bin/aido" gh pr list
      return $?
      ;;
    ghlog)
      # GitHub CLI: list workflow run history (T0: auto-execute)
      bash "$AGENCE_ROOT/bin/aido" gh run list
      return $?
      ;;
    ghrun)
      # GitHub CLI: run list/view (T0: auto-execute)
      local ghrun_sub="${2:-list}"
      shift 2 2>/dev/null || shift 1 2>/dev/null || true
      case "$ghrun_sub" in
        list)
          bash "$AGENCE_ROOT/bin/aido" gh run list "$@"
          ;;
        view)
          bash "$AGENCE_ROOT/bin/aido" gh run view "$@"
          ;;
        *)
          echo "Usage: agence /ghrun [list|view] [args...]" >&2
          return 1
          ;;
      esac
      return $?
      ;;
    ghflow)
      # GitHub CLI: list workflows (T0: auto-execute)
      bash "$AGENCE_ROOT/bin/aido" gh workflow list
      return $?
      ;;
    ghissue)
      # GitHub CLI: list issues (T0: auto-execute)
      bash "$AGENCE_ROOT/bin/aido" gh issue list
      return $?
      ;;
  esac

  # Load permitted commands from config/commands.json
  local commands_file="$AGENCE_ROOT/bin/commands.json"
  
  if [[ ! -f "$commands_file" ]]; then
    echo "Error: No commands.json found" >&2
    return 1
  fi

  # Check if command is allowed
  local command_allowed
  if command -v jq &>/dev/null; then
    command_allowed=$(jq -r ".\"$cmd_request\" // false" "$commands_file")
  else
    # Fallback if jq not available: simple grep
    command_allowed=$(grep -q "\"$cmd_request\"" "$commands_file" && echo "true" || echo "false")
  fi

  if [[ "$command_allowed" != "true" ]]; then
    echo "Error: Command not allowed: $cmd_request" >&2
    return 1
  fi

  # Log the execution
  echo "[INFO] Executing: $cmd_request" >&2

  # Route to appropriate module
  case "$cmd_request" in
    terraform-*)
      "$AGENCE_MODULES/iac/iac.sh" terraform "${cmd_request#terraform-}"
      ;;
    git-*)
      "$AGENCE_MODULES/git/git.sh" "${cmd_request#git-}"
      ;;
    aws-*)
      "$AGENCE_MODULES/cloud/aws.sh" "${cmd_request#aws-}"
      ;;
    *)
      echo "Error: Unknown command category: $cmd_request" >&2
      return 1
      ;;
  esac

  return $?
}

# ============================================================================
# MODE: SPECIAL INITIALIZATION
# ============================================================================
# Initialize Agence environment and create required symlinks
# Example: agence ^init
