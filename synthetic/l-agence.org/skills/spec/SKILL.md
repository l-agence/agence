# Skill: ^spec

**Category**: Analysis (SKILL-004)  
**Artifact**: document → synthetic/docs/  
**Agents**: @sonya (primary), @claudia (architecture), @copilot (coder)

## Purpose
Write a clear, testable specification from a description or requirements.

## Input
- Feature description, user story, or problem statement
- Optionally: existing system context, constraints

## Output
1. **Summary** — what we're specifying and why
2. **Requirements** — numbered, testable statements (MUST/SHOULD/MAY)
3. **Acceptance Criteria** — concrete pass/fail conditions
4. **Edge Cases** — boundary conditions and error scenarios
5. **Non-goals** — explicitly what this does NOT cover
6. **Open Questions** — unresolved decisions needing input

## Workflow
```
^spec "User can reset password via email link"
^spec "Rate limiting for all public API endpoints"
^spec --agent @claudia "SLO framework for the platform"
```

## Quality Criteria
- Every requirement is testable (can write a test for it)
- Acceptance criteria are specific (not "works correctly")
- Edge cases cover error paths, not just happy path
- Non-goals prevent scope creep
