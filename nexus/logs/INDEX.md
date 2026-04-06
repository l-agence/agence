 Index

**Human-readable master index of all activity logs.**

Format: Syslog-style with `@agent` prefix, hex ID, formtag, and link to detailed JSONL entry.

```
TIMESTAMP            | @AGENT          | TYPE   | HEX-ID   | FORMTAG        | SUMMARY
─────────────────────┼─────────────────┼────────┼──────────┼────────────────┼──────────────────────────────────
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- HEX-ID links to JSONL entries in LOGS.json
- Query by agent: `grep @claudia INDEX.md`
- Query by log type: `grep agent-execution INDEX.md`
- Query by date range: `grep "2026-03" INDEX.md`

**Log Types:**
- `agent-execution`: Agent start, duration, result
- `llm-calls`: LLM API calls, tokens, cost
- `state-mutations`: NEXUS state changes
- `errors`: Validation failures, timeouts, retries

