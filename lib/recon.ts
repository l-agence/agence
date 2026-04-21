#!/usr/bin/env bun
// lib/recon.ts — ^recon: General-purpose crawler / indexer primitive (Bun)
//
// ^recon is the single primitive that crawls any target and produces:
//   1. Index  → objectcode/<target>/  (persistent, chunk-per-file knowledge base)
//   2. Analysis → objectcode/<target>/ANALYSIS.md  (human-readable brief)
//
// Target types:
//   .                   → objectcode/local/
//   /path/to/dir        → objectcode/<dirname>/
//   github:org/repo     → objectcode/<org>/<repo>/
//   github:org          → objectcode/<org>/
//   github:topics/tag   → globalcache/github.com/topics/<tag>/
//   https://...         → globalcache/<domain>/
//
// Modes:
//   (default)   full — crawl + index + analysis
//   --index     index only (no analysis)
//   --analyse   analysis only (reads existing index if present)
//   --update    incremental — only re-chunk files changed since last index
//
// Subcommands:
//   list                show all indexed targets + staleness
//   status <target>     index health, file counts, last updated
//
// Usage:
//   airun recon . [--index|--analyse|--update]
//   airun recon github:org/repo
//   airun recon list
//   airun recon status .
//
// Exit codes: 0 = success, 1 = error

import {
  existsSync, mkdirSync, readdirSync, readFileSync,
  statSync, writeFileSync,
} from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";
import { execSync } from "child_process";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Constants ───────────────────────────────────────────────────────────────

/** GitHub domain used for globalcache path construction. */
const GITHUB_DOMAIN = "github.com";

/** Maximum source file size to index (bytes). Files larger than this are skipped
 *  to avoid memory pressure on very large generated files (e.g. minified bundles). */
const MAX_FILE_BYTES = 500_000;



type TargetKind = "local" | "github-repo" | "github-org" | "github-topic" | "url";
type ReconMode = "full" | "index" | "analyse" | "update";

interface Target {
  kind: TargetKind;
  raw: string;
  label: string;       // human-readable
  outputDir: string;   // absolute path to objectcode/… or globalcache/…
}

interface ChunkMeta {
  file: string;        // relative path within target
  chunkFile: string;   // filename of .chunk.md
  symbols: string[];   // extracted symbols/headings
  lines: number;
  lang: string;
}

interface IndexJson {
  target: string;
  kind: TargetKind;
  lastIndexed: string;
  gitSHA?: string;
  fileCount: number;
  files: ChunkMeta[];
}

// ─── Target Resolution ───────────────────────────────────────────────────────

function resolveTarget(raw: string): Target {
  // GitHub topic
  if (raw.startsWith("github:topics/")) {
    const tag = raw.slice("github:topics/".length);
    return {
      kind: "github-topic",
      raw,
      label: `GitHub topic: ${tag}`,
      outputDir: join(AGENCE_ROOT, "globalcache", GITHUB_DOMAIN, "topics", tag),
    };
  }

  // GitHub org/repo
  if (raw.startsWith("github:")) {
    const path = raw.slice("github:".length);
    const parts = path.split("/");
    if (parts.length >= 2) {
      return {
        kind: "github-repo",
        raw,
        label: `GitHub repo: ${path}`,
        outputDir: join(AGENCE_ROOT, "objectcode", ...parts),
      };
    }
    return {
      kind: "github-org",
      raw,
      label: `GitHub organization: ${path}`,
      outputDir: join(AGENCE_ROOT, "objectcode", path),
    };
  }

  // Full GitHub URL
  if (raw.startsWith(`https://${GITHUB_DOMAIN}/`) || raw.startsWith(`http://${GITHUB_DOMAIN}/`)) {
    const url = new URL(raw);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      return {
        kind: "github-repo",
        raw,
        label: `GitHub repo: ${parts.join("/")}`,
        outputDir: join(AGENCE_ROOT, "objectcode", ...parts),
      };
    }
    if (parts.length === 1) {
      return {
        kind: "github-org",
        raw,
        label: `GitHub org: ${parts[0]}`,
        outputDir: join(AGENCE_ROOT, "objectcode", parts[0]),
      };
    }
  }

  // Generic URL
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    const url = new URL(raw);
    const domain = url.hostname;
    return {
      kind: "url",
      raw,
      label: `URL: ${domain}`,
      outputDir: join(AGENCE_ROOT, "globalcache", domain),
    };
  }

  // Local path (. or absolute/relative)
  const abs = raw === "." ? process.cwd() : resolve(raw);
  const name = abs === AGENCE_ROOT ? "local" : basename(abs);
  return {
    kind: "local",
    raw,
    label: `Local: ${abs}`,
    outputDir: join(AGENCE_ROOT, "objectcode", name),
  };
}

