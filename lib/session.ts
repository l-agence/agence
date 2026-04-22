#!/usr/bin/env bun
// lib/session.ts — Session management module (Bun)
//
// Usage (from bash):
//   airun session list
//   airun session status <session-id>
//   airun session init <session-id> [role] [agent] [shell] [git-root]
//   airun session resume <session-id>
//   airun session prune [--days N] [--archive] [--dry-run]
//
// Exit codes: 0 = success, 1 = error

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, copyFileSync, unlinkSync } from "fs";
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

function sessionList(): number {
  if (!existsSync(SESSION_BASE)) {
    console.error(`[SESSION] ✗ No sessions directory: ${SESSION_BASE}`);
    return 1;
  }

  const metaFiles = findFiles(SESSION_BASE, (f) => f.endsWith(".meta.json")).sort().reverse();

  if (metaFiles.length === 0) {
    console.log(`No sessions found in ${SESSION_BASE}`);
    return 0;
  }

  // Header
  const hdr = [
    "SESSION ID".padEnd(45),
    "COMMAND".padEnd(40),
    "EXIT".padEnd(6),
    "TIMESTAMP",
  ].join(" ");
  console.log(hdr);
  console.log("=".repeat(125));

  for (const file of metaFiles) {
    const sid = basename(file, ".meta.json");
    const meta = readMeta(sid);
    if (!meta) continue;

    const cmd = (meta.command || "").slice(0, 40);
    const exit = meta.exit_code;
    const exitStr = exit === 0 ? `✓ ${exit}` : exit != null ? `✗ ${exit}` : "?";
    const ts = (meta.timestamp || "").slice(0, 20);

    console.log(
      `${sid.padEnd(45)} ${cmd.padEnd(40)} ${exitStr.padEnd(6)} ${ts}`
    );
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

  // Scan both session directories:
  //   nexus/.aisessions/ — aisession-created .meta.json + .typescript files
  //   nexus/sessions/    — aibash/signal .awaiting markers + legacy .meta.json
  const LEGACY_SESSION_DIR = join(AI_ROOT, "nexus", "sessions");
  const sessionDirs = [SESSION_BASE, LEGACY_SESSION_DIR].filter(d => existsSync(d));

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

  return 0;
}

// ─── Main Router ─────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

let exitCode = 0;
switch (cmd) {
  case "list":
    exitCode = sessionList();
    break;
  case "init":
    exitCode = sessionInit(args[0], args[1], args[2], args[3], args[4]);
    break;
  case "status":
    exitCode = sessionStatus(args[0]);
    break;
  case "resume":
    exitCode = sessionResume(args[0]);
    break;
  case "prune":
    exitCode = sessionPrune(args);
    break;
  default:
    // Treat unknown arg as session ID (backward compat)
    if (cmd) {
      exitCode = sessionStatus(cmd);
    } else {
      console.error("Usage: airun session <list|init|status|resume|prune> [args...]");
      exitCode = 1;
    }
}

process.exit(exitCode);
