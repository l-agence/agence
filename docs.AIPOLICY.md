# Agentic Shell Policy: Design Philosophy

## Overview
Agentic shell policy (`aipolicy`) is designed for safety, auditability, and accident prevention—not strict containment or true security. This approach is a pragmatic response to technical limitations in distinguishing human and agentic execution without OS-level segregation (dedicated users, containers, or VMs).

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
