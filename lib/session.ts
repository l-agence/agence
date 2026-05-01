#!/usr/bin/env bun
// lib/session.ts — Session management module (Bun)
//
// Usage (from bash):
//   airun session list
//   airun session status <session-id>
//   airun session init <session-id> [role] [agent] [shell] [git-root]
//   airun session resume <session-id>
//   airun session prune [--days N] [--archive] [--dry-run]
//   airun session gc [--dry-run]          Circular buffer eviction
//   airun session gc-status               Show buffer usage vs caps
//
// Circular buffer caps (env or defaults):
//   AGENCE_CAP_SESSIONS=200    max session files (.meta.json + .typescript pairs)
//   AGENCE_CAP_SIGNALS=500     max signal files
//   AGENCE_CAP_LOGS=100        max log files
//   AGENCE_CAP_COST=90         max cost JSONL files (days)
//   AGENCE_CAP_TOTAL_MB=100    max total nexus ephemeral size (MB)
//
// Exit codes: 0 = success, 1 = error

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, statSync, copyFileSync, unlinkSync, rmdirSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import { resolveOrg } from "./org.ts";

// Resolve paths from env (set by lib/env.sh) or fallback
const AI_ROOT = process.env.AI_ROOT || process.env.AGENCE_ROOT || join(import.meta.dir, "..");
const SESSION_BASE = join(AI_ROOT, "nexus", ".aisessions");

