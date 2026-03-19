# shellspec: aishell.ps1 agentic shell tests

Describe 'aishell.ps1 (pure agentic powershell shell)'
  It 'shows correct prompt and tile name'
    When call pwsh -NoProfile -File bin/aishell.ps1 -TestFlag --test
    The output should include 'aishell@agent'
    The output should include 'AGENCE PURE AGENTIC SHELL'
  End

  It 'creates session log and meta'
    When call pwsh -NoProfile -File bin/aishell.ps1 -TestFlag --test
    The file "nexus/.aisessions/unknown_agentic.meta.json" should be exist
    The file "nexus/.aisessions/unknown_agentic.typescript" should be exist
  End

  It 'exits cleanly on test mode'
    When call pwsh -NoProfile -File bin/aishell.ps1 -TestFlag --test
    The status should be success
  End
End