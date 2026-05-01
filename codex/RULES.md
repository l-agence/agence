3. watch.ts ↔ agentd Wiring — ✅ RESOLVED (c7a4771+)
agentd tangent create now: (a) enables tmux pipe-pane to capture typescript log,
(b) launches watch.ts tail in background with --signal and @error/@prompt/@complete patterns,
(c) stores watch PID in nexus/watches/<id>.pid, (d) cleans up on tangent destroy.

4. ^integrate MANUAL_VERIFY Flow — ✅ RESOLVED
lib/verify.ts implements a persistent JSONL queue at nexus/manual-verify/queue.jsonl.
CLI: `airun verify {list,show,ack,reject,add,ingest,compact,status}`.
ingestFindings() filters ^integrate JSON output, queuing only MANUAL_VERIFY items.
Skill delegation: `^verify <cmd>` routes through lib/skill.ts. 33 tests.

5. .airuns/ Task-Session Linkage — Audit gap
SESSION-PERSISTENCE.md still marks .airuns/ as ⏳ placeholder. AIDO_TASK_ID env var isn't plumbed through from matrix claim → aibash → session metadata. Needed for "show me everything that ran during TASK-042."# CODEX: RULES

**Prescriptive guidance and best practices for using Agence.**

These are the things we *want* you (any LLM or user) to do. They maximize effectiveness, safety, and collaboration.

---

## Rule 1: Always Use Agents, Not Raw LLM

**Do**: Route queries through the appropriate agent persona.

**Why**: Agents come with:
- Optimized system prompts (minimal token overhead)
- Cost-appropriate models (haiku for quick, opus for deep thinking)
- Personality + reliability (Ralph's Skinner harness, Chad's experience)
- State tracking (NEXUS records outcomes)

**Examples**:

```bash
# ✅ GOOD: Use agent for the task
agence @aiko "How do I scale my database?"
# → Haiku model, ~$0.003/query, fast + enthusiastic

agence @claudia "Design the observability layer"
# → Opus 4.5 model, ~$0.013/query, deep architecture thinking

agence @ralph "Explain ACID consistency"
# → Sonnet model, ~$0.008/query, learns + explains clearly

# ❌ BAD: Generic query without agent
agence "What's the best database for this?"
# → Default model, no personality, no tracking
```

---

## Rule 2: Match Agent to Task (Cost Alignment)

**Do**: Choose agents based on task complexity and your budget.

**Quick flowchart**:
- **Quick answers** → @aiko (haiku, $0.003)
- **DevOps/infra questions** → @chad (gpt-4o, $0.006)
- **Learning/explanations** → @ralph (sonnet, $0.008)
- **Architecture/design** → @claudia (opus, $0.013)
- **Code refactoring** → @aider (local, free)

**Why**: Different models have different strengths:
- **Haiku**: Fast, cheap, good for straightforward questions
- **GPT-4o**: Balanced, cost-effective, DevOps expert
- **Sonnet**: Learning-focused, Skinner oversight
- **Opus 4.5**: Deep thinking, architecture, mentoring
- **Aider**: Always local, no API cost, code patches

**Example**:
```bash
# ❌ WASTEFUL: Using expensive model for simple query
agence @claudia "How do I push to git?"
# Cost: $0.013, but answer is simple
# Better: Use Haiku (~$0.003)

# ✅ EFFICIENT: Right model for the task
agence @aiko "How do I push to git?"
# Cost: $0.003, still gets good answer
# Saved: 4x cost

# ✅ SMART: Use expensive model when needed
agence @claudia "Design a 3-tier microservices architecture"
# Cost: $0.013, but answer is complex
# Necessary: Only Opus is deep enough
```

---

## Rule 3: Set Flavor Intensity for Context

**Do**: Adjust `--flavor` flag based on situation.

**Why**: Flavor controls personality *orthogonal* to token cost:
- High stakes (production) → Low flavor (professional, focused)
- Learning environment → High flavor (encouragement, energy)
- Testing/exploration → Medium flavor (balanced)

**Examples**:

