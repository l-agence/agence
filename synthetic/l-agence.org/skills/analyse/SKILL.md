# Skill: ^analyse

**Category**: Analysis (SKILL-004)  
**Artifact**: analysis → synthetic/analyses/  
**Agents**: @sonya (primary), @claudia (deep), @feynman (explain)  
**Peer-capable**: yes (^analyse --peers or ^peer-analyse)

## Purpose
Deep analysis of code, systems, data, or incidents. Identify patterns, risks, dependencies, and recommendations.

## Input
- Code, logs, metrics, system description, or incident report
- Optionally: specific focus area (performance, reliability, coupling)

## Output
1. **Findings** — key observations, organized by category
2. **Patterns** — recurring themes or structural issues
3. **Risks** — things that could break, degrade, or surprise
4. **Dependencies** — what this connects to, what it depends on
5. **Recommendations** — prioritized, actionable next steps

## Workflow
```
^analyse "Why do Monday deployments fail more often?"
^analyse --peers < infrastructure/docker-compose.yaml
^analyse --agent @claudia "Analyse the auth service reliability"
```

## Quality Criteria
- Findings are evidence-based, not speculative
- Risks include likelihood and impact estimates
- Recommendations are prioritized (critical → nice-to-have)
- Analysis is structured, not a wall of text
