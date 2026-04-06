# shellspec: aishell.ps1 agentic shell tests
# These require pwsh (PowerShell) which is not available in WSL bash.
# Run manually on Windows: shellspec --shell pwsh tests/unit/aishell_spec.sh

Describe 'aishell.ps1 (pure agentic powershell shell)'
  It 'shows correct prompt and tile name'
    Skip 'pwsh not available in WSL — run on Windows with --shell pwsh'
    When run bash -c 'pwsh -NoProfile -File bin/aishell.ps1 -TestFlag --test 2>&1'
    The output should include 'aishell@agent'
    The output should include 'AGENCE PURE AGENTIC SHELL'
  End

  It 'creates session log and meta'
    Skip 'pwsh not available in WSL — run on Windows with --shell pwsh'
    When run bash -c 'pwsh -NoProfile -File bin/aishell.ps1 -TestFlag --test >/dev/null 2>&1 && test -f nexus/.aisessions/unknown_agentic.meta.json && echo ok'
    The output should equal 'ok'
  End

  It 'exits cleanly on test mode'
    Skip 'pwsh not available in WSL — run on Windows with --shell pwsh'
    When run bash -c 'pwsh -NoProfile -File bin/aishell.ps1 -TestFlag --test >/dev/null 2>&1; echo $?'
    The output should equal '0'
  End
End