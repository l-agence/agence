#!/usr/bin/env bun
// lib/memory.ts — Agence Knowledge Memory System
//
// 3-store memory model:
//
//   PERSISTENT
//     knowledge/{org}/memory/shared.jsonl   → team knowledge (versioned, committed)
//     knowledge/private/memory/private.jsonl → local-only (gitignored, 0o600)
//
//   RUNTIME
//     nexus/memory/working.jsonl            → fast working-set cache (hydrated projection)
//
// Schema: All stores use the same MemoryRow JSONL format.
// Storage: One .jsonl file per store (append-optimized, grep-friendly).
// Tags carry semantic distinctions: kind:code, kind:decision, source:recon, etc.
//
// Operations:
//   ^retain  <source> <tags> <content>  — write row to persistent store
//   ^recall  <tags> [--source X]        — query across stores, ranked
//   ^cache   <tags> [--max N]           — hydrate working memory from all stores
//   ^forget  <id> <source>              — remove row from store
//   ^promote <id> <from> <to>           — move row between stores
//
// Usage:
//   airun memory retain shared "jwt,auth" "JWT tokens expire after 24h..."
//   airun memory recall "jwt,auth"
//   airun memory recall "jwt" --source shared
//   airun memory cache "deploy,k8s" --max 20
//   airun memory forget sh-1713600000 shared
//   airun memory promote pr-123 private shared
//   airun memory list shared
//   airun memory stats
//   airun memory help

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, appendFileSync, chmodSync, statSync } from "fs";
import { join } from "path";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Types ───────────────────────────────────────────────────────────────────

export type MemorySource = "shared" | "private";

export interface MemoryRow {
  id: string;
  tags: string[];
  content: string;
  source: MemorySource;
  importance?: number;        // 0.0–1.0, default 0.5
  polarity?: "positive" | "negative";
  ts: number;                 // epoch ms
}

// ─── Store Paths ─────────────────────────────────────────────────────────────
// Maps each source to its COGNOS layer directory + JSONL file.

interface StoreConfig {
  dir: string;
  file: string;
  versioned: boolean;         // true = committed to git, false = gitignored
}

const STORE_MAP: Record<MemorySource, StoreConfig> = {
  shared:  { dir: "knowledge/@/memory",         file: "shared.jsonl",  versioned: true },
  private: { dir: "knowledge/private/memory",    file: "private.jsonl", versioned: false },
};

const WORKING_DIR = "nexus/memory";
const WORKING_FILE = "working.jsonl";

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_SOURCES: ReadonlySet<string> = new Set(Object.keys(STORE_MAP));
const TAG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const ID_PREFIX: Record<MemorySource, string> = {
  shared: "sh",
  private: "pr",
};
const MAX_CONTENT_SIZE = 64 * 1024;  // 64KB per row
const MAX_TAGS = 16;

export function isValidSource(s: string): s is MemorySource {
  return VALID_SOURCES.has(s);
}

export function isValidTag(t: string): boolean {
  return TAG_RE.test(t);
}

export function parseTags(input: string): string[] {
  return input.split(",").map(t => t.trim()).filter(Boolean);
}

function validateTags(tags: string[]): void {
  if (tags.length === 0) throw new Error("At least one tag required");
  if (tags.length > MAX_TAGS) throw new Error(`Too many tags (max ${MAX_TAGS})`);
  for (const t of tags) {
    if (!isValidTag(t)) throw new Error(`Invalid tag: "${t}" — must match ${TAG_RE}`);
  }
}

function validateContent(content: string): void {
  if (!content || content.trim().length === 0) throw new Error("Content must not be empty");
  if (content.length > MAX_CONTENT_SIZE) throw new Error(`Content too large (${content.length} bytes, max ${MAX_CONTENT_SIZE})`);
}

// ─── Store I/O ───────────────────────────────────────────────────────────────

function storePath(source: MemorySource): string {
  const cfg = STORE_MAP[source];
  return join(AGENCE_ROOT, cfg.dir, cfg.file);
}

function workingPath(): string {
  return join(AGENCE_ROOT, WORKING_DIR, WORKING_FILE);
}

