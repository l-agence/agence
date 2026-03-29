# Lessons Learned Index

**Human-readable master index of lessons extracted from experience.**

Format: Syslog-style with `@agent` prefix, hex ID, formtag, and link to detailed JSON.

```
DATE       | @AGENT          | HEX-ID   | FORMTAG        | SEVERITY | LESSON
───────────┼─────────────────┼──────────┼────────────────┼──────────┼──────────────────────────────────
2026-03-04 | @agence         | a3f7b2c1 | infrastructure | high     | Git symlinks required for cross-platform
2026-03-05 | @peers          | b4e8f1a3 | shell-compat   | high     | Bash history expansion (!) conflicts with agence ! prefix
2026-03-05 | @peers          | c2d9e5f7 | architecture   | medium   | Weighted expertise scoring > simple majority voting
2026-03-05 | @agence         | d7a3c8b1 | process        | high     | ADHD scope creep safeguards: hard stops prevent hyperflow
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- HEX-ID links to detailed JSON record in lessons/
- Query by agent: `grep @claudia INDEX.md`
- Query by severity: `grep critical INDEX.md`
- Query by formtag: `grep llm-hallucination INDEX.md`

**Severity Levels:**
- `critical`: Must implement immediately (blocks deployment, security issue)
- `high`: Important (affects reliability, performance, or multiple agents)
- `medium`: Should implement soon (improves quality, best practice)
- `low`: Nice to have (optimization, documentation)

