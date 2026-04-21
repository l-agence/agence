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
import { resolveOrg } from "./org.ts";

const AI_ROOT = process.env.AI_ROOT || process.env.AGENCE_ROOT || join(import.meta.dir, "..");
const AGENCE_ROOT = process.env.AGENCE_ROOT || AI_ROOT;

// ─── Scope Resolution ────────────────────────────────────────────────────────

type CmdType = "lesson" | "plan" | "issue" | "log" | "fault" | "todo" | "note" | "task" | "job" | "workflow" | "project";
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
    case "note":
      scope = "HERMETIC";
      baseDir = resolveOrgPath(join(AGENCE_ROOT, "hermetic"), org);
      break;
    case "task":
    case "job":
    case "workflow":
    case "project":
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

  // Try root-level organic JSON (e.g. organic/tasks.json, organic/workflows.json)
  const rootJson = join(AGENCE_ROOT, "organic", `${cmdType}s.json`);
  if (existsSync(rootJson)) {
    try {
      const data = JSON.parse(readFileSync(rootJson, "utf-8"));
      // Root JSON may be: array, {entries:[...]}, or {<plural>:[...]} (e.g. {workflows:[...]})
      const plural = `${cmdType}s`;
      const entries = Array.isArray(data) ? data : (data[plural] || data.entries || []);
      if (entries.length > 0) {
        for (const e of entries) {
          const id = e.id || e.fault_id || e.lesson_id || "?";
          const title = e.title || "(untitled)";
          const extra = e.state ? ` [${e.state}]` : (e.status ? ` [${e.status}]` : "");
          const date = e.date || e.date_extracted || e.timestamp || "";
          console.log(`  ${id}: ${title}${extra}${date ? ` (${date})` : ""}`);
        }
        return 0;
      }
    } catch { /* fall through */ }
  }

  // Try JSON index in data dir
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

// ─── Status Views ────────────────────────────────────────────────────────────

function prioStars(p: number): string {
  return "★".repeat(Math.min(Math.max(p, 0), 5)) || "-";
}

interface Task {
  id: string; repo?: string; title?: string; state?: string;
  priority?: number; agent?: string; stars?: number; heat?: number;
}

interface Workflow {
  id: string; title?: string; tasks: string[];
  completed?: number; total?: number; completion_pct?: number;
}

