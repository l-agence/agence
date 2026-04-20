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
