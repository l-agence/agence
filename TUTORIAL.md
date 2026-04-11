# Command Routing with Agence CLI

## Introduction
The Agence CLI allows for powerful command routing functionalities, enabling seamless interactions with various operations.

## Command Routing Examples
### Basic Command Routing
To start using the command routing feature, execute the following command:
```bash
$ agence command --route=example
```

### Interactive Prompt Session Example
Once you invoke the Agence CLI, it may offer interactive prompts. An example session:
```bash
$ agence start
Welcome to the Agence CLI interactive session!
Please select an option:
1. View current configuration
2. Modify settings
3. Exit
> 1
Current configuration:
- Setting A: Enabled
- Setting B: Disabled

> 2
Please specify the new value for Setting A:
> Enabled
Setting A has been updated successfully.

> 3
Exiting...
Thank you for using Agence CLI!
```

### Handoff Using @aider Agent
To leverage the @aider agent for complex tasks, you can do the following:
```bash
$ agence start --handoff @aider
Sending the current session context to the @aider...
@aider is now taking over the session. You can now relax while it handles the remaining commands.
```

With the powerful routing capabilities of Agence CLI, your command executions can be more dynamic and responsive to user inputs and scenarios!