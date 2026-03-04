# Agence: Agentic Engineering Framework

## Vision

**Agence** is a self-learning, distributed agentic framework designed for collaborative engineering teams. It enables multiple developers and AI agents to work together across multiple repositories, organizations, and cloud platforms while maintaining strong guardrails and knowledge sharing through a distributed RAG (Retrieval-Augmented Generation) system.

---

## Core Design Principles

### 1. **Single Write Lock Per Instance**
- Each Agence instance has **exclusive WRITE access** to exactly ONE repository (its parent project)
- READ access is unlimited across multi-org, multi-project, multi-repo landscapes
- Prevents conflicts and maintains data integrity in collaborative environments

### 2. **Self-Learning via Distributed Knowledge**
- Every action, decision, and outcome is captured as structured knowledge
- Knowledge can be stored in:
  - **Shared Knowledge Base**: Organization-wide learnings accessible to all Agence instances
  - **Private Knowledge Base**: Instance-specific or team-specific knowledge
- Knowledge propagates across the Agence network via git-based distribution

### 3. **Platform & Shell Agnostic**
- Operates seamlessly in both **PowerShell** and **Bash**
- Supports Windows, macOS, and Linux without friction
- Both **chat-mode** (interactive) and **in-shell** (direct commands) operation

### 4. **Engineering-First Focus**
- Deep integration with:
  - **Git & GitOps**: Native branch, merge, and workflow management
  - **Infrastructure as Code**: Terraform, CloudFormation, Bicep
  - **Cloud Platforms**: AWS, Azure, GCP APIs and SDKs
- Purpose-built for DevOps, SRE, and infrastructure engineering tasks

---

## Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────┐
│                    Agence Instance                      │
│  (Embedded as git submodule in parent project)          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐     ┌──────────────┐                 │
│  │  CLI / Chat  │     │ Shell Direct │                 │
│  │  Interface   │     │   Commands   │                 │
│  └──────────────┘     └──────────────┘                 │
│         │                     │                         │
│         └─────────┬───────────┘                         │
│                   ↓                                     │
│         ┌─────────────────────┐                        │
│         │  Action Orchestrator │                       │
│         └─────────────────────┘                        │
│                   │                                     │
│      ┌────────────┼────────────┐                       │
│      │            │            │                       │
│      ↓            ↓            ↓                       │
│  ┌────────┐  ┌────────┐  ┌──────────┐                 │
│  │  Git   │  │  IaC   │  │  Cloud   │                 │
│  │ Module │  │ Module │  │ Platform │                 │
│  └────────┘  └────────┘  │ Module   │                 │
│      │            │      └──────────┘                 │
│      └────────────┴──────────────┬────────────┐       │
│                                  ↓            ↓       │
│                         ┌──────────────────────────┐  │
│                         │  Local Repo (WRITE)      │  │
│                         │  Parent Project Files    │  │
│                         └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ↓                 ↓                 ↓
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │  Shared  │      │ Multi-  │      │  Sibling │
   │Knowledge │      │ Org RAG │      │ Agence   │
   │   Base   │      │ Sources │      │Instances │
   └──────────┘      └──────────┘      └──────────┘
