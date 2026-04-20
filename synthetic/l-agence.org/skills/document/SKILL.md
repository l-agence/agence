# Skill: ^document

**Category**: Knowledge (SKILL-007)  
**Artifact**: document → synthetic/docs/  
**Agents**: @feynman (primary), @sonya (technical), @copilot (coder)

## Purpose
Generate clear, accurate documentation from code or system knowledge. READMEs, ADRs, API refs, guides.

## Input
- Code, module, or system to document
- Optionally: target audience (developer, ops, end-user)
- Optionally: document type (README, ADR, API ref, guide)

## Output
Depends on document type:
- **README**: Purpose, quickstart, usage, configuration, contributing
- **ADR**: Context, decision, consequences, alternatives considered
- **API Ref**: Endpoints, parameters, responses, error codes, examples
- **Guide**: Step-by-step with prerequisites, commands, expected output

## Workflow
```
^document "Write a README for the auth module"
^document --agent @feynman "ADR for choosing PostgreSQL over MongoDB"
^document < src/api/ "API reference for all endpoints"
```

## Quality Criteria
- Accurate — matches actual code behavior (not aspirational)
- Audience-appropriate — right level of detail
- Examples are runnable (not pseudocode)
- Maintained — includes date and version context
