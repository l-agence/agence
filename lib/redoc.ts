#!/usr/bin/env bun
// lib/redoc.ts — Save, update, version, and publish docs from source to root

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, statSync } from "fs";
import { join, basename } from "path";

// ─── Environment (lazy getters for testability) ──────────────────────────────

function getRoot(): string {
  return process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
}
function getDocSource(): string {
  return process.env.AGENCE_DOC_SOURCE || join(getRoot(), "knowledge", "l-agence.org", "docs");
}
function getDocRoot(): string {
  return process.env.AGENCE_DOC_ROOT || join(getRoot(), "docs");
}
function getDocSaves(): string {
  return process.env.AGENCE_DOC_SAVES || join(getDocSource(), "deprecated");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RedocManifest {
  version: string;
  timestamp: string;
  files: string[];
  saved_from: string;
  saved_to: string;
}

export interface RedocReport {
  saved: number;
  updated: number;
  version: string;
  manifest: RedocManifest;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextVersion(): string {
  // Read existing manifest from DOC_ROOT to determine next version
  const manifestPath = join(getDocRoot(), "MANIFEST.json");
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const parts = (m.version || "0.0.0").split(".").map(Number);
      parts[2]++;
      return parts.join(".");
    } catch { /* fall through */ }
  }
  return "1.0.0";
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** Collect *.md files from a directory (non-recursive, skip deprecated/) */
function collectDocs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".md") && !f.startsWith("."))
    .sort();
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/** Phase 1: Save current DOC_ROOT contents to DOC_SAVES with version stamp */
export function saveCurrentDocs(version: string, dryRun: boolean = false): { saved: number; saveDir: string } {
  const docRoot = getDocRoot();
  const existing = collectDocs(docRoot);
  if (existing.length === 0) {
    return { saved: 0, saveDir: "" };
  }

  const tag = `v${version}_${timestamp()}`;
  const saveDir = join(getDocSaves(), tag);

  if (!dryRun) {
    mkdirSync(saveDir, { recursive: true });
    for (const f of existing) {
      copyFileSync(join(docRoot, f), join(saveDir, f));
    }
    // Write a small receipt
    writeFileSync(join(saveDir, ".receipt.json"), JSON.stringify({
      saved_at: new Date().toISOString(),
      version,
      files: existing,
    }, null, 2));
  }

  return { saved: existing.length, saveDir };
}

/** Phase 2: Copy DOC_SOURCE → DOC_ROOT (overwrite) */
export function publishDocs(dryRun: boolean = false): { updated: number; files: string[] } {
  const docSource = getDocSource();
  const docRoot = getDocRoot();
  const source = collectDocs(docSource);
  if (source.length === 0) {
    process.stderr.write(`[redoc] No .md files found in ${docSource}\n`);
    return { updated: 0, files: [] };
  }

  if (!dryRun) {
    mkdirSync(docRoot, { recursive: true });
    for (const f of source) {
      copyFileSync(join(docSource, f), join(docRoot, f));
    }
  }

  return { updated: source.length, files: source };
}