interface Project {
  id: string; title?: string; workflows: string[]; status?: string;
  completed_tasks?: number; total_tasks?: number; completion_pct?: number;
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

interface IndexEntry {
  id?: string; title?: string; source?: string; description?: string; date?: string;
}

interface Phase {
  id: string | number; name?: string; version?: string; status?: string;
}

function statusSymbol(status: string): string {
  switch (status) {
    case "complete": case "done": return "-";
    case "in-progress": case "active": return "%";
    case "queued": case "pending": return "~";
    case "blocked": case "failed": return "!";
    default: return "~";
  }
}

function knowledgeStatusIndex(cmdType: string, dataDir: string): number {
  const indexPath = join(dataDir, "INDEX.json");
  if (existsSync(indexPath)) {
    const data = loadJson<{ entries?: IndexEntry[] }>(indexPath);
    const entries = data?.entries || [];
    console.log(`[${cmdType} status] (${entries.length} entries)\n`);
    if (entries.length > 0) {
      for (const e of entries) {
        const label = e.id || e.title || e.source || "?";
        const desc = e.title || e.description || e.date || "";
        console.log(`  ~ ${label}  ${desc}`);
      }
    } else {
      console.log("  (no entries)");
    }
  } else {
    // Count .md files
    const { readdirSync } = require("fs");
    try {
      const files = readdirSync(dataDir).filter((f: string) => f.endsWith(".md") && f !== "INDEX.md");
      console.log(`[${cmdType} status] (${files.length} entries)\n`);
      if (files.length > 0) {
        for (const f of files) {
          const name = f.replace(/\.md$/, "");
          console.log(`  ~ ${name}`);
        }
      } else {
        console.log("  (no entries)");
      }
    } catch {
      console.log(`[${cmdType} status] (0 entries)\n`);
      console.log("  (no entries)");
    }
  }
  console.log("");
  return 0;
}

function knowledgeStatusPlan(dataDir: string): number {
  const phasesPath = join(dataDir, "phases.json");
  const data = loadJson<{ phases?: Phase[] }>(phasesPath);
  if (data?.phases) {
    console.log(`[plan status] (${data.phases.length} phases)\n`);
    for (const p of data.phases) {
      const sym = statusSymbol(p.status || "unknown");
      const ver = (p.version || "").padEnd(6);
      const name = (p.name || "").padEnd(30);
      console.log(`  ${sym} ${ver} ${name} [${p.status || "unknown"}] (phase ${p.id})`);
    }
  } else {
    return knowledgeStatusIndex("plan", dataDir);
  }
  console.log("");
  return 0;
}

function knowledgeStatus(cmdType: string, dataDir: string): number {
  const tasksData = loadJson<{ tasks: Task[] }>(join(AGENCE_ROOT, "organic", "tasks.json"));
  const wfData = loadJson<{ workflows: Workflow[] }>(join(AGENCE_ROOT, "organic", "workflows.json"));
  const projData = loadJson<{ projects: Project[] }>(join(AGENCE_ROOT, "organic", "projects.json"));

  const taskMap = new Map<string, Task>();
  if (tasksData?.tasks) {
    for (const t of tasksData.tasks) taskMap.set(t.id, t);
  }

  switch (cmdType) {
    case "task": {
      const tasks = tasksData?.tasks || [];
      console.log(`[task status] (${tasks.length} tasks)\n`);
      for (const t of tasks) {
        const s = t.state || "~";
        const prio = prioStars(t.priority || 0);
        let ref = t.id;
        if (t.repo) ref += `.${t.repo}`;
        if (t.agent) ref += `<@${t.agent}>`;
        console.log(`  ${s} ${prio.padEnd(5)} ${ref.padEnd(35)} ${t.title || ""}`);
      }
      console.log("");
      return 0;
    }
    case "workflow": {
      const wfs = wfData?.workflows || [];
      console.log(`[workflow status] (${wfs.length} workflows)\n`);
      for (const wf of wfs) {
        const pct = wf.completion_pct ?? 0;
        const ws = pct === 100 ? "-" : (wf.completed ?? 0) > 0 ? "%" : "~";
        const chain = wf.tasks.map(tid => {
          const t = taskMap.get(tid);
          const ts = t?.state || "~";
          let tref = tid;
          if (t?.repo) tref += `.${t.repo}`;
          if (t?.agent) tref += `@${t.agent}`;
          return `${ts}:${tref}`;
        }).join(" + ");
        console.log(`  ${ws} ${wf.id} (${wf.title || ""}) [${wf.completed ?? 0}/${wf.total ?? 0} ${pct}%] = ${chain}`);
      }
      console.log("");
      return 0;
    }
    case "project": {
      const projs = projData?.projects || [];
      console.log(`[project status] (${projs.length} projects)\n`);
      for (const p of projs) {
        const pct = p.completion_pct ?? 0;
        const ps = pct === 100 ? "-" : (p.completed_tasks ?? 0) > 0 ? "%" : "~";
        console.log(`  ${ps} ${p.id} (${p.title || ""}) [${p.completed_tasks ?? 0}/${p.total_tasks ?? 0} ${pct}%] status=${p.status || "unknown"}`);
        for (const wfid of p.workflows) {
          const wf = wfData?.workflows?.find(w => w.id === wfid);
          if (wf) {
            const wpct = wf.completion_pct ?? 0;
            const wfs = wpct === 100 ? "-" : (wf.completed ?? 0) > 0 ? "%" : "~";
            console.log(`    ${wfs} ${wf.id} [${wf.completed ?? 0}/${wf.total ?? 0} ${wpct}%]`);
          } else {
            console.log(`    ~ ${wfid} (no data)`);
          }
        }
      }
      console.log("");
      return 0;
    }
    case "plan":
      return knowledgeStatusPlan(dataDir);
    case "todo":
    case "note":
    case "job":
    case "issue":
      return knowledgeStatusIndex(cmdType, dataDir);
    default:
      console.error(`Error: 'status' subcommand not supported for ${cmdType}`);
      console.error("Supported: task, workflow, project, todo, job, issue, plan, session");
      return 1;
  }
}

// ─── Main Router ─────────────────────────────────────────────────────────────

const [cmdType, subCmd, ...rest] = process.argv.slice(2);

if (!cmdType) {
  console.error("Usage: airun commands <type> <list|show|add|status> [args...]");
  console.error("Types: lesson, plan, todo, note, fault, issue, task, job, log, workflow, project");
  process.exit(1);
}

const validTypes = ["lesson", "plan", "issue", "log", "fault", "todo", "note", "task", "job", "workflow", "project"];
if (!validTypes.includes(cmdType)) {
  console.error(`Error: Unknown command type: ${cmdType}`);
  process.exit(1);
}

// Parse --org from args
let org = resolveOrg(AGENCE_ROOT);
const orgIdx = rest.indexOf("--org");
if (orgIdx >= 0 && rest[orgIdx + 1]) {
  org = rest[orgIdx + 1];
}

const { scope, dataDir } = resolveScope(cmdType as CmdType, org);
ensureIndex(dataDir, cmdType, scope, org);

const sub = (subCmd || "list") as SubCmd | "status";
let exitCode = 0;

switch (sub) {
  case "list":
    exitCode = knowledgeList(cmdType, dataDir);
    break;
  case "status":
    exitCode = knowledgeStatus(cmdType, dataDir);
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
    console.error("Available: list, status, show, add");
    exitCode = 1;
}

process.exit(exitCode);
