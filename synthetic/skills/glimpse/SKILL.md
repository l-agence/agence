# Skill: ^glimpse

**Category**: Knowledge (SKILL-007)  
**Artifact**: analysis → synthetic/analyses/  
**Agents**: @feynman (primary), @haiku (fast), @sonya (architect)

## Purpose
High-level overview. Bird's-eye view of what something is, why it exists, and how it fits into the larger system.

## Input
- Repo, module, service, or system to overview
- Optionally: context about why you need the overview

## Output
1. **What** — what this is in one paragraph
2. **Why** — why it exists, what problem it solves
3. **How** — how it fits into the larger system
4. **Key Things** — 3-5 bullet points a newcomer must know
5. **Status** — health, maturity, known issues

## Workflow
```
^glimpse .                                  # overview of current repo
^glimpse "What is the peers consensus engine?"
^glimpse --agent @haiku < lib/skill.ts      # quick overview
```

## Quality Criteria
- One screen maximum — this is a glimpse, not a deep dive
- Newcomer-friendly — no assumed context
- Accurate — reflects current state, not historical intent
- Links to deeper resources if they exist
