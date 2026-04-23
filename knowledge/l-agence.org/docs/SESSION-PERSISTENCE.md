# Session Persistence Model

**TL;DR**: Local-only session capture for agent debugging and recovery. Raw outputs never leave the repo. Only metadata is selectively shared.

---

## Philosophy

Session persistence is **lightweight simplicity** in service of:
- **Fast recovery**: Restart failed jobs without re-running full commands
- **Token efficiency**: Cache outputs locally to avoid re-parsing
- **Learning**: Track faults and lessons per session for future prevention
- **Debugging**: Access raw STDOUT/STDERR/STDIN when needed for troubleshooting

**NOT designed for**: Memory/heap/dump sharing, distributed state sync, or cross-repo broadcasting.

---

## Architecture

```
LLM / Agent
   ↓
   wrapper (aido) 
   ↓
   PTY (real terminal) + 'script' saves outputs
   ↓
   command execution
```

Every command that flows through `aido` captures:

1. **Raw I/O** (.typescript files)
   - STDOUT, STDERR, STDIN (all visible in terminal)
   - Via `script --quiet --return --command`
   - Stored in: `nexus/.aisessions/SESSION_ID.typescript`
   - **LOCAL ONLY** - Never pushed, never shared

2. **Metadata** (.meta.json files)
   - Command executed
   - Exit code (MANDATORY: `=== AI_EXIT_CODE: X ===` marker)
   - SHA256 of typescript file
   - Timestamp, agent ID, session ID
   - Tail of stdout, head of stderr (for quick review)
   - Stored in: `nexus/.aisessions/SESSION_ID.meta.json`
   - **SELECTIVELY SHAREABLE** with upstream/handoffs

---

## Session Directory Structure

```
nexus/
├── .aisessions/                # Local only, .gitignore'd (NEXUS state database)
│   ├── ai-agent-20260305_132522-3216-2f587606.typescript
│   └── ai-agent-20260305_132522-3216-2f587606.meta.json
│
├── .airuns/                    # Future: task/job-level grouping
│   ├── task-20260305_run001/
│   │   ├── session-1.meta.json
│   │   ├── session-2.meta.json
│   │   └── task.status.json    # Aggregated task state
│   └── ...
│
└── faults/                     # Fault records (part of CODEX LAW 3)
    └── ...
```

---

## Session ID Format

```
{AGENT}-{YYYYMMDD_HHMMSS}-{PID}-{HEXID}
```

Example: `ai-agent-20260305_132522-3216-2f587606`

**Components**:
- `AGENT`: Agent identifier (e.g., `ai-agent`, `claudia`, `ralph`)
- `YYYYMMDD_HHMMSS`: Timestamp when session started
- `PID`: Process ID (allows multiple parallel agents)
- `HEXID`: Random 6-char hex ID (ensures uniqueness)

**Benefit**: Multiple agents can run in parallel, each with unique session logs.

---

## Metadata JSON Structure

```json
{
  "session_id": "ai-agent-20260305_132522-3216-2f587606",
  "agent": "ai-agent",
  "timestamp": "2026-03-05T18:25:23Z",
  "command": "git status",
  "exit_code": 0,
  "typescript_file": "./.aisessions/ai-agent-20260305_132522-3216-2f587606.typescript",
  "sha256": "81d50ae3d63fe9ec1ea3e223bed3e2a1202a8ba0e289c89ede3c7f802f979d35",
  "stdout_tail": "...",
  "stderr_head": "...",
  "env": {
    "SHELL": "/bin/bash",
    "OS": "windows",
    "REPO_ROOT": "/c/Users/steff/git/.agence"
  },
  "notes": "...",
  "fault": null,
  "lessons": [...]
}
```

**Fields**:
- `session_id`: Unique identifier for this session
- `agent`: Which agent ran the command
- `timestamp`: ISO 8601 UTC
- `command`: Exact command executed (for re-running)
- `exit_code`: MANDATORY - return value of command
- `typescript_file`: Path to raw I/O log
- `sha256`: Hash to verify file integrity
- `stdout_tail`, `stderr_head`: Summaries (optional, for quick review)
- `env`: Snapshot of execution environment (optional, for debugging)
- `notes`: Human-readable summary of what happened
- `fault`: If this session failed, capture fault ID/description
- `lessons`: What did we learn? (For [CODEX LAW 3](../codex/LAWS.md))

