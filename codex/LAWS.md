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

## Law 8: Path Validation (Security Layer)

### Symlinks & Junctions (Routing Layer)

- **Allowed**: User-created symlinks for `@` routing (local, `.gitignore`'d)
  - Example: `synthetic/@ → l-agence.org` (context switching)
  - Used for: Agent routing, org routing, team routing
  - NEVER committed to Git

- **Forbidden**: Auto-healing junctions in PATH validation
  - Security layer must NEVER create symlinks to "repair" broken paths
  - This was the catastrophic failure root cause
  - Principle: Validate only, never remediate via file creation

### Path Resolution (Validation Layer)

- All scope checks use `realpath()` (resolves all symlinks before validation)
- Base check: `resolved_path.startswith(allowed_scope)` (simple string prefix)
- No tricks: junctions, double-slashes (`//`), normalization hacks forbidden
- Container model (future): Paths pure POSIX, validation trivial

```bash
# ✅ LEGAL: Validate using resolved path
resolved=$(realpath "$user_path")
if [[ "$resolved" == "$allowed_root"* ]]; then
  proceed
else
  reject "Out of scope: $resolved vs $allowed_root"
fi

# ❌ ILLEGAL: String normalization in security layer
if [[ "${user_path//\\\//}" == "$allowed_root" ]]; then  # Wrong!
  proceed
fi

# ❌ ILLEGAL: Auto-create junctions to "fix" scope
mklink /J "$broken_path" "$canonical_path"  # Never!
```

### Symbol Scope Constraints

- **Agent-Level Symbols** (v0.2.3–v0.3.1): `+`, `&`, `%`, `-`, `_`, `#`
  - Valid in: tasks, workflows, assignments
  - Validates against: agent routing (`@agent`), job queue state

- **Swarm-Level Symbols** (v0.3.2+, RESERVED): `~`, `$`
  - Do NOT use in agent-only code
  - Reserved for Skupper/multi-agent coordination
  - Activate only when orchestrator integrates swarm logic

- **Priority Symbols** (all versions): `*`, `**`, `***`
  - Independent from state symbols
  - Compose freely: `***&task@ralph` (urgent assignment)

- **Routing** (`@`): Always suffix-based, never prefix-based
  - Valid: `task@agent`, `task@user`, `task@org`
  - Invalid: `@agent-task`, `@user~task` (prefix position)

```bash
# ✅ LEGAL: Hierarchical symbol use
***&task@ralph          # Priority + state + agent routing
*+task                  # Priority + pending state
%task@ralph             # Agent in-progress

# ❌ ILLEGAL: Wrong scope
~task@ralph             # Swarm symbol in agent code (v0.2.3)
$task                   # Swarm symbol without context
@ralph%task             # Routing in wrong position
```

---

**Version**: 0.2.3.1  
**Status**: In Effect  
**Last Updated**: 2026-03-31