/** Recursively find all files matching a predicate under a directory */
function findFiles(dir: string, predicate: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, predicate));
    } else if (predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/** Find a meta.json file for a session ID across day-sharded subdirs */
function findMetaPath(sid: string): string | null {
  const paths = findFiles(SESSION_BASE, (name) => name === `${sid}.meta.json`);
  return paths.length > 0 ? paths[0] : null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionMeta {
  session_id: string;
  agent: string;
  role: string;
  shell: string;
  git_root: string;
  timestamp: string;
  status: string;
  exit_code: number | null;
  verification_status: string;
  command?: string;
  typescript?: string;
  task_id?: string;
  tangent_id?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readMeta(sid: string): SessionMeta | null {
  const metaFile = findMetaPath(sid);
  if (!metaFile) return null;
  try {
    return JSON.parse(readFileSync(metaFile, "utf-8"));
  } catch {
    return null;
  }
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Return day-sharded session dir (DD/) with monthly recycling */
export function sessionDayDir(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dayDir = join(SESSION_BASE, day);
  mkdirSync(dayDir, { recursive: true });

  const marker = join(dayDir, ".month");
  if (existsSync(marker)) {
    const stored = readFileSync(marker, "utf-8").trim();
    if (stored !== currentMonth) {
      for (const f of readdirSync(dayDir)) {
        if (f.endsWith(".typescript") || f.endsWith(".meta.json")) {
          unlinkSync(join(dayDir, f));
        }
      }
      writeFileSync(marker, currentMonth + "\n");
    }
  } else {
    writeFileSync(marker, currentMonth + "\n");
  }
  return dayDir;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function sessionList(filterArgs?: string[]): number {
  if (!existsSync(SESSION_BASE)) {
    console.error(`[SESSION] ✗ No sessions directory: ${SESSION_BASE}`);
    return 1;
  }

  // Parse filter: --task <id>
  let taskFilter: string | undefined;
  if (filterArgs) {
    for (let i = 0; i < filterArgs.length; i++) {
      if (filterArgs[i] === "--task" && filterArgs[i + 1]) taskFilter = filterArgs[++i];
    }
  }

  const metaFiles = findFiles(SESSION_BASE, (f) => f.endsWith(".meta.json")).sort().reverse();

  if (metaFiles.length === 0) {
    console.log(`No sessions found in ${SESSION_BASE}`);
    return 0;
  }

  // Header
  const hdr = [
    "SESSION ID".padEnd(45),
    "TASK".padEnd(10),
    "COMMAND".padEnd(35),
    "EXIT".padEnd(6),
    "TIMESTAMP",
  ].join(" ");
  console.log(hdr);
  console.log("=".repeat(125));

  let shown = 0;
  for (const file of metaFiles) {
    const sid = basename(file, ".meta.json");
    const meta = readMeta(sid);
    if (!meta) continue;

    // Apply task filter
    if (taskFilter && meta.task_id !== taskFilter && !meta.task_id?.startsWith(taskFilter)) continue;

    const task = (meta.task_id || "").slice(0, 8);
    const cmd = (meta.command || "").slice(0, 35);
    const exit = meta.exit_code;
    const exitStr = exit === 0 ? `✓ ${exit}` : exit != null ? `✗ ${exit}` : "?";
    const ts = (meta.timestamp || "").slice(0, 20);

    console.log(
      `${sid.padEnd(45)} ${task.padEnd(10)} ${cmd.padEnd(35)} ${exitStr.padEnd(6)} ${ts}`
    );
    shown++;
  }

  if (taskFilter && shown === 0) {
    console.log(`(no sessions matching task ${taskFilter})`);
  }

  return 0;
}

function sessionInit(
  sid: string,
  role = "shared",
  agent = "unknown",
  shell = "bash",
  gitRoot = AI_ROOT
): number {
  if (!sid) {
    console.error("[SESSION] ✗ init requires a session ID");
    console.error("Usage: session init <session-id> [role] [agent] [shell] [git-root]");
    return 1;
  }

  const dayDir = sessionDayDir();

  const metaFile = join(dayDir, `${sid}.meta.json`);
  const typescriptFile = join(dayDir, `${sid}.typescript`);

  const meta: SessionMeta = {
    session_id: sid,
    agent,
    role,
    shell,
    git_root: gitRoot,
    timestamp: isoNow(),
    status: "recording",
    exit_code: null,
    verification_status: "pending",
    typescript: typescriptFile,
  };

  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");

  console.log(`[SESSION] ✓ Initialized: ${sid}  agent=${agent}  role=${role}`);
  console.log(`[SESSION]   typescript → ${typescriptFile}`);
  return 0;
}

function sessionStatus(sid: string): number {
  if (!sid) {
    console.error("ERROR: Session ID required");
    console.error("Usage: aisession status <sessionid>");
    return 1;
  }

  // Search day-sharded subdirs for typescript file
  const tsFiles = findFiles(SESSION_BASE, (name) => name === `${sid}.typescript`);
  const typescriptFile = tsFiles.length > 0 ? tsFiles[0] : null;
  const meta = readMeta(sid);

  if (!typescriptFile || !existsSync(typescriptFile)) {
    console.error(`[SESSION] ✗ Session not found: ${sid}`);
    console.error(`[SESSION]   Searched: ${SESSION_BASE}/*/`);
    return 1;
  }

  if (!meta) {
    console.error(`[SESSION] ✗ Session metadata missing: ${sid}`);
    return 1;
  }

  const stat = statSync(typescriptFile);
  const lines = readFileSync(typescriptFile, "utf-8").split("\n").length;

  console.log("");
  console.log("=".repeat(80));
  console.log("  SESSION STATUS");
  console.log("=".repeat(80));
  console.log("");
  console.log(`Session ID:   ${sid}`);
  console.log(`Timestamp:    ${meta.timestamp}`);
  console.log(`Command:      ${meta.command || "(none)"}`);
  console.log(`Exit Code:    ${meta.exit_code ?? "?"}`);
  console.log(`Status:       ${meta.verification_status}`);
  console.log(`Agent:        ${meta.agent}`);
  console.log(`Role:         ${meta.role}`);
  if (meta.task_id) console.log(`Task ID:      ${meta.task_id}`);
  if (meta.tangent_id) console.log(`Tangent ID:   ${meta.tangent_id}`);
  console.log(`File:         ${typescriptFile}`);
  console.log(`Size:         ${stat.size} bytes`);
  console.log(`Lines:        ${lines}`);
  console.log("");

  // Print exit status summary
  if (meta.exit_code === 0) {
    console.log("  Status: ✓ SUCCESS (exit code 0)");
  } else if (meta.exit_code != null) {
    console.log(`  Status: ✗ FAILED (exit code ${meta.exit_code})`);
  } else {
    console.log("  Status: ? UNKNOWN (exit code not yet recorded)");
  }
  console.log("");

  return 0;
}

function sessionResume(sid: string): number {
  if (!sid) {
    console.error("ERROR: Session ID required");
    console.error("Usage: session resume <sessionid>");
    return 1;
  }

  const meta = readMeta(sid);
  if (!meta) {
    console.error(`[SESSION] ✗ Session not found: ${sid}`);
    return 1;
  }

  // Output as eval-able shell exports
  console.log(`export AI_CURRENT_SESSION="${sid}"`);
  console.log(`export AI_LAST_COMMAND="${(meta.command || "").replace(/"/g, '\\"')}"`);
  console.log(`export AI_LAST_EXIT="${meta.exit_code ?? ""}"`);

  // Also print human-readable to stderr
  console.error("");
  console.error(`✓ Session resumed: ${sid}`);
  console.error(`  Command:   ${meta.command || "(none)"}`);
  console.error(`  Exit Code: ${meta.exit_code ?? "?"}`);
  console.error("");

  return 0;
}

// ─── End/Finalize ────────────────────────────────────────────────────────────

export function sessionEnd(sid: string, exitCode?: number): number {
  if (!sid) {
    // Try env
    sid = process.env.AI_SESSION || "";
    if (!sid) {
      console.error("Usage: session end <sessionid> [exit_code]");
      return 1;
    }
  }

  const metaFile = findMetaPath(sid);
  if (!metaFile) {
    console.error(`[SESSION] ✗ Session not found: ${sid}`);
    return 1;
  }

  const meta: SessionMeta = JSON.parse(readFileSync(metaFile, "utf-8"));
  meta.exit_code = exitCode ?? null;
  meta.status = "ended";
  meta.verification_status = exitCode === 0 ? "passed" : exitCode != null ? "failed" : "unverified";
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");

  // Update .airuns/ task→session index
  if (meta.task_id) {
    updateAirunsIndex(meta.task_id, sid, meta);
  }

  console.log(`[SESSION] ✓ Ended: ${sid}  exit=${exitCode ?? "?"} status=${meta.verification_status}`);
  return 0;
}

// ─── .airuns/ Task→Session Index ─────────────────────────────────────────────

const AIRUNS_DIR = join(AI_ROOT, ".airuns");

/** Append a session record to the task index file (.airuns/<task_id>.jsonl) */
function updateAirunsIndex(taskId: string, sessionId: string, meta: SessionMeta): void {
  // SEC: validate taskId as hex before using as filename
  if (!/^[a-f0-9]{4,16}$/.test(taskId)) return;
  if (!existsSync(AIRUNS_DIR)) mkdirSync(AIRUNS_DIR, { recursive: true });
  const indexFile = join(AIRUNS_DIR, `${taskId}.jsonl`);
  const record = {
    session_id: sessionId,
    agent: meta.agent,
    exit_code: meta.exit_code,
    timestamp: meta.timestamp,
    ended: new Date().toISOString(),
  };
  appendFileSync(indexFile, JSON.stringify(record) + "\n");
}

/** List sessions for a task (reads .airuns/<task_id>.jsonl) */
export function listTaskSessions(taskId: string): number {
  if (!taskId || !/^[a-f0-9]{4,16}$/.test(taskId)) {
    console.error("Usage: session airuns <task_id>  (hex, 4-16 chars)");
    return 1;
  }
  const indexFile = join(AIRUNS_DIR, `${taskId}.jsonl`);
  if (!existsSync(indexFile)) {
    console.log(`[airuns] No sessions recorded for task ${taskId}`);
    return 0;
  }
  const lines = readFileSync(indexFile, "utf-8").split("\n").filter(Boolean);
  console.log(`[airuns] Sessions for task ${taskId}:\n`);
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      const exit = r.exit_code === 0 ? "✓" : r.exit_code != null ? "✗" : "?";
      console.log(`  ${r.session_id.padEnd(40)} ${exit} @${r.agent || "?"}  ${r.ended || ""}`);
    } catch {}
  }
  return 0;
}

// ─── Prune ───────────────────────────────────────────────────────────────────

function sessionPrune(args: string[]): number {
  // Parse flags
  let days = 7;
  let archive = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) days = parseInt(args[++i], 10);
    if (args[i] === "--archive") archive = true;
    if (args[i] === "--dry-run") dryRun = true;
  }

  // Session files live in nexus/.aisessions/ (day-sharded {DD}/ subdirs + top-level)
  const SIGNAL_DIR = join(AI_ROOT, "nexus", "signals");
  const LOGS_DIR = join(AI_ROOT, "nexus", "logs");
  const sessionDirs = [SESSION_BASE].filter(d => existsSync(d));

  if (sessionDirs.length === 0) {
    console.error(`[SESSION] No sessions directory found`);
    return 1;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const candidates: { dir: string; file: string; mtime: Date }[] = [];
  let totalFiles = 0;

  for (const dir of sessionDirs) {
    const allFiles = readdirSync(dir);
    totalFiles += allFiles.length;
    for (const f of allFiles) {
      const full = join(dir, f);
      try {
        const st = statSync(full);
        if (!st.isFile()) continue;
        if (st.mtimeMs < cutoff) {
          candidates.push({ dir, file: f, mtime: st.mtime });
        }
      } catch { /* skip */ }
    }
  }

  if (candidates.length === 0) {
    console.error(`[SESSION] Nothing to prune (cutoff: ${days} days, ${totalFiles} total files across ${sessionDirs.length} dirs)`);
    return 0;
  }

  // Group by session ID (strip extension)
  const sessionIds = new Set<string>();
  for (const c of candidates) {
    const sid = c.file.replace(/\.(meta\.json|typescript|awaiting)$/, "");
    sessionIds.add(sid);
  }

  console.error(`[SESSION] Prune: ${candidates.length} files from ${sessionIds.size} sessions (older than ${days} days)`);

  // Archive to hermetic if requested
  const HERMETIC_DIR = join(AI_ROOT, "hermetic", resolveOrg(AI_ROOT));
  const ARCHIVE_DIR = join(HERMETIC_DIR, "sessions");
  const hermeticHasGit = existsSync(join(HERMETIC_DIR, ".git"));

  if (archive) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    console.error(`  Archiving to: ${ARCHIVE_DIR}`);
  }

  let archived = 0;
  let removed = 0;

  for (const c of candidates) {
    const src = join(c.dir, c.file);
    if (dryRun) {
      console.error(`  [dry-run] ${archive ? "archive + " : ""}remove: ${c.file}`);
      removed++;
      continue;
    }

    if (archive) {
      const dst = join(ARCHIVE_DIR, c.file);
      copyFileSync(src, dst);
      archived++;
    }

    unlinkSync(src);
    removed++;
  }

  // Commit archive to hermetic nested git if available
  if (archive && !dryRun && hermeticHasGit && archived > 0) {
    try {
      execSync(`git add sessions/`, { cwd: HERMETIC_DIR, stdio: "pipe" });
      execSync(
        `git commit -m "archive: ${sessionIds.size} sessions (${archived} files, older than ${days}d)"`,
        { cwd: HERMETIC_DIR, stdio: "pipe" }
      );
      console.error(`  ✓ Committed ${archived} files to hermetic git`);
    } catch {
      console.error(`  ⚠ Hermetic git commit failed — files copied but not committed`);
    }
  }

  const remaining = totalFiles - removed;
  console.error(`  ${dryRun ? "[dry-run] " : ""}Removed: ${removed} files | ${archive ? `Archived: ${archived} | ` : ""}Remaining: ${remaining}`);

  // ── Signal pruning (flat dir, age-based sweep) ──
  let signalsPruned = 0;
  const signalDays = Math.min(days, 3); // signals expire faster: min(requested, 3 days)
  const signalCutoff = Date.now() - signalDays * 24 * 60 * 60 * 1000;
  if (existsSync(SIGNAL_DIR)) {
    for (const f of readdirSync(SIGNAL_DIR)) {
      const full = join(SIGNAL_DIR, f);
      try {
        const st = statSync(full);
        if (!st.isFile()) continue;
        if (st.mtimeMs < signalCutoff) {
          if (dryRun) {
            console.error(`  [dry-run] signal: ${f}`);
          } else {
            unlinkSync(full);
          }
          signalsPruned++;
        }
      } catch { /* skip */ }
    }
    if (signalsPruned > 0) {
      console.error(`  ${dryRun ? "[dry-run] " : ""}Signals pruned: ${signalsPruned} (older than ${signalDays} days)`);
    }
  }

  // ── Log pruning (nexus/logs/{DD}/ dirs, same rotation as sessions) ──
  let logsPruned = 0;
  if (existsSync(LOGS_DIR)) {
    for (const entry of readdirSync(LOGS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        // Top-level log files
        const full = join(LOGS_DIR, entry.name);
        try {
          const st = statSync(full);
          if (st.mtimeMs < cutoff) {
            if (!dryRun) unlinkSync(full);
            logsPruned++;
          }
        } catch { /* skip */ }
        continue;
      }
      // DD subdirs
      const subdir = join(LOGS_DIR, entry.name);
      for (const f of readdirSync(subdir)) {
        if (f === ".month") continue;
        const full = join(subdir, f);
        try {
          const st = statSync(full);
          if (!st.isFile()) continue;
          if (st.mtimeMs < cutoff) {
            if (!dryRun) unlinkSync(full);
            logsPruned++;
          }
        } catch { /* skip */ }
      }
    }
    if (logsPruned > 0) {
      console.error(`  ${dryRun ? "[dry-run] " : ""}Logs pruned: ${logsPruned} (older than ${days} days)`);
    }
  }

  // ── Clean empty DD subdirs in .aisessions and logs ──
  for (const dir of [SESSION_BASE, LOGS_DIR]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const subdir = join(dir, entry.name);
      const contents = readdirSync(subdir).filter(f => f !== ".month");
      if (contents.length === 0) {
        if (!dryRun) {
          try { unlinkSync(join(subdir, ".month")); } catch { /* skip */ }
          try { rmdirSync(subdir); } catch { /* skip */ }
        }
      }
    }
  }

  return 0;
}

