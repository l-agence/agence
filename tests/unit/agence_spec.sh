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
  export GIT_REPO AGENCE_REPO

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
  # ===========================================================================

  It 'routes chat queries to router_chat'
    When run bash bin/agence "What is Agence?"
    The status should be success
    The output should include 'router_chat'
  End

  It 'routes bare strings to chat mode (no prefix)'
    When run bash bin/agence "hello agence"
    The status should be success
    The output should include 'router_chat'
  End

  It 'routes explicit chat subcommand to chat mode'
    When run bash bin/agence chat "hello agence"
    The status should be success
    The output should include 'router_chat'
  End

  # ===========================================================================
  # AI-routed mode (+)
  # Pending: stub returns ACTION: chat which has no dispatch handler yet
  # ===========================================================================

  It 'routes +plan to router_plan_action (stub)'
    Skip 'router_plan_action stub returns ACTION: chat which has no handler yet — needs action dispatch wiring'
    When run bash bin/agence +plan
    The status should be success
    The output should include 'router_plan_action'
  End

  It 'routes +deploy to router_plan_action (stub)'
    Skip 'router_plan_action stub returns ACTION: chat which has no handler yet — needs action dispatch wiring'
    When run bash bin/agence +deploy
    The status should be success
    The output should include 'router_plan_action'
  End

  # ===========================================================================
  # External commands (/) — integration (require real tools / bin/aido)
  # Skip: these call real external tools (gh, aido) and are interactive
  # ===========================================================================

  It 'handles ghauth external command'
    Skip 'integration: calls bin/aido gh auth status (real gh required)'
    When run bash bin/agence /ghauth
    The output should include 'gh auth status'
  End

  It 'handles ghlogin external command'
    Skip 'integration: interactive gh auth login — cannot run headlessly'
    When run bash bin/agence /ghlogin
    The output should include 'gh auth login'
  End

  It 'handles gitstatus external command'
    Skip 'integration: calls bin/aido git status (real git session capture required)'
    When run bash bin/agence /gitstatus
    The output should include 'git status'
  End

  It 'handles ghstatus external command'
    Skip 'integration: calls bin/aido gh repo view (real gh required)'
    When run bash bin/agence /ghstatus
    The output should include 'gh repo view'
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

  It 'handles ^session-list with no sessions present'
    When run bash bin/agence '^session-list'
    The status should be success
    The output should include 'SESSION LIST'
  End

  It '^session-list reports active sessions header'
    When run bash bin/agence '^session-list'
    The status should be success
    The output should include 'Active sessions:'
  End

  It '^session-kill reports not-found for nonexistent session'
    When run bash bin/agence '^session-kill' 'nonexistent-test-session'
    The status should be success
    The output should include 'not found'
  End

  It '^session-status reports not-found for nonexistent session'
    When run bash bin/agence '^session-status' 'nonexistent-test-session'
    The status should be success
    The output should include 'not found'
  End

  It '^session-attach requires session_id argument'
    When run bash bin/agence '^session-attach'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-handoff requires session_id and new_owner arguments'
    When run bash bin/agence '^session-handoff'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-export requires session_id and output_file arguments'
    When run bash bin/agence '^session-export'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-import requires input_file and session_id arguments'
    When run bash bin/agence '^session-import'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-pause requires session_id argument'
    When run bash bin/agence '^session-pause'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-resume requires session_id argument'
    When run bash bin/agence '^session-resume'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-replay reports no log for nonexistent session'
    When run bash bin/agence '^session-replay' 'nonexistent-test-session'
    The status should be success
    The output should include 'No replay log found'
  End

  It '^session-audit reports no log for nonexistent session'
    When run bash bin/agence '^session-audit' 'nonexistent-test-session'
    The status should be success
    The output should include 'No audit log found'
  End

  It '^session-migrate requires session_id and target_dir arguments'
    When run bash bin/agence '^session-migrate'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-snapshot requires session_id and snapshot_dir arguments'
    When run bash bin/agence '^session-snapshot'
    The status should be failure
    The output should include 'Usage:'
  End

  It '^session-restore requires session_id and snapshot_dir arguments'
    When run bash bin/agence '^session-restore'
    The status should be failure
    The output should include 'Usage:'
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

End
