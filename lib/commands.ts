#!/usr/bin/env bun
// lib/commands.ts — Knowledge command module (Bun)
//
// Extracted from bin/agence mode_knowledge + helpers.
// Handles: ^lesson, ^plan, ^todo, ^fault, ^issue, ^task, ^job, ^log
//
// Usage (from bash):
//   airun commands <cmd_type> <sub_cmd> [args...]
//   airun commands lesson list
//   airun commands todo list
//   airun commands plan show v0.3.0-tiles
//   airun commands fault add "description here"
//
// Exit codes: 0 = success, 1 = error

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";

const AI_ROOT = process.env.AI_ROOT || process.env.AGENCE_ROOT || join(import.meta.dir, "..");
const AGENCE_ROOT = process.env.AGENCE_ROOT || AI_ROOT;

// ─── Scope Resolution ────────────────────────────────────────────────────────

type CmdType = "lesson" | "plan" | "issue" | "log" | "fault" | "todo" | "task" | "job";
type SubCmd = "list" | "show" | "add";
type Scope = "SYNTHETIC" | "NEXUS" | "HERMETIC" | "ORGANIC";

interface ScopeInfo {
  scope: Scope;
  baseDir: string;
  dataDir: string;
}

function resolveOrgPath(scopeRoot: string, fallbackOrg: string): string {
  const symlink = join(scopeRoot, "@");
  const named = join(scopeRoot, `@${fallbackOrg}`);
  const canonical = join(scopeRoot, fallbackOrg);

  // Tier 1: @ symlink
  if (existsSync(symlink)) return symlink;
  // Tier 2: @org symlink
  if (existsSync(named)) return named;
  // Tier 3: canonical path
  return canonical;
}

function resolveScope(cmdType: CmdType, org: string): ScopeInfo {
  let scope: Scope;
  let baseDir: string;

  switch (cmdType) {
    case "lesson":
    case "plan":
    case "issue":
      scope = "SYNTHETIC";
      baseDir = resolveOrgPath(join(AGENCE_ROOT, "synthetic"), org);
      break;
    case "log":
    case "fault":
      scope = "NEXUS";
      baseDir = join(AGENCE_ROOT, "nexus");
      break;
    case "todo":
      scope = "HERMETIC";
      baseDir = resolveOrgPath(join(AGENCE_ROOT, "hermetic"), org);
      break;
    case "task":
    case "job":
      scope = "ORGANIC";
      baseDir = join(AGENCE_ROOT, "organic");
      break;
    default:
      scope = "SYNTHETIC";
      baseDir = resolveOrgPath(join(AGENCE_ROOT, "synthetic"), org);
  }

  const dataDir = join(baseDir, `${cmdType}s`);
  return { scope, baseDir, dataDir };
}

// ─── INDEX.md creation ───────────────────────────────────────────────────────

