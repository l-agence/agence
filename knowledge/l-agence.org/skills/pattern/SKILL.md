# Skill: ^pattern

**Category**: Analysis (SKILL-004)  
**Artifact**: pattern → objectcode/patterns/  
**Agents**: @sonya (primary), @copilot (coder), @claudia (architecture)

## Purpose
Extract a reusable, well-documented pattern from code or a recurring problem.

## Input
- Code exhibiting the pattern (or problem that needs one)
- Optionally: similar examples for cross-reference

## Output
1. **Pattern Name** — concise, descriptive identifier
2. **Problem** — what recurring issue this solves
3. **Solution** — the pattern structure with code
4. **Usage** — concrete examples showing application
5. **Constraints** — when NOT to use this pattern
6. **Variants** — common modifications

## Workflow
```
^pattern "Extract the retry-with-backoff pattern from our API clients"
^pattern < src/services/payment.ts
^pattern "We keep writing the same validation logic — extract it"
```

## Quality Criteria
- Pattern is genuinely reusable (not just one-off extraction)
- Code examples are copy-pasteable and tested
- Constraints clearly state when the pattern is wrong
- Named consistently with existing objectcode/patterns/
