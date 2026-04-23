# Skill: ^simplify

**Category**: Review (SKILL-003)  
**Artifact**: pattern → objectcode/patterns/  
**Agents**: @linus (primary), @sonya (architect)

## Purpose
Simplify complex code. Remove unnecessary abstractions, dead code, and over-engineering.

## Input
- Complex code (file, module, function)
- Optionally: specific complexity concern (too many layers, too abstract)

## Output
1. **Complexity Analysis** — what's over-engineered and why
2. **Simplification** — rewritten code with complexity removed
3. **What was removed** — justification for each deletion/simplification
4. **Diff** — before/after comparison

## Workflow
```
^simplify < src/service-factory-builder-manager.ts
^simplify --agent @linus "This 400-line function does too much"
^simplify "The auth module has 6 layers of abstraction for one check"
```

## Simplification Targets
- Abstractions with single implementations (interfaces nobody extends)
- Wrapper classes that just delegate (remove the middleman)
- Configuration objects for things that never change
- Builder patterns for objects with 2 fields
- Event systems with 1 emitter and 1 listener
- Generic types that are never instantiated with different params

## Quality Criteria
- Behavior preserved — tests still pass
- Measurably simpler (fewer files, fewer lines, fewer indirection levels)
- Each removal justified — not just "it's shorter"
- Remaining code is still extensible where needed

## Anti-patterns
- ❌ Simplifying into a worse design (less readable, more coupled)
- ❌ Removing error handling to make code shorter
- ❌ Inlining everything (some abstraction is correct)
