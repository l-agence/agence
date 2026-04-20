# Skill: ^recon

**Category**: Knowledge (SKILL-007)  
**Artifact**: analysis → synthetic/analyses/  
**Agents**: @aleph (primary), @feynman (explain), @haiku (fast)

## Purpose
Reconnaissance of a codebase or system. Survey structure, dependencies, entry points, data flows, and configuration. Produce a concise intelligence report.

## Input
- Directory, repo, or system to survey
- Optionally: specific focus (security, architecture, dependencies)

## Output
1. **Structure** — directory layout, key files, module organization
2. **Tech Stack** — languages, frameworks, tools, versions
3. **Entry Points** — main, CLI, API endpoints, event handlers
4. **Dependencies** — external libs, services, databases
5. **Data Flows** — how data enters, transforms, and exits
6. **Configuration** — env vars, config files, secrets management
7. **Notable** — unusual patterns, tech debt, potential issues

## Workflow
```
^recon .                                    # survey current repo
^recon "Map the infrastructure of this monorepo"
^recon --agent @aleph "Security recon of the API surface"
```

## Quality Criteria
- Factual — based on actual files, not assumptions
- Concise — intelligence report, not a book
- Actionable — highlights what matters for the reader's goal
- Complete — covers all entry points and data flows
