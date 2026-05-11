# Skill: ^document

**Category**: Knowledge (SKILL-007)  
**Artifact**: document → knowledge/docs/  
**Agents**: @feynman (primary), @sonya (technical), @copilot (coder)

## Purpose
Generate clear, accurate documentation from code or system knowledge. READMEs, ADRs, API refs, guides.

## Input
- Code, module, or system to document
- Optionally: target audience (developer, ops, end-user)
- Optionally: document type (README, ADR, API ref, guide)

## Output
Depends on document type:
- **README**: Purpose, quickstart, usage, configuration, contributing
- **ADR**: Context, decision, consequences, alternatives considered
- **API Ref**: Endpoints, parameters, responses, error codes, examples
- **Guide**: Step-by-step with prerequisites, commands, expected output

## Workflow
```
^document "Write a README for the auth module"
^document --agent @feynman "ADR for choosing PostgreSQL over MongoDB"
^document < src/api/ "API reference for all endpoints"
```

## Quality Criteria
- Accurate — matches actual code behavior (not aspirational)
- Audience-appropriate — right level of detail
- Examples are runnable (not pseudocode)
- Maintained — includes date and version context

---

# Skill: ^test

**Category**: Knowledge (SKILL-007)  
**Artifact**: result → organic/results/  
**Agents**: @ralph (primary), @copilot (coder), @haiku (fast)

## Purpose
Generate or analyze tests. Cover happy path, edge cases, error handling, and boundary conditions.

## Input
- Code to test (function, module, API)
- Optionally: existing test framework context
- Optionally: specific scenarios to cover

## Output
1. **Test Plan** — what's being tested and why
2. **Test Cases** — runnable tests with:
   - Description (what it verifies)
   - Setup / input
   - Expected output / assertion
   - Teardown if needed
3. **Coverage Notes** — what's covered, what's intentionally skipped

## Workflow
```
^test < src/auth/validate.ts
^test "Write integration tests for the payment flow"
^test --agent @ralph "Test the rate limiter edge cases"
```

## Test Categories
- **Happy path**: Normal usage, expected inputs
- **Edge cases**: Empty, null, boundary values, max/min
- **Error paths**: Invalid input, network failures, timeouts
- **Concurrency**: Race conditions, parallel access
- **Security**: Injection, auth bypass, privilege escalation

## Quality Criteria
- Tests are runnable with the project's existing framework
- Each test has a clear, descriptive name
- Tests are independent (no ordering dependencies)
- Assertions are specific (not just "no error thrown")
- Mock/stub boundaries are at I/O, not at implementation details

---

# Skill: ^recon

**Category**: Primitive / Crawler-Indexer  
**Artifact**: index → `knowledge/<target>/`  · analysis → `knowledge/<target>/ANALYSIS.md`  
**Agents**: @aleph (primary), @feynman (explain), @haiku (fast)

## Purpose
General-purpose crawler and indexer. `^recon` is the single primitive that crawls any
target — a local path, a GitHub repo/org/topic, or a URL — and produces two outputs:

1. **Index** → structured artefacts written to `knowledge/<target>/` (persistent,
   AST-chunked knowledge base consumed by `^glimpse`, `^grasp`, `^ken`, etc.)
2. **Analysis** → human-readable intelligence brief at `knowledge/<target>/ANALYSIS.md`

The analysis is the byproduct of the index. Crawl once, read many times.

`^recon` replaces any separate `^harvest` command. They are the same operation.

---

## Target Types

| Target | Example | Output path |
|---|---|---|
| Current repo | `.` | `objectcode/local/` |
| Local path | `/path/to/repo` | `objectcode/<dirname>/` |
| GitHub repo | `github:org/repo` | `objectcode/<org>/<repo>/` |
| GitHub org | `github:org` | `objectcode/<org>/` |
| GitHub topic | `github:topics/ai-agents` | `knowledge/cache/github.com/topics/ai-agents/` |
| URL / web | `https://docs.example.com` | `knowledge/cache/<domain>/` |

> **Note on storage paths**: Local and GitHub repo/org targets write to `objectcode/`
> (persistent, commitable knowledge base). GitHub topic and URL targets write to
> `knowledge/cache/` (external content cache, not source code — same convention as
> the existing `knowledge/cache/acme.tld/` knowledge bases).

---

## Modes

