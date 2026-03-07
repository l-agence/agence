# 🏗️ Agence Architecture & Design

> **Distributed Knowledge Base with Git-Based Sharding**

---

## 1. System Overview

Agence is a **distributed agent collaboration system** that solves persistent memory and multi-tenant isolation through **git-based sharding**.

```
┌───────────────────────────────────────────┐
│    Agence Master Repository               │
│ (l-agence/agence-master - reference impl) │
└──────────────────┬────────────────────────┘
                   │
           [Git Clone/Pull:]
             [CODEX]        : Governance
             [OBJECTCODE]   : CODE-base
             [GLOBALCACHE]  : RAG-base
             [ORCHESTRATOR] : Workflows
             [SYNTHETIC]    : DWM-Base 
                   │
    ┌──────────────┼────────────┐
    ↓              ↓            ↓
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Agence     │ │ Agence     │ │ Agence     │
│ Shard A    │ │ Shard B    │ │ Shard C    │
│(Team Repo) │ │(Org Repo)  │ │(Project)   │
└────────────┘ └────────────┘ └────────────┘
     │             │              │
  [NEXUS]       [NEXUS]        [NEXUS]    : Local States
  [HERMETIC]    [HERMETIC]     [HERMETIC] : Secret-base
```

---

## 2. Core Architecture

### 2.1 Three-Layer Model

#### Layer 1: Master Repository
- **Purpose**: Single source of truth, reference implementation
- **Location**: `l-agence/agence-master` (GitHub)
- **Contents**: 
  - Base framework (bin/agence entry point)
  - Template structure (codex/, nexus/, synthetic/)
  - Standard command definitions
  - Agent personas library
- **Role**: Template, not runtime - never stores operational data

#### Layer 2: Shard Instances
- **Purpose**: Distributed knowledge and execution
- **One per**: Project, team, organization, or repo
- **Created by**: `git clone l-agence/agence-master`
- **Contents**: 
  - Same structure as master
  - Project-specific lessons and rules customizations
  - Isolated sessions (local NEXUS)
  - Local CODEX extensions

#### Layer 3: Local Runtime (NEXUS)
- **Purpose**: Operational state that doesn't sync
- **Lifecycle**: Ephemeral (or archived)
- **Data**:
  - Active sessions
  - Runtime logs
  - Fault records
  - Command history
- **Location**: .agence/nexus/ (not in git)

### 2.2 Knowledge vs Operations (NEXUS vs CODEX)

```
CODEX (Immutable, Versioned)
├─ Principles (maxims)
├─ Laws (constraints)
├─ Rules (best practices)
└─ Lessons (learned insights)

NEXUS (Operational, Ephemeral)
├─ Logs (activity)
├─ Faults (errors)
├─ Sessions (agent state)
└─ Buffers (stdout/stderr/stdin - future)
```

**Sync Strategy:**
- CODEX → Version controlled (git), shared across shards
- NEXUS → Local only (gitignore), never synced
- Sessions → Can be exported/imported for handoff

---

## 3. Sharding Strategy

### 3.1 Why Sharding?

| Problem | Centralized DB | Git Sharding |
|---------|----------------|-------------|
| **Database Size** | Grows unbounded | One per project (small) |
| **Compression** | Complex, slow | Native git compression |
| **Security** | Shared access control | Per-repo isolation |
| **Scaling** | Requires infrastructure | Scales with git |
| **Backup** | Custom strategy | Git native (distributed) |

### 3.2 Shard Boundaries

Shards are created **at git repository boundaries**:

```
Development Organization
├─ Frontend Team
│  └─ repo: ui-framework
│     └─ Agence Shard A (own NEXUS/CODEX)
├─ Backend Team
│  └─ repo: api-services
│     └─ Agence Shard B (own NEXUS/CODEX)
└─ DevOps Team
   └─ repo: infrastructure
      └─ Agence Shard C (own NEXUS/CODEX)
```

**Key Properties:**
1. Each repo contains its own `.agence/` directory
2. `.agence/.gitignore` excludes nexus/ (operational state)
3. `.agence/codex/` and `.agence/synthetic/` are versioned
4. Sessions can be exported for cross-shard handoff

### 3.3 Distribution Model

```
┌─ Shard Instance
│  ├─ bin/agence (symlink or copy from master)
│  ├─ codex/ (versioned)
│  │  ├─ PRINCIPLES.md (base + overrides)
│  │  ├─ LAWS.md
│  │  ├─ RULES.md
│  │  └─ agents/ (local personas)
│  ├─ synthetic/ (versioned)
│  │  ├─ lessons/ (project-specific)
│  │  └─ docs/
│  └─ .gitignore (excludes nexus/)

┌─ Not Shared: Instance
│  ├─ nexus/ (local states, not versioned)
│  │  ├─ logs/
│  │  ├─ faults/
│  │  └─ sessions/
│  ├─ hermetic/  (private local knowledge)
│  │  ├─ lessons/ (project-specific)
│  │  └─ docs/
```

