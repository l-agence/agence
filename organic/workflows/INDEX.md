# Workflows Index

**Workflow pipelines. Each workflow aggregates a sequence of tasks.**

Format: Syslog-style with creation date, workflow ID, task count, and completion.

```
DATE       | ID         | TASKS | DONE | COMPLETION | TITLE
───────────┼────────────┼───────┼──────┼────────────┼──────────────────────
```

---

**Instructions:**
- Each workflow maps to an entry in `organic/workflows.json`
- Tasks within a workflow are ordered; dependencies in `organic/deps.json`
- Query workflows: `jq '.workflows[]' ../workflows.json`
- Completion: count of tasks in state `-` / total tasks × 100%

**Completion Formula:**

$$\text{completion}(W) = \frac{|\{t \in W : \text{state}(t) = \texttt{"-"}\}|}{|W|} \times 100\%$$
