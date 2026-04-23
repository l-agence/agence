#!/usr/bin/env bash
# shellspec spec for TEST-001: ^ledger, ^audit, ^session prune, ^index
# Run: shellspec tests/unit/test001_spec.sh
# Tests: dispatch routing, error handling, bash fallback (ailedger), ^index scan

Describe 'TEST-001: ledger / audit / session prune / index'

  GIT_REPO="$(pwd)"
  AGENCE_REPO="$GIT_REPO"
  AGENCE_ROOT="$GIT_REPO"
  AIDO_NO_VERIFY=1
  export GIT_REPO AGENCE_REPO AGENCE_ROOT AIDO_NO_VERIFY

  # ===========================================================================
  # ^index — scan_knowledge_bases() (pure bash, no bun required)
  # ===========================================================================

  Describe '^index (scan_knowledge_bases)'

    It 'exits 0 and produces output'
      When run bash bin/agence index
      The status should be success
      The output should include 'INDEX SCAN'
    End

    It 'prints INDEX SCAN header'
      When run bash bin/agence index
      The output should include 'INDEX SCAN'
    End

    It 'scans knowledge directory'
      When run bash bin/agence index
      The output should include 'Scanning: knowledge/'
    End

    It 'scans nexus directory'
      When run bash bin/agence index
      The output should include 'Scanning: nexus/'
    End

    It 'scans organic directory'
      When run bash bin/agence index
      The output should include 'Scanning: organic/'
    End

    It 'prints scan count summary'
      When run bash bin/agence index
      The output should include 'Scanned:'
      The output should include 'INDEX.md files'
    End

    It 'reports existing INDEX pairs with check mark'
      # organic/tasks has both INDEX.md and INDEX.json
      When run bash bin/agence index
      The output should include '✓'
    End

    It 'reports missing INDEX.json with warning'
      # Several dirs have INDEX.md but no INDEX.json
      When run bash bin/agence index
      The output should include '⚠'
    End

    It 'prints SCAN COMPLETE footer'
      When run bash bin/agence index
      The output should include 'SCAN COMPLETE'
    End

  End

  # ===========================================================================
  # ^ledger — dispatch to bun lib/ledger.ts
  # ===========================================================================

  Describe '^ledger dispatch'

    It 'requires bun + lib/ledger.ts'
      # With bun missing from PATH, should fail with error message
      When run env PATH="/usr/bin:/bin" bash bin/agence ledger status
      The status should be failure
      The stderr should include 'requires bun'
    End

    It 'error message mentions ledger.ts'
      # Verify the error path mentions the right file
      When run env PATH="/usr/bin:/bin" bash bin/agence ledger status
      The status should be failure
      The stderr should include 'ledger'
    End

  End

  # ===========================================================================
  # ^audit — dispatch to bun lib/audit.ts
  # ===========================================================================

  Describe '^audit dispatch'

    It 'requires bun + lib/audit.ts'
      When run env PATH="/usr/bin:/bin" bash bin/agence audit trail
      The status should be failure
      The stderr should include 'requires bun'
    End

  End

  # ===========================================================================
  # ^session prune — dispatch to bin/airun session prune
  # ===========================================================================

  Describe '^session prune dispatch'

    It 'requires bun + lib/session.ts'
      When run env PATH="/usr/bin:/bin" bash bin/agence session prune
      The status should be failure
      The stderr should include 'requires bun'
    End

    It 'rejects unknown session subcommand'
      When run bash bin/agence session bogus
      The status should be failure
      The stderr should include 'Unknown session subcommand'
    End

    It 'lists available session subcommands on error'
      When run bash bin/agence session bogus
      The status should be failure
      The stderr should include 'list'
      The stderr should include 'prune'
    End

  End

  # ===========================================================================
  # lib/ailedger.sh — Merkle-chained append-only ledger (bash fallback)
  # ===========================================================================

  Describe 'ailedger.sh (bash fallback)'

    # Use a temp directory for isolated ledger tests
    _test_ledger_dir=""

    setup_ledger() {
      _test_ledger_dir="$(mktemp -d)"
      export AGENCE_LEDGER_DIR="$_test_ledger_dir"
      export AGENCE_LEDGER_NO_BUN=1
      export AGENCE_ROOT="$GIT_REPO"
      export AI_SESSION_ID="test-session-001"
      export AI_AGENT="test-agent"
      # shellcheck disable=SC1091
      . lib/ailedger.sh
    }

    cleanup_ledger() {
      rm -rf "$_test_ledger_dir"
    }

    BeforeEach 'setup_ledger'
    AfterEach 'cleanup_ledger'

    Describe 'ailedger_append'

      It 'creates ledger file on first append'
        ailedger_append "route" "test-tag" "TASK-99" "echo hello" "0"
        When call ailedger_count
        The output should equal "1"
      End

      It 'first entry has genesis prev_hash'
        ailedger_append "route" "first-entry" "" "" "0"
        When call ailedger_tail 1
        The output should include '"prev_hash":"genesis"'
      End

      It 'increments sequence number'
        ailedger_append "route" "entry-1" "" "" "0"
        ailedger_append "commit" "entry-2" "" "" "0"
        When call ailedger_tail 1
        The output should include '"seq":2'
      End

      It 'records decision_type'
        ailedger_append "fault" "oops" "" "" "1"
        When call ailedger_tail 1
        The output should include '"decision_type":"fault"'
      End

      It 'records agent from AI_AGENT env'
        ailedger_append "route" "tag" "" "" "0"
        When call ailedger_tail 1
        The output should include '"agent":"test-agent"'
      End

      It 'records session_id from AI_SESSION_ID env'
        ailedger_append "route" "tag" "" "" "0"
        When call ailedger_tail 1
        The output should include '"session_id":"test-session-001"'
      End

      It 'records task_id when provided'
        ailedger_append "route" "tag" "INFRA-005" "" "0"
        When call ailedger_tail 1
        The output should include '"task_id":"INFRA-005"'
      End

      It 'records command string'
        ailedger_append "launch" "tag" "" "git status" "0"
        When call ailedger_tail 1
        The output should include '"command":"git status"'
      End

      It 'records exit_code'
        ailedger_append "launch" "tag" "" "false" "1"
        When call ailedger_tail 1
        The output should include '"exit_code":1'
      End

    End

    Describe 'ailedger_verify (Merkle chain)'

      It 'verifies empty ledger as missing'
        When call ailedger_verify "/nonexistent/file.jsonl"
        The status should be failure
        The stderr should include 'No ledger file'
      End

      It 'verifies single-entry chain'
        ailedger_append "route" "genesis-test" "" "" "0"
        When call ailedger_verify "$_test_ledger_dir/$(date -u '+%Y-%m').jsonl"
        The status should be success
        The output should include 'VERIFIED'
        The output should include '1 entries'
      End

      It 'verifies multi-entry chain'
        ailedger_append "route" "first" "" "" "0"
        ailedger_append "commit" "second" "" "" "0"
        ailedger_append "push" "third" "" "" "0"
        When call ailedger_verify "$_test_ledger_dir/$(date -u '+%Y-%m').jsonl"
        The status should be success
        The output should include 'VERIFIED'
        The output should include '3 entries'
      End

      It 'detects chain tampering'
        ailedger_append "route" "honest" "" "" "0"
        ailedger_append "commit" "honest-too" "" "" "0"
        # Tamper: overwrite line 1 with faked data
        local lfile="$_test_ledger_dir/$(date -u '+%Y-%m').jsonl"
        sed -i '1s/honest/TAMPERED/' "$lfile"
        When call ailedger_verify "$lfile"
        The status should be failure
        The stderr should include 'CHAIN BROKEN'
      End

    End

    Describe 'ailedger_tail'

      It 'shows last N entries'
        ailedger_append "route" "a" "" "" "0"
        ailedger_append "route" "b" "" "" "0"
        ailedger_append "route" "c" "" "" "0"
        When call ailedger_tail 2
        The lines of output should equal 2
      End

      It 'reports empty ledger'
        When call ailedger_tail
        The stderr should include 'No entries'
      End

    End

    Describe 'ailedger_count'

      It 'returns 0 for empty ledger'
        When call ailedger_count
        The output should equal "0"
      End

      It 'returns correct count after appends'
        ailedger_append "route" "a" "" "" "0"
        ailedger_append "route" "b" "" "" "0"
        When call ailedger_count
        The output should equal "2"
      End

    End

    Describe 'ailedger_list'

      It 'reports no files when empty'
        When call ailedger_list
        The stderr should include 'No ledger files'
      End

      It 'lists ledger files with counts'
        ailedger_append "route" "a" "" "" "0"
        When call ailedger_list
        The output should include '.jsonl'
        The output should include 'entries'
      End

    End

  End

End
