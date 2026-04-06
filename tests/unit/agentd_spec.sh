#!/usr/bin/env bash
# shellspec spec for bin/agentd tmux swarm orchestrator
# Run: shellspec --shell bash tests/unit/agentd_spec.sh

Describe 'agentd (tmux swarm orchestrator)'

  SESSION_NAME="agence-test-$$"
  export AGENTD_SESSION="$SESSION_NAME"

  # Clean up any leftover test session after each example
  AfterEach 'tmux kill-session -t "$SESSION_NAME" 2>/dev/null; true'

  # ===========================================================================
  # File structure
  # ===========================================================================

  It 'agentd exists and is executable'
    When run bash -c 'test -x bin/agentd && echo ok'
    The output should equal 'ok'
  End

  It 'has correct shebang'
    When run bash -c 'head -1 bin/agentd'
    The output should equal '#!/usr/bin/env bash'
  End

  It 'defines all expected subcommands'
    When run bash -c 'grep -E "^  start\)" bin/agentd | wc -l | tr -d " "'
    The output should equal '1'
  End

  # ===========================================================================
  # Help
  # ===========================================================================

  It 'shows help with no arguments'
    When run bash bin/agentd
    The status should be success
    The output should include 'agentd'
    The output should include 'USAGE:'
  End

  It 'shows help with help argument'
    When run bash bin/agentd help
    The status should be success
    The output should include 'USAGE:'
    The output should include 'start'
    The output should include 'stop'
    The output should include 'attach'
    The output should include 'add'
  End

  It 'shows help with --help'
    When run bash bin/agentd --help
    The status should be success
    The output should include 'USAGE:'
  End

  It 'shows help with -h'
    When run bash bin/agentd -h
    The status should be success
    The output should include 'USAGE:'
  End

  # ===========================================================================
  # tmux-dependent tests (skip if tmux absent)
  # ===========================================================================

  Describe 'tmux operations'

    It 'status reports not running when session absent'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      When run bash bin/agentd status
      The status should be success
      The output should include 'Not running'
    End

    It 'stop is safe when not running'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      When run bash bin/agentd stop
      The status should be success
      The output should include 'Not running'
    End

    It 'attach fails gracefully when not running'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      When run bash bin/agentd attach
      The status should be failure
      The error should include 'Not running'
    End

    It 'add fails gracefully when not running'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      When run bash bin/agentd add ralph
      The status should be failure
      The error should include 'Not running'
    End

    It 'add requires an agent name'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      When run bash bin/agentd add
      The status should be failure
      The error should include 'Usage:'
    End

    It 'start creates tmux session with default agents'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      # Start detached
      bash bin/agentd start >/dev/null 2>&1
      When run bash bin/agentd status
      The status should be success
      The output should include 'running'
      The output should include '@copilot'
    End

    It 'start detects already-running session'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      bash bin/agentd start >/dev/null 2>&1
      When run bash bin/agentd start
      The status should be success
      The output should include 'already running'
    End

    It 'status lists all agent windows after start'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      bash bin/agentd start >/dev/null 2>&1
      When run bash bin/agentd status
      The status should be success
      The output should include '@copilot'
      The output should include '@ralph'
    End

    It 'add creates a new agent window in running session'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      bash bin/agentd start copilot >/dev/null 2>&1
      When run bash bin/agentd add sonya
      The status should be success
      The output should include '@sonya'
    End

    It 'stop kills the session'
      Skip if 'tmux not installed' ! command -v tmux >/dev/null 2>&1
      bash bin/agentd start >/dev/null 2>&1
      bash bin/agentd stop >/dev/null 2>&1
      When run bash bin/agentd status
      The status should be success
      The output should include 'Not running'
    End

    It 'unknown subcommand returns failure'
      When run bash bin/agentd unknowncmd
      The status should be failure
      The error should include 'Unknown command'
    End

  End

  # ===========================================================================
  # AGENTD_SESSION env override
  # ===========================================================================

  It 'AGENTD_SESSION variable is used as session name'
    When run bash -c 'grep -c "AGENTD_SESSION" bin/agentd'
    The output should match pattern '[1-9]*'
  End

  It 'AGENTD_AGENTS variable is documented in help'
    When run bash bin/agentd help
    The output should include 'AGENTD_AGENTS'
  End

End