```bash
# Production deployment: Strict, no jokes
agence @chad --flavor=1 "Review this deployment plan"
# Chad: Professional, careful, no sarcasm

# Learning session: Energetic, encouraging
agence @ralph --flavor=8 "Teach me databases"
# Ralph: Bubbly, encouraging, fun examples

# Normal work: Default flavor
agence @aiko "Optimize my query"
# Aiko: Default 6/10 (gamer refs, enthusiastic)
```

**Flavor Scale**:
| Flavor | Style | Best For |
|--------|-------|----------|
| 0-2 | Strict, professional | Production, high-stakes |
| 3-4 | Balanced, helpful | General work |
| 5-6 | Friendly, natural | Collaboration, normal tasks |
| 7-9 | Playful, energetic | Learning, exploration |
| 10 | Chaotic, experimental | Research, creativity (risky) |

---

## Rule 4: Give Context, Get Better Answers

**Do**: Provide background when asking questions.

**Why**: LLMs work better with context:
- What have you already tried?
- What's the constraint or goal?
- What domain are we in?

**Examples**:

```bash
# ❌ VAGUE: No context
agence @ralph "How do I make it faster?"
# → Ralph doesn't know what "it" is

# ✅ GOOD: Context included
agence @ralph "I have a Postgres query that does 3 full table scans. 
I need it faster for a real-time dashboard. What are my options?"
# → Ralph can give specific advice (indexing, denormal, caching, etc)

# ✅ EVEN BETTER: Include constraints
agence @claudia "Design a cache layer. Constraints:
- 100M documents
- Sub-100ms reads
- Budget: $500/month
- Consistency: eventual is OK
What's your recommendation?"
# → Claudia can weigh Redis vs Memcached vs DynamoDB with real numbers
```

---

## Rule 5: Use KNOWLEDGE for Code References

**Do**: When asking about code, include git SHA and file path.

**Why**: Ensures we're talking about the exact version:
- Code changes over time
- SHA makes reference immutable
- Prevents "but I changed that" confusion

**Format**: `<repo>#<SHA>:<path>`

**Examples**:

```bash
# ❌ VAGUE: No version info
agence @aider "Fix the error handling in handler.ts"
# → Which version? Is there a recent fix?

# ✅ GOOD: Include commit
agence @aider "Fix the error handling in handler.ts"
# Current version: my-api#abc123def456:src/handler.ts
# Error: Lines 45-50 throw but don't log

# ✅ BETTER: Full context
agence @aider "In my-api#abc123def456:src/handler.ts,
lines 45-50 throw errors but don't log them.
Generate a patch that adds structured logging."
```

---

## Rule 6: Trust KNOWLEDGE, Verify External Sources

**Do**: 
- Trust KNOWLEDGE (our derived analysis) until proven wrong
- Verify external sources in KNOWLEDGE until confirmed

**Why**:
- KNOWLEDGE contains our own thinking (we understand assumptions)
- External sources in KNOWLEDGE could be outdated/wrong

**Examples**:

```bash
# ✅ DO THIS: Trust our own analysis
agence "@ralph In knowledge/@/l-agence.org/agence-patterns.md,
I wrote that Ralph needs Principal Skinner for reliability.
Can you explain the pattern?"
# → Ralph explains our own writing (he understands context)

# ⚠️ CHECK THIS: Verify external sources
agence "@claudia I found this in KNOWLEDGE about microservices patterns.
But it's from 2019. Is it still current?
Source: knowledge/medium.com/microservices-2019/index.md"
# → Claudia can evaluate how much things changed
```

---

## Rule 7: Record Key Insights in KNOWLEDGE

**Do**: After learning something valuable, save it to KNOWLEDGE.

**Why**: 
- Builds our collective knowledge base
- Next person doesn't have to re-learn
- Creates audit trail of discoveries
- Feeds into future AI training (your own analysis feeds future models)

**Format**: Create/update KNOWLEDGE entries with:
- What we learned
- Why it matters
- Source (if external)
- How to use it

**Examples**:

```bash
# After solving a problem:
agence "@ralph I just figured out that our Postgres query was doing 
full table scans because the index was on the wrong column.
Let me save this pattern to SYNTHESIS."

# Aiko then saves to:
# knowledge/l-agence.org/database-patterns/index-optimization.md
```

