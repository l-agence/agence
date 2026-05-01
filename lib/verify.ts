#!/usr/bin/env bun
// lib/verify.ts — MANUAL_VERIFY queue for ^integrate findings

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

// ─── Environment (lazy for testability) ──────────────────────────────────────

function getRoot(): string {
  return process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
}
function getQueueDir(): string {
  return process.env.AGENCE_VERIFY_DIR || join(getRoot(), "nexus", "manual-verify");
}
function getQueueFile(): string {
  return join(getQueueDir(), "queue.jsonl");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerifyItem {
  id: string;
  timestamp: string;
  severity: string;
  component: string;
  finding: string;
  fix: string;
  verify: string;
  source?: string;           // skill/session that produced this
  status: "pending" | "acked" | "rejected";
  acked_at?: string;
}

// ─── Queue Operations ────────────────────────────────────────────────────────

function ensureQueue(): void {
  const dir = getQueueDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Read all items from the JSONL queue */
export function readQueue(): VerifyItem[] {
  const file = getQueueFile();
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean);
  const items: VerifyItem[] = [];
  for (const line of lines) {
    try { items.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return items;
}

/** Write full queue back (after mutations) */
function writeQueue(items: VerifyItem[]): void {
  ensureQueue();
  const content = items.map(i => JSON.stringify(i)).join("\n") + (items.length ? "\n" : "");
  writeFileSync(getQueueFile(), content);
}

/** Add a single finding to the queue */
export function addItem(item: Omit<VerifyItem, "id" | "timestamp" | "status">): VerifyItem {
  ensureQueue();
  const entry: VerifyItem = {
    id: randomBytes(4).toString("hex"),
    timestamp: new Date().toISOString(),
    status: "pending",
    ...item,
  };
  appendFileSync(getQueueFile(), JSON.stringify(entry) + "\n");
  return entry;
}

/** Add multiple findings from ^integrate JSON output */
export function ingestFindings(json: string, source?: string): { added: number; skipped: number } {
  let findings: any[];
  try {
    const parsed = JSON.parse(json);
    findings = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Try extracting JSON array from text (LLM output may have preamble)
    const match = json.match(/\[[\s\S]*\]/);
    if (!match) return { added: 0, skipped: 0 };
    try { findings = JSON.parse(match[0]); } catch { return { added: 0, skipped: 0 }; }
  }

  let added = 0;
  let skipped = 0;

  for (const f of findings) {
    // Only queue MANUAL_VERIFY items (or items without explicit status)
    if (f.status && f.status !== "MANUAL_VERIFY") {
      skipped++;
      continue;
    }
    addItem({
      severity: f.severity || "medium",
      component: f.component || "unknown",
      finding: f.finding || f.description || String(f),
      fix: f.fix || "",
      verify: f.verify || "",
      source: source || f.source || undefined,
    });
    added++;
  }

  return { added, skipped };
}

/** Acknowledge an item by ID */
export function ackItem(id: string): boolean {
  const items = readQueue();
  const item = items.find(i => i.id === id);
  if (!item || item.status !== "pending") return false;
  item.status = "acked";
  item.acked_at = new Date().toISOString();
  writeQueue(items);
  return true;
}

/** Reject an item by ID */
export function rejectItem(id: string): boolean {
  const items = readQueue();
  const item = items.find(i => i.id === id);
  if (!item || item.status !== "pending") return false;
  item.status = "rejected";
  item.acked_at = new Date().toISOString();
  writeQueue(items);
  return true;
}

/** Get queue statistics */
export function queueStats(): { pending: number; acked: number; rejected: number; total: number } {
  const items = readQueue();
  return {
    pending: items.filter(i => i.status === "pending").length,
    acked: items.filter(i => i.status === "acked").length,
    rejected: items.filter(i => i.status === "rejected").length,
    total: items.length,
  };
}

/** Clear all acked/rejected items (compact the queue) */
export function compactQueue(): number {
  const items = readQueue();
  const pending = items.filter(i => i.status === "pending");
  const removed = items.length - pending.length;
  writeQueue(pending);
  return removed;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdList(args: string[]): number {
  const items = readQueue();
  const showAll = args.includes("--all");
  const display = showAll ? items : items.filter(i => i.status === "pending");

  if (display.length === 0) {
    console.log("[verify] Queue empty — no pending items.");
    return 0;
  }

  console.log(`[verify] ${display.length} item(s):\n`);
  const fmt = (s: string, w: number) => s.slice(0, w).padEnd(w);
  console.log(`  ${fmt("ID", 10)} ${fmt("SEV", 8)} ${fmt("COMPONENT", 16)} ${fmt("STATUS", 10)} FINDING`);
  console.log(`  ${fmt("—", 10)} ${fmt("—", 8)} ${fmt("—", 16)} ${fmt("—", 10)} ${"—".repeat(40)}`);

  for (const item of display) {
    const sev = item.severity.toUpperCase();
    console.log(`  ${fmt(item.id, 10)} ${fmt(sev, 8)} ${fmt(item.component, 16)} ${fmt(item.status, 10)} ${item.finding.slice(0, 60)}`);
  }

  const stats = queueStats();
  console.log(`\n  pending: ${stats.pending}  acked: ${stats.acked}  rejected: ${stats.rejected}  total: ${stats.total}`);
  return 0;
}

function cmdShow(args: string[]): number {
  const id = args[0];
  if (!id) {
    console.error("Usage: airun verify show <id>");
    return 2;
  }
  const items = readQueue();
  const item = items.find(i => i.id === id || i.id.startsWith(id));
  if (!item) {
    console.error(`[verify] Item not found: ${id}`);
    return 1;
  }
  console.log(JSON.stringify(item, null, 2));
  return 0;
}

function cmdAck(args: string[]): number {
  const id = args[0];
  if (!id) {
    console.error("Usage: airun verify ack <id>");
    return 2;
  }
  // Support prefix match
  const items = readQueue();
  const item = items.find(i => i.id === id || i.id.startsWith(id));
  if (!item) {
    console.error(`[verify] Item not found: ${id}`);
    return 1;
  }
  if (ackItem(item.id)) {
    console.log(`[verify] ✓ Acknowledged: ${item.id} (${item.component})`);
    return 0;
  }
  console.error(`[verify] Item already processed: ${item.id} (status=${item.status})`);
  return 1;
}

function cmdReject(args: string[]): number {
  const id = args[0];
  if (!id) {
    console.error("Usage: airun verify reject <id>");
    return 2;
  }
  const items = readQueue();
  const item = items.find(i => i.id === id || i.id.startsWith(id));
  if (!item) {
    console.error(`[verify] Item not found: ${id}`);
    return 1;
  }
  if (rejectItem(item.id)) {
    console.log(`[verify] ✗ Rejected: ${item.id} (${item.component})`);
    return 0;
  }
  console.error(`[verify] Item already processed: ${item.id} (status=${item.status})`);
  return 1;
}

function cmdIngest(args: string[]): number {
  // Read JSON from stdin or file arg
  let json: string;
  const source = args.find(a => a.startsWith("--source="))?.slice(9);
  const fileArg = args.find(a => !a.startsWith("-"));

  if (fileArg && existsSync(fileArg)) {
    json = readFileSync(fileArg, "utf-8");
  } else if (fileArg) {
    // Treat as inline JSON
    json = fileArg;
  } else {
    // Read from stdin
    json = readFileSync("/dev/stdin", "utf-8");
  }

  const { added, skipped } = ingestFindings(json, source);
  console.log(`[verify] Ingested: ${added} items queued, ${skipped} skipped (non-MANUAL_VERIFY)`);
  return added > 0 ? 0 : 1;
}

function cmdAdd(args: string[]): number {
  // Manual add: airun verify add --component X --severity high "finding text"
  let severity = "medium";
  let component = "unknown";
  let fix = "";
  let verify = "";
  let finding = "";
  let source: string | undefined;

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--severity": severity = args[++i] || "medium"; break;
      case "--component": component = args[++i] || "unknown"; break;
      case "--fix": fix = args[++i] || ""; break;
      case "--verify": verify = args[++i] || ""; break;
      case "--source": source = args[++i]; break;
      default:
        if (!args[i].startsWith("-")) {
          finding = args.slice(i).join(" ");
          i = args.length;
          continue;
        }
    }
    i++;
  }

  if (!finding) {
    console.error("Usage: airun verify add [--severity S] [--component C] <finding text>");
    return 2;
  }

  const item = addItem({ severity, component, finding, fix, verify, source });
  console.log(`[verify] + Added: ${item.id} (${severity}/${component})`);
  return 0;
}

function cmdCompact(): number {
  const removed = compactQueue();
  console.log(`[verify] Compacted: removed ${removed} resolved items.`);
  return 0;
}

function cmdStatus(): number {
  const stats = queueStats();
  console.log(`[verify] Queue status:`);
  console.log(`  pending:  ${stats.pending}`);
  console.log(`  acked:    ${stats.acked}`);
  console.log(`  rejected: ${stats.rejected}`);
  console.log(`  total:    ${stats.total}`);
  return 0;
}

function cmdHelp(): number {
  console.log(`verify — MANUAL_VERIFY queue for ^integrate findings

Usage:
  airun verify list [--all]         List pending items (--all includes resolved)
  airun verify show <id>            Show full details of an item
  airun verify ack <id>             Acknowledge item (mark verified)
  airun verify reject <id>          Reject item (false positive / won't fix)
  airun verify add [opts] <text>    Manually add an item
  airun verify ingest [file]        Ingest ^integrate JSON output (stdin or file)
  airun verify compact              Remove resolved items from queue
  airun verify status               Show queue statistics
  airun verify help                 This help

Add options:
  --severity <level>    critical|high|medium|low (default: medium)
  --component <name>    Component/module name
  --fix <text>          Suggested fix
  --verify <text>       Verification command/steps
  --source <name>       Source skill or session

Ingest options:
  --source=<name>       Tag items with source identifier

Environment:
  AGENCE_VERIFY_DIR    Queue directory (default: nexus/manual-verify/)

Workflow:
  1. Run ^integrate → produces JSON findings
  2. airun verify ingest < findings.json  (or pipe)
  3. airun verify list                     (review pending)
  4. Fix items manually, then: airun verify ack <id>
  5. airun verify compact                  (clean up resolved)
`);
  return 0;
}

// ─── Main Router ─────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  let exitCode = 0;
  switch (cmd) {
    case "list":    exitCode = cmdList(args); break;
    case "show":    exitCode = cmdShow(args); break;
    case "ack":     exitCode = cmdAck(args); break;
    case "reject":  exitCode = cmdReject(args); break;
    case "ingest":  exitCode = cmdIngest(args); break;
    case "add":     exitCode = cmdAdd(args); break;
    case "compact": exitCode = cmdCompact(); break;
    case "status":  exitCode = cmdStatus(); break;
    case "help":
    case "--help":
    case "-h":
      exitCode = cmdHelp();
      break;
    default:
      if (!cmd) {
        exitCode = cmdList([]);
      } else {
        console.error(`[verify] Unknown command: ${cmd}`);
        exitCode = 2;
      }
  }

  process.exit(exitCode);
}