// ─── Language Detection ───────────────────────────────────────────────────────

function detectLang(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".py": "python",
    ".go": "go",
    ".sh": "shell", ".bash": "shell",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".md": "markdown",
    ".txt": "text",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml",
    ".css": "css", ".scss": "css",
    ".html": "html", ".htm": "html",
  };
  return map[ext] || "unknown";
}

// ─── Symbol Extraction (lightweight, no tree-sitter) ────────────────────────
// Regex-based extraction for common languages. Good enough for an index.

function extractSymbols(content: string, lang: string): string[] {
  const symbols: string[] = [];
  const lines = content.split("\n");

  if (lang === "typescript" || lang === "javascript") {
    for (const line of lines) {
      // Top-level declarations
      const m = line.match(
        /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (m) { symbols.push(m[1]); continue; }
      // Class method definitions (  methodName( or  async methodName()
      const mm = line.match(/^\s+(?:async\s+)?(?:static\s+)?(?:private\s+)?(?:public\s+)?(?:protected\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
      if (mm && mm[1] !== "if" && mm[1] !== "for" && mm[1] !== "while" && mm[1] !== "switch") {
        symbols.push(mm[1]);
      }
    }
  } else if (lang === "python") {
    for (const line of lines) {
      const m = line.match(/^(?:def|class|async def)\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) symbols.push(m[1]);
    }
  } else if (lang === "go") {
    for (const line of lines) {
      const m = line.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) symbols.push(m[1]);
    }
  } else if (lang === "rust") {
    for (const line of lines) {
      const m = line.match(/^(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl)\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) symbols.push(m[1]);
    }
  } else if (lang === "shell") {
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\)/);
      if (m) symbols.push(m[1]);
    }
  } else if (lang === "markdown") {
    for (const line of lines) {
      const m = line.match(/^#{1,3}\s+(.+)/);
      if (m) symbols.push(m[1].trim());
    }
  }

  return [...new Set(symbols)];
}

// ─── Chunk Writer ─────────────────────────────────────────────────────────────

function safeChunkName(relPath: string): string {
  return relPath.replace(/[/\\]/g, "__").replace(/[^A-Za-z0-9._-]/g, "_") + ".chunk.md";
}

function writeChunk(outputDir: string, relPath: string, content: string, lang: string): ChunkMeta {
  const symbols = extractSymbols(content, lang);
  const lines = content.split("\n").length;
  const chunkFile = safeChunkName(relPath);

  const symbolSection = symbols.length > 0
    ? `\n## Symbols\n\n${symbols.map(s => `- \`${s}\``).join("\n")}\n`
    : "";

  const preview = content.slice(0, 800).trimEnd();
  const previewSection = preview
    ? `\n## Preview\n\n\`\`\`${lang}\n${preview}${content.length > 800 ? "\n… (truncated)" : ""}\n\`\`\`\n`
    : "";

  const chunk = `# ${relPath}

**Language**: ${lang}  
**Lines**: ${lines}  
**Symbols**: ${symbols.length}
${symbolSection}${previewSection}`;

  writeFileSync(join(outputDir, chunkFile), chunk, "utf-8");

  return { file: relPath, chunkFile, symbols, lines, lang };
}

// ─── File Collector ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "__pycache__",
  ".cache", "vendor", ".venv", "venv", "coverage",
]);

const SKIP_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
  ".ttf", ".eot", ".otf", ".mp4", ".mp3", ".pdf", ".zip", ".tar", ".gz",
  ".lock", ".sum",
]);

function collectFiles(dir: string, base: string = dir): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".env.example") continue;
    if (SKIP_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }

    if (st.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else if (st.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (SKIP_EXTS.has(ext)) continue;
      if (st.size > MAX_FILE_BYTES) continue; // skip very large files
      results.push(relative(base, full));
    }
  }

  return results;
}

