# Skill: ^refactor

**Category**: Code (SKILL-002)  
**Artifact**: pattern → objectcode/patterns/  
**Agents**: @copilot (primary), @sonya (architect), @linus (simplifier)

## Purpose
Improve code structure, readability, and maintainability without changing behavior.

## Input
- Code to refactor (file, function, module)
- Optionally: specific concern (naming, duplication, complexity, coupling)

## Output
1. **Changes** — each refactoring step with before/after
2. **Rationale** — why each change improves the code
3. **Verification** — how to confirm behavior is preserved

## Workflow
```
^refactor "Extract auth logic from handler into middleware"
^refactor --agent @linus < src/monolith.ts    # brutal simplification
^refactor --agent @sonya "Reduce coupling in payment module"
```

## Quality Criteria
- Behavior is 100% preserved (refactoring, not rewriting)
- Measurable improvement (fewer lines, lower complexity, better names)
- Each step is independently reviewable
- Tests still pass after each step

## Anti-patterns
- ❌ Changing behavior under the guise of refactoring
- ❌ Introducing new abstractions for one-time code
- ❌ Renaming things without improving clarity
- ❌ Moving code around without reducing coupling
