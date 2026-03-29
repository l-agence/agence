Describe 'hello world' test for ShellSpec

# tests/unit/hello-world.spec
Describe 'Hello World' {
  It 'prints Hello, World!' {
    When run echo "Hello, World!"
    The output should equal "Hello, World!"
    The status should be 0
  }
}
