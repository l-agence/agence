# Skill: ^solve

**Category**: Code (SKILL-002)  
**Artifact**: solution → synthetic/solutions/  
**Agents**: @sonya (primary), @copilot (coder), @peers (consensus)  
**Peer-capable**: yes (^solve --peers or ^peer-solve)

## Purpose
Solve a hard technical problem. Analyze deeply, consider multiple approaches, recommend the best.

## Input
- Problem description (stuck, deadlocked, novel challenge)
- Optionally: constraints, prior failed attempts, context

## Output
1. **Analysis** — root cause or problem decomposition
2. **Approaches** — 2-3 viable solutions with trade-offs
3. **Recommendation** — best approach with rationale
4. **Implementation** — concrete steps or code

## Workflow
```
^solve "CI takes 45 minutes, how to get under 10"
^solve --peers "Should we migrate to gRPC or stay REST?"
^solve --agent @sonya "Circular dependency between auth and user modules"
```

## Quality Criteria
- Multiple approaches considered (not just the first idea)
- Trade-offs clearly stated (cost, complexity, risk, time)
- Recommendation is actionable, not hand-wavy
- If using --peers: consensus table with confidence scores

## When to use --peers
- Deadlocked technical decisions (team can't agree)
- Architecture-level choices with long-term impact
- Novel problems with no clear precedent
