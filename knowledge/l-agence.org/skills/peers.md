# Skill: ^peer-design

**Category**: Peer (SKILL-005)  
**Artifact**: design → knowledge/designs/  
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

---

# Skill: ^peer-review

**Category**: Peer (SKILL-005)  
**Artifact**: report → knowledge/reports/  
**Agents**: @peers (3-LLM ensemble)  
**Peer skill**: review

## Purpose
Multi-agent code/design review. Three models review independently, then findings are synthesized — consensus issues are critical, divergent opinions are flagged.

## Input
- Code, diff, or design document to review
- Optionally: --flavor code|light|heavy (default: code)

## Output
1. **Per-Agent Reviews** — each model's findings
2. **Consensus Table** — issue, severity, confidence, weighted score
3. **Critical Issues** — all 3 models agree (high confidence)
4. **Disputed Issues** — models disagree (needs human judgment)
5. **Combined Rating** — weighted quality score

## Workflow
```
^peer-review < src/auth/middleware.ts
^peer-review --flavor heavy "Review the new caching architecture"
git diff main | ^peer-review
```

## When to Use
- Major PRs before merge to main
- Design docs before implementation starts
- Critical security-sensitive code
- When single-reviewer bias is a concern

---

# Skill: ^peer-solve

**Category**: Peer (SKILL-005)  
**Artifact**: solution → knowledge/solutions/  
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

---

# Skill: ^peer-analyse

**Category**: Peer (SKILL-005)  
**Artifact**: analysis → knowledge/analyses/  
**Agents**: @peers (3-LLM ensemble)  
**Peer skill**: analyze

## Purpose
Multi-agent analysis. Three models analyze from different perspectives, then findings are correlated — agreed patterns are high-confidence, unique insights are preserved.

## Input
- System, codebase, data, incident, or trend to analyze
- Optionally: --flavor code|light|heavy (default: code)

## Output
1. **Per-Agent Analysis** — each model's perspective
2. **Consensus Table** — finding, confidence, weighting, score
3. **Correlated Findings** — patterns all models identified
4. **Unique Insights** — findings only one model surfaced
5. **Implications** — what the analysis means for decisions

## Workflow
```
^peer-analyse "Why do Monday deploys fail 3x more than Thursday?"
^peer-analyse --flavor heavy "Post-mortem: 2-hour outage on April 15"
^peer-analyse < monitoring/dashboard-export.json
```

## When to Use
- Post-mortems and incident analysis
- System health diagnostics
- Trend analysis across metrics/logs
- When single-perspective analysis might miss patterns
