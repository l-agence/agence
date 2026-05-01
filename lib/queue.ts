#!/usr/bin/env bun
// lib/queue.ts — Work queue for task lifecycle management
//
// Persistent JSONL queue at nexus/queue/tasks.jsonl
// CLI: airun queue {show,add,rm,next,switch,last,status,help}
//
// Integrates with AGENCE_TASK_ID — active task is exported to tangent env.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

// ─── Environment (lazy for testability) ──────────────────────────────────────

function getRoot(): string {
  return process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
}
export function getQueueDir(): string {
  return process.env.AGENCE_QUEUE_DIR || join(getRoot(), "nexus", "queue");
}
function getQueueFile(): string {
  return join(getQueueDir(), "tasks.jsonl");
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  status: "pending" | "active" | "done" | "dropped";
  created: string;
  started_at?: string;
  done_at?: string;
  agent?: string;
  tags?: string[];
  notes?: string;
}

// ─── Queue Operations ────────────────────────────────────────────────────────

function ensureQueue(): void {
  const dir = getQueueDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Read all tasks from the JSONL queue */
export function readTasks(): Task[] {
  const file = getQueueFile();
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean);
  const tasks: Task[] = [];
  for (const line of lines) {
    try { tasks.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return tasks;
}

/** Write full queue back (after mutations) */
function writeTasks(tasks: Task[]): void {
  ensureQueue();
  const content = tasks.map(t => JSON.stringify(t)).join("\n") + (tasks.length ? "\n" : "");
  writeFileSync(getQueueFile(), content);
}

/** Add a new task */
export function addTask(title: string, opts?: { agent?: string; tags?: string[] }): Task {
  ensureQueue();
  const task: Task = {
    id: randomBytes(4).toString("hex"),
    title,
    status: "pending",
    created: new Date().toISOString(),
    ...opts,
  };
  appendFileSync(getQueueFile(), JSON.stringify(task) + "\n");
  return task;
}

/** Get the currently active task (if any) */
export function activeTask(): Task | null {
  const tasks = readTasks();
  return tasks.find(t => t.status === "active") || null;
}

/** Get the next pending task */
export function nextTask(): Task | null {
  const tasks = readTasks();
  return tasks.find(t => t.status === "pending") || null;
}

/** Switch active task: deactivate current, activate target */
export function switchTask(id: string): Task | null {
  const tasks = readTasks();
  const target = tasks.find(t => t.id === id || t.id.startsWith(id));
  if (!target) return null;
  if (target.status === "done" || target.status === "dropped") return null;

  // Deactivate any currently active
  for (const t of tasks) {
    if (t.status === "active") {
      t.status = "pending";
      t.started_at = undefined;
    }
  }
  // Activate target
  target.status = "active";
  target.started_at = new Date().toISOString();
  writeTasks(tasks);
  return target;
}

/** Mark task as done */
export function doneTask(id: string): boolean {
  const tasks = readTasks();
  const task = tasks.find(t => t.id === id || t.id.startsWith(id));
  if (!task || task.status === "done" || task.status === "dropped") return false;
  task.status = "done";
  task.done_at = new Date().toISOString();
  writeTasks(tasks);
  return true;
}

/** Remove (drop) a task */
export function dropTask(id: string): boolean {
  const tasks = readTasks();
  const task = tasks.find(t => t.id === id || t.id.startsWith(id));
  if (!task) return false;
  task.status = "dropped";
  task.done_at = new Date().toISOString();
  writeTasks(tasks);
  return true;
}

/** Get the last completed or dropped task */
export function lastTask(): Task | null {
  const tasks = readTasks();
  const resolved = tasks.filter(t => t.status === "done" || t.status === "dropped");
  if (resolved.length === 0) return null;
  // Sort by done_at descending
  resolved.sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
  return resolved[0];
}

/** Compact: remove done/dropped tasks */
export function compactTasks(): number {
  const tasks = readTasks();
  const live = tasks.filter(t => t.status === "pending" || t.status === "active");
  const removed = tasks.length - live.length;
  writeTasks(live);
  return removed;
}

/** Queue stats */
export function queueStats(): { pending: number; active: number; done: number; dropped: number; total: number } {
  const tasks = readTasks();
  return {
    pending: tasks.filter(t => t.status === "pending").length,
    active: tasks.filter(t => t.status === "active").length,
    done: tasks.filter(t => t.status === "done").length,
    dropped: tasks.filter(t => t.status === "dropped").length,
    total: tasks.length,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdShow(args: string[]): number {
  const tasks = readTasks();
  const showAll = args.includes("--all");
  const display = showAll ? tasks : tasks.filter(t => t.status === "pending" || t.status === "active");

  if (display.length === 0) {
    console.log("[queue] Empty — no pending/active tasks.");
    return 0;
  }

  const fmt = (s: string, w: number) => s.slice(0, w).padEnd(w);
  console.log(`  ${fmt("ID", 10)} ${fmt("STATUS", 9)} ${fmt("AGENT", 8)} TITLE`);
  console.log(`  ${fmt("—", 10)} ${fmt("—", 9)} ${fmt("—", 8)} ${"—".repeat(50)}`);

  for (const t of display) {
    const mark = t.status === "active" ? "▶" : t.status === "done" ? "✓" : t.status === "dropped" ? "✗" : " ";
    console.log(`  ${fmt(t.id, 10)} ${mark}${fmt(t.status, 8)} ${fmt(t.agent || "-", 8)} ${t.title.slice(0, 60)}`);
  }

  const s = queueStats();
  console.log(`\n  pending: ${s.pending}  active: ${s.active}  done: ${s.done}  dropped: ${s.dropped}`);
  return 0;
}

function cmdAdd(args: string[]): number {
  let agent: string | undefined;
  let tags: string[] | undefined;
  const titleParts: string[] = [];

  let i = 0;
  while (i < args.length) {
    if (args[i] === "--agent" && args[i + 1]) { agent = args[++i]; }
    else if (args[i] === "--tag" && args[i + 1]) {
      tags = tags || [];
      tags.push(args[++i]);
    }
    else if (!args[i].startsWith("-")) { titleParts.push(...args.slice(i)); i = args.length; continue; }
    i++;
  }

  const title = titleParts.join(" ");
  if (!title) {
    console.error("Usage: airun queue add [--agent A] [--tag T] <title>");
    return 2;
  }

  const task = addTask(title, { agent, tags });
  console.log(`[queue] + ${task.id}: ${task.title}`);
  return 0;
}

function cmdRm(args: string[]): number {
  const id = args[0];
  if (!id) { console.error("Usage: airun queue rm <id>"); return 2; }
  if (dropTask(id)) {
    console.log(`[queue] ✗ Dropped: ${id}`);
    return 0;
  }
  console.error(`[queue] Not found: ${id}`);
  return 1;
}

function cmdDone(args: string[]): number {
  const id = args[0];
  if (!id) {
    // Mark active task as done
    const current = activeTask();
    if (!current) { console.error("[queue] No active task to complete."); return 1; }
    doneTask(current.id);
    console.log(`[queue] ✓ Done: ${current.id} — ${current.title}`);
    return 0;
  }
  if (doneTask(id)) {
    console.log(`[queue] ✓ Done: ${id}`);
    return 0;
  }
  console.error(`[queue] Not found or already resolved: ${id}`);
  return 1;
}

function cmdNext(): number {
  const next = nextTask();
  if (!next) {
    console.log("[queue] No pending tasks.");
    return 0;
  }
  const activated = switchTask(next.id);
  if (activated) {
    console.log(`[queue] ▶ Active: ${activated.id} — ${activated.title}`);
    return 0;
  }
  return 1;
}

function cmdSwitch(args: string[]): number {
  const id = args[0];
  if (!id) { console.error("Usage: airun queue switch <id>"); return 2; }
  const task = switchTask(id);
  if (task) {
    console.log(`[queue] ▶ Switched to: ${task.id} — ${task.title}`);
    return 0;
  }
  console.error(`[queue] Not found or already resolved: ${id}`);
  return 1;
}

function cmdLast(): number {
  const last = lastTask();
  if (!last) {
    console.log("[queue] No completed tasks.");
    return 0;
  }
  console.log(JSON.stringify(last, null, 2));
  return 0;
}

function cmdStatus(): number {
  const s = queueStats();
  const current = activeTask();
  console.log(`[queue] Status:`);
  if (current) console.log(`  active:   ${current.id} — ${current.title}`);
  else console.log(`  active:   (none)`);
  console.log(`  pending:  ${s.pending}`);
  console.log(`  done:     ${s.done}`);
  console.log(`  dropped:  ${s.dropped}`);
  console.log(`  total:    ${s.total}`);
  return 0;
}

function cmdCompact(): number {
  const removed = compactTasks();
  console.log(`[queue] Compacted: removed ${removed} resolved tasks.`);
  return 0;
}

function cmdHelp(): number {
  console.log(`queue — Work queue for task lifecycle

Usage:
  airun queue show [--all]          List pending/active tasks (--all includes resolved)
  airun queue add [opts] <title>    Add a new task
  airun queue rm <id>               Drop a task
  airun queue done [id]             Mark task as done (default: active task)
  airun queue next                  Activate next pending task
  airun queue switch <id>           Switch active task
  airun queue last                  Show last completed task
  airun queue compact               Remove resolved tasks
  airun queue status                Show queue statistics
  airun queue help                  This help

Add options:
  --agent <name>        Assign agent
  --tag <tag>           Add tag (repeatable)

Environment:
  AGENCE_QUEUE_DIR     Queue directory (default: nexus/queue/)
`);
  return 0;
}

// ─── Main Router ─────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  let exitCode = 0;
  switch (cmd) {
    case "show":
    case "list":    exitCode = cmdShow(args); break;
    case "add":     exitCode = cmdAdd(args); break;
    case "rm":
    case "delete":
    case "drop":    exitCode = cmdRm(args); break;
    case "done":    exitCode = cmdDone(args); break;
    case "next":    exitCode = cmdNext(); break;
    case "switch":  exitCode = cmdSwitch(args); break;
    case "last":    exitCode = cmdLast(); break;
    case "compact": exitCode = cmdCompact(); break;
    case "status":  exitCode = cmdStatus(); break;
    case "help":
    case "--help":
    case "-h":      exitCode = cmdHelp(); break;
    default:
      if (!cmd) {
        exitCode = cmdShow([]);
      } else {
        console.error(`[queue] Unknown command: ${cmd}`);
        exitCode = 2;
      }
  }

  process.exit(exitCode);
}
