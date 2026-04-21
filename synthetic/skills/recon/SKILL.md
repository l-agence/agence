# Skill: ^recon

**Category**: Primitive / Crawler-Indexer  
**Artifact**: index → `objectcode/<target>/`  · analysis → `objectcode/<target>/ANALYSIS.md`  
**Agents**: @aleph (primary), @feynman (explain), @haiku (fast)

## Purpose
General-purpose crawler and indexer. `^recon` is the single primitive that crawls any
target — a local path, a GitHub repo/org/topic, or a URL — and produces two outputs:

1. **Index** → structured artefacts written to `objectcode/<target>/` (persistent,
   AST-chunked knowledge base consumed by `^glimpse`, `^grasp`, `^ken`, etc.)
2. **Analysis** → human-readable intelligence brief at `objectcode/<target>/ANALYSIS.md`

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
| GitHub topic | `github:topics/ai-agents` | `globalcache/github.com/topics/ai-agents/` |
| URL / web | `https://docs.example.com` | `globalcache/<domain>/` |

> **Note on storage paths**: Local and GitHub repo/org targets write to `objectcode/`
> (persistent, commitable knowledge base). GitHub topic and URL targets write to
> `globalcache/` (external content cache, not source code — same convention as
> the existing `globalcache/acme.tld/` knowledge bases).

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

## Index Output (`objectcode/<target>/`)

```
objectcode/<target>/
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

- `^glimpse <target>` → reads `objectcode/<target>/INDEX.md` if indexed; falls back
  to live crawl if not yet indexed
- `^grasp <file>` → reads `objectcode/<target>/<file>.chunk.md` if indexed; falls
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