---

## Local vs. Shareable

### ❌ LOCAL ONLY (Never Pushed)

- `.aisessions/SESSION_ID.typescript` - Raw terminal output
- `.aisessions/.gitignore` entry: `.aisessions/`
- Sensitive data may be in raw output (credentials, IPs, etc.)

### ✅ SELECTIVELY SHAREABLE (Optional Export)

- `SESSION_ID.meta.json` with sanitized fields
- Faults and lessons learned
- Environment snapshots (REPO_ROOT, SHELL, OS only)
- Exit codes and timestamps
- Can be shared for:
  - Handoff to another agent
  - Upstream sync to parent repo
  - Knowledge base updates (lessons)
  - Post-mortem analysis

```bash
# Example: Export session metadata for handoff
cat .aisessions/ai-agent-20260305_132522-3216-2f587606.meta.json | \
  jq 'del(.typescript_file, .stdout_tail, .stderr_head)' > \
  /tmp/handoff.json

# Upload to upstream/knowledge-base selectively
curl -X POST https://knowledge-base.internal/sessions \
  -d @/tmp/handoff.json
```

---

## Use Cases

### Case 1: Recovery After Failure

```bash
# Session failed (exit_code: 1)
$ cat .aisessions/ai-agent-20260305_132522-3216-2f587606.meta.json | jq '.exit_code'
1

# Read raw output for debugging
$ tail -50 .aisessions/ai-agent-20260305_132522-3216-2f587606.typescript

# Re-run with same command
$ bash bin/aido $(cat .aisessions/ai-agent-20260305_132522-3216-2f587606.meta.json | jq -r '.command')
```

### Case 2: Handoff Between Agents

```bash
# Agent A finishes task, captures session
# Agent B needs to continue work

# B reads A's session metadata
$ jq '.notes, .lessons, .fault' < .aisessions/A-session-id.meta.json

# B knows:
# - What A did (notes)
# - Why it failed (fault)
# - What to avoid (lessons)
```

### Case 3: Learning from Faults (CODEX LAW 3)

Every failed session auto-populates:
```json
{
  "fault": "f9e7c3d2-symlink-false-success",
  "lessons": [
    "Truncated output is unreliable - verify filesystem independently",
    "VS Code run_in_terminal truncates at ~16KB - use real terminal for long-running tasks",
    "Always use 'ls -la' or 'test -e' after claiming success"
  ]
}
```

These are stored and queried to prevent recurrence:
```bash
# Future sessions check:
if session_has_fault_like("truncation"); then
  # Use real terminal, not VSCode
fi
```

---

## Configuration

```bash
# Default (uses nexus/.aisessions automatically)
bash bin/aido git status

# Override session directory if needed
export AIDO_SESSION_DIR=/custom/path/.aisessions

# Override agent identifier
export AIDO_AGENT=claudia

# Enable debug output
export AIDO_DEBUG=1

# Run wrapped command
bash bin/aido git status
```

---

## Circular Buffer / Cleanup

Sessions accumulate over time. Implement circular buffer via cron:

```bash
# Cron job (optional, add to ^init later)
0 0 * * * find nexus/.aisessions -type f -mtime +30 -delete  # Purge sessions older than 30 days
0 0 * * * ls -t nexus/.aisessions | tail -n +1001 | xargs rm  # Keep only last 1000 sessions
```

---

## Implementation Status

- ✅ aido wrapper with session capture
- ✅ Metadata JSON generation
- ✅ Session ID uniqueness (multi-agent support)
- ✅ Exit code tracking
- ⏳ jq integration (for JSON escaping) - TBD
- ⏳ Circular buffer cleanup - TBD
- ⏳ Lesson learning system - TBD

---

## Related

- [LAWS.md](../codex/LAWS.md) - CODEX LAW 3 (Do Not Repeat Faults)
- [aido script](../../bin/aido) - Session wrapper implementation
- [.gitignore](.gitignore) - `.aisessions/` entry

---

**Version**: 1.0.0  
**Status**: In Effect (Beta)  
**Last Updated**: 2026-03-05
