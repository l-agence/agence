# DEPRECATED: codex/bin/

This directory contains legacy Agence scripts that have been superseded by the main command system in `bin/`.

## Migration Status

### aicmd.deprecated
- **Status**: DEPRECATED (v0.0.1)
- **Replaced by**: `bin/^` (main command router)
- **Reason**: Consolidated into unified command interface with better routing
- **Archived**: 2026-03-05

### commands.json.old  
- **Status**: DEPRECATED
- **Replaced by**: `bin/commands.json`
- **Reason**: Moved to canonical location for command whitelist validation
- **Archived**: 2026-03-05

## Current System

All command routing now goes through:

```bash
$ agence <mode> <command>
```

Modes:
- `+` (AI-routed): LLM determines action
- `/` (External): Pre-validated external commands (whitelist in `bin/commands.json`)
- `!` (System): Built-in utilities
- `^` (Init): Initialization and maintenance commands
- (default): Chat mode

## See Also
- `bin/^` - Main command router and handler
- `bin/COMMANDS.md` - Complete command reference
- `bin/commands.json` - External command whitelist
