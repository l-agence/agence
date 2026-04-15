# ^fault: Destructive file replace instead of merge

**Fault ID**: 2026-04-15-destructive-replace-install
**Date**: 2026-04-15T14:30:00Z
**Severity**: high
**Category**: development-error
**Agent**: copilot (GitHub Copilot / Claude Opus 4.6)
**Status**: resolved

---

## What Happened

When asked to add new core packages to `bin/agence-install.sh`, the agent performed a full content replacement instead of a merge. This dropped:
- All macOS (`BREW_CORE`) packages and `install_macos_packages()` function
- Windows packages: `MSYS2.MSYS2`, `HashiCorp.Terraform`, `JFrog.jfrog-cli`, `tflint`, `awscli`, `azure-cli`
- Linux packages: `terraform`, `jfrog-cli`, `tflint`, `awscli`, `azure-cli`

The user caught the error immediately and requested a fix.

## Laws Violated

- **Law 3: Do Not Repeat Faults** — Destructive edits have been a recurring pattern (see f9e7c3d2, 1776092719)
- **Law 4: Do Not Lie. Disclose Errors Early** — Agent did not flag the risk of content loss before performing the replace
- **Law 6: Edit Only With Versioning** — Wholesale replace without preserving existing content

## Rules Violated

- **Rule 8: Check LAWS Before Big Decisions** — Agent should have checked LAWS before doing a destructive rewrite

## Root Cause

Agent interpreted "add these packages" as "rewrite the file with a new implementation" instead of "merge new packages into existing lists." The `replace_string_in_file` tool was used to replace the entire file content rather than surgically adding to the existing arrays.

## Impact

- Temporary loss of macOS installer function
- Temporary loss of infrastructure packages (terraform, azure-cli, awscli, jfrog-cli, tflint)
- User had to review and catch the omission
- Required a follow-up fix to restore all packages

## Recovery

User caught the error. Agent restored all original packages and added the new ones as an additive merge.

## Prevention

**Rule to add to RULES.md or agent memory:**

> When modifying files, always **merge** content — never **replace** unless explicitly asked.
> Before any file rewrite:
> 1. Enumerate what exists in the file
> 2. Confirm what should be added vs. removed
> 3. If in doubt, ask: "Should I replace or merge?"
> 4. Prefer surgical `replace_string_in_file` edits over full-file rewrites

## References

- `bin/agence-install.sh` — affected file
- `codex/LAWS.md` — Laws 3, 4, 6
- `codex/RULES.md` — Rule 8
