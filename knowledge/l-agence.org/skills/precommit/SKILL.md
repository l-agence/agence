# Skill: ^precommit

**Category**: Review (SKILL-003)  
**Artifact**: report → synthetic/reports/  
**Agents**: @ralph (primary), @linus (strict), @haiku (fast)

## Purpose
Pre-commit review gate. Check staged diff for bugs, security issues, style violations, and incomplete changes.

## Input
- Git staged diff (automatic via `git diff --cached`)
- Optionally: explicit file or diff piped via stdin

## Output
1. **Verdict** — PASS / FAIL / WARN
2. **Findings** — list of issues by severity
3. **Blockers** — issues that must be fixed before commit (if FAIL)

## Workflow
```
^precommit                                # review staged changes
^precommit --agent @linus                 # strict precommit gate
^precommit --agent @haiku                 # fast/cheap check
git diff --cached | ^precommit            # explicit pipe
```

## Check Categories
- **Bugs**: Null derefs, type mismatches, logic errors
- **Security**: Hardcoded secrets, injection, unsafe eval
- **Incomplete**: TODO/FIXME in diff, missing imports, unused vars
- **Style**: Naming violations, formatting (only if egregious)
- **Tests**: Changed behavior without updated tests

## Quality Criteria
- Fast — should complete in <10s for typical diffs
- Low false-positive rate — don't block on style nitpicks
- FAIL only for genuine bugs or security issues
- WARN for everything else
