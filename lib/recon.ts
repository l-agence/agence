#!/usr/bin/env bun
// lib/recon.ts — ^recon: General-purpose crawler / indexer primitive (Bun)
//
// ^recon is the single primitive that crawls any target and produces:
//   1. Index  → knowledge/{org}/<target>/  (persistent, chunk-per-file knowledge base)
//   2. Analysis → knowledge/{org}/<target>/ANALYSIS.md  (human-readable brief)
//   3. REPO.json → knowledge/{org}/<target>/REPO.json  (repo manifest, for git repos)
//
// Target types:
//   .                   → knowledge/{org}/{origin-dns}/  (auto-detect via git remote)
//   /path/to/dir        → knowledge/{org}/<dirname>/
//   github:org/repo     → knowledge/{org}/github.com/<org>/<repo>/
//   github:org          → knowledge/{org}/github.com/<org>/
//   github:topics/tag   → knowledge/{org}/github.com/topics/<tag>/
//   https://...         → knowledge/{org}/<domain>/
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

/** GitHub domain used for knowledge path construction. */
const GITHUB_DOMAIN = "github.com";

/** Maximum source file size to index (bytes). Files larger than this are skipped
 *  to avoid memory pressure on very large generated files (e.g. minified bundles). */
const MAX_FILE_BYTES = 500_000;

/** Resolve the default org for knowledge/ paths via @ symlink. */
function resolveDefaultOrg(): string {
  const symlink = join(AGENCE_ROOT, "knowledge", "@");
  try {
    const target = readFileSync(symlink, "utf-8").trim(); // readlink
    return basename(target);
  } catch {
    // Fallback: try to read symlink target directly
    try {
      const { readlinkSync } = require("fs");
      return basename(readlinkSync(symlink));
    } catch {
      return "default";
    }
  }
}

/** Knowledge base root for the default org. */
function knowledgeBase(): string {
  return join(AGENCE_ROOT, "knowledge", resolveDefaultOrg());
}



type TargetKind = "local" | "github-repo" | "github-org" | "github-topic" | "url";
type ReconMode = "full" | "index" | "analyse" | "update";

interface Target {
  kind: TargetKind;
  raw: string;
  label: string;       // human-readable
  outputDir: string;   // absolute path to knowledge/{org}/…
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
  const kb = knowledgeBase();

