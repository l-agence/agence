# Mandatory Session Verification Architecture

**Built**: 2026-03-05  
**Status**: ✅ Complete - Ready for Testing

---

## What We Built

### Verification-Mandatory Workflow

Agents **cannot proceed** until they read and explicitly confirm session outputs. Exit code `254` blocks workflow until verification.

**Flow:**
```
aido git status
   ↓
aido captures output → SESSION_ID.typescript + SESSION_ID.meta.json
   ↓
verify-session SESSION_ID (MANDATORY)
   ↓
[Agent MUST read output and confirm]
   ↓
'yes' → exit 0 (proceed) | 'no' → exit 254 (BLOCKED)
```

### Environment Variables (Standardized)

**Primary names:**
- `AI_ROOT` = agence repo root (e.g., `/c/Users/steff/git/.agence`)
- `AI_BIN` = agence bin directory (e.g., `$AI_ROOT/bin`)
- `GIT_ROOT` = git repository root (e.g., `/c/Users/steff/git`)

**Legacy aliases (backwards compatibility):**
- `AGENCE_ROOT` → `$AI_ROOT`
- `AGENCE_BIN` → `$AI_BIN`
- `REPO_ROOT` → `$GIT_ROOT`
- `GIT_REPO` → `$GIT_ROOT`

**Set by:** `.agencerc` (source first to get all vars)

### Key Scripts

**`.agencerc`** - Universal bootstrap
- Shell detection (git-bash, Cygwin, WSL, bash, zsh)
- Dynamic AI_ROOT, GIT_ROOT computation
- Sources shell-specific profile (.gitbashrc, .cygbashrc, profile.ps1)
- Exports all AGENCE env vars
- Sets up PATH with AI_BIN

**`aido`** - Whitelisted command wrapper
- Validates git/aws/gh/PowerShell commands
- Captures STDOUT/STDERR/STDIN via `script` command
- Creates unique session IDs per invocation
- **Calls verify-session (MANDATORY)**
- Returns exit code 254 if verification denied

**`verify-session`** - Mandatory verification
- Displays session metadata and output (last 30 lines)
- Extracts exit code from .meta.json
- Prompts: 'yes'/'no'/'show'/'meta'
- Exit codes:
  - 0 = verified ✓
  - 254 = denied (workflow blocked)
  - 1 = error

**Shell profiles:**
- `.gitbashrc` - Git-bash specific config, mklink wrapper, PATH setup
- `.cygbashrc` - Cygwin specific config, mklink wrapper, PATH setup
- `profile.ps1` - PowerShell config, New-Symlink function, PATH setup

### Session Directory

```
nexus/
├── .aisessions/
│   ├── ai-agent-20260305_134036-3375-1d2b09ef.typescript  (raw output)
│   └── ai-agent-20260305_134036-3375-1d2b09ef.meta.json   (metadata)
│
└── .airuns/
    └── (placeholder for task-level grouping)
```

### Design Philosophy

**Security:**
- Raw .typescript files local-only (never pushed)
- Metadata JSON selectively shareable for handoffs
- No memory/heap/dump broadcasting

**Enforcement:**
- Verification is built into execution (aido → verify-session)
- Exit code 254 blocks workflow until confirmed
- Agent can't claim success without reading output

**Multi-Agent Support:**
- Unique session IDs: `{agent}-{timestamp}-{pid}-{hexid}`
- Multiple agents can run in parallel
- Each gets independent session logs

**OS Agnostic:**
- Works on Windows (git-bash, Cygwin, PowerShell)
- Works on macOS (bash, zsh)
- Works on Linux (bash, WSL)
- Dynamically detects shell and applies appropriate config

---

## Testing Checklist

- [ ] Source .agencerc: `source bin/.agencerc` (or `. bin/profile.ps1` in PowerShell)
- [ ] Verify env vars: `echo $AI_ROOT $AI_BIN $GIT_ROOT`
- [ ] Test aido whitelisting: `bash bin/aido git status`
- [ ] Verify session files created: `ls nexus/.aisessions/`
- [ ] Test verification workflow: When prompted, confirm with 'yes'
- [ ] Check exit code: Last command should show 0
- [ ] Test denial: Run `bash bin/aido git log --oneline`, respond 'no' to verification
- [ ] Verify exit code 254: Last command should show 254 (workflow blocked)

---

## Known Issues / TODO

- ⏳ jq integration (JSON string escaping in metadata)
- ⏳ Circular buffer cleanup (cron for old sessions)
- ⏳ Lesson learning system (extract+query from faults)
- ⏳ .airuns/ structure (task/job aggregation)
- ⚠️ here-document warning in verify-session (cosmetic, non-fatal)

---

## References

- [SESSION-PERSISTENCE.md](../synthetic/l-agence.org/SESSION-PERSISTENCE.md)
- [SESSION-ARCHITECTURE.md](../nexus/SESSION-ARCHITECTURE.md)
- [CODEX LAW 5](../codex/LAWS.md#law-5-sessions-stay-local-metadata-shared)
- [bin/aido](../bin/aido)
- [bin/verify-session](../bin/verify-session)
- [bin/.agencerc](../bin/.agencerc)