/** Phase 3: Write MANIFEST.json to DOC_ROOT */
export function writeManifest(version: string, files: string[], dryRun: boolean = false): RedocManifest {
  const manifest: RedocManifest = {
    version,
    timestamp: new Date().toISOString(),
    files,
    saved_from: getDocSource(),
    saved_to: getDocRoot(),
  };

  if (!dryRun) {
    writeFileSync(join(getDocRoot(), "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  }

  return manifest;
}

/** Full redoc cycle: save → publish → version → manifest */
export function runRedoc(dryRun: boolean = false): RedocReport {
  const version = nextVersion();

  // Phase 1: save previous
  const { saved } = saveCurrentDocs(version, dryRun);

  // Phase 2: publish source → root
  const { updated, files } = publishDocs(dryRun);

  // Phase 3: manifest
  const manifest = writeManifest(version, files, dryRun);

  return { saved, updated, version, manifest };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdRun(args: string[]): number {
  const dryRun = args.includes("--dry-run");
  const report = runRedoc(dryRun);

  const prefix = dryRun ? "[dry-run] " : "";

  if (report.saved > 0) {
    process.stderr.write(`${prefix}Saved ${report.saved} previous docs to deprecated/\n`);
  }
  process.stderr.write(`${prefix}Published ${report.updated} docs → ${getDocRoot()}\n`);
  process.stderr.write(`${prefix}Version: ${report.version}\n`);

  console.log(JSON.stringify(report, null, 2));
  return 0;
}

function cmdStatus(): number {
  const docSource = getDocSource();
  const docRoot = getDocRoot();
  const sourceFiles = collectDocs(docSource);
  const rootFiles = collectDocs(docRoot);
  const manifestPath = join(docRoot, "MANIFEST.json");

  let version = "unpublished";
  let lastPublished = "never";
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf-8"));
      version = m.version || "unknown";
      lastPublished = m.timestamp || "unknown";
    } catch { /* skip */ }
  }

  // Count saves
  const docSaves = getDocSaves();
  let saveCount = 0;
  if (existsSync(docSaves)) {
    saveCount = readdirSync(docSaves).filter(d => d.startsWith("v")).length;
  }

  console.log(`[redoc] Status:`);
  console.log(`  source:     ${docSource} (${sourceFiles.length} docs)`);
  console.log(`  published:  ${docRoot} (${rootFiles.length} docs)`);
  console.log(`  version:    ${version}`);
  console.log(`  last:       ${lastPublished}`);
  console.log(`  saves:      ${saveCount} archived versions`);
  console.log(`  next:       ${nextVersion()}`);
  return 0;
}

function cmdDiff(): number {
  const docSource = getDocSource();
  const docRoot = getDocRoot();
  const sourceFiles = collectDocs(docSource);
  const rootFiles = collectDocs(docRoot);

  const added = sourceFiles.filter(f => !rootFiles.includes(f));
  const removed = rootFiles.filter(f => !sourceFiles.includes(f));
  const common = sourceFiles.filter(f => rootFiles.includes(f));

  // Check content differences
  const modified: string[] = [];
  for (const f of common) {
    const src = readFileSync(join(docSource, f), "utf-8");
    const dst = readFileSync(join(docRoot, f), "utf-8");
    if (src !== dst) modified.push(f);
  }

  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    console.log("[redoc] Docs are in sync. Nothing to publish.");
    return 0;
  }

  console.log("[redoc] Changes pending:");
  for (const f of added) console.log(`  + ${f}`);
  for (const f of removed) console.log(`  - ${f}`);
  for (const f of modified) console.log(`  ~ ${f}`);
  console.log(`\n  ${added.length} new, ${removed.length} removed, ${modified.length} modified`);
  return 0;
}

function cmdHelp(): number {
  console.log(`Usage: airun redoc <command> [options]

Commands:
  run [--dry-run]    Save previous + publish source → docs/ + version
  status             Show current doc state and versions
  diff               Show what would change on next publish
  help               This help

Environment:
  AGENCE_DOC_SOURCE  Source docs directory  (default: knowledge/l-agence.org/docs/)
  AGENCE_DOC_ROOT    Published docs root    (default: docs/)
  AGENCE_DOC_SAVES   Version archive dir    (default: <source>/deprecated/)
`);
  return 0;
}

// ─── Main Router ─────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  let exitCode = 0;
  switch (cmd) {
    case "run":
      exitCode = cmdRun(args);
      break;
    case "status":
      exitCode = cmdStatus();
      break;
    case "diff":
      exitCode = cmdDiff();
      break;
    case "help":
    case "--help":
    case "-h":
      exitCode = cmdHelp();
      break;
    default:
      if (!cmd) {
        // No args → run (default action)
        exitCode = cmdRun(args || []);
      } else {
        console.error(`Unknown command: ${cmd}`);
        exitCode = cmdHelp();
        exitCode = 2;
      }
  }

  process.exit(exitCode);
}
