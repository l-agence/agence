# Skill: ^review

**Category**: Review (SKILL-003)  
**Artifact**: report → knowledge/reports/  
**Agents**: @ralph (primary), @linus (harsh), @claudia (architecture)  
**Peer-capable**: yes (^review --peers or ^peer-review)

## Purpose
Code or design review. Assess correctness, security, performance, and maintainability.

## Input
- Code diff, file, or PR reference
- Optionally: specific concerns to focus on
- Optionally: pipe in code or diff via stdin

## Output
1. **Summary** — overall quality assessment (pass/fail/concerns)
2. **Critical Issues** — bugs, security, correctness problems (must fix)
3. **Suggestions** — improvements, style, readability (nice to have)
4. **Rating** — quality score with brief rationale

## Workflow
```
^review < src/auth.ts
^review --agent @linus "Review the payment module"
^review --peers "Review the new caching architecture"
git diff main | ^review                     # review staged changes
```

## Review Checklist
- [ ] Correctness: Does it do what it claims?
- [ ] Security: Input validation, auth checks, injection risks
- [ ] Performance: O(n²) loops, unnecessary allocations, N+1 queries
- [ ] Error handling: Failures handled at boundaries, not swallowed
- [ ] Readability: Clear names, reasonable function length, no magic numbers
- [ ] Tests: Are changes tested? Are edge cases covered?

## Quality Criteria
- Critical issues clearly separated from style preferences
- Each finding includes location and suggested fix
- No false positives on intentional patterns (check context)
- Actionable — reviewer can apply feedback directly

## Anti-patterns
- ❌ Bikeshedding (style opinions without substance)
- ❌ Reviewing generated code as if human-written
- ❌ Suggesting rewrites when small fixes suffice

---

# Skill: ^precommit

**Category**: Review (SKILL-003)  
**Artifact**: report → knowledge/reports/  
**Agents**: @ralph (primary), @linus (strict), @haiku (fast)

## Purpose
Pre-commit review gate. Check staged diff for bugs, security issues, style violations, and incomplete changes.

## Input
- Git staged diff (automatic via `git diff --cached`)
- Optionally: explicit file or diff piped via stdin

## Output
1. **Verdict** — PASS / FAIL / WARN
2. **Findings** — list of issues by severity
3. **Blockers** — issues that must be fixed before commit (if FAIL)

## Workflow
```
^precommit                                # review staged changes
^precommit --agent @linus                 # strict precommit gate
^precommit --agent @haiku                 # fast/cheap check
git diff --cached | ^precommit            # explicit pipe
```

## Check Categories
- **Bugs**: Null derefs, type mismatches, logic errors
- **Security**: Hardcoded secrets, injection, unsafe eval
- **Incomplete**: TODO/FIXME in diff, missing imports, unused vars
- **Style**: Naming violations, formatting (only if egregious)
- **Tests**: Changed behavior without updated tests

## Quality Criteria
- Fast — should complete in <10s for typical diffs
- Low false-positive rate — don't block on style nitpicks
- FAIL only for genuine bugs or security issues
- WARN for everything else

---

# Skill: ^simplify

**Category**: Review (SKILL-003)  
**Artifact**: pattern → knowledge/patterns/  
**Agents**: @linus (primary), @sonya (architect)

## Purpose
Simplify complex code. Remove unnecessary abstractions, dead code, and over-engineering.

## Input
- Complex code (file, module, function)
- Optionally: specific complexity concern (too many layers, too abstract)

## Output
1. **Complexity Analysis** — what's over-engineered and why
2. **Simplification** — rewritten code with complexity removed
3. **What was removed** — justification for each deletion/simplification
4. **Diff** — before/after comparison

## Workflow
```
^simplify < src/service-factory-builder-manager.ts
^simplify --agent @linus "This 400-line function does too much"
^simplify "The auth module has 6 layers of abstraction for one check"
```

## Simplification Targets
- Abstractions with single implementations (interfaces nobody extends)
- Wrapper classes that just delegate (remove the middleman)
- Configuration objects for things that never change
- Builder patterns for objects with 2 fields
- Event systems with 1 emitter and 1 listener
- Generic types that are never instantiated with different params