// ─── Git Helpers ─────────────────────────────────────────────────────────────

function getGitSHA(dir: string): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd: dir, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  } catch {
    return undefined;
  }
}

function getChangedFilesSince(dir: string, sha: string): string[] {
  try {
    const out = execSync(`git diff --name-only ${sha} HEAD`, {
      cwd: dir, stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
    return out ? out.split("\n") : [];
  } catch {
    return [];
  }
}

// ─── Index JSON helpers ───────────────────────────────────────────────────────

function loadIndexJson(outputDir: string): IndexJson | null {
  const p = join(outputDir, "INDEX.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

function saveIndexJson(outputDir: string, data: IndexJson): void {
  writeFileSync(join(outputDir, "INDEX.json"), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ─── INDEX.md builder ────────────────────────────────────────────────────────

function buildIndexMd(target: Target, files: ChunkMeta[], gitSHA?: string): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // Language breakdown
  const langCount: Record<string, number> = {};
  for (const f of files) {
    langCount[f.lang] = (langCount[f.lang] || 0) + 1;
  }
  const techStack = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .filter(([lang]) => lang !== "unknown")
    .map(([lang, n]) => `- **${lang}**: ${n} file${n > 1 ? "s" : ""}`)
    .join("\n");

  const topSymbols = files
    .flatMap(f => f.symbols.slice(0, 5))
    .slice(0, 20)
    .map(s => `\`${s}\``)
    .join(", ");

  return `# ${target.label}

**Indexed**: ${now}  
**Files**: ${files.length}  
${gitSHA ? `**Git SHA**: \`${gitSHA.slice(0, 8)}\`  \n` : ""}**Output**: \`${target.outputDir}\`

## Tech Stack

${techStack || "(none detected)"}

## Key Symbols

${topSymbols || "(none extracted)"}

## Files

${files.map(f => `- [\`${f.file}\`](./${f.chunkFile}) — ${f.lang}, ${f.lines} lines, ${f.symbols.length} symbols`).join("\n") || "(no files indexed)"}

---
*Generated by \`^recon\`. Re-run with \`^recon --update\` to refresh changed files.*
`;
}

// ─── Core: index a local directory ───────────────────────────────────────────

function indexLocal(target: Target, mode: ReconMode): IndexJson {
  const sourceDir = target.raw === "." ? process.cwd() : resolve(target.raw);

  mkdirSync(target.outputDir, { recursive: true });

  const existing = loadIndexJson(target.outputDir);
  const gitSHA = getGitSHA(sourceDir);

  let filesToIndex: string[];
  let allMeta: ChunkMeta[] = existing?.files || [];

  if (mode === "update" && existing && existing.gitSHA && gitSHA) {
    const changed = getChangedFilesSince(sourceDir, existing.gitSHA);
    filesToIndex = changed.filter(f => {
      const ext = extname(f).toLowerCase();
      return !SKIP_EXTS.has(ext);
    });
    console.error(`[recon] update mode: ${filesToIndex.length} changed files since ${existing.gitSHA.slice(0, 8)}`);
    // Remove stale chunk entries for changed files
    allMeta = allMeta.filter(m => !filesToIndex.includes(m.file));
  } else {
    filesToIndex = collectFiles(sourceDir);
    allMeta = [];
    console.error(`[recon] full index: ${filesToIndex.length} files in ${sourceDir}`);
  }

  for (const relPath of filesToIndex) {
    const full = join(sourceDir, relPath);
    let content: string;
    try { content = readFileSync(full, "utf-8"); } catch { continue; }
    const lang = detectLang(relPath);
    const meta = writeChunk(target.outputDir, relPath, content, lang);
    allMeta.push(meta);
  }

  const indexData: IndexJson = {
    target: target.raw,
    kind: target.kind,
    lastIndexed: new Date().toISOString(),
    gitSHA,
    fileCount: allMeta.length,
    files: allMeta,
  };

  saveIndexJson(target.outputDir, indexData);
  writeFileSync(join(target.outputDir, "INDEX.md"), buildIndexMd(target, allMeta, gitSHA), "utf-8");

  console.error(`[recon] ✓ index written → ${target.outputDir}`);
  return indexData;
}

// ─── Core: write ANALYSIS.md ─────────────────────────────────────────────────

function writeAnalysis(target: Target, index: IndexJson): void {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // Summarise by language
  const langCount: Record<string, number> = {};
  for (const f of index.files) {
    langCount[f.lang] = (langCount[f.lang] || 0) + 1;
  }
  const techLines = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .filter(([lang]) => lang !== "unknown")
    .map(([lang, n]) => `- ${lang}: ${n} file${n > 1 ? "s" : ""}`)
    .join("\n");

  // Top entry points heuristic (files named main/index/app/cli/bin at root level)
  const entryPatterns = /^(main|index|app|cli|bin|server|start)\.[a-z]+$/i;
  const entryPoints = index.files
    .filter(f => !f.file.includes("/") && entryPatterns.test(basename(f.file)))
    .map(f => `- \`${f.file}\` (${f.lang})`)
    .join("\n");

  // Config files heuristic
  const configPatterns = /(config|settings|[._]env|[._]agence|docker|compose|package\.json|tsconfig|pyproject|Cargo\.toml)/i;
  const configFiles = index.files
    .filter(f => configPatterns.test(f.file))
    .slice(0, 10)
    .map(f => `- \`${f.file}\``)
    .join("\n");

  const analysis = `# Recon Analysis: ${target.label}

**Generated**: ${now}  
**Target**: \`${target.raw}\`  
**Files indexed**: ${index.fileCount}  
${index.gitSHA ? `**Git SHA**: \`${index.gitSHA.slice(0, 8)}\`\n` : ""}
---

## Structure

Total files indexed: **${index.fileCount}**

\`\`\`
${target.outputDir}
\`\`\`

## Tech Stack

${techLines || "(none detected)"}

## Entry Points

${entryPoints || "(none detected — check INDEX.md for full file list)"}

## Configuration

${configFiles || "(none detected)"}

## Notable Symbols

${index.files
    .flatMap(f => f.symbols.map(s => ({ s, file: f.file })))
    .slice(0, 30)
    .map(({ s, file }) => `- \`${s}\` ← \`${file}\``)
    .join("\n") || "(none extracted)"}

---

## Recommendations

- Run \`^recon --update\` after commits to keep the index current.
- Use \`^glimpse\` for a high-level overview of any indexed file.
- Use \`^grasp <file>\` for deep understanding of a specific module.
- Use \`^recon status\` to check index freshness before a code task.
`;

  writeFileSync(join(target.outputDir, "ANALYSIS.md"), analysis, "utf-8");
  console.error(`[recon] ✓ analysis written → ${join(target.outputDir, "ANALYSIS.md")}`);
}

