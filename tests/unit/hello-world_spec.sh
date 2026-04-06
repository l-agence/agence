Describe 'Hello World'
    hello_world() {
        echo "Hello, World!"
    }
    It 'should return "Hello, World!"'
        When call hello_world
        The output should equal "Hello, World!"
    End
End