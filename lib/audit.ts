#!/usr/bin/env bun
// lib/audit.ts — Ledger audit + decision review module (Bun)
//
// Provides audit commands over .ailedger data (both local and shard tiers)
// and cross-references with pipe-pane session captures.
//
// Usage:
//   bun run lib/audit.ts trail [--limit N] [--type T] [--shard]
//   bun run lib/audit.ts show <seq|hash>
//   bun run lib/audit.ts agent <name> [--limit N]
//   bun run lib/audit.ts session <id> [--limit N]
//   bun run lib/audit.ts diff <local-hash>
//   bun run lib/audit.ts stats [--all]
//
// Exit codes: 0 = success, 1 = error

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const LOCAL_DIR  = process.env.AGENCE_LEDGER_DIR || join(AGENCE_ROOT, "nexus", ".ailedger");
const SHARD_FILE = process.env.AGENCE_SHARD_LEDGER || join(AGENCE_ROOT, ".ailedger");
const SESSIONS_DIR = join(AGENCE_ROOT, "nexus", ".aisessions");

// ─── Types ───────────────────────────────────────────────────────────────────

interface LedgerEntry {
  seq: number;
  timestamp: string;
  session_id: string;
  decision_type: string;
  agent: string;
  rationale_tag: string;
  task_id: string;
  command: string;
  exit_code: number;
  prev_hash: string;
  // Shard-only fields
  local_hash?: string;
  upstream_hash?: string;
  prev_upstream?: string;
  redacted?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function loadEntries(source: "local" | "shard", month?: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  if (source === "shard") {
    if (!existsSync(SHARD_FILE)) return entries;
    const lines = readFileSync(SHARD_FILE, "utf-8").trimEnd().split("\n").filter(Boolean);
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    return entries;
  }

  // Local: load specific month or all
  if (!existsSync(LOCAL_DIR)) return entries;
  const files = month
    ? [`${month}.jsonl`]
    : readdirSync(LOCAL_DIR).filter(f => f.endsWith(".jsonl")).sort();

  for (const f of files) {
    const fp = join(LOCAL_DIR, f);
    if (!existsSync(fp)) continue;
    const lines = readFileSync(fp, "utf-8").trimEnd().split("\n").filter(Boolean);
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }
  return entries;
}

function findSessionLog(sessionId: string): string | null {
  if (!existsSync(SESSIONS_DIR)) return null;
  // Pipe-pane logs: nexus/.aisessions/{sid}.typescript
  // Session metadata: nexus/.aisessions/{agent}/YYYY-MM-DD.jsonl
  const files = readdirSync(SESSIONS_DIR);

  // Direct match on typescript file containing session_id
  for (const f of files) {
    if (f.includes(sessionId) && f.endsWith(".typescript")) {
      return join(SESSIONS_DIR, f);
    }
  }

  // Check subdirectories (per-agent daily logs)
  for (const f of files) {
    const subDir = join(SESSIONS_DIR, f);
    try {
      const stat = Bun.file(subDir);
      // Skip files, look at directories
    } catch { /* skip */ }
  }

  return null;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  route:    "🔀",
  commit:   "📦",
  push:     "🚀",
  launch:   "🚀",
  execute:  "⚡",
  fault:    "❌",
  kill:     "🛑",
  verify:   "✅",
  inject:   "💉",
  plan:     "📋",
  policy:   "🔒",
};

function fmtEntry(e: LedgerEntry, verbose: boolean = false): string {
  const icon = TYPE_ICONS[e.decision_type] || "•";
  const ts = e.timestamp.replace("T", " ").replace("Z", "");
  const redacted = e.redacted ? " [REDACTED]" : "";
  const cmd = e.command ? ` → ${e.command.slice(0, 80)}${e.command.length > 80 ? "…" : ""}` : "";
  const exit = e.exit_code >= 0 ? ` (exit=${e.exit_code})` : "";
  const task = e.task_id ? ` task=${e.task_id}` : "";

  let line = `${icon} #${e.seq} ${ts}  ${e.decision_type.padEnd(8)} @${e.agent.padEnd(10)} ${e.rationale_tag}${cmd}${exit}${task}${redacted}`;

  if (verbose) {
    line += `\n   session=${e.session_id}  prev_hash=${e.prev_hash.slice(0, 12)}…`;
    if (e.local_hash) line += `\n   local_hash=${e.local_hash.slice(0, 12)}…  upstream_hash=${e.upstream_hash?.slice(0, 12)}…`;
  }

  return line;
}

function fmtHeader(title: string): string {
  return `\n${"═".repeat(78)}\n  ${title}\n${"═".repeat(78)}`;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdTrail(limit: number, typeFilter?: string, useShard: boolean = false): number {
  const source = useShard ? "shard" : "local";
  let entries = loadEntries(source);

  if (typeFilter) {
    entries = entries.filter(e => e.decision_type === typeFilter);
  }

  if (entries.length === 0) {
    console.log(`No entries in ${source} ledger${typeFilter ? ` (type=${typeFilter})` : ""}`);
    return 0;
  }

  // Take last N
  const shown = entries.slice(-limit);
  const skipped = entries.length - shown.length;

  console.log(fmtHeader(`AUDIT TRAIL (${source}) — ${entries.length} total entries`));
  if (skipped > 0) console.log(`  (showing last ${limit} of ${entries.length}, ${skipped} earlier entries hidden)\n`);

  for (const e of shown) {
    console.log(fmtEntry(e));
  }
  console.log("");
  return 0;
}

function cmdShow(target: string): number {
  // target can be seq number or hash prefix
  const localEntries = loadEntries("local");
  const shardEntries = loadEntries("shard");

  let found: LedgerEntry | undefined;
  let shardMatch: LedgerEntry | undefined;
  let source = "local";

  // Search by seq number
  const seqNum = parseInt(target, 10);
  if (!isNaN(seqNum)) {
    found = localEntries.find(e => e.seq === seqNum);
    if (!found) {
      found = shardEntries.find(e => e.seq === seqNum);
      source = "shard";
    }
  }

  // Search by hash prefix (prev_hash, local_hash, upstream_hash)
  if (!found) {
    for (const e of localEntries) {
      if (e.prev_hash.startsWith(target)) { found = e; break; }
    }
    if (!found) {
      for (const e of shardEntries) {
        if (e.upstream_hash?.startsWith(target) || e.local_hash?.startsWith(target)) {
          found = e;
          source = "shard";
          break;
        }
      }
    }
  }

  if (!found) {
    console.error(`No entry found matching: ${target}`);
    return 1;
  }

  // Find surrounding context (±3 entries in same session)
  const allSrc = source === "local" ? localEntries : shardEntries;
  const idx = allSrc.indexOf(found);
  const contextBefore = allSrc.slice(Math.max(0, idx - 3), idx);
  const contextAfter = allSrc.slice(idx + 1, idx + 4);

  // Find shard match by local_hash if we found a local entry
  if (source === "local") {
    const lineHash = sha256(JSON.stringify(found));
    shardMatch = shardEntries.find(e => e.local_hash === lineHash);
  }

  console.log(fmtHeader(`DECISION DETAIL — #${found.seq} (${source})`));
  console.log("");
  console.log(JSON.stringify(found, null, 2));

  // Shard cross-reference
  if (shardMatch) {
    console.log(`\n  SHARD MATCH: seq=${shardMatch.seq}  redacted=${shardMatch.redacted}  upstream_hash=${shardMatch.upstream_hash?.slice(0, 16)}…`);
  } else if (source === "local") {
    console.log("\n  SHARD: not found (withheld or not yet synced)");
  }

  // Context
  if (contextBefore.length > 0 || contextAfter.length > 0) {
    console.log(`\n  CONTEXT (±3 entries):`);
    for (const e of contextBefore) console.log(`    ↑ ${fmtEntry(e)}`);
    console.log(`    ★ ${fmtEntry(found)}`);
    for (const e of contextAfter) console.log(`    ↓ ${fmtEntry(e)}`);
  }

  // Session log link
  const logPath = findSessionLog(found.session_id);
  if (logPath) {
    console.log(`\n  PIPE-PANE LOG: ${logPath}`);
  }
  console.log("");

  return 0;
}

function cmdAgent(agentName: string, limit: number): number {
  let entries = loadEntries("local");
  entries = entries.filter(e => e.agent === agentName);

  if (entries.length === 0) {
    console.log(`No entries for agent: ${agentName}`);
    return 0;
  }

  const shown = entries.slice(-limit);
  console.log(fmtHeader(`AGENT AUDIT: @${agentName} — ${entries.length} total decisions`));

  // Summary stats
  const types: Record<string, number> = {};
  const sessions = new Set<string>();
  for (const e of entries) {
    types[e.decision_type] = (types[e.decision_type] || 0) + 1;
    sessions.add(e.session_id);
  }
  console.log(`\n  Sessions: ${sessions.size}  |  Decision types: ${Object.entries(types).map(([k, v]) => `${k}(${v})`).join(", ")}\n`);

  for (const e of shown.slice(-limit)) {
    console.log(fmtEntry(e));
  }
  console.log("");
  return 0;
}

function cmdSession(sessionId: string, limit: number): number {
  let entries = loadEntries("local");
  entries = entries.filter(e => e.session_id === sessionId);

  if (entries.length === 0) {
    console.log(`No ledger entries for session: ${sessionId}`);
    return 0;
  }

  const shown = entries.slice(-limit);
  console.log(fmtHeader(`SESSION AUDIT: ${sessionId} — ${entries.length} decisions`));

  // Agent breakdown
  const agents = new Set(entries.map(e => e.agent));
  const firstTs = entries[0].timestamp;
  const lastTs = entries[entries.length - 1].timestamp;
  console.log(`\n  Agents: ${[...agents].join(", ")}  |  Span: ${firstTs} → ${lastTs}\n`);

  for (const e of shown) {
    console.log(fmtEntry(e));
  }

  // Pipe-pane log link
  const logPath = findSessionLog(sessionId);
  if (logPath) {
    console.log(`\n  PIPE-PANE LOG: ${logPath}`);
    // Show size
    try {
      const content = readFileSync(logPath, "utf-8");
      const lines = content.split("\n").length;
      console.log(`  Log size: ${lines} lines, ${(content.length / 1024).toFixed(1)} KB`);
    } catch { /* skip */ }
  }
  console.log("");
  return 0;
}

function cmdDiff(localHash: string): number {
  const shardEntries = loadEntries("shard");
  const match = shardEntries.find(e =>
    e.local_hash?.startsWith(localHash) || e.upstream_hash?.startsWith(localHash)
  );

  if (!match) {
    console.error(`No shard entry matching hash: ${localHash}`);
    return 1;
  }

  // Find the original local entry by reconstructing from local ledger
  const localEntries = loadEntries("local");
  let localMatch: LedgerEntry | undefined;
  for (const e of localEntries) {
    const lineHash = sha256(JSON.stringify(e));
    if (lineHash === match.local_hash) {
      localMatch = e;
      break;
    }
  }

  console.log(fmtHeader(`DIFF: local ↔ shard`));

  if (!localMatch) {
    console.log("\n  LOCAL: entry not found (may be in a different month's ledger)");
    console.log("\n  SHARD:");
    console.log(JSON.stringify(match, null, 2));
    console.log("");
    return 0;
  }

  console.log(`\n  Redacted: ${match.redacted ? "YES" : "no"}`);
  console.log(`  local_hash:    ${match.local_hash}`);
  console.log(`  upstream_hash: ${match.upstream_hash}`);

  // Field-by-field diff
  const localFields = localMatch as Record<string, unknown>;
  const shardFields = match as Record<string, unknown>;
  const diffFields: string[] = [];

  for (const key of Object.keys(localFields)) {
    if (key === "prev_hash") continue; // always different (different chains)
    if (localFields[key] !== shardFields[key]) {
      diffFields.push(key);
    }
  }

  if (diffFields.length === 0 && !match.redacted) {
    console.log("\n  ✅ No differences (clean pass-through)");
  } else {
    console.log(`\n  Changed fields (${diffFields.length}):`);
    for (const f of diffFields) {
      console.log(`    ${f}:`);
      console.log(`      LOCAL: ${JSON.stringify(localFields[f])}`);
      console.log(`      SHARD: ${JSON.stringify(shardFields[f])}`);
    }
  }
  console.log("");
  return 0;
}

function cmdStats(allMonths: boolean): number {
  const localEntries = loadEntries("local", allMonths ? undefined : currentMonth());
  const shardEntries = loadEntries("shard");

  console.log(fmtHeader("LEDGER STATISTICS"));

  // Local stats
  const localTypes: Record<string, number> = {};
  const localAgents: Record<string, number> = {};
  const localSessions = new Set<string>();
  for (const e of localEntries) {
    localTypes[e.decision_type] = (localTypes[e.decision_type] || 0) + 1;
    localAgents[e.agent] = (localAgents[e.agent] || 0) + 1;
    localSessions.add(e.session_id);
  }

  console.log(`\n  LOCAL (${allMonths ? "all months" : currentMonth()}):`);
  console.log(`    Entries:  ${localEntries.length}`);
  console.log(`    Sessions: ${localSessions.size}`);
  console.log(`    By type:  ${Object.entries(localTypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(", ")}`);
  console.log(`    By agent: ${Object.entries(localAgents).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(", ")}`);

  // Shard stats
  const shardRedacted = shardEntries.filter(e => e.redacted).length;
  console.log(`\n  SHARD:`);
  console.log(`    Entries:  ${shardEntries.length}`);
  console.log(`    Redacted: ${shardRedacted} (${shardEntries.length > 0 ? ((shardRedacted / shardEntries.length) * 100).toFixed(1) : 0}%)`);

  // Ledger file listing
  if (existsSync(LOCAL_DIR)) {
    const files = readdirSync(LOCAL_DIR).filter(f => f.endsWith(".jsonl")).sort();
    if (files.length > 0) {
      console.log(`\n  LEDGER FILES:`);
      for (const f of files) {
        const fp = join(LOCAL_DIR, f);
        const lines = readFileSync(fp, "utf-8").trimEnd().split("\n").filter(Boolean).length;
        console.log(`    ${f}: ${lines} entries`);
      }
    }
  }

  // Pipe-pane logs
  if (existsSync(SESSIONS_DIR)) {
    const typescripts = readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".typescript"));
    if (typescripts.length > 0) {
      console.log(`\n  PIPE-PANE LOGS: ${typescripts.length} captures`);
      for (const f of typescripts.slice(-5)) {
        const fp = join(SESSIONS_DIR, f);
        try {
          const size = readFileSync(fp).length;
          console.log(`    ${f}: ${(size / 1024).toFixed(1)} KB`);
        } catch { console.log(`    ${f}: (unreadable)`); }
      }
      if (typescripts.length > 5) console.log(`    ... and ${typescripts.length - 5} more`);
    }
  }

