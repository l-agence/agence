# Issues Index

**Team-discovered problems and opportunities. Shared knowledge base.**

Format: Syslog-style with discovery date, reporter, issue ID, category, and status.

```
DATE       | @REPORTER       | ID    | CATEGORY           | STATUS   | DESCRIPTION
───────────┼─────────────────┼───────┼────────────────────┼──────────┼──────────────────────
2026-03-06 | @steff          | I001  | path-normalization | open     | Windows/WSL path handling inconsistent
2026-03-05 | @peers          | I002  | bash-compatibility | open     | Git Bash builtins unreliable for POSIX
2026-03-04 | @agence         | I003  | symbol-overload    | resolved | Too many meanings for $, ~, # prefixes
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- ID links to detailed JSON record in issues/
- Query by reporter: `grep @claudia INDEX.md`
- Query by status: `grep open INDEX.md`
- Query by category: `grep architecture INDEX.md`
- Issues are PERSONAL → TEAM (discoverable, not assigned)

**Status Values:**
- `open`: Active, needs investigation or resolution
- `in-progress`: Someone is working on it
- `resolved`: Fixed or addressed
- `deferred`: Acknowledged but deprioritized
- `duplicate`: Covered by another issue

**Difference from Tasks:**
- **Issues** = discoveries, problems, technical debt (not assigned)
- **Tasks** = assignments to humans/agents (work to do)

---

**Related:**
- Tasks (assignments): [`organic/tasks/`](../../organic/tasks/)
- Jobs (robot work): [`organic/jobs/`](../../organic/jobs/)
- Lessons (sanitized learning): [`lessons/`](../lessons/)
- Faults (local incidents): [`../../nexus/faults/`](../../nexus/faults/)