---

## Rule 8: Check LAWS Before Big Decisions

**Do**: When uncertain about what's allowed, check LAWS.md first.

**Why**: 
- LAWS are the hard constraints
- Everything else is just guidance
- LAWS prevent silent failures

**Examples**:

```bash
# Uncertain:
"Can I call the Anthropic API directly if the Agence script is down?"
# → Check LAWS.md → Law 1: Everything through CODEX
# Answer: No. Use agence script instead.

# Uncertain:
"Can I run agence from /tmp if I'm not in a repo?"
# → Check LAWS.md → Law 2: Context isolation
# Answer: No. Must be in GIT_REPO or AGENCE_REPO.
```

---

## Rule 9: Keep Prompts Minimal, System Prompts Even Smaller

**Do**: 
- Keep user queries focused (2-3 sentences is ideal)
- Keep system prompts tiny (5-30 tokens)

**Why**:
- Focused queries get better answers
- Tiny system prompts = low token cost
- Longer prompts dilute the signal

**Examples**:

```bash
# ❌ TOO LONG: User query is a novel
agence "@ralph I'm trying to understand how databases work.
There are relational databases and NoSQL databases.
There's also something called NewSQL. I'm confused about
the differences and when to use each one. Also, what about
graph databases? And document databases? I think I should
learn this properly because..."
# → Ralph loses the core question

# ✅ FOCUSED:
agence "@ralph Explain the difference between relational,
NoSQL, and graph databases. When would I use each one?"
# → Clear, answerable, focused

# System prompt example:
# ❌ TOO LONG (60 tokens):
# "You are an expert database architect from Milan with 20 years
# of experience in distributed systems. You specialize in
# consistency models and eventual consistency. You believe in
# elegance and long-term thinking. You prefer teaching through
# examples. You like to mention edge cases when they matter.
# You think deeply about reliability and observability..."

# ✅ MINIMAL (20 tokens):
# "Claudia: SRE architect, Milan. Mantra: elegance in code & systems.
# Mentor. Explain principles. Subtle encouragement. Long-term focus.
# Expertise: architecture, reliability, observability, SRE practices."
```

---

## Rule 10: Iterate, Don't Abandon

**Do**: If an answer doesn't satisfy you, ask follow-up questions.

**Why**:
- First answer is often surface-level
- Iteration refines understanding
- Agents remember context across turns

**Examples**:

```bash
# First question:
agence @ralph "What's ACID consistency?"
# → Gets basic explanation

# Follow-up (iteration):
agence @ralph "You mentioned atomicity. Give me a concrete
example of when atomicity matters in a banking system."
# → Ralph refines and deepens based on your question

# Don't do this:
agence @ralph "What's ACID consistency?"
# (Unsatisfied with answer)
agence @claudia "What's ACID consistency?"  # ← Assumes first agent failed
# ← Better: agence @ralph "That's helpful. Can you elaborate on..."
```

---

## Rule 11: Always Provide Proof of Actions

**Do**: When claiming an action was taken, provide verifiable proof.

**Why**: Transparency and accountability prevent ghost work:
- Output excerpt shows actual result
- Git commit hash proves it was persisted
- File diffs show exact changes
- Without proof, claims are unverifiable

**Proof sources** (in priority order):
1. **Output/STDOUT**: Actual command output (truncated excerpt is fine)
2. **Git commit**: `git commit abc123def456` with diff
3. **File content**: Excerpt showing the change (before/after)
4. **File stat**: `ls -la` or `git ls-files --stage` showing file properties
5. **Returned value**: Function return code or JSON response

**Examples**:

