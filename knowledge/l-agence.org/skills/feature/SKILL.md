# Skill: ^feature

**Category**: Code (SKILL-002)  
**Artifact**: solution → synthetic/solutions/  
**Agents**: @copilot (primary), @sonya (architect)

## Purpose
Implement a new feature with clean, idiomatic code.

## Input
- Feature description (what it should do)
- Optionally: spec, acceptance criteria, existing interface constraints
- Optionally: pipe in relevant code for context

## Output
1. **Implementation** — complete, working code
2. **Integration** — where and how to wire it in
3. **Tests** — basic test coverage for the new feature
4. **Edge cases** — known limitations or considerations

## Workflow
```
^feature "Add rate limiting to /api/auth endpoint"
^feature --agent @sonya "Design + implement caching layer"
^feature < spec.md
```

## Quality Criteria
- Feature meets the stated requirements
- Code follows existing project conventions
- No regressions to existing functionality
- Includes basic test coverage
- Clean commit-ready output

## Anti-patterns
- ❌ Over-engineering (YAGNI — only build what's asked)
- ❌ Ignoring existing patterns in the codebase
- ❌ Missing error handling at system boundaries