```bash
^recon <target>               # full: crawl + index + analysis brief (default)
^recon <target> --index       # crawl + index only, no analysis (fast, cheap)
^recon <target> --analyse     # analysis only, uses existing index if present
^recon <target> --update      # incremental: re-index changed files only (git diff)
^recon list                   # show all indexed targets + staleness
^recon status <target>        # show index health, file counts, last updated
```

---

## Index Output (`knowledge/<target>/`)

```
knowledge/<target>/
  INDEX.md          ← entry point: repo overview, tech stack, key facts
  INDEX.json        ← machine-readable: file list, git SHA, lastIndexed timestamp
  <file>.chunk.md   ← one chunk file per source file: symbols + signatures
  ANALYSIS.md       ← human-readable recon brief (present when --analyse run)
```

For non-code targets (URLs, GitHub topics), chunk files contain page/section
summaries rather than AST-extracted symbols.

---

## Relationship to `^glimpse` and `^grasp`

`^recon` **writes**. `^glimpse` and `^grasp` **read**.

- `^glimpse <target>` → reads `knowledge/<target>/INDEX.md` if indexed; falls back
  to live crawl if not yet indexed
- `^grasp <file>` → reads `knowledge/<target>/<file>.chunk.md` if indexed; falls
  back to live analysis
- `^ken` orchestrator → runs `^recon --index` first, then `^glimpse`/`^grasp`
  consume the cached index (ETL pipeline)

This layering eliminates redundant crawls. Index once, query cheaply.

---

## Incremental Indexing (`--update`)

For git repos, `--update` reads the last-indexed SHA from `INDEX.json` and
re-chunks only files changed since that commit. Large codebases stay current
without full re-walks.

---

## Workflow Examples

```bash
^recon .                                         # index + analyse current repo
^recon . --index                                 # index only (fast)
^recon . --update                                # re-index changed files only
^recon github:garrytan/gstack                    # crawl a GitHub repo
^recon github:topics/ai-agents                   # scan a GitHub topic
^recon https://docs.anthropic.com                # crawl a URL
^recon list                                      # show all indexed targets
^recon status .                                  # health check on local index
^recon --agent @aleph "Security recon of the API surface"
```

---

## Quality Criteria
- Factual — based on actual files, not assumptions
- Concise — intelligence report, not a book
- Actionable — highlights what matters for the reader's goal
- Complete — covers all entry points, data flows, and tech stack
- Incremental — `--update` keeps the index current without full re-walks

---

# Skill: ^grasp

**Category**: Knowledge (SKILL-007)  
**Artifact**: analysis → knowledge/analyses/  
**Agents**: @feynman (primary), @sonya (technical), @haiku (fast)

## Purpose
Quick understanding of unfamiliar code. Rapidly explain purpose, key abstractions, data flow, and design decisions.

## Input
- Code file, function, or module to understand
- Optionally: specific question ("what does this do?", "why this pattern?")

## Output
1. **Purpose** — what this code does in one sentence
2. **Key Abstractions** — main types, interfaces, patterns used
3. **Data Flow** — input → processing → output
4. **Design Decisions** — why it's structured this way
5. **Gotchas** — non-obvious behavior, side effects, assumptions

## Workflow
```
^grasp < src/auth/middleware.ts
^grasp "What does the signal handler in lib/watch.ts do?"
^grasp --agent @haiku < src/utils/crypto.ts    # fast/cheap
```

## Quality Criteria
- Concise — fits in one screen (not a dissertation)
- Accurate — describes actual behavior, not intent
- Highlights non-obvious parts (the "aha" moments)
- Appropriate depth — more detail for complex code

---

# Skill: ^glimpse

**Category**: Knowledge (SKILL-007)  
**Artifact**: analysis → knowledge/analyses/  
**Agents**: @feynman (primary), @haiku (fast), @sonya (architect)

## Purpose
High-level overview. Bird's-eye view of what something is, why it exists, and how it fits into the larger system.

## Input
- Repo, module, service, or system to overview
- Optionally: context about why you need the overview

## Output
1. **What** — what this is in one paragraph
2. **Why** — why it exists, what problem it solves
3. **How** — how it fits into the larger system
4. **Key Things** — 3-5 bullet points a newcomer must know
5. **Status** — health, maturity, known issues

## Workflow
```
^glimpse .                                  # overview of current repo
^glimpse "What is the peers consensus engine?"
^glimpse --agent @haiku < lib/skill.ts      # quick overview
```

## Quality Criteria
- One screen maximum — this is a glimpse, not a deep dive
- Newcomer-friendly — no assumed context
- Accurate — reflects current state, not historical intent
- Links to deeper resources if they exist
