#!/usr/bin/env bun
// lib/scope.ts — Scope Collision Prevention (Bun)
//
// Prevents multiple agents from working on overlapping file paths simultaneously.
// Uses advisory file locks (horde) for atomic task claims and path-prefix overlap
// detection for scope enforcement.
//
// Collision vectors addressed:
//   1. Double-pickup: two agents claim the same task → atomic horde lock on tasks.json
//   2. Scope overlap: two tasks touch the same files → overlap detection before assign
//   3. Drift enforcement: agent modifies files outside declared scope → diff check
//
// Task scope declaration (in organic/tasks.json):
//   { "id": "SEC-017", ..., "scope": ["lib/guard.ts", "lib/policy.ts", "tests/"] }
//
// Scope rules:
//   - Paths ending in / are directories (prefix match)
//   - Paths without / suffix are exact files
//   - No scope = unrestricted (legacy tasks, warn but don't block)
//   - Scope "*" = global lock (only one such task active at a time)
//
// Usage:
//   airun scope check <task_id>            Check if task scope is free
//   airun scope claim <task_id> <agent>    Atomic claim with overlap check
//   airun scope release <task_id>          Release scope (on task completion)
//   airun scope active                     Show all active scope claims
//   airun scope overlaps <task_id>         Show what would collide
//   airun scope verify [--staged]          Verify staged/working diff is in-scope
//   airun scope help

import { existsSync, readFileSync, writeFileSync, openSync, closeSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const TASKS_FILE = join(AGENCE_ROOT, "organic", "tasks.json");
const LOCK_FILE = join(AGENCE_ROOT, "organic", ".tasks.lock");

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  repo: string;
  title: string;
  state: string;
  priority: number;
  stars: number;
  heat: number;
  agent: string | null;
  created: string;
  updated: string;
  scope?: string[];
}

interface TasksData {
  tasks: Task[];
}

export interface ScopeConflict {
  task_id: string;
  agent: string | null;
  overlapping_paths: string[];
}

export interface ClaimResult {
  success: boolean;
  task_id: string;
  agent: string;
  conflicts?: ScopeConflict[];
  reason?: string;
}

export interface ScopeVerification {
  in_scope: boolean;
  task_id: string;
  declared_scope: string[];
  out_of_scope_files: string[];
}

// ─── Horde Lock ──────────────────────────────────────────────────────────────
// Advisory exclusive lock via lockfile (O_EXCL + retry).
// Named "horde" — the mechanism that keeps the swarm from trampling itself.

const HORDE_TIMEOUT_MS = 5000;
const HORDE_RETRY_MS = 50;

function hordeAcquire(): number {
  mkdirSync(join(LOCK_FILE, ".."), { recursive: true });
  const deadline = Date.now() + HORDE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      // O_CREAT | O_EXCL | O_WRONLY = create exclusively (fails if exists)
      const fd = openSync(LOCK_FILE, "wx");
      // Write PID for diagnostics
      const buf = Buffer.from(`${process.pid}\n`);
      const file = Bun.file(LOCK_FILE);
      Bun.write(file, buf);
      return fd;
    } catch (e: any) {
      if (e.code === "EEXIST") {
        // Lock held — check if holder is still alive (stale lock detection)
        try {
          const pidStr = readFileSync(LOCK_FILE, "utf-8").trim();
          const pid = parseInt(pidStr, 10);
          if (pid && !isProcessAlive(pid)) {
            // Stale lock — remove and retry
            try { Bun.file(LOCK_FILE).delete; } catch {}
            try { require("fs").unlinkSync(LOCK_FILE); } catch {}
            continue;
          }
        } catch { /* can't read lock, wait */ }

        // Wait and retry
        Bun.sleepSync(HORDE_RETRY_MS);
        continue;
      }
      throw e;
    }
  }

  throw new Error(`[scope] Horde lock timeout (${HORDE_TIMEOUT_MS}ms) — another agent holds the claim`);
}

