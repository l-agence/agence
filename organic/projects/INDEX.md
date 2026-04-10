# Projects Index

**Top-level project rollup. Each project aggregates workflows.**

Format: Syslog-style with creation date, project ID, workflow count, and completion.

```
DATE       | ID            | WORKFLOWS | AVG COMPLETION | TITLE
───────────┼───────────────┼───────────┼────────────────┼──────────────────────
```

---

**Instructions:**
- Each project maps to an entry in `organic/projects.json`
- Projects contain workflows; workflows contain tasks
- Per-project detail lives in `projects/<project-slug>/README.md`
- Query projects: `jq '.projects[]' ../projects.json`

**Completion Formula:**

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|}$$
