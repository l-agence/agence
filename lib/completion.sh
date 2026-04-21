#!/usr/bin/env bash
# lib/completion.sh — Bash tab-completion for agence commands
# Sourced by bin/agence.
[[ -n "${_AGENCE_COMPLETION_LOADED:-}" ]] && return 0
_AGENCE_COMPLETION_LOADED=1

_agence_completion() {
  local cur prev words
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  local caret_commands="help symbols init reload install save learn commit push stash sync session lesson log plan todo fault issue task job audit ledger handoff pickup pause resume index reindex recall retain cache forget promote distill memory"
  local knowledge_subcmds="list show add"

  case "${COMP_WORDS[1]}" in
    "^help"|"^init"|"^reload"|"^save"|"^learn"|"^stash"|"^sync"|"^push")
      COMPREPLY=()
      ;;
    "^lesson"|"^plan"|"^issue")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "$knowledge_subcmds" -- "$cur") )
      elif [[ "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--org" -- "$cur") )
      fi
      ;;
    "^log"|"^fault"|"^todo")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "$knowledge_subcmds" -- "$cur") )
      fi
      ;;
    "^task")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "$knowledge_subcmds" -- "$cur") )
      elif [[ "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--assign" -- "$cur") )
      fi
      ;;
    "^job")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "$knowledge_subcmds" -- "$cur") )
      elif [[ "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--agent" -- "$cur") )
      fi
      ;;
    "^audit")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "trail show agent session diff stats" -- "$cur") )
      elif [[ "${COMP_WORDS[2]}" == "trail" && "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--type --shard" -- "$cur") )
      elif [[ "${COMP_WORDS[2]}" == "show" || "${COMP_WORDS[2]}" == "agent" || "${COMP_WORDS[2]}" == "session" || "${COMP_WORDS[2]}" == "diff" ]]; then
        COMPREPLY=()
      fi
      ;;
    "^ledger")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "init list show add sync status" -- "$cur") )
      elif [[ "${COMP_WORDS[2]}" == "list" && "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--last --all" -- "$cur") )
      elif [[ "${COMP_WORDS[2]}" == "init" && "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--remote" -- "$cur") )
      fi
      ;;
    "^handoff")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "@ralph @sonya @aider @copilot user" -- "$cur") )
      fi
      ;;
    "^pickup"|"^resume")
      if [[ $COMP_CWORD -eq 2 ]]; then
        local dir="${AGENCE_ROOT:-$PWD}/nexus/.aihandoffs"
        COMPREPLY=( $(compgen -W "$(ls "$dir" 2>/dev/null | sed 's/\.json$//')" -- "$cur") )
      fi
      ;;
    "^pause"|"^index")
      COMPREPLY=()
      ;;
    "^reindex")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "--source --input --output --print" -- "$cur") )
      fi
      ;;
    "^recall"|"~recall")
      if [[ $COMP_CWORD -eq 2 && "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--source --max --negative" -- "$cur") )
      fi
      ;;
    "^retain")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "eidetic semantic episodic kinesthetic masonic" -- "$cur") )
      elif [[ "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--importance --negative" -- "$cur") )
      fi
      ;;
    "^cache")
      if [[ "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--max --masonic" -- "$cur") )
      fi
      ;;
    "^forget")
      if [[ $COMP_CWORD -eq 3 ]]; then
        COMPREPLY=( $(compgen -W "eidetic semantic episodic kinesthetic masonic" -- "$cur") )
      fi
      ;;
    "^promote")
      if [[ $COMP_CWORD -eq 3 || $COMP_CWORD -eq 4 ]]; then
        COMPREPLY=( $(compgen -W "eidetic semantic episodic kinesthetic masonic" -- "$cur") )
      fi
      ;;
    "^memory")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "retain recall cache forget promote distill list stats help" -- "$cur") )
      elif [[ $COMP_CWORD -eq 3 && "${COMP_WORDS[2]}" == "list" ]]; then
        COMPREPLY=( $(compgen -W "eidetic semantic episodic kinesthetic masonic" -- "$cur") )
      fi
      ;;
    "^distill")
      if [[ $COMP_CWORD -eq 2 || $COMP_CWORD -eq 3 ]]; then
        COMPREPLY=( $(compgen -W "eidetic semantic episodic kinesthetic masonic" -- "$cur") )
      elif [[ "$cur" == "--"* ]]; then
        COMPREPLY=( $(compgen -W "--min-importance --min-age-days --tags --dry-run" -- "$cur") )
      fi
      ;;
    "^session")
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "list view handoff assign attach export import push pull" -- "$cur") )
      fi
      ;;
    *)
      # First argument: suggest ^ commands
      if [[ $COMP_CWORD -eq 1 ]]; then
        local suggestions=""
        for cmd in $caret_commands; do
          suggestions="$suggestions ^$cmd"
        done
        suggestions="$suggestions ~recall"
        COMPREPLY=( $(compgen -W "$suggestions" -- "$cur") )
      fi
      ;;
  esac
}

complete -F _agence_completion agence

# ============================================================================
# MODE: SESSION MANAGEMENT
# ============================================================================
# Manage agentic sessions: list, view, handoff, assign, attach, export/import
# Example: agence ^session list
# Example: agence ^session handoff <id> @agent