// ─── Circular Buffer ─────────────────────────────────────────────────────────
// Enforces hard caps on ephemeral directories. Evicts oldest files first (LRU by mtime).

const CAP_SESSIONS = parseInt(process.env.AGENCE_CAP_SESSIONS || "200", 10);
const CAP_SIGNALS = parseInt(process.env.AGENCE_CAP_SIGNALS || "500", 10);
const CAP_LOGS = parseInt(process.env.AGENCE_CAP_LOGS || "100", 10);
const CAP_COST = parseInt(process.env.AGENCE_CAP_COST || "90", 10);
const CAP_TOTAL_MB = parseInt(process.env.AGENCE_CAP_TOTAL_MB || "100", 10);

const SIGNAL_DIR = join(AI_ROOT, "nexus", "signals");
const LOGS_DIR = join(AI_ROOT, "nexus", "logs");
const COST_DIR = join(AI_ROOT, "nexus", "cost");

interface FileEntry {
  path: string;
  mtime: number;
  size: number;
}

/** Collect all files recursively from a dir, sorted oldest-first */
function collectFiles(dir: string, filter?: (name: string) => boolean): FileEntry[] {
  if (!existsSync(dir)) return [];
  const entries: FileEntry[] = [];

  function walk(d: string): void {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.name === ".month" || ent.name === ".git" || ent.name === ".gitignore") continue;
      const full = join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else {
        if (filter && !filter(ent.name)) continue;
        try {
          const st = statSync(full);
          entries.push({ path: full, mtime: st.mtimeMs, size: st.size });
        } catch { /* skip */ }
      }
    }
  }

  walk(dir);
  entries.sort((a, b) => a.mtime - b.mtime); // oldest first
  return entries;
}

