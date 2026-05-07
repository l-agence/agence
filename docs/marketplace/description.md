# Agence Guard — GitHub Marketplace Description

## Short description (150 chars max)
Gate every AI agent command through MLS policy enforcement. Classify, log, and block shell commands before they run — fail-closed by design.

---

## Long description

**Agence Guard** is the command-gating layer of the [Agence](https://github.com/l-agence/agence) AI governance framework. It enforces a 4-tier trust model on every shell command an AI agent proposes to execute — before execution.

### Trust Tiers

| Tier | Gate | Typical Commands |
|------|------|-----------------|
| T0 | Auto-execute | `git status`, `ls`, `cat`, `git log` |
| T1 | Flag & log | `git add`, unknown read-like commands |
| T2 | Require human approval | `git push`, `git merge`, `terraform plan` |
| T3 | **Block** | `rm -rf`, `git push --force`, `terraform destroy` |

Unknown commands **default to T2** (fail-closed). The guard never auto-approves unfamiliar input.

### MLS Capability Engine

On top of tier classification, Agence Guard enforces a POSIX-inspired capability model (Bell-LaPadula + Biba). Each agent identity carries a capability set. A command is denied if the agent lacks the required capability — regardless of tier.

Built-in capabilities include:
- `CAP_EXEC_SHELL` — execute shell commands
- `CAP_MUTATE_GIT` — git write operations
- `CAP_EXEC_INFRA` — terraform / docker / k8s
- `CAP_RED_TEAM` — security probing
- `CAP_PUBLISH` — npm publish, gh release

### Usage

```yaml
- name: Gate AI command
  id: guard
  uses: l-agence/agence@v1
  with:
    command: 'git push origin main'
    agent: ci
    fail_on_block: 'true'

- name: Use result
  run: echo "Tier: ${{ steps.guard.outputs.tier }}"
```

The Marketplace rollout starts with the reusable **GitHub Action** first. The separate **GitHub App** listing and webhook server can ship afterward as Phase 2+.

### Outputs

| Output | Description |
|--------|-------------|
| `tier` | T0 / T1 / T2 / T3 |
| `action` | allow / flag / escalate / deny |
| `reason` | Human-readable decision reason |
| `rule` | Matched policy rule (e.g. `blacklist.linux_shell`) |

### Custom Policy

Bring your own `AIPOLICY.yaml`:

```yaml
- uses: l-agence/agence@v1
  with:
    command: 'terraform apply'
    policy: 'codex/AIPOLICY.yaml'   # relative to your repo root
    fail_on_escalate: 'true'
```

### Why Agence?

- **Zero databases** — state lives in flat files and git
- **3 runtime dependencies** — `@modelcontextprotocol/sdk`, `bun`, `zod`
- **751 tests** with 279 security-specific assertions
- **9 red-team cycles** completed (SEC-008 through SEC-019)
- **Fail-closed** — unknown input is never auto-approved

---

## Category
`Continuous Integration` · `Security` · `Code Quality`

## Tags
`ai-governance`, `policy-enforcement`, `security`, `mls`, `command-gating`, `ai-agents`, `guardrails`
