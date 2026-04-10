# Workflows Dashboard

> **Source**: `organic/workflows.json` + `organic/tasks.json`

---

## Active Workflows

| ID | Title | Tasks | Completed | Remaining | Completion % | Status |
|----|-------|-------|-----------|-----------|-------------|--------|
| — | *No workflows yet* | — | — | — | — | — |

## Workflow Detail

*Each workflow expands to show its constituent tasks:*

> No workflows defined. Create one:
> ```bash
> # Workflows are defined in organic/workflows.json
> # Each workflow references task IDs from tasks.json
> ```

---

## Completion Formula

$$\text{completion}(W) = \frac{|\{t \in W : \text{state}(t) = \texttt{"-"}\}|}{|W|} \times 100\%$$

A workflow is **complete** when all its tasks reach state `-`.

---

*Regenerate: `airun matrix dashboard` | Spec: [MATRICES.md](../MATRICES.md)*