export interface EvictResult {
  dir: string;
  before: number;
  after: number;
  evicted: number;
  freed_bytes: number;
}

/** Evict oldest files from a directory until count is within cap */
export function circularEvict(dir: string, cap: number, dryRun: boolean = false, filter?: (name: string) => boolean): EvictResult {
  const files = collectFiles(dir, filter);
  const before = files.length;

  if (before <= cap) {
    return { dir, before, after: before, evicted: 0, freed_bytes: 0 };
  }

  const toEvict = files.slice(0, before - cap);
  let freedBytes = 0;

  for (const f of toEvict) {
    if (!dryRun) {
      try { unlinkSync(f.path); } catch { /* skip */ }
    }
    freedBytes += f.size;
  }

  return { dir, before, after: before - toEvict.length, evicted: toEvict.length, freed_bytes: freedBytes };
}

/** Evict oldest files until total size is within a byte cap */
export function circularEvictBySize(dir: string, maxBytes: number, dryRun: boolean = false): EvictResult {
  const files = collectFiles(dir);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  if (totalSize <= maxBytes) {
    return { dir, before: files.length, after: files.length, evicted: 0, freed_bytes: 0 };
  }

  let freedBytes = 0;
  let evicted = 0;

  for (const f of files) {
    if (totalSize - freedBytes <= maxBytes) break;
    if (!dryRun) {
      try { unlinkSync(f.path); } catch { /* skip */ }
    }
    freedBytes += f.size;
    evicted++;
  }

  return { dir, before: files.length, after: files.length - evicted, evicted, freed_bytes: freedBytes };
}

