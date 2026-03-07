# Agence: Agentic Engineering Collaborative Environment
# Author : stephane Korning : stefusss@gmail.com

l' Agence is a  distributed, multi-agent framework for collaborative engineering with built-in governance, knowledge management, and state coordination.*

---

## 🎮 Quick Start

```bash
# Chat with default agent
agence "How do I deploy this?"
^ "validate and open PR "

# Route to specific agent
agence @claudia "Review my architecture"
^ @chad "Debug my CI/CD pipeline"
agence @ralph "Teach me consistency patterns"
^  @aiko "Optimize my cloud infrastructure"

# Direct model access
agence @gpt-4o "Quick analysis"
agence @haiku "Fast question?"
```

## 🔧 Execution Environment (CODEX Law 2)

Agence automatically detects your shell environment and normalizes paths accordingly:

- **Git-bash** (MinGW/MSYS2) ✅ Supported
- **Cygwin** ✅ Supported
- **PowerShell** 🚧 Coming soon
- **WSL** (Windows Subsystem for Linux) ✅ Supported
- **Linux** ✅ Supported
- **macOS** ✅ Supported

Before any command executes, Agence validates:
1. **Shell Detection**: Identifies environment and sets path style automatically
2. **Execution Context**: Verifies `pwd` is in `GIT_REPO/` or `AI_REPO/`
3. **CODEX Check**: Validates against governance rules

If context validation fails:
```bash
$ cd /tmp && agence "test"
[ERROR] Execution context mismatch (CODEX LAW 2 violation)!
  pwd: /tmp
  AGENCE_REPO: /cygdrive/c/Users/steff/git/.agence
  
Recovery: cd to your project root or ~/.agence
```

See [codex/SHELL_DETECTION.md](SHELL_DETECTION.md) and [codex/LAWS.md](../codex/LAWS.md) for details.

---

## 🧠 COGNOS: Cognitive Framework

