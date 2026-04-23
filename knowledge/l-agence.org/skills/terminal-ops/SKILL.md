# Skill: Terminal Operations via aicmd

## When to Use

ALWAYS use `aicmd` when executing commands that produce significant output:
- Docker builds (`docker build`, `docker compose`)
- Test suites (`shellspec`, `bun test`, `npm test`)
- Package installs (`apt-get`, `bun install`, `pip install`)
- Long-running processes (servers, watchers, CI pipelines)
- Any command where output exceeds ~50 lines

## Why

VS Code's terminal integration has a **16KB output buffer**. When output exceeds this:
- The agent sees empty/truncated output and starts hallucinating results
- Token waste from repeated polling (`get_terminal_output` returning blanks)
- Costly mistakes from acting on imaginary build results
- Minutes of wall-clock time lost to polling loops

`aicmd` wraps commands with `script(1)` (Unix typescript) or tmux `pipe-pane` — full I/O capture to a file in `nexus/.aisessions/DD/`. The file is always readable even while the command runs.

## Usage

```bash
# Instead of running directly:
docker build -t agence/agent:latest --progress=plain .

# Wrap with aicmd:
bin/aicmd docker build -t agence/agent:latest --progress=plain .
```

## Reading Output

After launching via aicmd, read the typescript file instead of polling the terminal:

```bash
# Find the latest typescript (day-sharded under DD = day of month)
ls -lt nexus/.aisessions/$(date +%d)/*.typescript | head -1

# Tail last N lines of output
tail -30 nexus/.aisessions/$(date +%d)/copilot-*.typescript

# Check if build succeeded (search for keywords)
grep -i 'error\|fail\|done\|success' nexus/.aisessions/$(date +%d)/copilot-*.typescript | tail -10
```

## Pattern: Fire and Read

1. **Fire**: `bin/aicmd <command>` in async terminal mode
2. **Read**: `tail -N` or `grep` on the typescript file (fast, no buffer limit)
3. **Verify**: Check `.meta.json` for exit code after completion

This pattern eliminates:
- Terminal buffer truncation
- Polling loops that waste tokens
- Hallucinated command output
- False success/failure conclusions

## When NOT to Use

- Quick one-liners that produce <10 lines (e.g., `git status`, `ls`, `wc -l`)
- Interactive commands that need stdin (e.g., `read`, `vim`)
- Commands already inside tmux with pipe-pane active (`AGENCE_PIPE_PANE=1`)

## Prerequisites

- `bin/.agencerc` sourced (sets `AI_ROOT`, `AI_BIN`)
- `lib/env.sh` sourced (provides `agence_session_day_dir`)
- `script` command available (standard on Linux/macOS/WSL)
