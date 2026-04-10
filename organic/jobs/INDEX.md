# Jobs Index

**ROBOT-ONLY ASSIGNMENTS. Agent execution queue and history.**

Format: Syslog-style with creation date, assigned agent, job ID, category, and status.

```
DATE       | @AGENT          | ID    | CATEGORY           | STATUS      | TASK-LINK
───────────┼─────────────────┼───────┼────────────────────┼─────────────┼──────────
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- ID links to detailed JSON record in jobs/
- Query by agent: `grep @ralph INDEX.md`
- Query by status: `grep in-progress INDEX.md`
- **ROBOT ONLY**: Jobs are assignments to agents, not humans

**Status Values:**
- `assigned`: Job queued, waiting for agent to read
- `started`: Agent has begun execution
- `in-progress`: Agent actively working
- `complete`: Agent finished, results submitted
- `failed`: Agent encountered error
- `abandoned`: Interrupted by human (Ctrl+K)
- `on-hold`: Paused by orchestrator

**Relationship to Tasks:**
- **Task** = human-created work item (e.g., T001)
- **Job** = agent-routable execution unit derived from task (e.g., J001 ← T001)
- One task may spawn multiple jobs (parallel shards)

---

**Related:**
- Tasks (human assignments): [`../tasks/`](../tasks/)
- Sessions (agent execution logs): [`../../nexus/sessions/`](../../nexus/sessions/)
- Logs (operational): [`../../nexus/logs/`](../../nexus/logs/)
- State matrix: [`../matrix-state.json`](../matrix-state.json)
