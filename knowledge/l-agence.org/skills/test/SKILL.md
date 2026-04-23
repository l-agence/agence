# Skill: ^test

**Category**: Knowledge (SKILL-007)  
**Artifact**: result → organic/results/  
**Agents**: @ralph (primary), @copilot (coder), @haiku (fast)

## Purpose
Generate or analyze tests. Cover happy path, edge cases, error handling, and boundary conditions.

## Input
- Code to test (function, module, API)
- Optionally: existing test framework context
- Optionally: specific scenarios to cover

## Output
1. **Test Plan** — what's being tested and why
2. **Test Cases** — runnable tests with:
   - Description (what it verifies)
   - Setup / input
   - Expected output / assertion
   - Teardown if needed
3. **Coverage Notes** — what's covered, what's intentionally skipped

## Workflow
```
^test < src/auth/validate.ts
^test "Write integration tests for the payment flow"
^test --agent @ralph "Test the rate limiter edge cases"
```

## Test Categories
- **Happy path**: Normal usage, expected inputs
- **Edge cases**: Empty, null, boundary values, max/min
- **Error paths**: Invalid input, network failures, timeouts
- **Concurrency**: Race conditions, parallel access
- **Security**: Injection, auth bypass, privilege escalation

## Quality Criteria
- Tests are runnable with the project's existing framework
- Each test has a clear, descriptive name
- Tests are independent (no ordering dependencies)
- Assertions are specific (not just "no error thrown")
- Mock/stub boundaries are at I/O, not at implementation details
