# Skill: ^fix

**Category**: Code (SKILL-002)  
**Artifact**: solution → synthetic/solutions/  
**Agents**: @copilot (primary), @haiku (fast)

## Purpose
Fix a bug, error, or failing test. Identify root cause and provide a minimal, correct patch.

## Input
- Error message, stack trace, or bug description
- Optionally: file path, line numbers, reproduction steps
- Optionally: pipe in code via stdin

## Output
1. **Root Cause** — what's wrong and why
2. **Fix** — minimal code patch (diff or full replacement)
3. **Verification** — how to confirm the fix works

## Workflow
```
^fix "TypeError in auth.ts line 42"
^fix < src/auth.ts                     # pipe file, auto-detect errors
^fix --agent @haiku "quick null check" # fast/cheap agent
```

## Quality Criteria
- Fix addresses root cause, not just symptoms
- Minimal change — don't refactor unrelated code
- No new warnings or type errors introduced
- Include test case if the bug could recur

## Anti-patterns
- ❌ Wrapping in try/catch without fixing the actual bug
- ❌ Changing function signatures to work around the issue
- ❌ Suppressing errors/warnings instead of fixing them
