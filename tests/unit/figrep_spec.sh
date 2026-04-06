#!/usr/bin/env bash
# shellspec spec for bin/figrep (find + grep combined utility)
# Run: shellspec --shell bash tests/unit/figrep_spec.sh

Describe 'figrep (find + grep utility)'

  # ===========================================================================
  # File structure
  # ===========================================================================

  It 'figrep exists and is executable'
    When run bash -c 'test -x bin/figrep && echo ok'
    The output should equal 'ok'
  End

  It 'has correct shebang'
    When run bash -c 'head -1 bin/figrep'
    The output should equal '#!/usr/bin/env bash'
  End

  It 'skips .git directory (no .git in path)'
    When run bash -c 'grep -c "\.git" bin/figrep'
    The output should match pattern '[1-9]*'
  End

  # ===========================================================================
  # Usage / argument validation
  # ===========================================================================

  It 'shows usage when called with no arguments'
    When run bash bin/figrep
    The status should be failure
    The error should include 'Usage:'
    The error should include 'figrep'
  End

  It 'shows usage when called with only one argument'
    When run bash bin/figrep somepath
    The status should be failure
    The error should include 'Usage:'
  End

  # ===========================================================================
  # Search functionality
  # ===========================================================================

  It 'finds a known string in the bin/ directory'
    When run bash bin/figrep bin 'agence'
    The status should be success
    The output should not be blank
  End

  It 'returns matches with file paths'
    When run bash bin/figrep bin 'mode_system'
    The status should be success
    The output should include 'bin/agence'
  End

  It 'returns no output (exit 1) when pattern not found'
    When run bash bin/figrep bin 'XYZZY_NOTFOUND_12345'
    The status should be failure
  End

  It 'respects extra grep options (-l lists files only)'
    When run bash bin/figrep bin 'mode_system' -l
    The status should be success
    The output should include 'agence'
    The output should not include ':'
  End

  It 'respects extra grep options (-i for case-insensitive)'
    When run bash bin/figrep bin 'MODE_SYSTEM' -i
    The status should be success
    The output should include 'agence'
  End

  It 'searches recursively into subdirectories'
    When run bash bin/figrep lib 'router'
    The status should be success
    The output should include 'router'
  End

  It 'works with a dot (.) as path for current directory'
    When run bash bin/figrep . 'agence_spec'
    The status should be success
    The output should include 'agence_spec'
  End

  It 'does not return .git object paths'
    When run bash bin/figrep . 'agence'
    The output should not include '/.git/'
  End

  It 'works with codex directory'
    When run bash bin/figrep codex 'PRINCIPLES'
    The status should be success
    The output should not be blank
  End

End
