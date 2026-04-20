# Skill: ^grasp

**Category**: Knowledge (SKILL-007)  
**Artifact**: analysis → synthetic/analyses/  
**Agents**: @feynman (primary), @sonya (technical), @haiku (fast)

## Purpose
Quick understanding of unfamiliar code. Rapidly explain purpose, key abstractions, data flow, and design decisions.

## Input
- Code file, function, or module to understand
- Optionally: specific question ("what does this do?", "why this pattern?")

## Output
1. **Purpose** — what this code does in one sentence
2. **Key Abstractions** — main types, interfaces, patterns used
3. **Data Flow** — input → processing → output
4. **Design Decisions** — why it's structured this way
5. **Gotchas** — non-obvious behavior, side effects, assumptions

## Workflow
```
^grasp < src/auth/middleware.ts
^grasp "What does the signal handler in lib/watch.ts do?"
^grasp --agent @haiku < src/utils/crypto.ts    # fast/cheap
```

## Quality Criteria
- Concise — fits in one screen (not a dissertation)
- Accurate — describes actual behavior, not intent
- Highlights non-obvious parts (the "aha" moments)
- Appropriate depth — more detail for complex code
