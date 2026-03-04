# Faults Index

**Human-readable master index of all recorded faults.**

Format: Syslog-style with `@agent` prefix, hex ID, formtag, and link to detailed JSON.

```
TIMESTAMP            | @AGENT          | TYPE  | HEX-ID   | FORMTAG        | SUMMARY
─────────────────────┼─────────────────┼───────┼──────────┼────────────────┼──────────────────────────────────
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- HEX-ID links to detailed JSON record in FAULTS.json
- Query by agent: `grep @claudia INDEX.md`
- Query by formtag: `grep infrastructure INDEX.md`
- Query by date: `grep 2026-03-04 INDEX.md`

