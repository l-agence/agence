# Skill: ^design

**Category**: Analysis (SKILL-004)  
**Artifact**: design → objectcode/designs/  
**Agents**: @sonya (primary), @claudia (architecture), @chad (infra)  
**Peer-capable**: yes (^design --peers or ^peer-design)

## Purpose
Architecture or system design. Create clear, pragmatic designs with components, interfaces, and data flow.

## Input
- Requirements description or problem statement
- Optionally: constraints (tech stack, team size, timeline, budget)
- Optionally: existing system context to extend

## Output
1. **Overview** — what we're building and why
2. **Components** — modules, services, or layers with responsibilities
3. **Interfaces** — API contracts, data shapes, protocols
4. **Data Flow** — how data moves through the system
5. **Trade-offs** — what was considered and why this approach wins
6. **Implementation Guide** — phased steps to build it

## Workflow
```
^design "gRPC migration for 4 microservices"
^design --peers "Event-driven architecture for order processing"
^design --agent @chad "CI/CD pipeline for monorepo with 12 services"
```

## Quality Criteria
- Design is implementable (not just boxes and arrows)
- Interfaces are concrete (types, endpoints, payloads)
- Trade-offs are explicit (not hidden assumptions)
- Phased implementation — can deliver incrementally
- Failure modes identified (what breaks if X goes down)
