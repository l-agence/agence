# Projects Dashboard

> **Source**: `organic/projects.json` + `organic/workflows.json`

---

## Active Projects

| ID | Title | Workflows | Avg Completion % | Status |
|----|-------|-----------|-----------------|--------|
| — | *No projects yet* | — | — | — |

## Project → Workflow Breakdown

*Each project aggregates its workflows:*

> No projects defined. Create one in `organic/projects.json`:
> ```json
> {
>   "projects": [
>     { "id": "PROJ-1", "title": "v0.4.0 Release", "workflows": ["WF-BUILD", "WF-DOCS"] }
>   ]
> }
> ```

---

## Completion Formula

$$\text{completion}(P) = \frac{\sum_{W \in P} \text{completion}(W)}{|P|}$$

Project completion is the mean of its workflow completions.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