---

## 4. Session Persistence & Handoff

### 4.1 Session Lifecycle

```
CREATE (^save)
    ↓
SAVED (session-saved.jsonl)
    ↓
    ├─→ RESUME (^resume) → ACTIVE
    ├─→ HANDOFF (^handoff) → TRANSFERRED
    └─→ ARCHIVE (after expiry)
```

### 4.2 Session Data Structure

```json
{
  "session_id": "69a8f74c",
  "created_at": "2026-03-05T03:21:07Z",
  "status": "saved",
  "agent": "claudia",
  
  "runstate": {
    "agent_context": "Current task description",
    "execution_stack": "Current working directory, file states",
    "memory_state": "Variables, buffers, internal state",
    "cursor_position": "Active file and line position",
    "todo_list": [
      { "id": 1, "title": "Task 1", "status": "in-progress" }
    ]
  },
  
  "metadata": {
    "task_description": "What this session was working on",
    "repo": "/path/to/repo",
    "priority": "high",
    "tags": ["deployment", "urgent"]
  }
}
```

### 4.3 Cross-Shard Handoff

```
Shard A (Team Frontend)
├─ Agent: Claudia (active)
├─ Session: 69a8f74c (saves state)
│  └─ Export: nexus/sessions/69a8f74c.export.json
│
    [Git Commit & Push]
    [Manual transfer or CI/CD]
│
Shard B (Team DevOps)
├─ Agent: Ralph (receives)
├─ Import: nexus/sessions/69a8f74c.export.json
└─ Execute: agence ^resume 69a8f74c
    └─ Continues with full context
```

---

## 5. Command Routing Architecture

### 5.1 Prefix-Based Routing

```
agence <input>
    │
    ├─ "..."          → mode_chat (natural language)
    ├─ "+..."         → mode_ai_routed (autonomous planning)
    ├─ "/..."         → mode_external (validated commands)
    ├─ "!..."         → mode_system (utilities) [reserved]
    └─ "^..."         → mode_init (special commands)
                         ├─ ^init (initialize environment)
                         ├─ ^reload (load all context)
                         └─ ^save (persist session)
```

### 5.2 External Command Safety

Commands under `/` are:
1. **Validated** against whitelist (commands.json)
2. **Guarded** via AIDO (opposite of sudo)
3. **Logged** to NEXUS/logs/
4. **Reversible** (git-friendly operations only)

Example:
```bash
agence /git-status      # ✅ Allowed (read-only)
agence /terraform-apply # ❌ Blocked (destructive)
```

---

## 6. Multi-Agent Coordination

### 6.1 Agent Registry

```
codex/agents/
├─ @claudia        # (opus)    Principal SRE and architect. Visionary Evolution. 
├─ @chad           # (GPT)     free & cost-optimized but Safe and reliable devops/cloudops. Stability. 
├─ @aiko           # (haiku)   lead CI/CD DevOps SRE, infrastructure prototyping. Disruptive innovator. 
├─ @sonya          # (sonnet)  Full Stack Dev lead and SRE. Deep detailed elegant coding. Backend, data layer.
├─ @ralph          # (ralph)   Ralph Wiggum iteration loop
├─ @olena          # (ollama)  free & Secure guard-railed On-premises local Ollama sessions.
├─ @peers          # (3-peers) MIT style 3-peer LLM agent weighed consensus. Strategic planning, Unsolvable P1 problems, RCA reviews.
└─ @pilot          # (copilot) Copilot agent session.  Code review, quality

 ... or you can roll your own !

```

Each agent has:
- **Capabilities** - What they can do
- **Context Window** - How much history they track
- **Handoff Rules** - When to pass to another agent
- **Constraints** - What they cannot do

### 6.2 Handoff Protocol

```
Agent A (active)
    │
    ├─ Identify need for specialist
    ├─ Save session: ^save "Handing off to Ralph for infra"
    ├─ Determine target: Ralph (DevOps agent)
    │
    └─ Execute: agence ^handoff ralph
        │
        ├─ Export session to transfer format
        ├─ Note: "Ralph, vpc implementation"
        └─ Return context to user with pointer
        
User/Agent B
    │
    ├─ Receive handoff pointer
    ├─ Load: agence ^resume 69a8f74c
    └─ Continue from where Agent A left off
```

---

## 7. Data Flow Examples

### 7.1 Single Shard Chat
```
User Input: agence "How do I configure TLS?"
    ↓
Agence (bin/agence)
    ├─ Detect mode: chat
    ├─ Load context: codex/LAWS.md, RULES.md
    ├─ Load agent: codex/agents/claudia.md
    ├─ Call LLM: Claude Opus
    ├─ Log call: nexus/logs/llm-calls.jsonl
    └─ Output: Structured response
```

