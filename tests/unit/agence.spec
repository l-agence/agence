Describe 'Agence CLI' {
  Include bin/agence

  It 'shows help with --help' {
    When run bash bin/agence --help
    The status should be 0
    The output should include 'Usage:'
    The output should include 'Agence'
  }

  It 'shows version with --version' {
    When run bash bin/agence --version
    The status should be 0
    The output should include 'Agence'
    # Adjust this line if your version output is different
  }

  # Add more tests for specific subcommands as needed
}
