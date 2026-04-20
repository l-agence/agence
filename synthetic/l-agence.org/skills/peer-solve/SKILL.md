# Skill: ^peer-solve

**Category**: Peer (SKILL-005)  
**Artifact**: solution → synthetic/solutions/  
**Agents**: @peers (3-LLM ensemble)  
**Peer skill**: solve

## Purpose
Multi-agent problem solving. Three models tackle the problem independently, then solutions are synthesized — consensus approaches are recommended, novel ideas are surfaced.

## Input
- Hard technical problem, stuck decision, or novel challenge
- Optionally: --flavor code|light|heavy (default: code)
- Optionally: prior failed attempts, constraints

## Output
1. **Per-Agent Solutions** — each model's approach
2. **Consensus Table** — approach, confidence, weighting, score
3. **Recommended Solution** — highest weighted consensus
4. **Alternative Approaches** — minority but valuable ideas
5. **Trade-off Matrix** — cost/complexity/risk per approach

## Workflow
```
^peer-solve "CI takes 45 minutes, target is under 10"
^peer-solve --flavor heavy "Should we rewrite in Rust or optimize Go?"
^peer-solve "Circular dependency between auth, user, and billing"
```

## When to Use
- Deadlocked technical decisions
- Problems with no obvious solution
- Architectural trade-offs with long-term impact
- When you want diverse reasoning approaches (not just one model's bias)
