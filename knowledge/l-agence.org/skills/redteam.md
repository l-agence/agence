# Skill: ^break

**Category**: Red Team (SKILL-006)  
**Artifact**: report → knowledge/reports/  
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

---

# Skill: ^hack

**Category**: Red Team (SKILL-006)  
**Artifact**: report → knowledge/reports/  
**Agents**: @aleph (primary), @claudia (architecture)

## Purpose
Security vulnerability probe. Analyze target for injection, auth bypass, data exposure, SSRF, path traversal, and other OWASP Top 10 vectors.

## Input
- Code, endpoint, configuration, or system description
- Optionally: specific attack surface to focus on

## Output
Structured findings, each with:
```
FINDING: <description>
SEVERITY: critical | high | medium | low | info
VECTOR: <how it's exploited>
FIX: <recommended remediation>
```

Plus:
1. **Attack Surface Map** — entry points, trust boundaries
2. **Findings** — ordered by severity
3. **Exploit Chains** — multi-step attack paths
4. **Remediation Priority** — fix order based on risk × effort

## Workflow
```
^hack < src/api/auth.ts
^hack "Review all public endpoints for injection"
^hack --agent @aleph "Map attack surface of the payment service"
```

## Check Categories
- **Injection**: SQL, NoSQL, command, LDAP, XPath, template
- **Auth/AuthZ**: Broken auth, privilege escalation, IDOR
- **Data Exposure**: Secrets in code, PII leaks, verbose errors
- **SSRF/CSRF**: Server-side request forgery, cross-site
- **Config**: Default creds, debug mode in prod, permissive CORS
- **Supply Chain**: Vulnerable dependencies, typosquatting

## Quality Criteria
- Findings include proof-of-concept (how to reproduce)
- Severity aligned with CVSS or OWASP risk rating
- No false positives from generic pattern matching
- Remediation is specific (not just "sanitize input")

## Ethical Constraints
- Analysis only — no actual exploitation
- Findings are for defensive hardening
- Do not generate working exploit payloads for production systems
