# Skill: ^review

**Category**: Review (SKILL-003)  
**Artifact**: report → synthetic/reports/  
**Agents**: @ralph (primary), @linus (harsh), @claudia (architecture)  
**Peer-capable**: yes (^review --peers or ^peer-review)

## Purpose
Code or design review. Assess correctness, security, performance, and maintainability.

## Input
- Code diff, file, or PR reference
- Optionally: specific concerns to focus on
- Optionally: pipe in code or diff via stdin

## Output
1. **Summary** — overall quality assessment (pass/fail/concerns)
2. **Critical Issues** — bugs, security, correctness problems (must fix)
3. **Suggestions** — improvements, style, readability (nice to have)
4. **Rating** — quality score with brief rationale

## Workflow
```
^review < src/auth.ts
^review --agent @linus "Review the payment module"
^review --peers "Review the new caching architecture"
git diff main | ^review                     # review staged changes
```

## Review Checklist
- [ ] Correctness: Does it do what it claims?
- [ ] Security: Input validation, auth checks, injection risks
- [ ] Performance: O(n²) loops, unnecessary allocations, N+1 queries
- [ ] Error handling: Failures handled at boundaries, not swallowed
- [ ] Readability: Clear names, reasonable function length, no magic numbers
- [ ] Tests: Are changes tested? Are edge cases covered?

## Quality Criteria
- Critical issues clearly separated from style preferences
- Each finding includes location and suggested fix
- No false positives on intentional patterns (check context)
- Actionable — reviewer can apply feedback directly

## Anti-patterns
- ❌ Bikeshedding (style opinions without substance)
- ❌ Reviewing generated code as if human-written
- ❌ Suggesting rewrites when small fixes suffice