// ─── Subcommand: list ────────────────────────────────────────────────────────

function cmdList(): number {
  const roots = [
    join(AGENCE_ROOT, "objectcode"),
    join(AGENCE_ROOT, "globalcache"),
  ];

  let found = 0;
  for (const root of roots) {
    if (!existsSync(root)) continue;

    const walk = (dir: string, depth = 0): void => {
      if (depth > 3) return;
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return; }

      const indexFile = join(dir, "INDEX.json");
      if (existsSync(indexFile)) {
        const data = loadIndexJson(dir);
        if (data) {
          found++;
          const rel = relative(AGENCE_ROOT, dir);
          const age = data.lastIndexed
            ? Math.round((Date.now() - new Date(data.lastIndexed).getTime()) / 3_600_000)
            : -1;
          const staleness = age < 0 ? "(unknown age)" : age < 24 ? `${age}h ago` : `${Math.round(age / 24)}d ago`;
          const sha = data.gitSHA ? ` @${data.gitSHA.slice(0, 8)}` : "";
          console.log(`  ${rel.padEnd(50)} ${data.fileCount} files  ${staleness}${sha}`);
        }
        return; // don't descend into an indexed dir
      }

      for (const e of entries) {
        const full = join(dir, e);
        try {
          if (statSync(full).isDirectory()) walk(full, depth + 1);
        } catch { /* skip */ }
      }
    };

    walk(root);
  }

  if (found === 0) {
    console.log("  (no indexed targets — run `^recon <target>` to create an index)");
  }
  return 0;
}

// ─── Subcommand: status ───────────────────────────────────────────────────────