function ensureDir(filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read all rows from a JSONL store file.
 * Skips malformed lines silently (resilient to partial writes).
 */
export function readStore(source: MemorySource): MemoryRow[] {
  const path = storePath(source);
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8").split("\n").filter(l => l.trim());
  const rows: MemoryRow[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as MemoryRow;
      if (row.id && row.tags && row.content && row.source && row.ts) {
        rows.push(row);
      }
    } catch {
      // skip malformed lines
    }
  }
  return rows;
}

/**
 * Read working memory (runtime cache).
 */
export function readWorking(): MemoryRow[] {
  const path = workingPath();
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8").split("\n").filter(l => l.trim());
  const rows: MemoryRow[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as MemoryRow;
      if (row.id && row.tags && row.content && row.source && row.ts) {
        rows.push(row);
      }
    } catch { /* skip */ }
  }
  return rows;
}

/**
 * Append a single row to a JSONL store.
 * Creates the directory and file if needed.
 * Private files get 0o600 permissions.
 */
function appendRow(source: MemorySource, row: MemoryRow): void {
  const path = storePath(source);
  ensureDir(path);
  appendFileSync(path, JSON.stringify(row) + "\n", "utf-8");

  // private store — restrict file permissions
  if (source === "private") {
    chmodSync(path, 0o600);
  }
}

/**
 * Rewrite a full store (used by forget/promote to remove rows).
 */
function rewriteStore(source: MemorySource, rows: MemoryRow[]): void {
  const path = storePath(source);
  ensureDir(path);
  const data = rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(path, data, "utf-8");
  if (source === "private") {
    chmodSync(path, 0o600);
  }
}

/**
 * Write working memory cache (full replace, not append).
 */
