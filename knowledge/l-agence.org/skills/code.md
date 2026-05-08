# Skill: ^fix

**Category**: Code (SKILL-002)  
**Artifact**: solution → knowledge/solutions/  
**Agents**: @copilot (primary), @haiku (fast)

## Purpose
Fix a bug, error, or failing test. Identify root cause and provide a minimal, correct patch.

## Input
- Error message, stack trace, or bug description
- Optionally: file path, line numbers, reproduction steps
- Optionally: pipe in code via stdin

## Output
1. **Root Cause** — what's wrong and why
2. **Fix** — minimal code patch (diff or full replacement)
3. **Verification** — how to confirm the fix works

## Workflow
```
^fix "TypeError in auth.ts line 42"
^fix < src/auth.ts                     # pipe file, auto-detect errors
^fix --agent @haiku "quick null check" # fast/cheap agent
```

## Quality Criteria
- Fix addresses root cause, not just symptoms
- Minimal change — don't refactor unrelated code
- No new warnings or type errors introduced
- Include test case if the bug could recur

## Anti-patterns
- ❌ Wrapping in try/catch without fixing the actual bug
- ❌ Changing function signatures to work around the issue
- ❌ Suppressing errors/warnings instead of fixing them

---

# Skill: ^build

**Category**: Code (SKILL-002)  
**Artifact**: result → organic/results/  
**Agents**: @copilot (primary), @chad (infra), @haiku (fast)

## Purpose
Diagnose and fix build failures. Get the project compiling/passing.

## Input
- Build error output (compiler, bundler, CI log)
- Optionally: build config files (tsconfig, Makefile, Dockerfile)

## Output
1. **Diagnosis** — what's failing and why
2. **Fix** — changes to resolve the build
3. **Prevention** — config changes to avoid recurrence

## Workflow
```
^build "tsc reports 12 errors after upgrade"
^build < ci-output.log
^build --agent @chad "Docker build fails on arm64"
```

## Quality Criteria
- Build passes after applying the fix
- No version pinning hacks — fix the actual incompatibility
- Preserve existing build targets and behaviors

---

# Skill: ^feature

**Category**: Code (SKILL-002)  
**Artifact**: solution → knowledge/solutions/  
**Agents**: @copilot (primary), @sonya (architect)

## Purpose
Implement a new feature with clean, idiomatic code.

## Input
- Feature description (what it should do)
- Optionally: spec, acceptance criteria, existing interface constraints
- Optionally: pipe in relevant code for context

## Output
1. **Implementation** — complete, working code
2. **Integration** — where and how to wire it in
3. **Tests** — basic test coverage for the new feature
4. **Edge cases** — known limitations or considerations

## Workflow
```
^feature "Add rate limiting to /api/auth endpoint"
^feature --agent @sonya "Design + implement caching layer"
^feature < spec.md
```

## Quality Criteria
- Feature meets the stated requirements
- Code follows existing project conventions
- No regressions to existing functionality
- Includes basic test coverage
- Clean commit-ready output

## Anti-patterns
- ❌ Over-engineering (YAGNI — only build what's asked)
- ❌ Ignoring existing patterns in the codebase
- ❌ Missing error handling at system boundaries

---

# Skill: ^refactor

**Category**: Code (SKILL-002)  
**Artifact**: pattern → knowledge/patterns/  
**Agents**: @copilot (primary), @sonya (architect), @linus (simplifier)

## Purpose
Improve code structure, readability, and maintainability without changing behavior.

## Input
- Code to refactor (file, function, module)
- Optionally: specific concern (naming, duplication, complexity, coupling)

## Output
1. **Changes** — each refactoring step with before/after
2. **Rationale** — why each change improves the code
3. **Verification** — how to confirm behavior is preserved

## Workflow
```
^refactor "Extract auth logic from handler into middleware"
^refactor --agent @linus < src/monolith.ts    # brutal simplification
^refactor --agent @sonya "Reduce coupling in payment module"
```

## Quality Criteria
- Behavior is 100% preserved (refactoring, not rewriting)
- Measurable improvement (fewer lines, lower complexity, better names)
- Each step is independently reviewable
- Tests still pass after each step

## Anti-patterns
- ❌ Changing behavior under the guise of refactoring
- ❌ Introducing new abstractions for one-time code
- ❌ Renaming things without improving clarity
- ❌ Moving code around without reducing coupling

---

# Skill: ^solve

**Category**: Code (SKILL-002)  
**Artifact**: solution → knowledge/solutions/  
**Agents**: @sonya (primary), @copilot (coder), @peers (consensus)  
**Peer-capable**: yes (^solve --peers or ^peer-solve)

## Purpose
Solve a hard technical problem. Analyze deeply, consider multiple approaches, recommend the best.

## Input
- Problem description (stuck, deadlocked, novel challenge)
- Optionally: constraints, prior failed attempts, context

## Output
1. **Analysis** — root cause or problem decomposition
2. **Approaches** — 2-3 viable solutions with trade-offs
3. **Recommendation** — best approach with rationale
4. **Implementation** — concrete steps or code

## Workflow
```
^solve "CI takes 45 minutes, how to get under 10"
^solve --peers "Should we migrate to gRPC or stay REST?"
^solve --agent @sonya "Circular dependency between auth and user modules"
```

## Quality Criteria
- Multiple approaches considered (not just the first idea)
- Trade-offs clearly stated (cost, complexity, risk, time)
- Recommendation is actionable, not hand-wavy
- If using --peers: consensus table with confidence scores

## When to use --peers
- Deadlocked technical decisions (team can't agree)
- Architecture-level choices with long-term impact
- Novel problems with no clear precedent