export interface GCReport {
  sessions: EvictResult;
  signals: EvictResult;
  logs: EvictResult;
  cost: EvictResult;
  total_size: EvictResult;
  total_freed_bytes: number;
  total_evicted: number;
}

/** Run full garbage collection across all ephemeral dirs */
export function runGC(dryRun: boolean = false): GCReport {
  // Phase 1: per-directory count caps
  const sessions = circularEvict(SESSION_BASE, CAP_SESSIONS, dryRun, (f) => f.endsWith(".meta.json") || f.endsWith(".typescript"));
  const signals = circularEvict(SIGNAL_DIR, CAP_SIGNALS, dryRun);
  const logs = circularEvict(LOGS_DIR, CAP_LOGS, dryRun);
  const cost = circularEvict(COST_DIR, CAP_COST, dryRun);

  // Phase 2: total size cap across all nexus ephemeral
  const NEXUS_DIR = join(AI_ROOT, "nexus");
  const maxBytes = CAP_TOTAL_MB * 1024 * 1024;
  const totalSize = circularEvictBySize(NEXUS_DIR, maxBytes, dryRun);

  const totalFreed = sessions.freed_bytes + signals.freed_bytes + logs.freed_bytes + cost.freed_bytes + totalSize.freed_bytes;
  const totalEvicted = sessions.evicted + signals.evicted + logs.evicted + cost.evicted + totalSize.evicted;

  return { sessions, signals, logs, cost, total_size: totalSize, total_freed_bytes: totalFreed, total_evicted: totalEvicted };
}

