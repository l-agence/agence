# ^deploy — Deployment & Release Operations

## Purpose
Plan and execute deployments safely: pre-flight checks, rollback strategy, health verification, and post-deploy validation.

## Inputs
- Deployment target (environment, service, infrastructure)
- Change description (what's being deployed)
- Optional: rollback plan, health check endpoints

## Outputs
- Pre-flight checklist
- Deployment plan with steps
- Rollback strategy
- Post-deploy verification steps

## Agent Routing
- Default: @chad (DevOps/infra)
- Peer: @peers ^deploy for consensus on risky deploys

## Artifact
- Type: result
- Scope: organic/results/
