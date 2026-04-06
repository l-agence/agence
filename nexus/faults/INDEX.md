# Faults Index

**LOCAL ONLY — Operational incident history. Not shared upstream. Sensitive data may be present.**

Format: Syslog-style with timestamp, fault ID, category, and severity.

```
TIMESTAMP           | FAULT-ID             | CATEGORY           | SEVERITY | DESCRIPTION
──────────────────┼──────────────────────┼────────────────────┼──────────┼──────────────────────
2026-03-06 19:15  | 2026-03-06-git-clean | development-error  | high     | git clean -fdx deleted critical files
f9e7c3d2          | symlink-false-success| catastrophic       | critical | Path validation escape (junctions auto-healed)
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- Fault files are MARKDOWN (.md) or JSON for structured data
- Query by category: `grep development-error INDEX.md`
- Query by severity: `grep critical INDEX.md`
- **PRIVACY**: Never commit secrets, passwords, or sensitive data

**Severity Levels:**
- `critical`: Service unavailable, data loss, security violation
- `high`: Major incident, system degradation
- `medium`: Partial service loss, workaround available
- `low`: Minor issue, cosmetic

**Privacy Policy:**
- Faults are LOCAL ONLY (nexus/faults/)
- To share: Extract sanitized lesson → synthetic/lessons/
- Raw faults never committed upstream
- Future: ailedger will segregate secrets

---

**Related:**
- Lessons (sanitized): [`synthetic/l-agence.org/lessons/`](../../synthetic/l-agence.org/lessons/)
- Sessions (local): [`nexus/sessions/`](../sessions/)
- Logs (local): [`nexus/logs/`](../logs/)

