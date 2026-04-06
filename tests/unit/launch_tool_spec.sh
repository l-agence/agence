#!/usr/bin/env bash
# shellspec spec for bin/agence !<tool> launcher (launch_tool function)
# Tests the CLI tool dispatch layer: aider, claude, pilot
# Run: shellspec --shell bash tests/unit/launch_tool_spec.sh

Describe 'agence !tool launcher (mode_system / launch_tool)'

  GIT_REPO="$(pwd)"
  AGENCE_REPO="$GIT_REPO"
  AIDO_NO_VERIFY=1
  export GIT_REPO AGENCE_REPO AIDO_NO_VERIFY

  # ===========================================================================
  # Structure checks — launch_tool function exists
  # ===========================================================================

  It 'launch_tool function is defined in bin/agence'
    When run bash -c 'grep -c "^launch_tool()" bin/agence'
    The output should match pattern '[1-9]*'
  End

  It 'aider case is present in launch_tool'
    When run bash -c 'grep -c "aider)" bin/agence'
    The output should match pattern '[1-9]*'
  End

  It 'claude case is present in launch_tool'
    When run bash -c 'grep -c "claude)" bin/agence'
    The output should match pattern '[1-9]*'
  End

  It 'pilot case is present in launch_tool'
    When run bash -c 'grep -c "pilot)" bin/agence'
    The output should match pattern '[1-9]*'
  End

  # ===========================================================================
  # Not-installed error messages
  # ===========================================================================

  Describe 'when aider is not installed'
    aider_absent() { ! command -v aider >/dev/null 2>&1; }

    It 'reports aider not installed with install hint'
      Skip if 'aider is actually installed' command -v aider >/dev/null 2>&1
      When run bash bin/agence '!aider'
      The status should be failure
      The error should include 'aider not installed'
      The error should include 'pip install aider-chat'
    End
  End

  Describe 'when claude CLI is not installed'
    It 'reports claude not installed with install hint'
      Skip if 'claude is actually installed' command -v claude >/dev/null 2>&1
      When run bash bin/agence '!claude'
      The status should be failure
      The error should include 'claude not installed'
      The error should include 'npm install'
    End
  End

  Describe 'when gh copilot is not installed'
    It 'reports pilot not installed when gh missing'
      Skip if 'gh is actually installed' command -v gh >/dev/null 2>&1
      When run bash bin/agence '!pilot'
      The status should be failure
      The error should include 'gh CLI not installed'
    End

    It 'reports copilot extension missing when gh present but extension absent'
      Skip if 'gh not installed' ! command -v gh >/dev/null 2>&1
      Skip if 'gh copilot extension installed' gh copilot --version >/dev/null 2>&1
      When run bash bin/agence '!pilot'
      The status should be failure
      The error should include 'gh copilot extension not installed'
      The error should include 'gh extension install'
    End
  End

  # ===========================================================================
  # Launch with real tools (skip if absent)
  # ===========================================================================

  It 'aider launches and responds to --help'
    Skip if 'aider not installed' ! command -v aider >/dev/null 2>&1
    When run bash -c 'AI_AGENT="" bash bin/agence "!aider" -- --help 2>&1 | head -3'
    The output should include 'aider'
  End

  It 'claude launches and responds to --help'
    Skip if 'claude not installed' ! command -v claude >/dev/null 2>&1
    When run bash -c 'bash bin/agence "!claude" -- --help 2>&1 | head -3'
    The output should not be blank
  End

  # ===========================================================================
  # mode_system persona routing (agents → shell_bash_session stub)
  # These just verify routing — not launching an interactive shell
  # ===========================================================================

  It 'mode_system routes persona agents to shell_bash_session'
    When run bash -c 'grep -c "shell_bash_session" bin/agence'
    The output should match pattern '[1-9]*'
  End

  It 'help text lists !aider launcher'
    When run bash bin/agence help
    The status should be success
    The output should include '!aider'
  End

  It 'help text lists !claude launcher'
    When run bash bin/agence help
    The status should be success
    The output should include '!claude'
  End

  It 'help text lists !pilot launcher'
    When run bash bin/agence help
    The status should be success
    The output should include '!pilot'
  End

End