## Quality Criteria
- Behavior preserved — tests still pass
- Measurably simpler (fewer files, fewer lines, fewer indirection levels)
- Each removal justified — not just "it's shorter"
- Remaining code is still extensible where needed

## Anti-patterns
- ❌ Simplifying into a worse design (less readable, more coupled)
- ❌ Removing error handling to make code shorter
- ❌ Inlining everything (some abstraction is correct)

---

# Skill: ^analyse

**Category**: Analysis (SKILL-004)  
**Artifact**: analysis → knowledge/analyses/  
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

---

# Skill: ^design

**Category**: Analysis (SKILL-004)  
**Artifact**: design → knowledge/designs/  
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

---

# Skill: ^pattern

**Category**: Analysis (SKILL-004)  
**Artifact**: pattern → knowledge/patterns/  
**Agents**: @sonya (primary), @copilot (coder), @claudia (architecture)

## Purpose
Extract a reusable, well-documented pattern from code or a recurring problem.

## Input
- Code exhibiting the pattern (or problem that needs one)
- Optionally: similar examples for cross-reference

## Output
1. **Pattern Name** — concise, descriptive identifier
2. **Problem** — what recurring issue this solves
3. **Solution** — the pattern structure with code
4. **Usage** — concrete examples showing application
5. **Constraints** — when NOT to use this pattern
6. **Variants** — common modifications

## Workflow
```
^pattern "Extract the retry-with-backoff pattern from our API clients"
^pattern < src/services/payment.ts
^pattern "We keep writing the same validation logic — extract it"
```

## Quality Criteria
- Pattern is genuinely reusable (not just one-off extraction)
- Code examples are copy-pasteable and tested
- Constraints clearly state when the pattern is wrong
- Named consistently with existing knowledge/patterns/

---

# Skill: ^scope

**Category**: Analysis (SKILL-004)  
**Artifact**: analysis → knowledge/analyses/  
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

---

# Skill: ^spec

**Category**: Analysis (SKILL-004)  
**Artifact**: document → knowledge/docs/  
**Agents**: @sonya (primary), @claudia (architecture), @copilot (coder)

## Purpose
Write a clear, testable specification from a description or requirements.

## Input
- Feature description, user story, or problem statement
- Optionally: existing system context, constraints

## Output
1. **Summary** — what we're specifying and why
2. **Requirements** — numbered, testable statements (MUST/SHOULD/MAY)
3. **Acceptance Criteria** — concrete pass/fail conditions
4. **Edge Cases** — boundary conditions and error scenarios
5. **Non-goals** — explicitly what this does NOT cover
6. **Open Questions** — unresolved decisions needing input

## Workflow
```
^spec "User can reset password via email link"
^spec "Rate limiting for all public API endpoints"
^spec --agent @claudia "SLO framework for the platform"
```

## Quality Criteria
- Every requirement is testable (can write a test for it)
- Acceptance criteria are specific (not "works correctly")
- Edge cases cover error paths, not just happy path
- Non-goals prevent scope creep

---

# Skill: ^split

**Category**: Analysis (SKILL-004)  
**Artifact**: analysis → knowledge/analyses/  
**Agents**: @haiku (primary, fast), @sonya (architect), @chad (infra)

## Purpose
Split a large task into small, independently testable subtasks with clear ordering.

## Input
- Large task description or ticket
- Optionally: existing codebase context, constraints

## Output
1. **Subtasks** — numbered list, each with:
   - Title (action-oriented, concise)
   - Acceptance criteria (1-3 concrete checks)
   - Dependencies (which subtasks must complete first)
   - Estimated size (S/M/L)
2. **Dependency Graph** — ordering constraints
3. **Critical Path** — which subtasks block the most

## Workflow
```
^split "Implement OAuth2 with Google, GitHub, and email providers"
^split --agent @haiku "Break down the database migration"
^split "This PR is 800 lines — help me split it"
```

## Quality Criteria
- Each subtask is independently testable and deployable
- No subtask is larger than ~1 day of work
- Dependencies form a DAG (no cycles)
- Critical path is identified for scheduling
- Subtasks use agence task format (ready for ^task add)

## Anti-patterns
- ❌ Subtasks that can only be tested together
- ❌ "Setup" tasks with no deliverable
- ❌ Splitting by layer instead of by feature slice
