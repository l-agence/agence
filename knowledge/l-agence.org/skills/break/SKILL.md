# Skill: ^break

**Category**: Red Team (SKILL-006)  
**Artifact**: report → synthetic/reports/  
**Agents**: @aleph (primary), @ralph (reliability), @haiku (fast)

## Purpose
Adversarial stress testing. Find ways to break the system: edge cases, race conditions, resource exhaustion, malformed input.

## Input
- Code, API, system, or component to stress-test
- Optionally: specific failure modes to probe

## Output
1. **Failure Modes** — each with:
   - Description of the break
   - Reproduction steps
   - Impact (data loss, crash, hang, corruption)
   - Likelihood (common, edge case, adversarial)
2. **Chaos Scenarios** — multi-step failure cascades
3. **Resilience Gaps** — missing circuit breakers, retries, timeouts
4. **Hardening Recommendations** — ordered by impact

## Workflow
```
^break < src/queue/consumer.ts
^break "What happens if the database goes down mid-transaction?"
^break --agent @ralph "Find edge cases in the rate limiter"
```

## Stress Vectors
- **Input**: Null, empty, oversized, unicode, nested, recursive
- **Timing**: Race conditions, slow consumers, clock skew
- **Resources**: Memory exhaustion, disk full, connection pool
- **Network**: Timeout, partial response, DNS failure
- **State**: Stale cache, orphaned locks, split brain
- **Concurrency**: Deadlock, livelock, thundering herd

## Quality Criteria
- Each break has concrete reproduction steps
- Impact is specific (not just "things break")
- Distinguishes likely failures from adversarial edge cases
- Hardening recommendations are proportional to risk
