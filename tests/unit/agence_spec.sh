#!/usr/bin/env bash
# shellspec spec for bin/agence
# Run: shellspec tests/unit/agence_spec.sh
# Requires: shellspec with --shell bash (set in .shellspec)

Describe 'Agence CLI'

  # Pre-set execution context so every 'When run bash bin/agence' subprocess
  # inherits GIT_REPO/AGENCE_REPO — bypasses slow 'git rev-parse' on WSL/NTFS
  # (git rev-parse against /mnt/c/... can take 2-5s per call)
  GIT_REPO="$(pwd)"
  AGENCE_REPO="$GIT_REPO"
  # Skip aido session verification in tests — aisession 'Your choice:' blocks without TTY
  AIDO_NO_VERIFY=1
  export GIT_REPO AGENCE_REPO AIDO_NO_VERIFY

  # ===========================================================================
  # Help & Version
  # ===========================================================================

  It 'shows help with --help'
    When run bash bin/agence --help
    The status should be success
    The output should include 'USAGE:'
    The output should include 'Agence'
  End

  It 'shows help with -h flag'
    When run bash bin/agence -h
    The status should be success
    The output should include 'USAGE:'
  End

  It 'shows help with bare help subcommand'
    When run bash bin/agence help
    The status should be success
    The output should include 'USAGE:'
    The output should include 'MODES:'
  End

  It 'shows version with --version'
    When run bash bin/agence --version
    The status should be success
    The output should include 'Agence'
  End

  It 'shows version with -v flag'
    When run bash bin/agence -v
    The status should be success
    The output should include 'Agence'
  End

  It 'shows version with bare version subcommand'
    When run bash bin/agence version
    The status should be success
    The output should include 'Agence version'
  End

  # ===========================================================================
  # Chat mode (default / bare string)
  # AGENCE_TRACE=1 → mode_chat prints "[router_chat] provider=..." without LLM call
  # ===========================================================================

  It 'routes chat queries to router_chat'
    When run env AGENCE_TRACE=1 bash bin/agence "What is Agence?"
    The status should be success
    The output should include 'router_chat'
  End

  It 'routes bare strings to chat mode (no prefix)'
    When run env AGENCE_TRACE=1 bash bin/agence "hello agence"
    The status should be success
    The output should include 'router_chat'
  End

  It 'routes explicit chat subcommand to chat mode'
    When run env AGENCE_TRACE=1 bash bin/agence chat "hello agence"
    The status should be success
    The output should include 'router_chat'
  End

  # ===========================================================================
  # AI-routed mode (+)
  # AGENCE_TRACE=1 → mode_ai_routed prints "[router_plan_action] ..." without LLM call
  # ===========================================================================

  It 'routes +plan to router_plan_action'
    When run env AGENCE_TRACE=1 bash bin/agence +plan
    The status should be success
    The output should include 'router_plan_action'
  End

  It 'routes +deploy to router_plan_action'
    When run env AGENCE_TRACE=1 bash bin/agence +deploy
    The status should be success
    The output should include 'router_plan_action'
  End

  # ===========================================================================
  # External commands (/) — integration (require real tools / bin/aido)
  # ===========================================================================

  It 'handles ghauth external command'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghauth
    The status should be success
    The output should include 'github.com'
  End

  It 'handles ghlogin external command'
    Skip 'integration: interactive gh auth login — cannot run headlessly'
    When run bash bin/agence /ghlogin
    The status should be success
  End

  It 'handles gitstatus external command'
    When run bash bin/agence /gitstatus
    The status should be success
    The output should include 'On branch'
  End

  It 'handles ghstatus external command'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghstatus
    The status should be success
    The output should include 'l-agence'
  End

  # ===========================================================================
  # Git shortcuts and generic /git handler (AIPOLICY tier model)
  # T0 commands auto-execute (no TTY needed) — fully testable
  # T1/T2 commands require TTY read prompt — Skip
  # T3 commands block immediately — testable
  # ===========================================================================

  It '/git status runs git status (T0: auto-execute)'
    Skip if 'aido not in PATH or not interactive' ! command -v aido > /dev/null 2>&1
    When run bash bin/agence /git status
    The status should be success
    The output should include 'branch'
  End

  It '/git log runs git log (T0: auto-execute)'
    Skip if 'aido not in PATH or not interactive' ! command -v aido > /dev/null 2>&1
    When run bash bin/agence /git log --oneline -3
    The status should be success
    The output should not be blank
  End

  It '/git diff runs git diff (T0: auto-execute)'
    Skip if 'aido not in PATH or not interactive' ! command -v aido > /dev/null 2>&1
    When run bash bin/agence /git diff --stat HEAD~1
    The status should be success
    The output should include 'changed'
  End

  It '/git with no subcommand prints usage and fails'
    Skip if 'aido not in PATH' ! command -v aido > /dev/null 2>&1
    When run bash bin/agence /git
    The status should be failure
    The error should include 'Usage:'
    The error should include 'agence /git'
  End

  It '/git filter-branch is T3 blocked'
    Skip if 'aido not in PATH' ! command -v aido > /dev/null 2>&1
    When run bash bin/agence /git filter-branch
    The status should be failure
    The error should include 'BLOCKED'
    The error should include 'T3'
  End

  It '/git gc is T3 blocked'
    Skip if 'aido not in PATH' ! command -v aido > /dev/null 2>&1
    When run bash bin/agence /git gc
    The status should be failure
    The error should include 'BLOCKED'
  End

  It '/status shortcut runs git status (T0: auto-execute)'
    When run bash bin/agence /status
    The status should be success
    The output should include 'branch'
  End

  It '/log shortcut runs git log (T0: auto-execute)'
    When run bash bin/agence /log
    The status should be success
    The output should include 'agence'
  End

  It '/remote shortcut runs git remote (T0: auto-execute)'
    When run bash bin/agence /remote
    The status should be success
    The output should include 'origin'
  End

  It '/fetch shortcut requires TTY confirmation (T2: Skip in CI)'
    Skip 'T2: git fetch requires interactive confirm — cannot run headlessly'
    When run bash bin/agence /fetch
    The status should be success
  End

  It '/pull shortcut requires TTY confirmation (T2: Skip in CI)'
    Skip 'T2: git pull requires interactive confirm — cannot run headlessly'
    When run bash bin/agence /pull
    The status should be success
  End

  # ===========================================================================
  # GitHub CLI shortcuts and generic /gh handler (AIPOLICY tier model)
  # T0 auto-execute (no TTY) — fully testable with real authenticated gh
  # T2 mutation commands — Skip (require interactive TTY confirm)
  # ===========================================================================

  It '/gh with no subcommand shows usage and fails'
    When run bash bin/agence /gh
    The status should be failure
    The error should include 'Usage:'
    The error should include '/gh'
  End

  It '/gh --help passes through to gh help'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /gh --help
    The status should be success
    The output should include 'USAGE'
  End

  It '/gh auth status runs gh auth status (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /gh auth status
    The status should be success
    The output should include 'github.com'
  End

  It '/gh repo view runs gh repo view (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /gh repo view
    The status should be success
    The output should include 'agence'
  End

  It '/ghremote shortcut runs gh repo view (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghremote
    The status should be success
    The output should include 'agence'
  End

  It '/ghpull shortcut lists PRs by default (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghpull
    The status should be success
  End

  It '/ghlog shortcut lists run history (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghlog
    The status should be success
  End

  It '/ghrun lists runs by default (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghrun
    The status should be success
  End

  It '/ghflow lists workflows by default (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghflow
    The status should be success
  End

  It '/ghissue lists issues by default (T0: auto-execute)'
    Skip if 'gh not authenticated' ! gh auth status >/dev/null 2>&1
    When run bash bin/agence /ghissue
    The status should be success
  End

  It '/gh pr merge requires TTY confirmation (T2: Skip in CI)'
    Skip 'T2: gh pr merge requires interactive confirm — cannot run headlessly'
    When run bash bin/agence /gh pr merge
    The status should be success
  End

  It '/ghmerge requires TTY confirmation (T2: Skip in CI)'
    Skip 'T2: gh pr merge requires interactive confirm — cannot run headlessly'
    When run bash bin/agence /ghmerge
    The status should be success
  End

  It '/gh secret set is T2 (Skip in CI)'
    Skip 'T2: gh secret set requires interactive confirm — CI/CD secret mutation'
    When run bash bin/agence /gh secret set
    The status should be success
  End

  # ===========================================================================
  # System commands (!)
  # ===========================================================================

  It 'handles !help system command'
    When run bash bin/agence '!help'
    The status should be success
    The output should include 'USAGE:'
  End

  It 'handles !version system command'
    When run bash bin/agence '!version'
    The status should be success
    The output should include 'Agence version'
  End

  It 'handles !config system command'
    When run bash bin/agence '!config'
    The status should be success
    The output should include 'config'
  End

  It 'handles !status system command'
    When run bash bin/agence '!status'
    The status should be success
    The output should include 'Agence Status:'
  End

  It '!status includes root path'
    When run bash bin/agence '!status'
    The status should be success
    The output should include 'Root:'
  End

  It '!status includes config path'
    When run bash bin/agence '!status'
    The status should be success
    The output should include 'Config:'
  End

  # ===========================================================================
  # Init commands (^)
  # ===========================================================================

  It 'handles ^init init command'
    Skip 'integration: init_agence_environment sources .agencerc — needs mock to run safely in CI'
    When run bash bin/agence '^init'
    The status should be success
    The output should include 'AGENCE INITIALIZATION'
  End

  It 'handles ^reload init command'
    When run bash bin/agence '^reload'
    The status should be success
    The output should include 'RELOAD'
  End

  It 'handles ^install init command'
    Skip 'integration: attempts real package installation (apt-get/winget/brew) — not safe for automated runs'
    When run bash bin/agence '^install'
    The output should include 'AGENCE PACKAGE INSTALLATION'
  End

  # ---------------------------------------------------------------------------
  # Session subcommands
  # ---------------------------------------------------------------------------

  It 'handles ^session list with no sessions present'
    When run bash bin/agence '^session' 'list'
    The status should be success
    The output should include 'SESSION LIST'
  End

  It '^session list reports output'
    When run bash bin/agence '^session' 'list'
    The status should be success
    The output should not be blank
  End

  It '^session view requires session_id argument'
    When run bash bin/agence '^session' 'view'
    The status should be failure
    The error should include 'Usage:'
  End

  It '^session handoff requires session_id and new_owner arguments'
    When run bash bin/agence '^session' 'handoff'
    The status should be failure
    The error should include 'Usage:'
  End

  It '^session export requires session_id'
    When run bash bin/agence '^session' 'export'
    The status should be failure
    The error should include 'Usage:'
  End

  It '^session import requires input_file'
    When run bash bin/agence '^session' 'import'
    The status should be failure
    The error should include 'Usage:'
  End

  It '^session assign requires session_id and agent'
    When run bash bin/agence '^session' 'assign'
    The status should be failure
    The error should include 'Usage:'
  End

  It '^session-restore requires session_id and snapshot_dir arguments'
    When run bash bin/agence '^session-restore'
    The status should be failure
    The error should include 'Usage:'
  End

  # ===========================================================================
  # Error handling
  # ===========================================================================

  It 'shows error for unknown external command'
    When run bash bin/agence /unknowncmd
    The status should be failure
    The error should include 'Error:'
  End

  It 'shows error for unknown system command'
    When run bash bin/agence '!unknown'
    The status should be failure
    The error should include 'Unknown system command'
  End

  It 'shows error for unknown init command'
    When run bash bin/agence '^unknown'
    The status should be failure
    The error should include 'Error: Unknown init command'
  End

  # ===========================================================================
  # Execution context
  # ===========================================================================

  It 'execution context is initialised (exits cleanly)'
    When run bash bin/agence '!status'
    The status should be success
    The output should include 'Agence Status:'
  End

  It 'execution context tolerates pre-set GIT_ROOT env var'
    GIT_ROOT="$(pwd)"
    export GIT_ROOT
    When run bash bin/agence --version
    The status should be success
    The output should include 'Agence'
  End

  # ===========================================================================
  # Knowledge commands (^lesson, ^log, ^plan, ^todo, ^fault, ^issue, ^task, ^job)
  # ===========================================================================

  It '^plan list returns plan entries or empty'
    When run bash bin/agence '^plan' 'list'
    The status should be success
    The output should include '[plan]'
  End

  It '^lesson list returns lesson entries or empty'
    When run bash bin/agence '^lesson' 'list'
    The status should be success
    The output should include '[lesson]'
  End

  It '^todo list returns todo entries or empty'
    When run bash bin/agence '^todo' 'list'
    The status should be success
    The output should include '[todo]'
  End

  It '^fault list returns fault entries or empty'
    When run bash bin/agence '^fault' 'list'
    The status should be success
    The output should include '[fault]'
  End

  It '^issue list returns issue entries or empty'
    When run bash bin/agence '^issue' 'list'
    The status should be success
    The output should include '[issue]'
  End

  It '^task list returns task entries or empty'
    When run bash bin/agence '^task' 'list'
    The status should be success
    The output should include '[task]'
  End

  It '^job list returns job entries or empty'
    When run bash bin/agence '^job' 'list'
    The status should be success
    The output should include '[job]'
  End

  It '^log list returns log entries or empty'
    When run bash bin/agence '^log' 'list'
    The status should be success
    The output should include '[log]'
  End

  It '^plan add requires a title argument'
    When run bash bin/agence '^plan' 'add'
    The status should be failure
    The stderr should include 'Usage:'
  End

  It '^lesson add requires a content argument'
    When run bash bin/agence '^lesson' 'add'
    The status should be failure
    The stderr should include 'Usage:'
  End

  It '^task add requires title and --assign'
    When run bash bin/agence '^task' 'add'
    The status should be failure
    The stderr should include 'Usage:'
  End

  It '^plan show with unknown id returns not found'
    When run bash bin/agence '^plan' 'show' 'nonexistent-plan-xyz'
    The status should be failure
    The stderr should include 'not found'
  End

  It '^lesson show with unknown id returns not found'
    When run bash bin/agence '^lesson' 'show' 'nonexistent-lesson-xyz'
    The status should be failure
    The stderr should include 'not found'
  End

  # ===========================================================================
  # Symbols and Help commands
  # ===========================================================================

  It '^symbols displays task state table'
    When run bash bin/agence 'symbols'
    The status should be success
    The output should include 'TASK STATE'
  End

  It '^symbols displays routing section'
    When run bash bin/agence 'symbols'
    The status should be success
    The output should include 'ROUTING'
  End

  It '^symbols displays command modes'
    When run bash bin/agence 'symbols'
    The status should be success
    The output should include 'COMMAND MODES'
  End

  It '^symbols displays workflow notation'
    When run bash bin/agence 'symbols'
    The status should be success
    The output should include 'WORKFLOW'
  End

  It '^help shows all command categories'
    When run bash bin/agence 'help'
    The status should be success
    The output should include 'USAGE:'
  End

  # ===========================================================================
  # Handoff / Pickup / Pause / Resume / Reindex
  # ===========================================================================

  It '^handoff requires agent argument'
    When run bash bin/agence '^handoff'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^pickup with no sessions shows list or empty'
    When run bash bin/agence '^pickup'
    The status should be success
  End

  It '^pause creates valid checkpoint'
    When run bash bin/agence '^pause'
    The status should be success
    The output should include 'Session'
  End

  It '^resume with no paused sessions reports empty or lists'
    When run bash bin/agence '^resume'
    The status should be success
  End

  It '^reindex runs without error'
    When run bash bin/agence '^reindex'
    The status should be success
    The output should include 'REINDEX'
  End

  # ===========================================================================
  # aibash: shebang + help (non-interactive, non-hanging tests)
  # ===========================================================================

  Describe 'aibash shell'

    It 'has #!/usr/bin/env bash as first line'
      When run bash -c 'head -1 bin/aibash'
      The output should equal '#!/usr/bin/env bash'
    End

    It 'exits cleanly with --help'
      When run bash bin/aibash --help
      The status should be success
      The output should include 'aibash: Agentic'
    End

    It 'exits cleanly with help'
      When run bash bin/aibash help
      The status should be success
      The output should include 'Usage:'
    End

    It 'shows signal handler note in help'
      When run bash bin/aibash --help
      The status should be success
      The output should include 'PARENT-owned'
    End

  End

  # ===========================================================================
  # ibash: sanity checks (non-hanging)
  # ===========================================================================

  Describe 'ibash shell'

    It 'has #!/usr/bin/env bash as first line'
      When run bash -c 'head -1 bin/ibash'
      The output should equal '#!/usr/bin/env bash'
    End

    It 'uses nexus/.aisessions for session recordings'
      When run bash -c 'grep -c "\.aisessions" bin/ibash'
      The output should match pattern '[1-9]*'
    End

    It 'does not have duplicate GIT_ROOT derivation'
      When run bash -c 'grep -c "BASH_SOURCE\[0\]" bin/ibash'
      The output should equal '1'
    End

  End

End