```

### Core Modules

#### **CLI & Interface Layer**
- **Chat Mode**: Interactive conversation with context awareness
- **Shell Mode**: Direct command execution (e.g., `agence terraform plan`)
- **Bidirectional**: Can initiate actions or respond to external requests

#### **Action Orchestrator**
- Routes requests to appropriate domain modules
- Manages execution context (repo, org, project, environment)
- Tracks all actions and their outcomes for learning
- Enforces guardrails and permission checks

#### **Domain Modules**
1. **Git Module**
   - Branch management and CI/CD integration
   - Merge conflict resolution
   - Commit history analysis
   - GitOps workflow automation

2. **IaC Module** (Infrastructure as Code)
   - Terraform: plan, apply, validate, refactor
   - AWS CloudFormation, Azure Bicep
   - Drift detection and remediation
   - Cost analysis and optimization

3. **Cloud Platform Module**
   - AWS: EC2, Lambda, RDS, networking, IAM
   - Azure: VMs, App Service, Storage, networking
   - GCP: Compute Engine, Cloud Run, Firestore
   - Multi-cloud resource discovery and management

#### **Knowledge Management System**
- **RAG Engine**: Retrieves relevant context from multi-source knowledge
- **Learning Capture**: Automatic documentation of decisions and outcomes
- **Knowledge Distribution**: Git-based sync across Agence network
- **Searchable Index**: Fast lookup of best practices, patterns, fixes

---

## Key Features

### 1. **Multi-Org, Multi-Project, Multi-Repo RAG**
```
Agence Instance A (Repo: company/backend) 
  ├─ Can READ from: company/*, shared/*, public/*
  ├─ Can WRITE to: company/backend (only)
  └─ Knowledge shared to: Shared KB via git tags/releases
  
Agence Instance B (Repo: company/infra)
  ├─ Can READ from: company/*, shared/*, public/*
  ├─ Can WRITE to: company/infra (only)
  └─ Receives knowledge from: Instance A via git + Shared KB
```

### 2. **Knowledge Propagation**
- When Agence solves a problem, it documents:
  - Problem description and context
  - Solution approach and reasoning
  - Validation/test results
  - Failure modes and workarounds
  
- Knowledge is:
  - Pushed to Shared KB (via git commit to `.agence/knowledge/`)
  - Tagged for easy discovery
  - Queryable by other instances via RAG

### 3. **Knowledge Pop/Push Workflow**
```bash
# In Repository A:
agence knowledge push my-terraform-optimization

# In Repository B:
agence knowledge pop my-terraform-optimization
# → Pulls knowledge into local context
# → Applies learnings to current task
```

### 4. **Collaborative Multi-Agent/Developer Experience**
- **Human + Agent Teams**: Developers and agents work in parallel
  - Agent handles automation/boilerplate
  - Humans provide strategy/oversight
  
- **Agent + Agent Teams**: Multiple Agence instances coordinate
  - Agent A: works on backend infrastructure
  - Agent B: works on frontend deployment
  - Shared knowledge prevents duplication

- **Developer Handoff**: One developer can hand off to another
  - `agence context export` → portable context file
  - `agence context import` → resume elsewhere

---

## Guardrails & Safety

### Permission Model
- **WRITE**: Exclusive to parent repo (strictly enforced)
- **READ**: Configurable access levels to multi-repo landscape
- **Execute**: Validated actions only (pre-approved commands/patterns)
- **Secrets**: Encrypted, environment-scoped, never logged

### Audit Trail
- Every action logged with:
  - Actor (agent ID, user, timestamp)
  - Intent (what was requested)
  - Execution (what actually ran)
  - Outcome (success, failure, side effects)
  - Knowledge captured (for learning)

### Rollback & Recovery
- Git-native: All changes are commits
- Agence can suggest/execute rollbacks
- Knowledge of past failures prevents repeats

---

## Execution Context

Each Agence instance operates within a context:
```
context {
  organization: "company"
  project: "backend"
  repository: "company/backend"
  environment: "staging|production"
  branch: "feature/xyz"
  user: "alice@company.com"
  agent_id: "agence-backend-01"
  knowledge_sources: [shared, private, local]
}
```

---

## Shell & Compatibility

### PowerShell Support
```powershell
# Chat mode
agence chat "How should I structure this Terraform module?"

# Direct mode
agence-terraform plan
agence-git branch create feature/new-api
```

### Bash Support
```bash
# Chat mode
agence chat "Review this CloudFormation template"

# Direct mode
agence terraform apply
agence git branch create feature/new-api
```

### Cross-Platform Operations
- Detects shell and platform automatically
- Translates commands appropriately (e.g., `rm` vs `Remove-Item`)
- Handles path separators transparently

---

## Integration Points

### CI/CD
- GitHub Actions / GitLab CI / Azure DevOps
- Agence invoked as workflow step
- Results propagated back to PR/MR

### Monitoring & Observability
- Emit events to CloudWatch, Application Insights, Stackdriver
- Alert on failures or anomalies
- Integrate with incident management (PagerDuty, etc.)

### External LLMs
- Pluggable LLM backend (OpenAI, Claude, Qwen, Ollama, etc.)
- Local inference (Ollama) or cloud-hosted
- Fallback chains for resilience

---

## Git Submodule Model

```
parent-project/
├── .agence/                    ← Agence submodule
│   ├── bin/                    ← Executables
│   ├── lib/                    ← Core libraries
│   ├── modules/                ← Domain modules (git, iac, cloud)
│   ├── knowledge/              ← Local knowledge base
│   ├── .github/
│   │   └── agence.md           ← This specification
│   └── README.md
├── .git/
├── .github/
│   └── workflows/
│       └── agence.yml          ← CI/CD integration
└── [parent project files]
```

**Advantages:**
- Agence updates independently of parent projects
- Each team/org can pin to specific Agence version
- Knowledge sharing via git tags/releases

---

## Future Extensibility

- **Plugin System**: Custom domain modules for niche tools
- **Training**: Fine-tune understanding of org-specific patterns
- **Governance**: Org-wide policy enforcement (e.g., "no EC2, use Lambda")
- **Cost Optimization**: Real-time cost impact analysis
- **Compliance**: Automated audit report generation

---

## Success Metrics

- **Knowledge Reuse**: % of problems solved via existing knowledge
- **Agent Autonomy**: % of tasks completed without human intervention
- **Collaboration**: % of tasks involving multi-agent/team work
- **Safety**: 0% unauthorized writes, 100% audit trail coverage
- **Performance**: Time-to-resolution vs. manual approach

---

## Next Steps

1. Define API specifications (CLI, programmatic)
2. Implement core Action Orchestrator
3. Build Git Module MVP
4. Build IaC Module MVP (Terraform focus)
5. Implement Knowledge Management (RAG)
6. Add Cloud Platform Module
7. Integration tests and safety validation
8. Documentation and examples

---

*Agence: Empowering teams to build, deploy, and learn faster.*
