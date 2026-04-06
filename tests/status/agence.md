# agence Test Status
day)

## Command Overview
- **File**: `bin/agence`
- **Purpose**: Agentic Engineering Collaboration Environment - Entry point for all command routing
- **Lines of Code**: 1564
- **Invocation Modes**: 7
- **Functions**: 20
- **Created**: 2026-03-19
- **Last Updated**: 2026-03-19

## Command Modes & Arguments
| Mode | Arguments | Description | ShellSpec Status | Status | Output | Handoff | Lines | Functions |
|------|-----------|-------------|------------------|--------|--------|---------|-------|-----------|
| help | --help, -h, help | Show help | pending | N/A | N/A | todo | 65 | 1 |
| version | --version, -v, version | Show version | pending | N/A | N/A | todo | 10 | 1 |
| chat | "<query>" | Chat mode (query to LLM) | pending | N/A | N/A | todo | 25 | 2 |
| ai-routed | +<request> | AI-routed mode (LLM determines action) | pending | N/A | N/A | todo | 63 | 3 |
| external | /<command> | External command (validated) | pending | N/A | N/A | todo | 186 | 6 |
| system | !<sys_cmd> | System command | pending | N/A | N/A | todo | 66 | 3 |
| init | ^<init_cmd> | Special initialization commands | pending | N/A | N/A | todo | 119 | 4 |

## Functions Documentation
| Function | Purpose | Lines | ShellSpec Status | Status | Output | Handoff |
|----------|---------|-------|------------------|--------|--------|---------|
| detect_shell_environment | Detect shell environment (git-bash, cygwin, WSL, etc) | 30 | pending | N/A | N/A | todo |
| normalize_path | Normalize paths to current shell environment | 35 | pending | N/A | N/A | todo |
| source_if_exists | Source a file if it exists | 5 | pending | N/A | N/A | todo |
| init_execution_context | Initialize repo context variables | 37 | pending | N/A | N/A | todo |
| validate_execution_context | Validate working directory context | 37 | pending | N/A | N/A | todo |
| show_help | Print help and usage | 65 | pending | N/A | N/A | todo |
| show_version | Print version information | 10 | pending | N/A | N/A | todo |
| main | Main entry point and mode routing | 10 | pending | N/A | N/A | todo |
| mode_chat | Handle chat mode | 25 | pending | N/A | N/A | todo |
| mode_ai_routed | Handle AI-routed mode | 63 | pending | N/A | N/A | todo |
| mode_external | Handle external commands | 186 | pending | N/A | N/A | todo |
| agence_save | Save session state | 62 | pending | N/A | N/A | todo |
| agence_resume | Resume session state | 72 | pending | N/A | N/A | todo |
| agence_handoff | Handoff session to another agent | 54 | pending | N/A | N/A | todo |
| mode_init | Handle special initialization commands | 119 | pending | N/A | N/A | todo |
| init_agence_environment | Initialize Agence environment | 119 | pending | N/A | N/A | todo |
| reload_agence_context | Reload Agence context | 123 | pending | N/A | N/A | todo |
| create_windows_symlink | Create Windows symlinks | 73 | pending | N/A | N/A | todo |
| parse_shell_route | Parse shell routing arguments | 35 | pending | N/A | N/A | todo |
| setup_shell_routing_env | Setup shell routing environment | 35 | pending | N/A | N/A | todo |
| mode_system | Handle system commands | 66 | pending | N/A | N/A | todo |
| repair_agence_symlinks | Repair broken symlinks | 52 | pending | N/A | N/A | todo |
| install_agence_packages | Install required packages | 47 | pending | N/A | N/A | todo |
| install_windows_packages | Windows-specific package install | 56 | pending | N/A | N/A | todo |
| install_macos_packages | macOS-specific package install | 56 | pending | N/A | N/A | todo |
| install_linux_packages | Linux-specific package install | 56 | pending | N/A | N/A | todo |

## Status Legend
- **ShellSpec Status**: `tested` | `modified` | `pending`
- **Status**: `pass` | `fail`
- **Handoff**: `todo` | `planned` | `assigned @agent` | `not required`

## Test Execution Notes
- **Path Normalization**: Use `//c/users/steff/git/.agence` format for all paths
- **CRLF Issues**: May need dos2unix processing for cross-platform compatibility
- **Dependencies**: Tests may require git, gh, and other external tools
- **Environment**: Ensure proper AI_ROOT and GIT_ROOT environment variables

## Recent Changes
- 2026-03-19: Initial test status tracking created

## Summary Statistics
- **Total Lines of Code**: 1564
- **Total Invocation Modes**: 7
- **Total Functions**: 20
- **Tested**: 0
- **Pending**: 27
- **Pass Rate**: N/A (testing not started)