```bash
# ❌ NO PROOF: Just claiming it worked
"I created the symlink. Done."

# ✅ PROOF INCLUDED: Output excerpt
"I created the symlink:
$ ln -s .github/CLAUDE.md CLAUDE.md
$ ls -la CLAUDE.md
lrwxrwxrwx 1 steff None 17 Mar 4 CLAUDE.md -> .github/CLAUDE.md
✓ Symlink verified"

# ❌ NO PROOF: Claiming file was updated
"I updated the RULES.md file with the new rule."

# ✅ PROOF INCLUDED: Diff excerpt
"I added Rule 11 to RULES.md:
+ ## Rule 11: Always Provide Proof of Actions
+ **Do**: When claiming an action was taken, provide verifiable proof.
+ [File now has 11 rules instead of 10]
+ Git status: nexus/rules.md (unstaged changes, +8 lines)"

# ❌ NO PROOF: Saying something was fixed
"Fixed the initialization command."

# ✅ PROOF INCLUDED: Commit + test
"Fixed the initialization command:
$ agence ^init
[INFO] Created symlink: /path/to/target
[OK] Agence initialization complete
$ git log --oneline -1
abc123d Fix: agence ^init now uses git symlinks"
```

**What counts as sufficient proof**:
- ✅ Command output (stdout/stderr showing result)
- ✅ File listing (`ls -la`, `git ls-files --stage`)
- ✅ Content excerpt (first 5 lines of file showing change)
- ✅ Git commit hash + short diff
- ✅ Function return value or exit code
- ✅ Verification command showing state after action

**What does NOT count**:
- ❌ "I tried..."
- ❌ "It should have..."
- ❌ "I think it worked..."
- ❌ "Trust me, it's done"

---

## Rule 12: Cache Your Context

**Do**: When working across multiple files, load context once and reference it.

**Why**: Reduces token waste and keeps narrative coherent:
- Load LAWS.md once, reference sections
- Load lesson tree once, link to entries
- Load code file once, cite line numbers

**Examples**:

```bash
# ❌ WASTEFUL: Refetching same file repeatedly
"Let me check LAWS.md..."
[reads LAWS.md]
"I see Law 1... let me check LAWS.md again..."
[reads LAWS.md again]

# ✅ EFFICIENT: Load once, reference
"From LAWS.md (loaded): Law 1 says... Law 2 says...
Both apply here because X and Y.
Therefore, recommend Z."
```

---

## Rule 13: Dangerous Operators Require Explicit Approval

**Do**: Always prompt when dangerous shell operators are detected.

**Why**: Shell metacharacters can cause data loss, unintended execution, or information leaks:
- `>` / `>>`: Silently overwrite or append to files
- `|`: Pipe can chain unexpected commands
- `&&` / `;`: Execute multiple commands in sequence
- `$()` / `` ` ``: Execute arbitrary subcommands
- `$VAR`: Variable expansion can leak secrets

**Blocked operators** (require explicit user confirmation):

```
>       Redirect STDOUT (overwrites file)
>>      Redirect STDOUT (appends to file)
|       Pipe to another command
&&      AND operator (execute next if success)
;       Command separator (always execute next)
$()     Command substitution
```

**Examples**:

```bash
# ❌ BLOCKED: Would redirect without warning
agence /something > output.txt
# → ERROR: Dangerous operator '>' detected
# → Prompt: "Confirm redirect to output.txt? [y/n]"

# ❌ BLOCKED: Pipes without approval
agence /get-data | grep secret
# → ERROR: Dangerous operator '|' detected
# → Prompt: "Confirm pipe to grep? [y/n]"

# ❌ BLOCKED: Command substitution
agence /run "$(cat file)"
# → ERROR: Dangerous operator '$()' detected

# ✅ SAFE: Direct command
agence /deploy app-v1.0
# → No operators, executes directly

# ✅ APPROVED: With confirmation
agence /something > output.txt
# [System prompts for confirmation]
# User: y
# [Proceeds with redirect]
```

**Handling**:

1. **Detect**: Scan input for dangerous operators
2. **Block**: Refuse execution if detected
3. **Prompt**: Ask user to confirm (with warning about risks)
4. **Log**: Record operator usage to audit trail

---

## Rule 14: Use AIDO for Safe Operations

**Do**: Pipe safe reads through `aido` instead of prompting.

**Why**: AIDO (Allow IDempotent Operations) is the opposite of `sudo` - it *reduces* prompting for obviously safe operations:

- **Git inspection**: `aido git status`, `aido git log`
- **AWS inspection**: `aido aws describe-instances`
- **PowerShell reads**: `Get-Service`, `Get-Process`

No prompts. Just safe execution.

**Philosophy**: 

`sudo` = privilege escalation  
`aido` = constraint reduction (only safe ops)

**Examples**:

```bash
# ✅ SAFE: Use aido, no prompts
aido git status
aido git log --oneline -10
aido aws describe-vpcs

