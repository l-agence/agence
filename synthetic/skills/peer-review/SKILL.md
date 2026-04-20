# Skill: ^peer-review

**Category**: Peer (SKILL-005)  
**Artifact**: report → synthetic/reports/  
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
