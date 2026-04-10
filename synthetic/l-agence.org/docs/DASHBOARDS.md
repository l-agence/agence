# Dashboards

**Human-readable views of Agence swarm state — rendered by GitHub.**

> These dashboards display the current state of tasks, workflows, projects, issues, and faults. They are regenerated from `organic/` JSON data and `nexus/` records.

---

## Views

| Dashboard | Source | Description |
|-----------|--------|-------------|
| [**TASKS**](dashboards/TASKS.md) | `organic/tasks.json` | All tasks with state, priority, score, agent assignment |
| [**WORKFLOWS**](dashboards/WORKFLOWS.md) | `organic/workflows.json` | Workflow pipelines with completion % |
| [**PROJECTS**](dashboards/PROJECTS.md) | `organic/projects.json` | Project-level rollup across workflows |
| [**ISSUES**](dashboards/ISSUES.md) | `synthetic/*/issues/` | Known problems and opportunities |
| [**FAULTS**](dashboards/FAULTS.md) | `nexus/faults/` | Incident history and root cause analysis |

---

## Regeneration

Dashboards are regenerated via:

```bash
airun matrix dashboard          # regenerate all views from JSON data
```

Or manually committed after data changes. Views are deterministic — same input always produces same output.

---

## Design

- **No JavaScript, no build step** — pure markdown tables, rendered by GitHub
- **Scoring formula**: $\text{score} = 10P + 25S + 100H$ (see [MATRICES.md](MATRICES.md))
- **State symbols**: see [SYMBOLS.md](SYMBOLS.md)
- **Future**: JIRA/TEMPO integration for graphs, resource assignment, and time tracking

---

*Data: [organic/](../../../organic/) | Spec: [MATRICES.md](MATRICES.md) | Engine: [lib/matrix.ts](../../../lib/matrix.ts)*