Agence is built on **COGNOS** - a 6-layer knowledge and governance system (+1 secret layer) 
that ensures every decision flows through rules, references multiple knowledge bases, and maintains state across distributed agents.
- (C) = Codex         : The Governance Engine - principles, laws & rules.
- (O) = ObjectCode    : Code-enabled KnowledgeBase - git integration. 
- (G) - GlobalCache   : Semantic RAG KnowledgeBase - vector-like . 
- (N) - Nexus         : Local State database - never shared.
- (O) - Orchestrator  : matrix-based project management and worklows. 
- (S) - Synthetic     : our Derived World Model - Human + AI Sentience.
+
- (H) - Hermetic      : Our Secret World Model. - Selectively Shared.
```
┌──────────────────────────────────────────────────────────────┐
│  CODEX (Rules & Laws) - Gates Everything                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────┐ │
│ │OBJECTCODE│ │ GLOBALCACHE  │ │ SYNTHETIC   │ │ HERMETIC   │ │
│ │(Git,etc) │ │(External RAG)│ │(shared DWM) │ │(secret DWM)│ │
│ └──────────┘ └──────────────┘ └─────────────┘ └────────────┘ │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ORCHESTRATOR (Workflow Engine) - Matrix Tasks & Projects     │
├──────────────────────────────────────────────────────────────┤
│ NEXUS (State Database) - Session & Agent State               │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: CODEX (Governance - Do's & Don'Ts)
**The First Law**: *Everything goes through CODEX first for interpretation - no exception.*

```
codex/
├── PRINCIPLES.md ← LLM value system & guidance (Philosophy of approach)
├── RULES.md      ← Prescriptive guidance (DO's - things we want)
├── LAWS.md       ← Immutable prohibitions (DON'Ts - things we MUST avoid)
└── codex.check() ← Pre-flight validation before any command/prompt
```

Every user command (CLI or prompt) is validated against LAWS before execution. This is non-negotiable.

### Layer 2-4: Knowledge Bases (C-O-G-S)
#### **C = CODEX** | Governance
- Rules of conduct (RULES.md)
- Immutable prohibitions (LAWS.md)
- Pre-flight checks before execution

#### **O = OBJECTCODE** | Code Knowledge
- Git repository metadata (no checkouts)
- Module structure & patterns
- Git SHA tracking (source of truth)
- Organized by TLD → Repository

#### **G = GLOBALCACHE** | External Semantic Knowledge
- Articles, documentation, external sources
- Vectored-light search (Dewey-decimal formtags)
- Checksums for cache expiry
- Organized by organizational boundaries (cross-TLD)

#### **S = SYNTHETIC** | Derived Knowledge
- **Everything we (LLMs + user) discover and create**
- Keeps original content pristine
- Analysis, patterns, conclusions we derive
- TLD/org structure with INDEX.md per org
- Indexed and cross-referenced

### Layer 5: NEXUS (State Coordination)
**NEXUS** is the persistent state database - critical for:
- **Session state**: User context across conversations
- **Agent state**: Current task, progress, results
- **Job handoffs**: When Chad → Claudia for deeper work
- **State queries**: "What's the status of that deployment?"

Enables **distributed agent coordination** without losing context.

### Layer 6: ORDINATOR (Workflow Engine)
**ORDINATOR** is the task/project engine - coming soon:
- Matrix-based project management (linear algebra)
- Task decomposition to agents
- Deliverables & timeline tracking
- Future: JIRA integration


### Layer 7: HERMETIC (Secret Knowledge Base)
#### **H = HERMETIC** | Secret Derived Knowledge - The "Secret-Base"
- ** private knowledge we (LLMs + user) discover and create**
- Same as SYNTHETIC knowledge but not shared in git.
- Selectively share/promote knowledge to SYNTHETIC. -You choose.
- Keeps original content pristine
- Analysis, patterns, conclusions we derive
- TLD/org structure with INDEX.md per org
- Indexed and cross-referenced


---

## 🎯 Model Routing

Agence supports 3 routing levels:

### 1. **Agent Personas** (Lowest Token Overhead)

Pre-tuned system prompts + model + personality. Each agent is optimized for cost and capability.

```bash
agence @aider "Refactor this function"        # ~5 tokens, offline
agence @chad "Review my deployment"           # ~10 tokens, DevOps
agence @aiko "Design my ML pipeline"          # ~10 tokens, Cloud
agence @ralph "Explain consistency patterns"  # ~20 tokens, Learning
agence @claudia "Architecture review"         # ~30 tokens, Deep thinking
```

### 2. **Model Aliases** (No Agent Persona)

Direct LLM access without system prompt injection:

```bash
agence @gpt-4o "Full analysis"
agence @claude "Detailed explanation"
agence @opus4.5 "Complex problem"
agence @haiku "Quick question?"
```

### 3. **Default/Fallback**

Uses symlink or auto-select:

```bash
agence "What should I do?"  # Via @symlink or fallback
```

---

## 🤖 Agents & Personalities

Each agent has a **system prompt** (minimal tokens), a **flavor intensity** (0-10 personality dial), and a **cost envelope** aligned with LLM pricing.

### Agent Fleet - from lowest cost to highest ...

| Agent | Model | Tokens | Flavor | Cost/Query | Best For |
|-------|-------|--------|--------|-----------|----------|
| **@**| autoselect | varies | N/A | varies | Default. let Copilot auto-select moddel. NO Persona.  |
| **@Olena**| ollama | Free! | 5/10 | ~$0.00 | Local On-Premises ollama cluster - secure LLM |
| **@Chad** | gpt-4o | ~10 | 5/10 | ~$0.001 | Cheap but safe & reliable CloudOps, infrastructure |
| **@Aiko** | haiku | ~10 | 6/10 | ~$0.003 | Sr. CI/CD DevOps/CloudOps, prototyping and disruptive innovation|
| **@Sonya** | sonnet | ~20 | 4/10 | ~$0.008 | Full Stack Dev lead and SRE. Deep Learning, reliability, detailed code |
| **@Claudia** | opus-4.5 | ~30 | 2/10 | ~$0.013 | Principal SRE and Architect, mentoring, Visionary Evolution |
| **@Aider** | aider CLI | ~5 | 0/10 | Negligible | aider Agentic Coding loop (offline) - autonomous coding |
| **@Ralph** | sonnet | ~20 | 4/10 | ~$0.008 | Safe Ralph Wiggum Agentic iteration loop,  Learning, reliability |
| **@Pilot** | copilot | ~20 | 4/10 | ~$0.008 | GitHub copilot  Agentic session ,  Learning, reliability |
| **@Peers** | 3-LLMs | ~20 | 4/10 | ~$$$ | MIT- style  3x LLM Peers Consensus. Most expensive but most powerful.  |
| **@GPT.4.1|@opus|@o1|@<model>** | you chooose | varies| N/A |  varies | Route to LLM [model.<ver>]. NO Persona  |
    * Depending on   your budget, @Peers is best used for limited: { Strategic-Planning, Impossible-Problem-Solving, RCA analysis etc}. 

### Flavor Intensity (0-10)

Control personality **without token bloat**:

```bash
agence @chad --flavor=2 "Prod deployment (professional)"
^ @aiko --flavor=8 "Teach me (fun learning)"
agence @claudia --flavor=2 "Design patterns (mentor)"
```

Each agent has a **default flavor** tuned for its role.

---

## 💬 System Prompts & Personality

### How It Works

1. **Agent Definition** (`codex/agents/<name>/agent.md`)
   - Identity: Who is this agent?
   - Model: Which LLM + provider?
   - System prompt: Minimal (2-3 sentences, ~5-30 tokens)
   - Flavor intensity: 0-10 personality dial
   - Temperature: Tied to flavor for coherent personality

2. **Flavor Injection** (Orthogonal to Model)
   - Flavor is **not** part of token count
   - Temperature adjusts with flavor (0/10 → 0.1, 10/10 → 0.9)
   - Personality scaled without inflation

3. **Example: Ralph Agent**

```json
{
  "model": "claude-3-5-sonnet",
  "provider": "anthropic",
  "flavor_intensity": 4,
  "temperature": 0.7,
  "system_prompt": "Ralph: Cheerful Claude, learns from mistakes, explains simply.\nPrincipal Skinner: Ensures reliability, catches errors, adds structure.\nExpertise: learning, explanations, patterns, teaching reliability."
}
```

### Cost Alignment

**Model selection = cost control**. Each agent's token overhead is aligned with LLM pricing:
- **Cheap models** (GPT-4o, Haiku) = thin personas (~10 tokens)
- **Expensive models** (Opus 4.5) = richer personas (~30 tokens)
- **Free/offline** (Aider) = minimal (~5 tokens)

This ensures **cost transparency** and **thoughtful agent choice**.

---

## 📁 Directory Structure

```
.agence/
├── bin/
│   ├── agence           ← Entry point (mode dispatch)
│   ├── indexer          ← Universal semantic indexer
│   └── commands.json    ← Command mappings
│
├── codex/
│   ├── agents/
│   │   ├── @             ← Symlink to default agent
│   │   ├── aider/agent.md
│   │   ├── chad/agent.md
│   │   ├── aiko/agent.md
│   │   ├── ralph/agent.md
│   │   ├── claudia/agent.md
│   │   ├── AGENTS.md     ← Quick reference
│   │   └── ROUTING.md    ← Routing spec
│   └── CODEX/
│       ├── RULES.md      ← Do's (prescriptive)
│       └── LAWS.md       ← DON'Ts (prohibitions)
│
├── lib/
│   ├── router.sh        ← Agent/model resolution
│   └── llm_provider.py  ← LLM client (TBD)
│
├── globalcache/         ← External RAG knowledge
│   └── l-agence.org/
│       └── INDEX.md     ← Semantic index (formtags + checksums)
│
├── objectcode/          ← Code metadata (git-tracked)
│   └── [TLD]/[repo]/    ← Module patterns & summaries
│
├── synthetic/           ← Derived knowledge (our analysis)
│   └── [TLD]/[org]/
│       └── INDEX.md     ← Analysis index
│
├── nexus/               ← Session & agent state (TBD)
│   └── sessions/        ← Persistent state
│
└── ordinator/           ← Task/project matrices (TBD)
    └── projects/        ← Project definitions
```

---

## 🚀 Command Modes

Agence supports 4 command modes (configurable via prefix):

```bash
# Chat mode (default)
agence "Ask a question"
agence @agent "Routed query"

# AI-routed mode (agent plans the action)
agence +"Deploy to production"  # Claude decides what to do

# External mode (validated command execution)
agence /git checkout main
agence /terraform plan

# System mode (built-in utilities)
agence !status "Show all agent states"
agence !ls "List agents"
```

---

## 🔒 Governance: LAWS First

**Before anything executes:**

1. Parse user input (chat, command, or prompt)
2. Run through CODEX validation
3. Check against LAWS (immutable prohibitions)
4. **Lift exception if violating LAW**
5. Otherwise, proceed to routing

**First Law**: Everything through CODEX first - no exception.

---

## 📊 Next Steps (Roadmap)

- [ ] **CODEX**: Implement LAWS pre-flight check in `bin/agence`
- [ ] **NEXUS**: Build state database (JSON/SQLite backend)
- [ ] **SYNTHESIS**: Index derived knowledge per org
- [ ] **ORDINATOR**: Matrix-based task engine (linear algebra)
- [ ] **LLM Client**: Connect agents to actual API calls
- [ ] **Tests**: Add integration tests for agent routing
- [ ] **JIRA**: Future integration for ORDINATOR

---

## 🎮 Quick Facts (Aiko-style)

- **Total Agents**: 5 core (Aider, Chad, Aiko, Ralph, Claudia) + TBD slots
- **Token Efficiency**: 5x improvement over standard persona systems (5-30 vs 100-300+ tokens)
- **Cost/Query**: $0.003 - $0.013 depending on agent + model
- **Governance**: Zero-trust (everything through CODEX)
- **State**: Persistent across sessions via NEXUS
- **Knowledge**: 4 separate knowledge bases (O-G-S-C) + coordination (N-N)

GG! Ready to collaborate. 🚀

---

**Version**: 0.2.0 (alpha)  
**Last Updated**: 2026-03-04  
**Framework**: COGNOS (C-O-G-N-O-S)
