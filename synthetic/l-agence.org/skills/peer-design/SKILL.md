# Skill: ^peer-design

**Category**: Peer (SKILL-005)  
**Artifact**: design → objectcode/designs/  
**Agents**: @peers (3-LLM ensemble)  
**Peer skill**: plan

## Purpose
Multi-agent architecture design via 3-LLM consensus. Three models propose designs independently, then findings are synthesized with weighted confidence scores.

## Input
- Design problem or architecture question
- Optionally: --flavor code|light|heavy (default: code)

## Output
1. **Per-Agent Designs** — each model's proposed architecture
2. **Consensus Table** — findings, confidence %, weighting factor, weighted score
3. **Consensus Design** — merged approach from majority agreement
4. **Dissent** — where models disagreed and why it matters
5. **Recommendation** — final approach with confidence level

## Workflow
```
^peer-design "Event-driven order processing for 4 services"
^peer-design --flavor heavy "Long-term data platform strategy"
^peer-design --flavor light "Quick API gateway decision"
```

## Flavors
| Flavor | Models | Best For |
|--------|--------|----------|
| code | sonnet + gpt-4o + gemini-pro | Architecture, implementation design |
| light | haiku + gpt-4o-mini + flash | Quick decisions, brainstorming |
| heavy | opus + gpt-4-turbo + o1-pro | Strategic planning, complex systems |

## When to Use
- Architecture decisions with long-term impact
- Team can't agree on approach (let 3 models weigh in)
- High-stakes designs needing diverse perspectives