  console.log("");
  return 0;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [subCmd, ...args] = process.argv.slice(2);

function parseFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

if (!subCmd) {
  console.error("Usage: bun run lib/audit.ts <command> [options]");
  console.error("");
  console.error("Commands:");
  console.error("  trail [--limit N] [--type T] [--shard]   Decision timeline");
  console.error("  show <seq|hash>                          Detail view + context");
  console.error("  agent <name> [--limit N]                 Decisions by agent");
  console.error("  session <id> [--limit N]                 Decisions in session");
  console.error("  diff <local-hash>                        Compare local ↔ shard");
  console.error("  stats [--all]                            Ledger statistics");
  process.exit(1);
}

const limit = parseInt(parseFlag("--limit") || "30", 10);
let exitCode = 0;

switch (subCmd) {
  case "trail":
    exitCode = cmdTrail(limit, parseFlag("--type"), hasFlag("--shard"));
    break;
  case "show":
    exitCode = cmdShow(args[0] || "");
    break;
  case "agent":
    exitCode = cmdAgent(args[0] || "", limit);
    break;
  case "session":
    exitCode = cmdSession(args[0] || "", limit);
    break;
  case "diff":
    exitCode = cmdDiff(args[0] || "");
    break;
  case "stats":
    exitCode = cmdStats(hasFlag("--all"));
    break;
  default:
    console.error(`Error: Unknown command: ${subCmd}`);
    exitCode = 1;
}

process.exit(exitCode);