  // GitHub topic
  if (raw.startsWith("github:topics/")) {
    const tag = raw.slice("github:topics/".length);
    return {
      kind: "github-topic",
      raw,
      label: `GitHub topic: ${tag}`,
      outputDir: join(kb, GITHUB_DOMAIN, "topics", tag),
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
        outputDir: join(kb, GITHUB_DOMAIN, ...parts),
      };
    }
    return {
      kind: "github-org",
      raw,
      label: `GitHub organization: ${path}`,
      outputDir: join(kb, GITHUB_DOMAIN, path),
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
        outputDir: join(kb, GITHUB_DOMAIN, ...parts),
      };
    }
    if (parts.length === 1) {
      return {
        kind: "github-org",
        raw,
        label: `GitHub org: ${parts[0]}`,
        outputDir: join(kb, GITHUB_DOMAIN, parts[0]),
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
      outputDir: join(kb, domain),
    };
  }

  // Local path (. or absolute/relative) — try to detect git remote for DNS path
  const abs = raw === "." ? process.cwd() : resolve(raw);
  let outDir: string;
  try {
    const remote = execSync("git remote get-url origin", { cwd: abs, encoding: "utf-8" }).trim();
    // Parse git remote URL → DNS path
    const m = remote.match(/(?:https?:\/\/|git@)([^/:]+)[/:](.+?)(?:\.git)?$/);
    if (m) {
      outDir = join(kb, m[1], m[2]); // e.g. knowledge/l-agence.org/github.com/l-agence/agence
    } else {
      outDir = join(kb, basename(abs));
    }
  } catch {
    const name = abs === AGENCE_ROOT ? "local" : basename(abs);
    outDir = join(kb, name);
  }
  return {
    kind: "local",
    raw,
    label: `Local: ${abs}`,
    outputDir: outDir,
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

/**
 * Write REPO.json manifest for git repos — the repo identity file.
 * `find knowledge/ -name REPO.json` gives every indexed repo instantly.
 */
function writeRepoManifest(target: Target, index: IndexJson, url?: string): void {
  const repoUrl = url || target.raw;
  // Extract origin DNS path from URL
  let origin = "";
  try {
    const parsed = new URL(repoUrl.replace(/^git@/, "https://").replace(/:([^/])/, "/$1"));
    origin = parsed.hostname + parsed.pathname.replace(/\.git$/, "");
  } catch {
    origin = target.label;
  }

  // Detect languages from index
  const langCount: Record<string, number> = {};
  for (const f of index.files) {
    if (f.lang && f.lang !== "text") langCount[f.lang] = (langCount[f.lang] || 0) + 1;
  }
  const languages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);

  const manifest = {
    kind: "repo",
    url: repoUrl,
    origin,
    branch: "main",
    sha: index.gitSHA || "",
    lastIndexed: index.lastIndexed,
    languages,
    fileCount: index.fileCount,
    chunkCount: index.files.length,
  };

  writeFileSync(
    join(target.outputDir, "REPO.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
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
  // Scan knowledge/ tree for indexed targets (those with INDEX.json)
  const roots = [
    knowledgeBase(),
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

// ─── GitHub Repo: clone to tmp, index, clean up ──────────────────────────────

/** Resolve a GitHub repo slug (org/repo) from a Target. */
function ghSlug(target: Target): string {
  // target.raw is "github:org/repo" or a full URL
  if (target.raw.startsWith("github:")) return target.raw.slice("github:".length);
  try {
    const url = new URL(target.raw);
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } catch {
    return target.raw;
  }
}

function indexGitHubRepo(target: Target, mode: ReconMode): IndexJson | null {
  const slug = ghSlug(target);
  const cloneUrl = `https://github.com/${slug}.git`;
  const tmpDir = join(AGENCE_ROOT, "nexus", "tmp", `recon-${slug.replace("/", "-")}-${Date.now()}`);

  // If update mode and we have an existing index with a gitSHA, do a shallow clone + diff
  const existing = loadIndexJson(target.outputDir);

  try {
    console.error(`[recon] cloning ${cloneUrl} → ${tmpDir}`);
    mkdirSync(tmpDir, { recursive: true });
    execSync(`git clone --depth 1 --single-branch ${cloneUrl} "${tmpDir}"`, {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 120_000,
    });
  } catch (err: any) {
    console.error(`[recon] error: git clone failed for ${slug}`);
    console.error(`  ${err.stderr?.toString().trim() || err.message}`);
    return null;
  }

  // Create a temporary local target pointing at the clone
  const cloneTarget: Target = {
    kind: "local",
    raw: tmpDir,
    label: target.label,
    outputDir: target.outputDir,
  };

  const index = indexLocal(cloneTarget, existing && mode === "update" ? "update" : "full");

  // Patch the index to record the original target
  index.target = target.raw;
  index.kind = "github-repo";
  saveIndexJson(target.outputDir, index);

  // Write REPO.json manifest for git repos
  writeRepoManifest(target, index, cloneUrl);

  // Clean up tmp clone
  try {
    execSync(`rm -rf "${tmpDir}"`, { stdio: "ignore" });
  } catch { /* best effort */ }

  return index;
}

// ─── GitHub Org: enumerate repos via gh CLI, index each ─────────────────────

function indexGitHubOrg(target: Target, mode: ReconMode): number {
  const org = target.raw.startsWith("github:") ? target.raw.slice("github:".length) : target.raw;

  let repos: string[];
  try {
    const out = execSync(
      `gh repo list ${org} --limit 50 --json nameWithOwner --jq '.[].nameWithOwner'`,
      { stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 },
    ).toString().trim();
    repos = out ? out.split("\n").filter(Boolean) : [];
  } catch (err: any) {
    console.error(`[recon] error: could not list repos for org '${org}'`);
    console.error(`  Ensure 'gh' CLI is installed and authenticated.`);
    return 1;
  }

  if (repos.length === 0) {
    console.error(`[recon] no repositories found for org '${org}'`);
    return 1;
  }

  console.error(`[recon] org '${org}': found ${repos.length} repos`);

  // Create org-level INDEX.md
  mkdirSync(target.outputDir, { recursive: true });
  const orgIndex = `# GitHub Organization: ${org}\n\n` +
    `**Repos**: ${repos.length}\n` +
    `**Indexed**: ${new Date().toISOString()}\n\n` +
    `## Repositories\n\n` +
    repos.map(r => `- [\`${r}\`](./${r.split("/")[1] || r}/INDEX.md)`).join("\n") + "\n";
  writeFileSync(join(target.outputDir, "INDEX.md"), orgIndex, "utf-8");

  // Index each repo
  let failures = 0;
  for (const slug of repos) {
    const repoTarget = resolveTarget(`github:${slug}`);
    console.error(`[recon] ── indexing ${slug} ──`);
    const result = indexGitHubRepo(repoTarget, mode);
    if (!result) failures++;
  }

  console.error(`[recon] org '${org}': ${repos.length - failures}/${repos.length} repos indexed`);
  return failures > 0 ? 1 : 0;
}

// ─── GitHub Topic: list repos by topic, create index ─────────────────────────

function indexGitHubTopic(target: Target): number {
  const tag = target.raw.startsWith("github:topics/")
    ? target.raw.slice("github:topics/".length)
    : target.raw;

  let repos: Array<{ nameWithOwner: string; description: string; stargazerCount: number }>;
  try {
    const out = execSync(
      `gh search repos --topic="${tag}" --limit=30 --json nameWithOwner,description,stargazerCount`,
      { stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 },
    ).toString().trim();
    repos = out ? JSON.parse(out) : [];
  } catch {
    console.error(`[recon] error: could not search topic '${tag}'. Ensure 'gh' is installed.`);
    return 1;
  }

  if (repos.length === 0) {
    console.error(`[recon] no repos found for topic '${tag}'`);
    return 1;
  }

  console.error(`[recon] topic '${tag}': found ${repos.length} repos`);

  mkdirSync(target.outputDir, { recursive: true });
  const topicIndex = `# GitHub Topic: ${tag}\n\n` +
    `**Repos found**: ${repos.length}\n` +
    `**Indexed**: ${new Date().toISOString()}\n\n` +
    `## Repositories (by stars)\n\n` +
    `| Repo | Stars | Description |\n|------|-------|-------------|\n` +
    repos
      .sort((a, b) => b.stargazerCount - a.stargazerCount)
      .map(r => `| [\`${r.nameWithOwner}\`](https://github.com/${r.nameWithOwner}) | ${r.stargazerCount} | ${(r.description || "").slice(0, 80)} |`)
      .join("\n") + "\n";

  writeFileSync(join(target.outputDir, "INDEX.md"), topicIndex, "utf-8");

  const indexData: IndexJson = {
    target: target.raw,
    kind: "github-topic",
    lastIndexed: new Date().toISOString(),
    fileCount: repos.length,
    files: repos.map(r => ({
      file: r.nameWithOwner,
      chunkFile: "",
      symbols: [],
      lines: r.stargazerCount,
      lang: "github-repo",
    })),
  };
  saveIndexJson(target.outputDir, indexData);
  console.error(`[recon] ✓ topic index → ${target.outputDir}`);
  return 0;
}

// ─── URL: fetch page, extract text, index ────────────────────────────────────

function indexUrl(target: Target): IndexJson | null {
  const url = target.raw;

  let html: string;
  try {
    // Use curl for portability (available everywhere, no extra deps)
    html = execSync(
      `curl -fsSL --max-time 30 --max-filesize 2000000 -A "agence-recon/1.0" "${url}"`,
      { stdio: ["ignore", "pipe", "ignore"], timeout: 35_000 },
    ).toString();
  } catch {
    console.error(`[recon] error: could not fetch ${url}`);
    return null;
  }

  mkdirSync(target.outputDir, { recursive: true });

  // Strip HTML tags for a rough text extraction
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract headings from the HTML
  const headings: string[] = [];
  const headingRe = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    headings.push(m[1].replace(/<[^>]+>/g, "").trim());
  }

  // Extract page title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

  // Write as a single chunk
  const chunkContent = `# ${title}\n\n**URL**: ${url}\n**Fetched**: ${new Date().toISOString()}\n\n` +
    (headings.length > 0 ? `## Headings\n\n${headings.map(h => `- ${h}`).join("\n")}\n\n` : "") +
    `## Content\n\n${text.slice(0, 50_000)}${text.length > 50_000 ? "\n\n… (truncated)" : ""}\n`;

  const chunkFile = "page.chunk.md";
  writeFileSync(join(target.outputDir, chunkFile), chunkContent, "utf-8");

  const indexData: IndexJson = {
    target: url,
    kind: "url",
    lastIndexed: new Date().toISOString(),
    fileCount: 1,
    files: [{
      file: url,
      chunkFile,
      symbols: headings.slice(0, 20),
      lines: text.split(/\n/).length,
      lang: "html",
    }],
  };

  saveIndexJson(target.outputDir, indexData);
  writeFileSync(join(target.outputDir, "INDEX.md"),
    buildIndexMd(target, indexData.files), "utf-8");

  console.error(`[recon] ✓ URL indexed → ${target.outputDir}`);
  return indexData;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function usage(): void {
  console.error(`recon — General-purpose crawler / indexer primitive

Usage:
  airun recon <target> [--index|--analyse|--update] [--depth N]
  airun recon list
  airun recon status <target>
  airun recon help

Target types:
  .                     Current directory (auto-detects git remote for DNS path)
  /path/to/dir          Local path
  github:org/repo       GitHub repository (clones, indexes, cleans up)
  github:org            GitHub organisation (enumerates repos via gh CLI)
  github:topics/<tag>   GitHub topic (searches repos, writes catalog)
  https://...           URL / web target (fetches, extracts text)

Modes (default: full = index + analysis):
  --index               Crawl + index only (no analysis)
  --analyse             Analysis only (reads existing index)
  --update              Incremental: re-index changed files only

Options:
  --depth N             Recursion depth for URL crawling (default: 1)

Output:
  knowledge/{org}/<target>/INDEX.md      Entry point overview
  knowledge/{org}/<target>/INDEX.json    Machine-readable index
  knowledge/{org}/<target>/<file>.chunk.md  Per-file symbol chunks
  knowledge/{org}/<target>/ANALYSIS.md   Human-readable brief (full mode)
  knowledge/{org}/<target>/REPO.json     Repo manifest (git repos only)`);
}

const argv = process.argv.slice(2);
const sub = argv[0] || "";

if (argv.length === 0 || sub === "help" || sub === "--help" || sub === "-h") {
  usage();
  process.exit(argv.length === 0 ? 1 : 0);
}

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

// recon <target> [--index|--analyse|--update] [--depth N]
const targetRaw = sub;
const modeFlag = argv.find(a => ["--index", "--analyse", "--update"].includes(a));
const mode: ReconMode = modeFlag === "--index"
  ? "index"
  : modeFlag === "--analyse"
    ? "analyse"
    : modeFlag === "--update"
      ? "update"
      : "full";

// Parse --depth flag (for future URL crawl recursion)
const depthIdx = argv.indexOf("--depth");
const _crawlDepth = depthIdx >= 0 && argv[depthIdx + 1] ? parseInt(argv[depthIdx + 1], 10) : 1;

const target = resolveTarget(targetRaw);
console.error(`[recon] target: ${target.label}  mode: ${mode}  depth: ${_crawlDepth}`);

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
  // Write REPO.json if this is a git repo
  const localAbs = targetRaw === "." ? process.cwd() : resolve(targetRaw);
  if (existsSync(join(localAbs, ".git"))) {
    writeRepoManifest(target, index);
  }
} else if (target.kind === "github-repo") {
  const index = indexGitHubRepo(target, mode);
  if (index) {
    if (mode === "full") writeAnalysis(target, index);
  } else {
    exitCode = 1;
  }
} else if (target.kind === "github-org") {
  exitCode = indexGitHubOrg(target, mode);
} else if (target.kind === "github-topic") {
  exitCode = indexGitHubTopic(target);
} else if (target.kind === "url") {
  const index = indexUrl(target);
  if (index) {
    if (mode === "full") writeAnalysis(target, index);
  } else {
    exitCode = 1;
  }
}

process.exit(exitCode);