/** Show buffer usage status */
export function gcStatus(): { sessions: { count: number; cap: number }; signals: { count: number; cap: number }; logs: { count: number; cap: number }; cost: { count: number; cap: number }; total_mb: { size: number; cap: number } } {
  const sessFiles = collectFiles(SESSION_BASE, (f) => f.endsWith(".meta.json") || f.endsWith(".typescript"));
  const sigFiles = collectFiles(SIGNAL_DIR);
  const logFiles = collectFiles(LOGS_DIR);
  const costFiles = collectFiles(COST_DIR);

  const nexusDir = join(AI_ROOT, "nexus");
  const allNexus = collectFiles(nexusDir);
  const totalBytes = allNexus.reduce((sum, f) => sum + f.size, 0);

  return {
    sessions: { count: sessFiles.length, cap: CAP_SESSIONS },
    signals: { count: sigFiles.length, cap: CAP_SIGNALS },
    logs: { count: logFiles.length, cap: CAP_LOGS },
    cost: { count: costFiles.length, cap: CAP_COST },
    total_mb: { size: Math.round(totalBytes / 1024 / 1024 * 100) / 100, cap: CAP_TOTAL_MB },
  };
}

function cmdGC(args: string[]): number {
  const dryRun = args.includes("--dry-run");
  const report = runGC(dryRun);

  if (report.total_evicted === 0) {
    process.stderr.write("[gc] All buffers within caps. Nothing to evict.\n");
    return 0;
  }

  const prefix = dryRun ? "[dry-run] " : "";

  if (report.sessions.evicted > 0)
    process.stderr.write(`${prefix}sessions: evicted ${report.sessions.evicted} (${report.sessions.before} → ${report.sessions.after}, cap=${CAP_SESSIONS})\n`);
  if (report.signals.evicted > 0)
    process.stderr.write(`${prefix}signals:  evicted ${report.signals.evicted} (${report.signals.before} → ${report.signals.after}, cap=${CAP_SIGNALS})\n`);
  if (report.logs.evicted > 0)
    process.stderr.write(`${prefix}logs:     evicted ${report.logs.evicted} (${report.logs.before} → ${report.logs.after}, cap=${CAP_LOGS})\n`);
  if (report.cost.evicted > 0)
    process.stderr.write(`${prefix}cost:     evicted ${report.cost.evicted} (${report.cost.before} → ${report.cost.after}, cap=${CAP_COST})\n`);
  if (report.total_size.evicted > 0)
    process.stderr.write(`${prefix}total:    evicted ${report.total_size.evicted} (size cap ${CAP_TOTAL_MB}MB)\n`);

  const freedMB = (report.total_freed_bytes / 1024 / 1024).toFixed(2);
  process.stderr.write(`${prefix}Freed: ${freedMB} MB (${report.total_evicted} files)\n`);

  console.log(JSON.stringify(report, null, 2));
  return 0;
}

