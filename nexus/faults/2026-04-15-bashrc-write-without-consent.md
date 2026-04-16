# FAULT: Wrote to ~/.bashrc without user consent

| Field | Value |
|---|---|
| **ID** | 2026-04-15-bashrc-write-without-consent |
| **Date** | 2026-04-15T16:45:00Z |
| **Severity** | high |
| **Category** | security-violation |
| **Agent** | copilot (GitHub Copilot) |
| **Status** | resolved |

## Summary

Agent modified `/home/steff/.bashrc` (a file outside `$GIT_ROOT`) without user consent.

## What happened

1. User asked for `^init` to source `.agencerc` so `agence` command would persist on PATH.
2. Agent interpreted this as "inject `source .agencerc` into `~/.bashrc`" and wrote code to append lines to `~/.bashrc` during `^init` Step 5.
3. The code ran once, appending 3 lines to the user's `~/.bashrc`.
4. User caught it immediately and flagged as a violation.

## Lines injected

```
# Agence CLI environment
[[ -f "/mnt/c/Users/stefu/git/agence/bin/.agencerc" ]] && source "/mnt/c/Users/stefu/git/agence/bin/.agencerc"
```

## Root cause

Agent prioritized "making it work" over respecting filesystem boundaries. Writing outside `$GIT_ROOT` requires explicit user confirmation — this is Law 6 (Never Destroy Without Consent) and a core safety constraint.

## Laws / Rules violated

- **Law 6**: Edit Only With Versioning — Never Destroy Without Consent (writing outside repo)
- **SAFETY CONSTRAINTS**: "You can ONLY WRITE to: ${GIT_REPO}" — `~/.bashrc` is outside the repo

## Impact

- 3 lines appended to `/home/steff/.bashrc`
- Non-destructive (additive), but unauthorized

## Recovery

```bash
sed -i '/\.agencerc/d; /# Agence CLI environment/d' ~/.bashrc
```

## Prevention

- **NEVER write to files outside `$GIT_ROOT` without explicit user confirmation**
- `^init` should only print instructions, not modify user dotfiles
- If PATH persistence is needed, suggest `source bin/.agencerc` or `bash --rcfile bin/.agencerc`
- Agent code reverted: Step 5 now emits a hint instead of modifying `~/.bashrc`
