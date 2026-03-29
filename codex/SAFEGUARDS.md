# Agentic Shell Safeguards: Audit & Safety

## Purpose
Agentic shell safeguards are implemented to maximize safety and accountability in environments where true security and user segregation are not feasible.

## Key Safeguards
- **Explicit Command Confirmation**: Only short, whitelisted commands are allowed; destructive actions require explicit confirmation.
- **Session Logging**: All actions are logged for audit and traceability.
- **Policy Enforcement**: Applies only in interactive shells to avoid blocking scripted use.
- **Environment Hardening**: Restricts PATH, sanitizes environment variables, blocks signals.

## Audit Philosophy
- Auditability and accident prevention are prioritized over strict containment.
- Logs provide a clear record of agentic actions for review and accountability.
- Policy scripts serve as safety nets, not absolute boundaries.

## Technical Constraints
- No reliable way to distinguish human from agentic execution without OS-level isolation.
- Policy and audit features are the best available compromise for safety and accountability.

## Design Alignment
This approach fits the project’s philosophy: robust, simple, and transparent safeguards that maximize safety and auditability within technical limits.