# ❌ BLOCKED: Mutating commands
aido git push
# → ERROR: push not whitelisted

aido aws create-instance
# → ERROR: create-instance blocks mutation operations

# ✅ MUSCLE MEMORY: Can pipe aido safely in scripts
git_branches=$(aido git branch -a | wc -l)
aws_count=$(aido aws list-instances | jq '.Reservations | length')
```

**Whitelisted families**:

- **Git**: status, log, diff, branch, tag, reflog, describe, config --list, show, etc.
- **AWS**: describe-*, get-*, list-*, head-*, auth status, sts.get-session-token
- **PowerShell**: Get, Test, Measure, Select, Where, Sort, Group, Compare (verbs only)

**Benefits**:

- Muscle memory for safe operations
- Zero cognitive overhead for reads
- Scripts can call them directly
- Audit trail is implicit (whitelists are the policy)

---

## Rule 15: Additive Tracking Principle

All knowledge items—todos, issues, tasks, logs, lessons, faults—are quantized and tracked as individual, additive entries. Never squash, overwrite, or delete entries unless explicitly requested. History and state must always be preserved. You may append new entries or update existing ones if requested, but never remove or merge away prior records. This ensures full auditability, traceability, and knowledge integrity.

---

## Rule 16: Merge, Don't Replace

**Do**: When modifying files, prefer surgical edits over wholesale rewrites.

**Why**: Replacing content silently drops existing functionality. This violates Law 6 and causes data loss that may not be caught until runtime.

**Before editing**:
1. Read what exists in the target section
2. Identify what to add, change, or keep
3. Apply the smallest diff that achieves the goal
4. If in doubt, ask: "Should I replace or merge?"

**Interpretation guide**:
- "Add X" → append to existing list
- "Change X to Y" → targeted edit of X only
- "Rewrite" or "Replace" → full replacement (requires explicit confirmation)
- "Fix X" → modify X, preserve everything else

**Examples**:

```bash
# ❌ BAD: Replace entire file to add one package
# (drops macOS installer, terraform, azure-cli, etc.)
APT_CORE=("jq" "gawk" "npm")

# ✅ GOOD: Add to existing array
# Existing: APT_CORE=("jq" "gh" "tmux" "terraform" "azure-cli")
# Edit: add gawk, npm, curl to the array
APT_CORE=("jq" "gh" "tmux" "terraform" "azure-cli" "gawk" "npm" "curl")

# ✅ GOOD: Surgical replace_string_in_file on the specific line
# oldString: local -a apt_pkgs=("git" "jq" "tmux")
# newString: local -a apt_pkgs=("git" "jq" "gawk" "tmux" "npm" "curl")
```

---

## Summary: The 16 Rules of CODEX

| Rule | Practice | Benefit |
|------|----------|---------|
| **1** | Use agents, not raw LLM | Personality, tracking, safety |
| **2** | Match agent to task | Cost-efficient, better answers |
| **3** | Set flavor intensity | Personality without token bloat |
| **4** | Give context | Better, specific answers |
| **5** | Reference code by SHA | Immutable, version-safe |
| **6** | Trust SYNTHESIS, question GLOBALCACHE | Clear knowledge boundaries |
| **7** | Save insights to SYNTHESIS | Build collective knowledge |
| **8** | Check LAWS when unsure | Guarantee safety |
| **9** | Keep prompts minimal | Lower cost, better signal |
| **10** | Iterate, don't abandon | Deeper understanding |
| **11** | Always provide proof of actions | Transparency & accountability |
| **12** | Cache your context | Token-efficient operation |
| **13** | Block dangerous operators | Prevent accidental data loss/leaks |
| **14** | Use AIDO for safe operations | Zero-friction reads + inspections |
| **15** | Additive tracking principle | Full auditability & knowledge integrity |
| **16** | Merge, don't replace | Prevent silent content loss |

---

**Version**: 0.2.0  
**Status**: In Effect  
**Last Updated**: 2026-04-15