function writeWorking(rows: MemoryRow[]): void {
  const path = workingPath();
  ensureDir(path);
  const data = rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(path, data, "utf-8");
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Generate a unique row ID: prefix + timestamp hex.
 */
function generateId(source: MemorySource): string {
  const prefix = ID_PREFIX[source];
  const hex = Date.now().toString(16);
  return `${prefix}-${hex}`;
}

/**
 * ^retain — Store a memory row in a persistent store.
 */
export function retain(
  source: MemorySource,
  tags: string[],
  content: string,
  opts?: { importance?: number; polarity?: "positive" | "negative" }
): MemoryRow {
  if (!isValidSource(source)) throw new Error(`Invalid source: "${source}"`);
  validateTags(tags);
  validateContent(content);

  const row: MemoryRow = {
    id: generateId(source),
    tags,
    content: content.trim(),
    source,
    importance: opts?.importance ?? 0.5,
    polarity: opts?.polarity ?? "positive",
    ts: Date.now(),
  };

  appendRow(source, row);
  return row;
}

/**
 * ^recall — Query across one or more stores by tag intersection.
 * Returns rows sorted by relevance (tag overlap × importance × recency).
 */
export function recall(
  queryTags: string[],
  opts?: { source?: MemorySource; max?: number; includeNegative?: boolean }
): MemoryRow[] {
  validateTags(queryTags);
  const max = opts?.max ?? 20;
  const querySet = new Set(queryTags.map(t => t.toLowerCase()));

  // Collect from target source(s)
  const sources: MemorySource[] = opts?.source
    ? [opts.source]
    : (Object.keys(STORE_MAP) as MemorySource[]);

  let pool: MemoryRow[] = [];
  for (const src of sources) {
    pool.push(...readStore(src));
  }

  // Filter out negative polarity unless explicitly requested
  if (!opts?.includeNegative) {
    pool = pool.filter(r => r.polarity !== "negative");
  }

  // Score: tag overlap count + importance bonus + recency decay
  const now = Date.now();
  const scored = pool.map(row => {
    const rowTagsLower = new Set(row.tags.map(t => t.toLowerCase()));
    let tagOverlap = 0;
    for (const qt of querySet) {
      if (rowTagsLower.has(qt)) tagOverlap++;
    }
    // No overlap = no match
    if (tagOverlap === 0) return { row, score: 0 };

    const overlapRatio = tagOverlap / querySet.size;
    const importance = row.importance ?? 0.5;
    // Recency: half-life of 30 days
    const ageDays = (now - row.ts) / 86_400_000;
    const recency = Math.exp(-0.023 * ageDays); // λ ≈ ln(2)/30

    const score = overlapRatio * 0.5 + importance * 0.3 + recency * 0.2;
    return { row, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => s.row);
}

/**
 * ^cache — Hydrate working memory from all persistent stores.
 * Merges, scores, trims to budget, writes nexus/memory/working.jsonl.
 */
export function cache(
  queryTags: string[],
  opts?: { max?: number; includePrivate?: boolean }
): MemoryRow[] {
  validateTags(queryTags);
  const max = opts?.max ?? 30;
  const querySet = new Set(queryTags.map(t => t.toLowerCase()));

  // Collect from all persistent stores
  const sources: MemorySource[] = opts?.includePrivate
    ? (Object.keys(STORE_MAP) as MemorySource[])
    : (Object.keys(STORE_MAP) as MemorySource[]).filter(s => s !== "private");

  let pool: MemoryRow[] = [];
  for (const src of sources) {
    pool.push(...readStore(src));
  }

  // Filter out negative polarity (anti-patterns don't go in cache)
  pool = pool.filter(r => r.polarity !== "negative");

  // Score same as recall
  const now = Date.now();
  const scored = pool.map(row => {
    const rowTagsLower = new Set(row.tags.map(t => t.toLowerCase()));
    let tagOverlap = 0;
    for (const qt of querySet) {
      if (rowTagsLower.has(qt)) tagOverlap++;
    }
    if (tagOverlap === 0) return { row, score: 0 };

    const overlapRatio = tagOverlap / querySet.size;
    const importance = row.importance ?? 0.5;
    const ageDays = (now - row.ts) / 86_400_000;
    const recency = Math.exp(-0.023 * ageDays);

    const score = overlapRatio * 0.5 + importance * 0.3 + recency * 0.2;
    return { row, score };
  });

  const selected = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(s => s.row);

  // Write to working memory (full replace)
  writeWorking(selected);
  return selected;
}

/**
 * ^forget — Remove a row by ID from a specific store.
 */
export function forget(id: string, source: MemorySource): boolean {
  if (!isValidSource(source)) throw new Error(`Invalid source: "${source}"`);

  const rows = readStore(source);
  const filtered = rows.filter(r => r.id !== id);

  if (filtered.length === rows.length) return false; // not found
  rewriteStore(source, filtered);
  return true;
}

/**
 * ^promote — Move a row from one store to another.
 * Removes from source, adds to target with new source tag.
 */
export function promote(id: string, fromSource: MemorySource, toSource: MemorySource): MemoryRow | null {
  if (!isValidSource(fromSource)) throw new Error(`Invalid source: "${fromSource}"`);
  if (!isValidSource(toSource)) throw new Error(`Invalid target: "${toSource}"`);
  if (fromSource === toSource) throw new Error("Cannot promote to same store");

  const rows = readStore(fromSource);
  const target = rows.find(r => r.id === id);
  if (!target) return null;

  // Remove from source
  rewriteStore(fromSource, rows.filter(r => r.id !== id));

  // Add to target with new ID and source
  const promoted: MemoryRow = {
    ...target,
    id: generateId(toSource),
    source: toSource,
    ts: Date.now(),
  };
  appendRow(toSource, promoted);
  return promoted;
}

/**
 * List all rows in a store (for ^memory list).
 */
export function list(source: MemorySource): MemoryRow[] {
  if (!isValidSource(source)) throw new Error(`Invalid source: "${source}"`);
  return readStore(source);
}

/**
 * Stats across all stores.
 */
export function stats(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const src of Object.keys(STORE_MAP) as MemorySource[]) {
    result[src] = readStore(src).length;
  }
  result.working = readWorking().length;
  return result;
}

// ─── Promotion Pipelines ────────────────────────────────────────────────
// Promote between persistent stores:
//   private → shared   (declassify private insights for team)
//
// distill() promotes multiple rows at once based on criteria:
//   - importance threshold
//   - age threshold (min days old — let insights settle)
//   - tag matching
//   - deduplication against target store

export interface DistillOpts {
  from: MemorySource;
  to: MemorySource;
  minImportance?: number;     // default 0.6
  minAgeDays?: number;        // default 1 (let insights settle)
  tags?: string[];            // only rows matching these tags
  dryRun?: boolean;           // preview without moving
}

/** Valid promotion paths — prevent nonsensical flows */
const VALID_PROMOTIONS: ReadonlySet<string> = new Set([
  "private→shared",
]);

function isValidPromotion(from: MemorySource, to: MemorySource): boolean {
  return VALID_PROMOTIONS.has(`${from}→${to}`);
}

/**
 * Simple content similarity: Jaccard coefficient on word sets.
 * Returns 0.0–1.0 (1.0 = identical word sets).
 */
function contentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/**
 * Check if a row is a near-duplicate of any existing row in the target store.
 * Uses tag overlap + content similarity (Jaccard > 0.8 = duplicate).
 */
function isDuplicate(row: MemoryRow, targetRows: MemoryRow[]): boolean {
  for (const existing of targetRows) {
    // Same tags AND similar content = duplicate
    const tagOverlap = row.tags.filter(t =>
      existing.tags.map(et => et.toLowerCase()).includes(t.toLowerCase())
    ).length;
    if (tagOverlap >= Math.min(row.tags.length, existing.tags.length)) {
      if (contentSimilarity(row.content, existing.content) > 0.8) {
        return true;
      }
    }
  }
  return false;
}

/**
 * ^distill — Batch promote rows from one store to another based on criteria.
 * Returns list of promoted rows (or preview if dryRun).
 */
export function distill(opts: DistillOpts): { promoted: MemoryRow[]; skipped: number; duplicates: number } {
  if (!isValidSource(opts.from)) throw new Error(`Invalid source: "${opts.from}"`);
  if (!isValidSource(opts.to)) throw new Error(`Invalid target: "${opts.to}"`);
  if (opts.from === opts.to) throw new Error("Cannot distill to same store");
  if (!isValidPromotion(opts.from, opts.to)) {
    throw new Error(`Invalid promotion path: ${opts.from} → ${opts.to}. Valid: ${[...VALID_PROMOTIONS].join(", ")}`);
  }

  const minImportance = opts.minImportance ?? 0.6;
  const minAgeDays = opts.minAgeDays ?? 1;
  const now = Date.now();
  const minAgeMs = minAgeDays * 86_400_000;

  let sourceRows = readStore(opts.from);
  const targetRows = readStore(opts.to);

  // Filter by criteria
  let candidates = sourceRows.filter(row => {
    // Importance threshold
    if ((row.importance ?? 0.5) < minImportance) return false;
    // Age threshold (let insights settle)
    if ((now - row.ts) < minAgeMs) return false;
    // Positive polarity only (don't promote anti-patterns)
    if (row.polarity === "negative") return false;
    // Tag filter if specified
    if (opts.tags && opts.tags.length > 0) {
      const rowTagsLower = new Set(row.tags.map(t => t.toLowerCase()));
      const hasMatch = opts.tags.some(t => rowTagsLower.has(t.toLowerCase()));
      if (!hasMatch) return false;
    }
    return true;
  });

  // Deduplicate against target
  let duplicates = 0;
  candidates = candidates.filter(row => {
    if (isDuplicate(row, targetRows)) {
      duplicates++;
      return false;
    }
    return true;
  });

  if (opts.dryRun) {
    return { promoted: candidates, skipped: sourceRows.length - candidates.length - duplicates, duplicates };
  }

  // Execute promotions
  const promoted: MemoryRow[] = [];
  for (const row of candidates) {
    const result = promote(row.id, opts.from, opts.to);
    if (result) promoted.push(result);
  }

  return { promoted, skipped: sourceRows.length - candidates.length - duplicates, duplicates };
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

function printHelp(): void {
  console.error(`Usage: airun memory <command> [args...]

Commands:
  retain <source> <tags> <content>      Store a memory row
  recall <tags> [--source X] [--max N]  Query memories by tags
  cache  <tags> [--max N] [--private]   Hydrate working memory cache
  forget <id> <source>                  Remove a row
  promote <id> <from> <to>              Move row between stores
  distill <from> <to> [opts]            Batch promote by criteria
  list   <source>                       List all rows in a store
  stats                                 Row counts per store
  help                                  Show this help

Sources: shared, private
Tags:    Comma-separated, alphanumeric with . _ - (max 16)

Promotion paths (distill):
  private → shared        Declassify private insights for team

Examples:
  airun memory retain shared "jwt,auth" "JWT tokens expire after 24h"
  airun memory recall "jwt,auth"
  airun memory recall "jwt" --source shared --max 10
  airun memory cache "deploy,k8s" --max 20
  airun memory forget sh-18f3a4b00 shared
  airun memory promote pr-18f3a4b00 private shared
  airun memory distill private shared --min-importance 0.7
  airun memory distill private shared --tags "pattern,fix" --dry-run
  airun memory list shared
  airun memory stats`);
}

function formatRow(row: MemoryRow): string {
  const age = Math.floor((Date.now() - row.ts) / 86_400_000);
  const ageStr = age === 0 ? "today" : `${age}d ago`;
  const pol = row.polarity === "negative" ? " ✗" : "";
  const imp = row.importance !== undefined ? ` ★${row.importance.toFixed(1)}` : "";
  return `[${row.id}] ${row.source}  [${row.tags.join(",")}]${imp}${pol}  ${ageStr}\n  ${row.content.substring(0, 120)}${row.content.length > 120 ? "…" : ""}`;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  try {
    switch (cmd) {
      case "retain": {
        const source = args[1];
        const tagStr = args[2];
        const content = args.slice(3).join(" ");
        if (!source || !tagStr || !content) {
          console.error("Usage: airun memory retain <source> <tags> <content>");
          process.exit(1);
        }
        if (!isValidSource(source)) {
          console.error(`Invalid source: "${source}". Valid: ${[...VALID_SOURCES].join(", ")}`);
          process.exit(1);
        }
        // Parse optional flags from content portion
        let importance: number | undefined;
        let polarity: "positive" | "negative" | undefined;
        let cleanContent = content;
        if (cleanContent.includes("--importance ")) {
          const m = cleanContent.match(/--importance\s+([\d.]+)/);
          if (m) {
            importance = Math.max(0, Math.min(1, parseFloat(m[1])));
            cleanContent = cleanContent.replace(/--importance\s+[\d.]+/, "").trim();
          }
        }
        if (cleanContent.includes("--negative")) {
          polarity = "negative";
          cleanContent = cleanContent.replace(/--negative/, "").trim();
        }

        const tags = parseTags(tagStr);
        const row = retain(source as MemorySource, tags, cleanContent, { importance, polarity });
        console.log(`Retained: ${row.id} → ${row.source} [${row.tags.join(",")}]`);
        break;
      }

      case "recall": {
        const tagStr = args[1];
        if (!tagStr) {
          console.error("Usage: airun memory recall <tags> [--source X] [--max N]");
          process.exit(1);
        }
        let source: MemorySource | undefined;
        let max: number | undefined;
        let includeNegative = false;
        for (let i = 2; i < args.length; i++) {
          if (args[i] === "--source" && args[i + 1]) { source = args[++i] as MemorySource; }
          else if (args[i] === "--max" && args[i + 1]) { max = parseInt(args[++i], 10); }
          else if (args[i] === "--negative") { includeNegative = true; }
        }
        const tags = parseTags(tagStr);
        const rows = recall(tags, { source, max, includeNegative });
        if (rows.length === 0) {
          console.log("No matching memories found.");
        } else {
          console.log(`Found ${rows.length} memor${rows.length === 1 ? "y" : "ies"}:\n`);
          for (const r of rows) console.log(formatRow(r) + "\n");
        }
        break;
      }

      case "cache": {
        const tagStr = args[1];
        if (!tagStr) {
          console.error("Usage: airun memory cache <tags> [--max N] [--private]");
          process.exit(1);
        }
        let max: number | undefined;
        let includePrivate = false;
        for (let i = 2; i < args.length; i++) {
          if (args[i] === "--max" && args[i + 1]) { max = parseInt(args[++i], 10); }
          else if (args[i] === "--private") { includePrivate = true; }
        }
        const tags = parseTags(tagStr);
        const rows = cache(tags, { max, includePrivate });
        console.log(`Cached ${rows.length} rows → nexus/memory/working.jsonl`);
        if (rows.length > 0) {
          const sources = [...new Set(rows.map(r => r.source))];
          console.log(`Sources: ${sources.join(", ")}`);
        }
        break;
      }

      case "forget": {
        const id = args[1];
        const source = args[2];
        if (!id || !source) {
          console.error("Usage: airun memory forget <id> <source>");
          process.exit(1);
        }
        if (!isValidSource(source)) {
          console.error(`Invalid source: "${source}"`);
          process.exit(1);
        }
        const removed = forget(id, source as MemorySource);
        if (removed) {
          console.log(`Forgot: ${id} from ${source}`);
        } else {
          console.error(`Not found: ${id} in ${source}`);
          process.exit(1);
        }
        break;
      }

      case "promote": {
        const id = args[1];
        const from = args[2];
        const to = args[3];
        if (!id || !from || !to) {
          console.error("Usage: airun memory promote <id> <from> <to>");
          process.exit(1);
        }
        if (!isValidSource(from) || !isValidSource(to)) {
          console.error(`Invalid source. Valid: ${[...VALID_SOURCES].join(", ")}`);
          process.exit(1);
        }
        const promoted = promote(id, from as MemorySource, to as MemorySource);
        if (promoted) {
          console.log(`Promoted: ${id} (${from}) → ${promoted.id} (${to})`);
        } else {
          console.error(`Not found: ${id} in ${from}`);
          process.exit(1);
        }
        break;
      }

      case "list": {
        const source = args[1];
        if (!source) {
          console.error("Usage: airun memory list <source>");
          process.exit(1);
        }
        if (!isValidSource(source)) {
          console.error(`Invalid source: "${source}"`);
          process.exit(1);
        }
        const rows = list(source as MemorySource);
        if (rows.length === 0) {
          console.log(`${source}: empty`);
        } else {
          console.log(`${source}: ${rows.length} row${rows.length === 1 ? "" : "s"}\n`);
          for (const r of rows) console.log(formatRow(r) + "\n");
        }
        break;
      }

      case "stats": {
        const s = stats();
        console.log("Memory stores:");
        for (const [name, count] of Object.entries(s)) {
          const bar = "█".repeat(Math.min(count, 40));
          console.log(`  ${name.padEnd(12)} ${String(count).padStart(4)}  ${bar}`);
        }
        const total = Object.values(s).reduce((a, b) => a + b, 0);
        console.log(`  ${"total".padEnd(12)} ${String(total).padStart(4)}`);
        break;
      }

      case "distill": {
        const from = args[1];
        const to = args[2];
        if (!from || !to) {
          console.error("Usage: airun memory distill <from> <to> [--min-importance N] [--min-age-days N] [--tags T] [--dry-run]");
          process.exit(1);
        }
        if (!isValidSource(from) || !isValidSource(to)) {
          console.error(`Invalid source. Valid: ${[...VALID_SOURCES].join(", ")}`);
          process.exit(1);
        }
        let minImportance: number | undefined;
        let minAgeDays: number | undefined;
        let dTags: string[] | undefined;
        let dryRun = false;
        for (let i = 3; i < args.length; i++) {
          if (args[i] === "--min-importance" && args[i + 1]) { minImportance = parseFloat(args[++i]); }
          else if (args[i] === "--min-age-days" && args[i + 1]) { minAgeDays = parseInt(args[++i], 10); }
          else if (args[i] === "--tags" && args[i + 1]) { dTags = parseTags(args[++i]); }
          else if (args[i] === "--dry-run") { dryRun = true; }
        }
        const result = distill({
          from: from as MemorySource,
          to: to as MemorySource,
          minImportance,
          minAgeDays,
          tags: dTags,
          dryRun,
        });
        if (dryRun) {
          console.log(`[dry-run] Would promote ${result.promoted.length} rows (${from} → ${to})`);
          console.log(`  Skipped: ${result.skipped} (below threshold), Duplicates: ${result.duplicates}`);
          for (const r of result.promoted) {
            console.log(`  ${formatRow(r)}`);
          }
        } else {
          console.log(`Distilled: ${result.promoted.length} rows (${from} → ${to})`);
          console.log(`  Skipped: ${result.skipped}, Duplicates: ${result.duplicates}`);
          for (const r of result.promoted) {
            console.log(`  → ${r.id} [${r.tags.join(",")}]`);
          }
        }
        break;
      }

      default:
        console.error(`Unknown command: ${cmd}`);
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