function cmdStatus(targetRaw: string): number {
  const target = resolveTarget(targetRaw);
  const data = loadIndexJson(target.outputDir);

  if (!data) {
    console.log(`[recon status] ${target.label}`);
    console.log(`  ✗ Not indexed — run \`^recon ${targetRaw}\``);
    return 1;
  }

  const age = Math.round((Date.now() - new Date(data.lastIndexed).getTime()) / 3_600_000);
  const stale = age > 48 ? " ⚠ stale" : "";

  console.log(`[recon status] ${target.label}`);
  console.log(`  Path:       ${target.outputDir}`);
  console.log(`  Files:      ${data.fileCount}`);
  console.log(`  Indexed:    ${data.lastIndexed}  (${age}h ago)${stale}`);
  if (data.gitSHA) console.log(`  Git SHA:    ${data.gitSHA.slice(0, 8)}`);
  console.log(`  Analysis:   ${existsSync(join(target.outputDir, "ANALYSIS.md")) ? "✓ present" : "✗ missing"}`);
  return 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function usage(): void {
  console.error(`Usage: airun recon <target> [--index|--analyse|--update]
       airun recon list
       airun recon status <target>

Target types:
  .                     Current directory
  /path/to/dir          Local path
  github:org/repo       GitHub repository
  github:org            GitHub organisation
  github:topics/<tag>   GitHub topic
  https://...           URL / web target

Modes (default: full = index + analysis):
  --index               Crawl + index only (no analysis)
  --analyse             Analysis only (reads existing index)
  --update              Incremental: re-index changed files only`);
}

const argv = process.argv.slice(2);

if (argv.length === 0) {
  usage();
  process.exit(1);
}

const sub = argv[0];

// list
if (sub === "list") {
  process.exit(cmdList());
}

// status <target>
if (sub === "status") {
  if (!argv[1]) {
    console.error("Usage: airun recon status <target>");
    process.exit(1);
  }
  process.exit(cmdStatus(argv[1]));
}

// recon <target> [--index|--analyse|--update]
const targetRaw = sub;
const modeFlag = argv.find(a => ["--index", "--analyse", "--update"].includes(a));
const mode: ReconMode = modeFlag === "--index"
  ? "index"
  : modeFlag === "--analyse"
    ? "analyse"
    : modeFlag === "--update"
      ? "update"
      : "full";

const target = resolveTarget(targetRaw);
console.error(`[recon] target: ${target.label}  mode: ${mode}`);

let exitCode = 0;

if (mode === "analyse") {
  // Analyse only — use existing index if available, otherwise error
  const existing = loadIndexJson(target.outputDir);
  if (!existing) {
    console.error(`[recon] error: no index found for ${targetRaw}. Run \`^recon ${targetRaw} --index\` first.`);
    exitCode = 1;
  } else {
    writeAnalysis(target, existing);
  }
} else if (target.kind === "local") {
  const index = indexLocal(target, mode);
  if (mode === "full") writeAnalysis(target, index);
} else {
  // Non-local targets (github, url) — create a stub index entry
  // Full crawling requires network calls; agents handle that via their tools.
  // We write a placeholder so status/list work correctly.
  mkdirSync(target.outputDir, { recursive: true });

  const stub: IndexJson = {
    target: targetRaw,
    kind: target.kind,
    lastIndexed: new Date().toISOString(),
    fileCount: 0,
    files: [],
  };

  if (!existsSync(join(target.outputDir, "INDEX.json"))) {
    saveIndexJson(target.outputDir, stub);
    writeFileSync(
      join(target.outputDir, "INDEX.md"),
      `# ${target.label}\n\n**Status**: Stub — crawl pending\n\n` +
      `This target requires agent-assisted crawling.\n` +
      `Run this \`^recon\` command from an agent with web/GitHub access.\n\n` +
      `**Target**: \`${targetRaw}\`  \n**Kind**: ${target.kind}\n`,
      "utf-8",
    );
    console.error(`[recon] ✓ stub index created → ${target.outputDir}`);
    console.error(`[recon] note: full crawl of ${target.kind} targets requires agent with network access`);
  } else {
    console.error(`[recon] index already exists → ${target.outputDir}`);
    console.error(`[recon] use --update to refresh`);
  }
}

process.exit(exitCode);
