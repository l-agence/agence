# Tasks Index

**Team assignments. Work to be done by humans or agents.**

Format: Syslog-style with creation date, assignee, task ID, category, and status.

```
DATE       | @ASSIGNED-TO    | ID    | CATEGORY           | STATUS      | DESCRIPTION
───────────┼─────────────────┼───────┼────────────────────┼─────────────┼──────────────────────
2026-03-20 | @ralph          | T001  | implementation     | in-progress | Implement matrix-math.ts core
2026-03-20 | @steff          | T002  | documentation      | assigned    | Write container architecture spec
2026-03-15 | @claudia        | T003  | refactoring        | complete    | Rewrite PATH validation layer
```

---

**Instructions:**
- Each line is human-parseable (markdown table)
- ID links to detailed JSON record in tasks/
- Query by assignee: `grep @ralph INDEX.md`
- Query by status: `grep in-progress INDEX.md`
- Query by category: `grep implementation INDEX.md`
- Tasks are TEAM ASSIGNMENTS (assigned to human or agent)

**Status Values:**
- `assigned`: Ready to start (queued)
- `in-progress`: Currently being worked on
- `complete`: Finished and verified
- `blocked`: Waiting on dependency
- `on-hold`: Paused by human decision

**Assignee Types:**
- `@human-name` (e.g., @steff, @alice) — Human assignment
- `@agent-name` (e.g., @ralph, @claudia) — Agent assignment
- Multiple assignees allowed (collaborative task)

**Difference from Issues:**
- **Issues** = discoveries (not assigned, team visibility)
- **Tasks** = assignments (routable to humans/agents, actionable)

---

**Related:**
- Issues (discoveries): [`../../synthetic/l-agence.org/issues/`](../../synthetic/l-agence.org/issues/)
- Jobs (robot execution): [`jobs/`](./jobs/)
- Plans (strategic roadmap): [`../../synthetic/l-agence.org/plans/`](../../synthetic/l-agence.org/plans/)
- State matrix: [`matrix-state.json`](./matrix-state.json)
