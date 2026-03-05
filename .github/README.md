🤖 ^ **Agence** - Multi-Agent Persistent Knowledge Base

---

## What is Agence?

**Agence** is a distributed agent collaboration framework that brings **persistent memory** and **intelligent handoffs** to AI-assisted development.

Instead of losing context at the end of each session, Agence lets agents:
- 💾 **Save session state** for later resumption
- 🤝 **Hand off work** to specialized agents with full context
- 📚 **Build knowledge** that persists across projects
- 🔐 **Scale securely** with git-based sharding

```
Agent A works on feature → saves state
        ↓
Agent B takes over → resumes with full context
        ↓
Your project now has institutional memory
```

---

## ⚡ Install (30 seconds)

Add Agence as a git submodule to your existing project:

```bash
# Add Agence to your repo
git submodule add https://github.com/l-agence/agence-master .agence

# Initialize the submodule
git submodule update --all --init

# Initialize Agence environment (creates symlinks, loads context)
sh .agence/bin/agence ^init

# Commit
git add .gitmodules .agence
git commit -m "Add Agence agent framework"
```

That's it. You now have:
- 🎯 **Agent collaboration** ready to use
- 💾 **Session persistence** for interrupted work
- 📖 **Knowledge base** (NEXUS/CODEX) living in your repo
- 🔄 **Command routing** via `agence` CLI

---

## 🚀 Quick Usage

```bash
# Chat with agent about your task
agence "How do I set up CI/CD for this?"

# Save session state (agent can resume later)
agence ^save "Implementing OAuth2, halfway through"

# Let an agent autonomously plan and execute
agence +deploy-to-staging

# Execute a validated command
agence /git-status

# See what's loaded (context, principles, rules)
agence ^reload

# Get help
agence !help
```

---

## 📚 Documentation

- **[Architecture](synthesis/l-agence.org/INDEX.md)** - How Agence works (sharding, sessions, handoff)
- **[Commands](bin/COMMANDS.md)** - Full CLI reference
- **[Principles](codex/PRINCIPLES.md)** - Core maxims
- **[Rules](codex/RULES.md)** - Best practices
- **[Lessons](synthesis/l-agence.org/lessons/)** - Captured insights

---

## 📦 What You Get

```
.agence/
├─ bin/agence                    # Main entry point (symlink or run directly)
├─ codex/                        # Immutable knowledge
│  ├─ PRINCIPLES.md              # Maxims (why)
│  ├─ LAWS.md                    # Hard constraints (must not)
│  ├─ RULES.md                   # Best practices (should)
│  └─ agents/                    # Agent personas
├─ nexus/                        # Operational state (local, ephemeral)
│  ├─ logs/                      # Activity logs
│  ├─ faults/                    # Error tracking
│  └─ sessions/                  # Persisted agent context
├─ synthesis/                    # Learning & documentation
│  └─ lessons/                   # Project lessons learned
├─ .github/                      # Git instructions
│  └─ CLAUDE.md                  # Agent context & instructions
└─ lib/                          # Utility functions
```

---

## 🎯 Usage Modes

| Mode | Example | Use When |
|------|---------|----------|
| **Chat** | `agence "question"` | Need advice or explanation |
| **Autonomous** | `agence +deploy-feature` | Want agent to plan & execute |
| **Command** | `agence /git-status` | Running pre-approved commands |
| **System** | `agence !help` | Using utilities or agent info |
| **Special** | `agence ^save` | Save/reload context, init |

---

## 🔄 How Sessions Work

**Before (traditional):**
```
Session 1: Agent works → loses context
Session 2: Agent starts fresh → repeats work
```

**With Agence:**
```
Session 1: Agent works → agence ^save
Session 2: Agent or colleague → agence ^resume SESSION_ID → continues
```

Each session captures:
- 💬 Agent context and memory
- 📝 Todo list and checkpoints  
- 📂 File states and directory
- 🎯 Task description and progress

---

## 🤖 ^ Design Philosophy

**"^ as Trademark"**

The `^` character represents Agence values:
- **Aleph (א)** - First letter, foundational intelligence
- **Lambda (λ)** - Function/transformation (what agents do)
- **Pointer (^)** - Reference to context (persistent memory)

All special commands use `^` prefix:
```bash
agence ^init           # Initialize environment
agence ^save "notes"   # Save session state  
agence ^resume ID      # Resume session
agence ^reload         # Reload knowledge base
```

---

## 📊 Status

| Component | Status |
|-----------|--------|
| Core Framework | ✅ Working |
| Session Persistence | ✅ Working |
| Command Routing | ✅ Working |
| Multi-Agent Coordination | 🔄 In Development |
| Knowledge Sharding | 🔄 In Development |
| Session Recovery | 🔄 In Development |

**Current Version:** 0.2.0 (alpha)

---

## 🔐 Security & Isolation

- ✅ Commands are **whitelisted**, not blacklisted
- ✅ Destructive operations require **confirmation**
- ✅ Each project gets isolated sessions (git-based sharding)
- ✅ Agent handoffs are **explicit** (not automatic)

---

## 🔗 Links

- **GitHub**: [l-agence/agence-master](https://github.com/l-agence/agence-master)
- **Architecture Docs**: [Full system design](synthesis/l-agence.org/docs/ARCHITECTURE.md)
- **Issues**: [GitHub Issues](https://github.com/l-agence/agence-master/issues)

---

## 📝 License

MIT + Commons Clause  
See LICENSE.md for details

---

**Questions?** Start with `agence !help` or check [the docs](synthesis/l-agence.org/INDEX.md).

**Want to contribute?** See CONTRIBUTING.md (coming soon).

---

*"An agent that remembers is an agent that learns."*

**v0.2.0** • Updated 2026-03-05
