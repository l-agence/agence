# Session Architecture Summary

**Built**: 2026-03-05  
**Status**: ✅ Complete and Tested

---

## What We Built

### Session Persistence System

Local-only agent session capture for debugging and recovery.

**Components:**

1. **aido wrapper** (`bin/aido`)
   - Whitelist-based command executor
   - Wraps whitelisted commands in `script` for I/O capture
   - Creates unique session IDs: `{AGENT}-{YYYYMMDD_HHMMSS}-{PID}-{HEXID}`
   - Supports multi-agent parallel execution
   - Environment variables:
     - `AIDO_SESSION_DIR` (default: `nexus/.aisessions`)
     - `AIDO_AGENT` (default: `ai-agent`)
     - `AIDO_DEBUG` (enable trace output)

2. **Session Files** (`nexus/.aisessions/`)
   - `SESSION_ID.typescript` - Raw STDOUT/STDERR/STDIN via `script` command
     - **LOCAL ONLY** - Never pushed, never shared
     - Sensitive data stays in repo
   - `SESSION_ID.meta.json` - Metadata about the session
     - Command, exit code, timestamp, SHA256, agent ID
     - Selectively shareable for handoffs and knowledge capture
     
3. **NEXUS Structure** (`nexus/`)
   ```
   nexus/
   ├── .aisessions/      # Session capture (STDOUT/STDERR/STDIN)
   ├── .airuns/          # Task/job-level grouping (future)
   └── faults/           # Fault records (CODEX LAW 3)
   ```

---

## How It Works

```
LLM / Agent Request
        ↓
   bin/aido (whitelist validator)
        ↓
   PTY + 'script' command (captures I/O)
        ↓
   Command execution
        ↓
   Generate SESSION_ID.typescript (raw output)
   Generate SESSION_ID.meta.json (metadata)
        ↓
   Return exit code with === AI_EXIT_CODE: X === marker
```

---

## Metadata Structure

```json
{
  "session_id": "ai-agent-20260305_134036-3375-1d2b09ef",
  "agent": "ai-agent",
  "timestamp": "2026-03-05T18:40:39Z",
  "command": "git log --oneline -5",
  "exit_code": 0,
  "typescript_file": "nexus/.aisessions/ai-agent-20260305_134036-3375-1d2b09ef.typescript",
  "sha256": "209f18e45acb33b1718114c4cf7bab6bac353f0d2e7e90dbf6a208da199fa908",
  "stdout_tail": "",
  "stderr_head": ""
}
```

---

## Whitelisted Commands

**git**: status, log, diff, branch, tag, reflog, describe, shortlog, config --list, remote, rev-parse, show, ls-files, ls-tree, grep, cat-file, ls-remote

**aws**: describe-*, get-*, list-*, head-*, auth status, auth login, sts get-session-token

**gh**: repo view|list|search, pr list|view|status|checks, issue list|view, run list|view|download, workflow list|view, auth status, org list, api GET

**PowerShell**: Get*, Test*, Measure*, Select, Where, Sort, Group, Compare

---

## Philosophy (CODEX LAW 5)

- **Local First**: Raw session data never leaves the repo
- **Selective Sharing**: Only metadata JSON is shareable
- **Simple**: No memory/heap/dump broadcasting (stays lightweight)
- **Recovery**: Fast restart after failures via session metadata
- **Learning**: Track faults and lessons per session (CODEX LAW 3)

---

## Known Issues / TODO

- ⏳ jq integration (JSON string escaping) - needed for proper stdout_tail/stderr_head
- ⏳ Circular buffer cleanup (cron job for old sessions)
- ⏳ Lesson learning system (extract and query lessons from faults)
- ⏳ .airuns/ structure (task/job-level grouping and aggregation)

---

## References

- [SESSION-PERSISTENCE.md](../synthetic/l-agence.org/SESSION-PERSISTENCE.md) - Full documentation
- [LAWS.md](../codex/LAWS.md) - CODEX Law 5 (Sessions Stay Local)
- [bin/aido](../bin/aido) - Implementation