function hordeRelease(fd: number): void {
  try { closeSync(fd); } catch { /* ignore */ }
  try { require("fs").unlinkSync(LOCK_FILE); } catch { /* ignore */ }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ─── Task Data ───────────────────────────────────────────────────────────────

function loadTasks(): TasksData {
  if (!existsSync(TASKS_FILE)) return { tasks: [] };
  try {
    return JSON.parse(readFileSync(TASKS_FILE, "utf-8"));
  } catch {
    return { tasks: [] };
  }
}

function saveTasks(data: TasksData): void {
  mkdirSync(join(TASKS_FILE, ".."), { recursive: true });
  writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ─── Scope Overlap Detection ─────────────────────────────────────────────────

const ACTIVE_STATES = new Set(["~", "$", "%", "&", "?"]);

export function pathOverlaps(a: string, b: string): boolean {
  // Directory prefix: "lib/" overlaps "lib/guard.ts"
  if (a.endsWith("/") && b.startsWith(a)) return true;
  if (b.endsWith("/") && a.startsWith(b)) return true;
  // Both dirs: "lib/" and "lib/foo/" overlap (nested)
  if (a.endsWith("/") && b.endsWith("/")) {
    return a.startsWith(b) || b.startsWith(a);
  }
  // Exact match
  return a === b;
}

export function scopeOverlaps(scopeA: string[], scopeB: string[]): string[] {
  const overlaps: string[] = [];
  for (const a of scopeA) {
    for (const b of scopeB) {
      if (pathOverlaps(a, b)) {
        overlaps.push(`${a} ∩ ${b}`);
      }
    }
  }
  return overlaps;
}

export function findConflicts(taskId: string, scope: string[], tasks: Task[]): ScopeConflict[] {
  const conflicts: ScopeConflict[] = [];

  // Global scope "*" conflicts with everything active
  if (scope.includes("*")) {
    const active = tasks.filter(t => t.id !== taskId && ACTIVE_STATES.has(t.state) && t.agent);
    for (const t of active) {
      conflicts.push({ task_id: t.id, agent: t.agent, overlapping_paths: ["* (global)"] });
    }
    return conflicts;
  }

  for (const other of tasks) {
    if (other.id === taskId) continue;
    if (!ACTIVE_STATES.has(other.state)) continue;
    if (!other.agent) continue;
    if (!other.scope || other.scope.length === 0) continue;

    // Check if other's scope is global
    if (other.scope.includes("*")) {
      conflicts.push({ task_id: other.id, agent: other.agent, overlapping_paths: ["* (global)"] });
      continue;
    }

    const overlaps = scopeOverlaps(scope, other.scope);
    if (overlaps.length > 0) {
      conflicts.push({ task_id: other.id, agent: other.agent, overlapping_paths: overlaps });
    }
  }

  return conflicts;
}

// ─── Atomic Claim ────────────────────────────────────────────────────────────

export function claimTask(taskId: string, agent: string, force: boolean = false): ClaimResult {
  const fd = hordeAcquire();
  try {
    const data = loadTasks();
    const task = data.tasks.find(t => t.id === taskId);

    if (!task) {
      return { success: false, task_id: taskId, agent, reason: `task '${taskId}' not found` };
    }

    // Already claimed by another agent?
    if (task.agent && task.agent !== `@${agent}` && task.agent !== agent) {
      return {
        success: false, task_id: taskId, agent,
        reason: `already claimed by ${task.agent}`,
      };
    }

    // Scope overlap check (only if task has scope declared)
    if (task.scope && task.scope.length > 0 && !force) {
      const conflicts = findConflicts(taskId, task.scope, data.tasks);
      if (conflicts.length > 0) {
        return { success: false, task_id: taskId, agent, conflicts, reason: "scope collision" };
      }
    }

    // Claim it
    task.agent = agent.startsWith("@") ? agent : `@${agent}`;
    task.state = "%";
    task.updated = isoNow();
    saveTasks(data);

    return { success: true, task_id: taskId, agent: task.agent };
  } finally {
    hordeRelease(fd);
  }
}

export function releaseTask(taskId: string): boolean {
  const fd = hordeAcquire();
  try {
    const data = loadTasks();
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) return false;

    task.agent = null;
    task.state = "+";
    task.updated = isoNow();
    saveTasks(data);
    return true;
  } finally {
    hordeRelease(fd);
  }
}

// ─── Active Scope Map ────────────────────────────────────────────────────────

export function activeScopeMap(): Map<string, { agent: string; scope: string[] }> {
  const data = loadTasks();
  const map = new Map<string, { agent: string; scope: string[] }>();

  for (const t of data.tasks) {
    if (!ACTIVE_STATES.has(t.state)) continue;
    if (!t.agent) continue;
    if (!t.scope || t.scope.length === 0) continue;
    map.set(t.id, { agent: t.agent, scope: t.scope });
  }

  return map;
}

// ─── Diff Scope Verification ─────────────────────────────────────────────────
// Checks that modified files are within the task's declared scope.

export function verifyDiffInScope(taskId?: string, staged: boolean = false): ScopeVerification {
  // Resolve task_id from env if not provided
  const resolvedTaskId = taskId || process.env.AI_TASK_ID || "";
  if (!resolvedTaskId) {
    return { in_scope: false, task_id: "", declared_scope: [], out_of_scope_files: ["ERROR: no task_id"] };
  }

  const data = loadTasks();
  const task = data.tasks.find(t => t.id === resolvedTaskId);
  if (!task) {
    return { in_scope: false, task_id: resolvedTaskId, declared_scope: [], out_of_scope_files: ["ERROR: task not found"] };
  }

  // No scope = unrestricted (pass but warn)
  if (!task.scope || task.scope.length === 0) {
    return { in_scope: true, task_id: resolvedTaskId, declared_scope: [], out_of_scope_files: [] };
  }

  // Get modified files from git
  const diffCmd = staged
    ? "git diff --cached --name-only"
    : "git diff --name-only";
  let files: string[];
  try {
    const output = execSync(diffCmd, { cwd: AGENCE_ROOT, timeout: 5000 }).toString().trim();
    files = output ? output.split("\n") : [];
  } catch {
    return { in_scope: false, task_id: resolvedTaskId, declared_scope: task.scope, out_of_scope_files: ["ERROR: git diff failed"] };
  }

  if (files.length === 0) {
    return { in_scope: true, task_id: resolvedTaskId, declared_scope: task.scope, out_of_scope_files: [] };
  }

  // Check each file against scope
  const outOfScope: string[] = [];
  for (const file of files) {
    const inScope = task.scope.some(scopePath => {
      if (scopePath === "*") return true;
      if (scopePath.endsWith("/")) return file.startsWith(scopePath);
      return file === scopePath;
    });
    if (!inScope) outOfScope.push(file);
  }

  return {
    in_scope: outOfScope.length === 0,
    task_id: resolvedTaskId,
    declared_scope: task.scope,
    out_of_scope_files: outOfScope,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === "help") {
    process.stderr.write("Usage: airun scope <command> [args]\n");
    process.stderr.write("Commands:\n");
    process.stderr.write("  check <task_id>            Check if task scope is collision-free\n");
    process.stderr.write("  claim <task_id> <agent>    Atomic claim with overlap check\n");
    process.stderr.write("  release <task_id>          Release scope (return task to pending)\n");
    process.stderr.write("  active                     Show all active scope claims\n");
    process.stderr.write("  overlaps <task_id>         Show what would collide\n");
    process.stderr.write("  verify [--staged]          Verify diff stays within task scope\n");
    process.stderr.write("  help                       Show this help\n");
    process.exit(cmd === "help" ? 0 : 2);
  }

  switch (cmd) {
    case "check": {
      const [taskId] = args;
      if (!taskId) { process.stderr.write("Usage: airun scope check <task_id>\n"); process.exit(2); }

      const data = loadTasks();
      const task = data.tasks.find(t => t.id === taskId);
      if (!task) { process.stderr.write(`[scope] Task not found: ${taskId}\n`); process.exit(1); }

      if (!task.scope || task.scope.length === 0) {
        process.stderr.write(`[scope] ${taskId}: no scope declared (unrestricted)\n`);
        process.exit(0);
      }

      const conflicts = findConflicts(taskId, task.scope, data.tasks);
      if (conflicts.length === 0) {
        process.stderr.write(`[scope] ${taskId}: scope is free ✓\n`);
        console.log(JSON.stringify({ free: true, scope: task.scope }));
      } else {
        process.stderr.write(`[scope] ${taskId}: COLLISION detected ✗\n`);
        console.log(JSON.stringify({ free: false, scope: task.scope, conflicts }, null, 2));
        process.exit(1);
      }
      break;
    }

    case "claim": {
      const [taskId, agent] = args;
      if (!taskId || !agent) { process.stderr.write("Usage: airun scope claim <task_id> <agent>\n"); process.exit(2); }

      const force = args.includes("--force");
      const result = claimTask(taskId, agent, force);

      if (result.success) {
        process.stderr.write(`[scope] ✓ Claimed: ${taskId} → ${result.agent}\n`);
        console.log(JSON.stringify(result));
      } else {
        process.stderr.write(`[scope] ✗ Claim failed: ${result.reason}\n`);
        if (result.conflicts) {
          for (const c of result.conflicts) {
            process.stderr.write(`  collision: ${c.task_id} (${c.agent}) at ${c.overlapping_paths.join(", ")}\n`);
          }
        }
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }
      break;
    }

    case "release": {
      const [taskId] = args;
      if (!taskId) { process.stderr.write("Usage: airun scope release <task_id>\n"); process.exit(2); }

      const ok = releaseTask(taskId);
      if (ok) {
        process.stderr.write(`[scope] Released: ${taskId}\n`);
      } else {
        process.stderr.write(`[scope] Task not found: ${taskId}\n`);
        process.exit(1);
      }
      break;
    }

    case "active": {
      const map = activeScopeMap();
      if (map.size === 0) {
        process.stderr.write("[scope] No active scope claims.\n");
      } else {
        const out: Record<string, { agent: string; scope: string[] }> = {};
        for (const [id, v] of map) out[id] = v;
        console.log(JSON.stringify(out, null, 2));
      }
      break;
    }

    case "overlaps": {
      const [taskId] = args;
      if (!taskId) { process.stderr.write("Usage: airun scope overlaps <task_id>\n"); process.exit(2); }

      const data = loadTasks();
      const task = data.tasks.find(t => t.id === taskId);
      if (!task) { process.stderr.write(`[scope] Task not found: ${taskId}\n`); process.exit(1); }
      if (!task.scope || task.scope.length === 0) {
        process.stderr.write(`[scope] ${taskId}: no scope declared\n`);
        process.exit(0);
      }

      const conflicts = findConflicts(taskId, task.scope, data.tasks);
      if (conflicts.length === 0) {
        process.stderr.write(`[scope] ${taskId}: no overlaps\n`);
      } else {
        console.log(JSON.stringify(conflicts, null, 2));
      }
      break;
    }

    case "verify": {
      const staged = args.includes("--staged");
      const taskId = args.find(a => !a.startsWith("--")) || undefined;

      const result = verifyDiffInScope(taskId, staged);
      if (result.in_scope) {
        process.stderr.write(`[scope] ✓ All changes within scope for ${result.task_id}\n`);
        console.log(JSON.stringify(result));
      } else {
        process.stderr.write(`[scope] ✗ Out-of-scope files detected:\n`);
        for (const f of result.out_of_scope_files) {
          process.stderr.write(`  ${f}\n`);
        }
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
      }
      break;
    }

    default:
      process.stderr.write(`[scope] Unknown command: ${cmd}\n`);
      process.exit(2);
  }
}