### 7.2 Session Persistence
```
User Command: agence ^save "Halfway through deployment"
    ↓
Agence (save_session function)
    ├─ Capture: pwd, git status, todo list, history
    ├─ Generate: session_id (hex timestamp)
    ├─ JSON: Create session object
    ├─ Append: nexus/sessions/session-saved.jsonl
    ├─ Update: nexus/sessions/INDEX.md
    └─ Confirm: "Session 69a8f74c saved"

Later...

User Command: agence ^resume 69a8f74c
    ↓
Agence (resume_session function - future)
    ├─ Load: session JSON from JSONL
    ├─ Restore: pwd, file states, todo list
    ├─ Reload: agent context and memory
    ├─ Display: "Resuming deployment task at step 3/8"
    └─ Continue: Ready for next command
```

### 7.3 Multi-Shard Handoff
```
User: Working with Claudia on API design

User: agence ^handoff ralph "Need infrastructure setup"
    ↓
Agence (Shard A - Frontend)
    ├─ Save session: 69a8f74c
    ├─ Export: nexus/sessions/69a8f74c_ralph.export
    ├─ Commit: [handoff] Session 69a8f74c from Claudia to Ralph
    └─ Sync: Push to shared location (or manual transfer)

User: [Switches to backend repo - Shard B]

Agence (Shard B - Backend)
    ├─ Import: 69a8f74c_ralph.export
    ├─ Load agent: Ralph (DevOps/infrastructure specialist)
    ├─ Resume: agence ^resume 69a8f74c
    ├─ Context: Full previous conversation, decisions, state
    └─ Continue: Ralph picks up from step N with full context
```

---

## 8. Security Model

### 8.1 Isolation Boundaries

**Per-Repository Isolation:**
- Each shard has its own NEXUS (sessions, logs)
- CODEX overrides don't leak between repos
- Git credentials/auth scoped to repo

**Per-Organization Isolation:**
- Shards for different orgs never cross-sync NEXUS
- Lessons learned stay within org
- Agent personas customized per org

### 8.2 Access Control

```
Role          | CODEX Access | NEXUS Access | Handoff Rights
──────────────┼──────────────┼──────────────┼────────────────
Agent (local) | Read         | Read/Write   | Within shard
Agent (cross) | Read         | Read (hint)  | With approval
User          | Read         | Read (own)   | Full
Admin         | Read/Write   | Read/Write   | Full
```

---

## 9. Performance & Scaling

### 9.1 Compression Strategy

- **CODEX**: Git native compression (versioned)
- **NEXUS**: JSONL (easy to compress, segment)
- **Sessions**: Archive old sessions, compress, move to cold storage

```
nexus/sessions/
├─ session-active.jsonl      # Current (hot)
├─ session-saved.jsonl       # Recent (warm)
├─ session-completed.jsonl   # Old (compress & archive)
└─ archive/
   ├─ 2026-02.tar.gz (cold)
   └─ 2026-01.tar.gz (cold)
```

### 9.2 Query Performance

- **By Session ID**: O(1) lookup in INDEX.md + direct JSONL read
- **By Date Range**: grep on timestamp field (fast)
- **By Agent**: grep @agent_name (fast)
- **By Status**: grep status field (fast)

---

## 10. Implementation Roadmap

| Phase | Target | Features |
|-------|--------|----------|
| **V0.1** | ✅ Done | Session save, command routing, NEXUS/CODEX separation |
| **V0.2** | 🔄 Current | Multi-agent coordination, session resume, architecture docs |
| **V0.3** | 📋 Planned | Git-based sharding templates, cross-shard handoff |
| **V0.4** | 📋 Planned | Full session recovery, circular buffers, archival |
| **V1.0** | 📋 Planned | Production-ready, multi-org support, CLI polish |

---

## 11. Key Design Decisions

### Decision: Git-Based Sharding (vs Centralized DB)

**Rationale:**
- Leverages existing infrastructure (git)
- Natural per-repo isolation
- Backup/recovery via git
- Scales with git providers (GitHub, GitLab, etc.)

**Trade-offs:**
- Cross-shard queries require export/sync
- Real-time consistency challenges
- NEXUS not version-controlled (by design)

### Decision: JSONL for Sessions (vs JSON array)

**Rationale:**
- Streaming-friendly (append-only)
- Compression-friendly (segment by date)
- Natural for distributed logs

**Trade-offs:**
- No random access (must scan)
- Index must be maintained separately

### Decision: Persistent NEXUS (vs Ephemeral)

**Rationale:**
- Sessions survive agent restarts
- Handoffs require session export
- Operational history useful for debugging

**Trade-offs:**
- Storage growth over time
- Archival/cleanup required

---

## 12. Future Enhancements

- **Circular Buffers** for stdout/stderr/stdin (memory-efficient)
- **Distributed Tracing** across multi-shard workflows
- **Session Replay** for debugging agent decisions
- **Knowledge Graph** for lesson relationships
- **Cost Tracking** per agent, per session, per shard
- **Real-time Sync** for cross-shard collaboration

---

**Document Version:** 0.2.0  
**Last Updated:** 2026-03-05  
**Status:** Active Development
