
# Agentic Shell Policy: Tiered Capability Model
(aido + policy + confirmation) is basically the same security pattern used in serious autonomous agent runtimes:

policy → capability tier → escalation path

Instead of one huge whitelist/blacklist, you define capability tiers. The router evaluates the command and assigns it a tier. Then we have sudo-like privilege via aido (sudo for AI) and aido  decides if escalation is allowed.

aido  has 2 modes of operation : 
- like sudo for robots but requires a user prompt confirmation to execute.
- the opposite of sudo. executes safe whitelisted commands with low prrompts.

so aido allows  near promptless execution of safe commands AND fully prompted escalation confirmation for unsafe commands. 

This dramatically simplifies policy maintenance.


## Overview
This policy uses a tiered capability model for agentic shell command execution. Instead of a flat whitelist/blacklist, commands are classified into four risk-based tiers. This simplifies policy maintenance and escalation logic for agentic shells and agentic sudo (aido).

## Capability Tiers

| Tier | Meaning                   | Example Commands                | Policy Action           |
|------|---------------------------|---------------------------------|------------------------|
| T0   | Pure read-only            | git status, ls, terraform plan  | Auto-execute           |
| T1   | Local workspace mutation  | git add, terraform fmt          | Ask/confirm            |
| T2   | Remote/cloud mutation     | git push, terraform apply       | Confirm/escalate       |
| T3   | System-level privileged   | sudo, rm -rf, systemctl         | Block or require human |

### T0: Pure Read-Only
Inspection commands that do not mutate local files, infrastructure, or remote services. Auto-executed by agents.

### T1: Local Workspace Mutation
Commands that modify the local workspace but not remote/cloud state. Require confirmation.

### T2: Remote/Cloud Mutation
Commands that modify remote systems, infrastructure, or cloud services. Require strong confirmation and escalation.

### T3: System-Level Privileged
Commands capable of damaging the OS or exfiltrating secrets. Blocked or require explicit human approval.

## Example Policy Flow

1. Agent proposes command
2. Router classifies command into a tier
3. Policy check determines if auto, confirm, escalate, or block
4. aido (agentic sudo) enforces escalation/confirmation as needed

## YAML Policy Structure
See codex/AIPOLICY.yaml for the canonical tier definitions, command lists, and escalation rules.

## Global Safety
Global forbidden operators and patterns are enforced regardless of tier (see YAML for details).

## Maintenance
Update codex/AIPOLICY.yaml to add or reclassify commands/tier logic. This model enables clear, auditable, and extensible policy for agentic shells.

## Rationale
- **Simplicity**: Avoids complex, brittle containment mechanisms.
- **Safety**: Enforces explicit, short commands and granular whitelisting to prevent accidents.
- **Accountability**: Logs all actions for audit and traceability.
- **Transparency**: Makes agentic execution visible and reviewable.

## Technical Limitations
- Shared user context means no reliable way to segregate agentic and human actions.
- Policy scripts cannot enforce absolute security; they can only provide safety and audit.
- True containment requires OS-level isolation (users, containers, VMs).

## Design Compromise
- Policy is used for explicit command confirmation, audit, and safety.
- All actions are logged for accountability.
- Policy enforcement applies only in interactive shells, not scripted use.

## Conclusion
This design aligns with the philosophy of simplicity and technical reality. It provides robust, extensible safety and audit features, prioritizing accident prevention and accountability over strict containment.
