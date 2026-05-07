# Agence Governance Layers

Use layered controls so governance applies across agents and execution paths.

## Layer 1 — Agent Instructions (Advisory)

Use repository instruction files so compatible agents read governance rules at session start:

- `AGENTS.md` (generic agent instruction surface)
- `.cursorrules` (Cursor)
- `.windsurfrules` (Windsurf)
- `.aider.conf.yml` with `conventions_file: AGENTS.md` (Aider)

These files standardize: classify commands with `airun guard classify "<command>"` before execution.

## Layer 2 — Local Hard Gate (Git Hooks)

Install a pre-push hook that runs guard checks before push:

```bash
bash scripts/install-hooks.sh
```

The hook blocks push when Agence policy denies or requires escalation.

## Layer 3 — CI Hard Gate (Required Status Check)

Use Agence Guard in GitHub Actions (`action.yml`) and mark the workflow check as required in branch protection.

This prevents ungoverned pushes from merging even if local hooks are bypassed.

## Layer 4 — Org-Scale Enforcement (GitHub App, Phase 2)

At org level, use a GitHub App to programmatically:

1. Ensure the guard workflow/check exists in every repository
2. Configure branch protection with required Agence Guard status checks
3. Monitor drift and re-apply policy if repositories diverge

This closes opt-out paths across mixed toolchains (Codex, Claude Code, LangChain, Aider, and others).