function cmdGCStatus(): number {
  const status = gcStatus();
  const pctSess = ((status.sessions.count / status.sessions.cap) * 100).toFixed(0);
  const pctSig = ((status.signals.count / status.signals.cap) * 100).toFixed(0);
  const pctLog = ((status.logs.count / status.logs.cap) * 100).toFixed(0);
  const pctCost = ((status.cost.count / status.cost.cap) * 100).toFixed(0);
  const pctTotal = ((status.total_mb.size / status.total_mb.cap) * 100).toFixed(0);

  console.log(`[gc] Buffer usage:`);
  console.log(`  sessions: ${status.sessions.count}/${status.sessions.cap} (${pctSess}%)`);
  console.log(`  signals:  ${status.signals.count}/${status.signals.cap} (${pctSig}%)`);
  console.log(`  logs:     ${status.logs.count}/${status.logs.cap} (${pctLog}%)`);
  console.log(`  cost:     ${status.cost.count}/${status.cost.cap} (${pctCost}%)`);
  console.log(`  total:    ${status.total_mb.size}MB/${status.total_mb.cap}MB (${pctTotal}%)`);
  return 0;
}

// ─── Main Router ─────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  let exitCode = 0;
  switch (cmd) {
    case "list":
      exitCode = sessionList(args);
      break;
    case "init":
      exitCode = sessionInit(args[0], args[1], args[2], args[3], args[4]);
      break;
    case "status":
      exitCode = sessionStatus(args[0]);
      break;
    case "end":
      {
        let parsedExit: number | undefined;
        if (args[1] != null) {
          parsedExit = parseInt(args[1], 10);
          if (isNaN(parsedExit)) {
            console.error(`[SESSION] ✗ Invalid exit code: ${args[1]}`);
            exitCode = 2;
            break;
          }
        }
        exitCode = sessionEnd(args[0], parsedExit);
      }
      break;
    case "airuns":
      exitCode = listTaskSessions(args[0] || process.env.AGENCE_TASK_ID || "");
      break;
    case "resume":
      exitCode = sessionResume(args[0]);
      break;
    case "prune":
      exitCode = sessionPrune(args);
      break;
    case "gc":
      exitCode = cmdGC(args);
      break;
    case "gc-status":
      exitCode = cmdGCStatus();
      break;
    default:
      // Treat unknown arg as session ID (backward compat)
      if (cmd) {
        exitCode = sessionStatus(cmd);
      } else {
        console.error("Usage: airun session <list|init|status|resume|prune|gc|gc-status> [args...]");
        exitCode = 1;
      }
  }

  process.exit(exitCode);
}
