# 🤖 Agence: Agentic Engineering Collaboration Environment

> **Multi-Agent Persistent Knowledge Base with Distributed Sharding**

---

## 📋 Overview

**Agence** is a second-generation agent collaboration framework designed for enterprise environments requiring:

- 🔄 **Session Persistence** - Agent state survives restarts and handoffs
- 🏗️ **Multi-Agent Coordination** - Orchestration and context passing between agents
- 🌐 **Distributed Knowledge** - Sharded knowledge bases across git repositories
- 🔐 **Organization Isolation** - Security boundaries at repo/org level
- 💾 **Efficient Storage** - Compression and sharding strategies built-in

**Current Version:** 0.2.0 (active development)

---

## 🎯 Core Design Principles

### Distributed, Not Centralized
Instead of one monolithic knowledge base (which creates scalability, security, and compression challenges), **Agence instances are sharded across multiple git repositories**.

```
Master Repo (l-agence/agence-master)
    ↓
  [Sharding Strategy]
    ↓
Upstream Project Repos (distributed knowledge bases)
    ├─ Team A Repo (isolated knowledge)
    ├─ Team B Repo (isolated knowledge)
    └─ Org C Repo (isolated knowledge)
```

Each upstream repository becomes its own **Agence instance**, solving:
- 📦 **Database Size** - Knowledge stays local to project
- 🗜️ **Compression** - Only relevant data per shard
- 🔐 **Security** - Org/repo boundaries enforced via git
- 💾 **Performance** - Smaller working sets, faster queries

### NEXUS vs CODEX
- **NEXUS** - Operational state (sessions, logs, faults, runtime)
- **CODEX** - Immutable knowledge (principles, laws, rules, lessons)

---

## 📚 Documentation

### Getting Started
- [Architecture & Design](docs/ARCHITECTURE.md) - System design, sharding strategy, data flow
- [Session Management](docs/SESSIONS.md) - Session lifecycle, persistence, recovery
- [Agent Personas](docs/AGENTS.md) - Agent types, capabilities, coordination
- [Command Reference](../../../bin/COMMANDS.md) - CLI command routing and execution

### Knowledge Hierarchy
- **Principles** - Maxims (foundational philosophy)
- **Laws** - Hard constraints (non-negotiable)
- **Rules** - Best practices (recommended patterns)
- **Lessons** - Learned experiences (captured insights)

### Operations
- **Logs** - Activity logs, LLM calls, state mutations
- **Faults** - Error tracking and fault analysis
- **Sessions** - Agent state persistence and continuity

---

## 🚀 Quick Start

### Local Setup
```bash
# Reload Agence context (all knowledge files)
agence ^reload

# Save session state for later
agence ^save "Working on deployment task"

# Resume saved session
agence ^resume <SESSION_ID>
```

### Usage Modes
```bash
agence "question"              # Chat mode
agence +autonomous-task        # AI-routed autonomous
agence /git-status             # Execute validated command
agence !help                   # System utility
agence ^save "notes"           # Session management
```

---

## 🏛️ Architecture Highlights

### Three-Tier Knowledge Model
1. **Master Repo** - Template and reference implementation
2. **Shard Instances** - Each project/org gets its own Agence via git
3. **Local Context** - Session state, logs, runtime (NEXUS)

### Session Persistence
- **Captured**: Agent context, execution stack, memory state, todo lists
- **Stored**: JSONL format for efficient streaming and compression
- **Recoverable**: Full restoration on ^resume

### Multi-Agent Coordination
```
Agent A (active)
    ↓ (^handoff)
Agent B (receives context)
    ↓ (^resume SESSION_ID)
    → Continues work with full context
```

---

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Core Framework** | ✅ Active | Session save/load, command routing |
| **NEXUS Operations** | ✅ Active | Logs, faults, sessions (basic) |
| **CODEX Foundation** | ✅ Active | Principles, Laws, Rules defined |
| **Agent Personas** | 🔄 In Development | Claudia, Ralph, Sonny, etc. |
| **Multi-Agent Coordination** | 🔄 In Development | Handoff and context passing |
| **Sharding Strategy** | 🔄 In Development | Git-based distribution model |
| **Session Recovery** | 🔄 In Development | Full state restoration |

---

## 🔗 Key Files

```
.agence/
├─ bin/agence                 # Main entry point
├─ codex/                     # Immutable knowledge
│  ├─ PRINCIPLES.md
│  ├─ LAWS.md
│  └─ RULES.md
├─ nexus/                     # Operational state
│  ├─ logs/
│  ├─ faults/
│  └─ sessions/
├─ synthesis/                 # Learning & documentation
│  └─ l-agence.org/
│     ├─ INDEX.md            # This file
│     ├─ docs/
│     │  └─ ARCHITECTURE.md   # System design
│     └─ lessons/            # Captured insights
└─ .github/                   # Git instructions
   └─ CLAUDE.md               # Agent context
```

---

## 👥 Authors & Contributors

- **Stephane Korning** - Architecture, design
- **Agence Team** - Implementation and coordination

**License:** MIT + Commons Clause

---

## 📖 Next Steps

- [ ] Implement ^resume for full session recovery
- [ ] Wire multi-agent handoff coordination
- [ ] Design git-based sharding templates
- [ ] Create agent persona system
- [ ] Build compression/archival for old sessions

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical design.

---

*Last Updated: 2026-03-05*
*Version: 0.2.0*
