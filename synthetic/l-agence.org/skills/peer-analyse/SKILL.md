# Skill: ^peer-analyse

**Category**: Peer (SKILL-005)  
**Artifact**: analysis → synthetic/analyses/  
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
