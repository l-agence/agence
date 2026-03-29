#, just spo Test Status Tracking

This directory contains comprehensive test status tracking for all commands in the Agence project.

## Structure

Each command has its own status file:
- `agence.md` - Status for bin/agence
- `aicmd.md` - Status for bin/aicmd  
- `aisession.md` - Status for bin/aisession
- `router.md` - Status for bin/router.sh

## Status Columns

### Command Modes Table
- **Mode**: The invocation mode (help, version, chat, etc.)
- **Arguments**: Command line arguments for the mode
- **Description**: Brief description of what the mode does
- **ShellSpec Status**: `tested` | `modified` | `pending`
- **Status**: `pass` | `fail`
- **Output**: Link to findings documentation
- **Handoff**: `todo` | `planned` | `assigned @agent` | `not required`
- **Lines**: Number of lines of code for this mode
- **Functions**: Number of functions tested in this mode

### Functions Table
- **Function**: Function name
- **Purpose**: Brief description of what the function does
- **Lines**: Number of lines in the function
- **ShellSpec Status**: `tested` | `modified` | `pending`
- **Status**: `pass` | `fail`
- **Output**: Link to findings documentation
- **Handoff**: `todo` | `planned` | `assigned @agent` | `not required`

## Usage

1. Update status files as tests are created and executed
2. Use `^save` to capture test results and findings
3. Use `^handoff` for major bugs to pass to @Sonya
4. Link findings to corresponding files in `tests/findings/`

## Test Execution Workflow

1. **Setup**: Ensure paths are normalized (`//c/users/steff/git/.agence`)
2. **Fix Issues**: Apply dos2unix to Unix scripts if needed
3. **Run Tests**: Execute ShellSpec tests with bundled shellspec
4. **Document Results**: Update status files with results
5. **Handle Bugs**: Use ^handoff for major issues
6. **Report**: Create comprehensive findings documentation