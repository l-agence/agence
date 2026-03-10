# CODEX: LAWS

**4 Immutable Prohibitions**

Violation = Immediate Abort. No Exceptions.

---

## Law 1: Never Skip CODEX

- All commands through `agence` script (never bypass)
- Never commit agence knowledge to parent repo
- CODEX gates everything, always

```bash
# ✅ LEGAL: Through agence
agence @claudia "Design a system"

# ❌ ILLEGAL: Bypasses CODEX
claude "Design a system"
git -C /parent/repo commit -m "agence knowledge"  # Never!
```

---

## Law 2: Never Auto-Destroy

- DO NOT auto-delete local branches after pull/merge
- Keep branches unless explicitly told to delete
- User must opt-in to cleanup, not opt-out

```bash
# ❌ ILLEGAL: Auto-delete
agence /merge feature-branch  # Don't delete feature-branch after!

# ✅ LEGAL: Keep and ask
agence /merge feature-branch
# → Branch kept, user decides later
agence ^branch-delete feature-branch  # Explicit deletion

---

## Law 3: Do Not Repeat Faults

- Track what failed and why
- Never make the same mistake twice
- Learn from errors permanently

```bash
# Maintain: mistakes.log or fault tracking
# Query: "Have we seen this error before?"
# Action: Prevent recurrence
```

---

## Law 4: Do Not Lie. Disclose Errors Early.

- Tell me every fault immediately
- Hiding mistakes is worse than the mistake itself
- Transparency > ego
- Ask if unclear instead of guessing
- Humans are imperfect (especially the author)

---

**Version**: 0.1.0  
**Status**: In Effect  
**Last Updated**: 2026-03-04

---

## Law 5: Sessions Stay Local, Metadata Shared

Local session persistence (`.aisessions/`) is for agent debugging and recovery **only**.

- Raw STDOUT/STDERR/STDIN files `.gitignore`'d and never pushed
- Sensitive data stays in repo, never leaves
- Metadata JSON (.meta.json) is selectively shareable for handoffs and knowledge capture
- No memory/heap/dump broadcasting (stays simple)

```bash

# ❌ ILLEGAL: Push raw session data
git add .aisessions/*.typescript
git commit -m "aisession logs"

# ✅ LEGAL: Export metadata for handoff
jq '.exit_code, .lessons, .fault' < .aisessions/AISESSION_ID.meta.json > /tmp/handoff.json
# Share /tmp/handoff.json, never .typescript
```

See [SESSION-PERSISTENCE.md](../synthetic/l-agence.org/docs/SESSION-PERSISTENCE.md) for details.

---

---

## Law 6: Edit Only With Versioning

- Never edit a file unless it is versioned and backed up (commit or stash).

## Law 7: Upstream Actions Require Review

- Never push, pull, or fetch from upstream without explicit human review.

---

**Version**: 0.3.0  
**Status**: In Effect  
**Last Updated**: 2026-03-10
