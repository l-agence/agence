#!/usr/bin/env bash
# shellspec spec for CLI-003: path validation rejects escapes
# Run: shellspec tests/unit/path_validation_spec.sh
# Tests: validate_command(), normalize_path(), resolve_org_path(), guard.ts traversal detection

Describe 'Path Validation (CLI-003)'

  GIT_REPO="$(pwd)"
  AGENCE_REPO="$GIT_REPO"
  AIDO_NO_VERIFY=1
  export GIT_REPO AGENCE_REPO AIDO_NO_VERIFY

  # ===========================================================================
  # validate_command() — shell injection rejection
  # ===========================================================================

  Describe 'validate_command()'

    # Source just the function we need
    setup() {
      eval "$(sed -n '/^validate_command()/,/^}/p' bin/agence)"
    }
    BeforeEach 'setup'

    It 'accepts safe git status'
      When run validate_command 'git status'
      The status should be success
    End

    It 'accepts safe ls command'
      When run validate_command 'ls -la'
      The status should be success
    End

    It 'rejects pipe-or (||)'
      When run validate_command 'echo ok || rm -rf /'
      The status should be failure
      The stderr should include 'disallowed'
    End

    It 'rejects double-ampersand (&&)'
      When run validate_command 'echo ok && rm -rf /'
      The status should be failure
      The stderr should include 'disallowed'
    End

    It 'rejects semicolon injection'
      When run validate_command 'echo ok; rm -rf /'
      The status should be failure
      The stderr should include 'disallowed'
    End

    It 'rejects backtick subshell'
      When run validate_command 'echo `whoami`'
      The status should be failure
      The stderr should include 'disallowed'
    End

    It 'rejects $() subshell'
      When run validate_command 'echo $(whoami)'
      The status should be failure
      The stderr should include 'disallowed'
    End

    It 'rejects output redirect (>)'
      When run validate_command 'echo pwned > /etc/passwd'
      The status should be failure
      The stderr should include 'disallowed'
    End

    It 'rejects input redirect (<)'
      When run validate_command 'cat < /etc/shadow'
      The status should be failure
      The stderr should include 'disallowed'
    End

  End

  # ===========================================================================
  # normalize_path() — no traversal escape
  # ===========================================================================

  Describe 'normalize_path()'

    setup() {
      export AGENCE_PATH_STYLE="posix"
      eval "$(sed -n '/^normalize_path()/,/^}/p' bin/agence)"
    }
    BeforeEach 'setup'

    It 'resolves absolute path unchanged'
      When run normalize_path '/tmp'
      The output should equal '/tmp'
    End

    It 'resolves dot-dot to parent (no escape)'
      When run normalize_path '/tmp/sub/../other'
      The output should equal '/tmp/other'
    End

    It 'resolves double-dot chain'
      When run normalize_path '/tmp/a/b/../../c'
      The output should equal '/tmp/c'
    End

    It 'does not produce // prefix'
      When run normalize_path '/tmp/test'
      The output should not start with '//'
    End

  End

  # ===========================================================================
  # resolve_org_path() — never creates symlinks
  # ===========================================================================

  Describe 'resolve_org_path()'

    _test_dir=""

    setup() {
      eval "$(sed -n '/^resolve_org_path()/,/^}/p' bin/agence)"
      _test_dir=$(mktemp -d)
      mkdir -p "$_test_dir/myorg"
    }
    BeforeEach 'setup'

    cleanup() {
      rm -rf "$_test_dir"
    }
    AfterEach 'cleanup'

    It 'returns canonical path when no symlink exists'
      When run resolve_org_path "$_test_dir" "myorg"
      The output should equal "${_test_dir}/myorg"
    End

    It 'does not create @ symlink as side effect'
      resolve_org_path "$_test_dir" "myorg" >/dev/null
      When run test -L "${_test_dir}/@"
      The status should be failure
    End

    It 'does not create @org symlink as side effect'
      resolve_org_path "$_test_dir" "myorg" >/dev/null
      When run test -L "${_test_dir}/@myorg"
      The status should be failure
    End

    It 'prefers @ symlink when it exists'
      ln -s myorg "${_test_dir}/@"
      When run resolve_org_path "$_test_dir" "myorg"
      The output should equal "${_test_dir}/@"
    End

  End

  # ===========================================================================
  # guard.ts — path traversal & injection detection
  # ===========================================================================

  Describe 'guard.ts path traversal'

    Skip if 'bun not available' test ! -x "$(command -v bun 2>/dev/null || true)"

    It 'blocks ../ traversal in commands'
      When run bun run lib/guard.ts classify 'cat ../../etc/passwd'
      The output should include '"tier": "T3"'
      The output should include '"action": "deny"'
    End

    It 'blocks ..\ backslash traversal'
      When run bun run lib/guard.ts classify 'type ..\..\..\windows\system32\config\sam'
      The output should include '"tier": "T3"'
      The output should include '"action": "deny"'
    End

    It 'allows safe git status'
      When run bun run lib/guard.ts classify 'git status'
      The output should include '"action": "allow"'
    End

    It 'blocks rm -rf /'
      When run bun run lib/guard.ts classify 'rm -rf /'
      The output should include '"action": "deny"'
    End

    It 'blocks git push --force'
      When run bun run lib/guard.ts classify 'git push --force'
      The output should not include '"action": "allow"'
    End

    It 'blocks git clean -fdx'
      When run bun run lib/guard.ts classify 'git clean -fdx'
      The output should not include '"action": "allow"'
    End

  End

End
