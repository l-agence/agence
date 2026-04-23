# Skill: ^scope

**Category**: Analysis (SKILL-004)  
**Artifact**: analysis → synthetic/analyses/  
**Agents**: @sonya (primary), @chad (infra), @claudia (architecture)

## Purpose
Scope analysis for a proposed change. Determine blast radius, affected components, dependencies, and risk.

## Input
- Description of the proposed change
- Optionally: target files or modules

## Output
1. **Blast Radius** — small / medium / large / critical
2. **Affected Files** — list of files/modules that will change
3. **Dependencies** — upstream and downstream impacts
4. **Risk Assessment** — what could go wrong, likelihood, mitigation
5. **Effort Estimate** — rough sizing (hours/days, not precise)
6. **Recommendation** — proceed / split / defer / escalate

## Workflow
```
^scope "Replace Express with Fastify across all services"
^scope "Add multi-tenancy to the auth module"
^scope --agent @chad "Migrate from Docker Compose to K8s"
```

## Quality Criteria
- Blast radius is justified (not just gut feel)
- Dependencies include transitive impacts
- Risk assessment includes mitigation strategies
- Recommendation is actionable (not just "be careful")