function ensureIndex(dataDir: string, cmdType: string, scope: string, org: string): string {
  mkdirSync(dataDir, { recursive: true });
  const indexFile = join(dataDir, "INDEX.md");
  if (!existsSync(indexFile)) {
    const content = `# ${cmdType} Index (${scope}/${org})

Scope: ${scope}
Org: ${org}
Last Updated: ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}

## Entries

(entries will be listed here)
`;
    writeFileSync(indexFile, content);
  }
  return indexFile;
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

function knowledgeList(cmdType: string, dataDir: string): number {
  console.log(`[${cmdType}]`);

  // Try JSON index first
  const jsonIndex = join(dataDir, "INDEX.json");
  if (existsSync(jsonIndex)) {
    try {
      const data = JSON.parse(readFileSync(jsonIndex, "utf-8"));
      const entries = data.entries || [];
      if (entries.length > 0) {
        for (const e of entries) {
          const id = e.id || e.lesson_id || "?";
          const title = e.title || "(untitled)";
          const date = e.date || e.date_extracted || "";
          console.log(`  ${id}: ${title}${date ? ` (${date})` : ""}`);
        }
        return 0;
      }
    } catch {
      // fall through to markdown
    }
  }

  // Fallback: list markdown files
  if (!existsSync(dataDir)) {
    console.log("  (no entries)");
    return 0;
  }

  const files = readdirSync(dataDir)
    .filter(f => f.endsWith(".md") && f !== "INDEX.md")
    .sort();

  if (files.length === 0) {
    console.log("  (no entries)");
    return 0;
  }

  for (const f of files) {
    const name = basename(f, ".md");
    const firstLine = readFileSync(join(dataDir, f), "utf-8").split("\n")[0];
    const title = firstLine.replace(/^#\s*/, "");
    console.log(`  - ${name}: ${title}`);
  }

  return 0;
}

function knowledgeShow(cmdType: string, dataDir: string, item: string): number {
  if (!item) {
    console.error(`Usage: agence ^${cmdType} show <name/id>`);
    return 1;
  }

  // Try JSON
  const jsonPath = join(dataDir, `${item}.json`);
  if (existsSync(jsonPath)) {
    console.log(JSON.stringify(JSON.parse(readFileSync(jsonPath, "utf-8")), null, 2));
    return 0;
  }

  // Try markdown
  const mdPath = join(dataDir, `${item}.md`);
  if (existsSync(mdPath)) {
    console.log(readFileSync(mdPath, "utf-8"));
    return 0;
  }

  console.error(`Error: ${cmdType} '${item}' not found`);
  return 1;
}

function knowledgeAdd(cmdType: string, dataDir: string, title: string): number {
  if (!title) {
    console.error(`Usage: agence ^${cmdType} add <title>`);
    return 1;
  }

  const ts = Math.floor(Date.now() / 1000);
  const shortId = title.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 8);
  const entryId = `${ts}_${shortId}`;
  const entryFile = join(dataDir, `${entryId}.md`);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const content = `# ${title}

**Created**: ${now}  
**ID**: ${entryId}

## Content

Add your content here.
`;

  writeFileSync(entryFile, content);
  console.log(`✓ ${cmdType} entry created: ${entryId}`);
  console.log(`  File: ${entryFile}`);

  // Update INDEX.json if it exists
  const jsonIndex = join(dataDir, "INDEX.json");
  if (existsSync(jsonIndex)) {
    try {
      const data = JSON.parse(readFileSync(jsonIndex, "utf-8"));
      data.entries = data.entries || [];
      data.entries.push({ id: entryId, title, date: now });
      writeFileSync(jsonIndex, JSON.stringify(data, null, 2) + "\n");
    } catch {
      // best effort
    }
  }

  return 0;
}

// ─── Main Router ─────────────────────────────────────────────────────────────

const [cmdType, subCmd, ...rest] = process.argv.slice(2);

if (!cmdType) {
  console.error("Usage: airun commands <type> <list|show|add> [args...]");
  console.error("Types: lesson, plan, todo, fault, issue, task, job, log");
  process.exit(1);
}

const validTypes = ["lesson", "plan", "issue", "log", "fault", "todo", "task", "job"];
if (!validTypes.includes(cmdType)) {
  console.error(`Error: Unknown command type: ${cmdType}`);
  process.exit(1);
}

// Parse --org from args
let org = "l-agence.org";
const orgIdx = rest.indexOf("--org");
if (orgIdx >= 0 && rest[orgIdx + 1]) {
  org = rest[orgIdx + 1];
}

const { scope, dataDir } = resolveScope(cmdType as CmdType, org);
ensureIndex(dataDir, cmdType, scope, org);

const sub = (subCmd || "list") as SubCmd;
let exitCode = 0;

switch (sub) {
  case "list":
    exitCode = knowledgeList(cmdType, dataDir);
    break;
  case "show":
    exitCode = knowledgeShow(cmdType, dataDir, rest[0]);
    break;
  case "add": {
    const title = rest.filter(a => a !== "--org" && a !== org).join(" ");
    exitCode = knowledgeAdd(cmdType, dataDir, title);
    break;
  }
  default:
    console.error(`Error: Unknown subcommand: ${sub}`);
    console.error("Available: list, show, add");
    exitCode = 1;
}

process.exit(exitCode);
