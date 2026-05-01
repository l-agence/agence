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
import { spawnSync } from "child_process";

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
  github_issue?: string;  // e.g. "owner/repo#42" or "#42"
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
    maybeCloseIssue(current);
    return 0;
  }
  const tasks = readTasks();
  const task = tasks.find(t => t.id === id || t.id.startsWith(id));
  if (doneTask(id)) {
    console.log(`[queue] ✓ Done: ${id}`);
    if (task) maybeCloseIssue(task);
    return 0;
  }
  console.error(`[queue] Not found or already resolved: ${id}`);
  return 1;
}

/** Auto-close linked GitHub issue when task is done */
function maybeCloseIssue(task: Task): void {
  if (!task.github_issue) return;
  const parsed = parseIssueRef(task.github_issue);
  if (!parsed) return;
  const repo = resolveRepo(parsed.repo);
  if (!repo) return;

  const result = spawnSync("gh", ["issue", "close", String(parsed.number), "--repo", repo, "--comment", `Closed via agence task ${task.id}`], {
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15_000,
  });

  if (result.status === 0) {
    console.log(`[queue]   → Closed ${repo}#${parsed.number}`);
  } else {
    console.error(`[queue]   ⚠ Could not auto-close ${repo}#${parsed.number}: ${result.stderr?.toString().trim() || "unknown error"}`);
  }
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

// ─── Dashboard ───────────────────────────────────────────────────────────────

function cmdDashboard(): number {
  const tasks = readTasks();
  const stats = queueStats();
  const current = activeTask();

  console.log("");
  console.log("  ╔══════════════════════════════════════════════════════════╗");
  console.log("  ║              QUEUE DASHBOARD                            ║");
  console.log("  ╚══════════════════════════════════════════════════════════╝");
  console.log("");

  // Active task
  console.log("  ▶ ACTIVE TASK");
  if (current) {
    const elapsed = current.started_at
      ? formatElapsed(Date.now() - new Date(current.started_at).getTime())
      : "?";
    console.log(`    ${current.id}  ${current.title}`);
    if (current.agent) console.log(`    Agent: @${current.agent}`);
    if (current.tags?.length) console.log(`    Tags:  ${current.tags.join(", ")}`);
    if (current.github_issue) console.log(`    Issue: ${current.github_issue}`);
    console.log(`    Running: ${elapsed}`);
  } else {
    console.log("    (none — run '^queue next' to activate)");
  }
  console.log("");

  // Pending queue
  const pending = tasks.filter(t => t.status === "pending");
  console.log(`  ⏳ PENDING (${pending.length})`);
  if (pending.length === 0) {
    console.log("    (empty)");
  } else {
    for (const t of pending.slice(0, 10)) {
      const issue = t.github_issue ? ` [${t.github_issue}]` : "";
      const agent = t.agent ? ` @${t.agent}` : "";
      console.log(`    ${t.id}  ${t.title.slice(0, 50)}${agent}${issue}`);
    }
    if (pending.length > 10) console.log(`    ... and ${pending.length - 10} more`);
  }
  console.log("");

  // Recent completions
  const done = tasks
    .filter(t => t.status === "done")
    .sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""))
    .slice(0, 5);
  console.log(`  ✓ RECENTLY DONE (${stats.done} total)`);
  if (done.length === 0) {
    console.log("    (none)");
  } else {
    for (const t of done) {
      const ago = t.done_at ? formatElapsed(Date.now() - new Date(t.done_at).getTime()) + " ago" : "";
      const issue = t.github_issue ? ` [${t.github_issue}]` : "";
      console.log(`    ✓ ${t.id}  ${t.title.slice(0, 45)}  ${ago}${issue}`);
    }
  }
  console.log("");

  // Dropped
  if (stats.dropped > 0) {
    console.log(`  ✗ DROPPED: ${stats.dropped}`);
    console.log("");
  }

  // Session counts per active/pending task (read .airuns if available)
  const airunsDir = join(getRoot(), "nexus", ".airuns");
  if (existsSync(airunsDir) && (current || pending.length > 0)) {
    const activeTasks = [current, ...pending].filter(Boolean) as Task[];
    let hasSessionData = false;
    for (const t of activeTasks.slice(0, 5)) {
      const indexFile = join(airunsDir, `${t.id}.jsonl`);
      if (existsSync(indexFile)) {
        const lines = readFileSync(indexFile, "utf-8").split("\n").filter(Boolean);
        if (lines.length > 0) {
          if (!hasSessionData) {
            console.log("  📋 SESSIONS");
            hasSessionData = true;
          }
          console.log(`    ${t.id}: ${lines.length} session(s)`);
        }
      }
    }
    if (hasSessionData) console.log("");
  }

  // Summary bar
  console.log("  ─────────────────────────────────────────────────────────");
  console.log(`  pending: ${stats.pending}  active: ${stats.active}  done: ${stats.done}  dropped: ${stats.dropped}  total: ${stats.total}`);
  console.log("");

  return 0;
}

function formatElapsed(ms: number): string {
  if (ms < 0) return "0s";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

// ─── GitHub Issues Bridge ────────────────────────────────────────────────────

/** Parse issue reference: "#42", "owner/repo#42", "https://github.com/owner/repo/issues/42" */
function parseIssueRef(ref: string): { repo: string; number: number } | null {
  // Full URL: https://github.com/owner/repo/issues/42
  const urlMatch = ref.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/);
  if (urlMatch) return { repo: urlMatch[1], number: parseInt(urlMatch[2], 10) };

  // owner/repo#N
  const fullMatch = ref.match(/^([a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+)#(\d+)$/);
  if (fullMatch) return { repo: fullMatch[1], number: parseInt(fullMatch[2], 10) };

  // #N (current repo)
  const shortMatch = ref.match(/^#?(\d+)$/);
  if (shortMatch) return { repo: "", number: parseInt(shortMatch[1], 10) };

  return null;
}

/** Resolve repo slug from git remote if not specified */
function resolveRepo(repo: string): string {
  if (repo) return repo;
  const result = spawnSync("git", ["remote", "get-url", "origin"], { cwd: getRoot(), stdio: ["pipe", "pipe", "pipe"] });
  const url = result.stdout?.toString().trim() || "";
  // https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : "";
}

function cmdImport(args: string[]): number {
  const ref = args[0];
  if (!ref) {
    console.error("Usage: airun queue import <issue#>  (e.g. #42, owner/repo#42)");
    return 2;
  }

  const parsed = parseIssueRef(ref);
  if (!parsed) {
    console.error(`[queue] Invalid issue reference: ${ref}`);
    return 1;
  }

  const repo = resolveRepo(parsed.repo);
  if (!repo) {
    console.error("[queue] Could not resolve repo — use owner/repo#N format");
    return 1;
  }

  // Fetch issue title via gh CLI
  const ghArgs = ["issue", "view", String(parsed.number), "--repo", repo, "--json", "title,state,labels"];
  const result = spawnSync("gh", ghArgs, { stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 });

  if (result.status !== 0) {
    const err = result.stderr?.toString().trim() || "unknown error";
    console.error(`[queue] gh issue view failed: ${err}`);
    return 1;
  }

  let issueData: { title: string; state: string; labels: { name: string }[] };
  try {
    issueData = JSON.parse(result.stdout?.toString() || "{}");
  } catch {
    console.error("[queue] Failed to parse gh output");
    return 1;
  }

  if (!issueData.title) {
    console.error(`[queue] Issue ${repo}#${parsed.number} not found`);
    return 1;
  }

  // Check for duplicate
  const existing = readTasks().find(t => t.github_issue === `${repo}#${parsed.number}`);
  if (existing) {
    console.error(`[queue] Already linked: task ${existing.id} → ${repo}#${parsed.number}`);
    return 1;
  }

  // Create task from issue
  const tags = issueData.labels?.map(l => l.name) || [];
  const task = addTask(issueData.title, { tags: tags.length ? tags : undefined });

  // Set github_issue field
  const tasks = readTasks();
  const created = tasks.find(t => t.id === task.id);
  if (created) {
    created.github_issue = `${repo}#${parsed.number}`;
    writeTasks(tasks);
  }

  console.log(`[queue] + ${task.id}: ${issueData.title}`);
  console.log(`[queue]   Linked to ${repo}#${parsed.number}`);
  if (tags.length) console.log(`[queue]   Labels: ${tags.join(", ")}`);
  return 0;
}

function cmdLink(args: string[]): number {
  const [id, ref] = args;
  if (!id || !ref) {
    console.error("Usage: airun queue link <task-id> <issue#>");
    return 2;
  }

  const parsed = parseIssueRef(ref);
  if (!parsed) {
    console.error(`[queue] Invalid issue reference: ${ref}`);
    return 1;
  }

  const repo = resolveRepo(parsed.repo);
  if (!repo) {
    console.error("[queue] Could not resolve repo — use owner/repo#N format");
    return 1;
  }

  const tasks = readTasks();
  const task = tasks.find(t => t.id === id || t.id.startsWith(id));
  if (!task) {
    console.error(`[queue] Task not found: ${id}`);
    return 1;
  }

  task.github_issue = `${repo}#${parsed.number}`;
  writeTasks(tasks);
  console.log(`[queue] ✓ Linked: ${task.id} → ${repo}#${parsed.number}`);
  return 0;
}

function cmdUnlink(args: string[]): number {
  const id = args[0];
  if (!id) {
    console.error("Usage: airun queue unlink <task-id>");
    return 2;
  }

  const tasks = readTasks();
  const task = tasks.find(t => t.id === id || t.id.startsWith(id));
  if (!task) {
    console.error(`[queue] Task not found: ${id}`);
    return 1;
  }

  if (!task.github_issue) {
    console.error(`[queue] Task ${task.id} has no issue link`);
    return 1;
  }

  const old = task.github_issue;
  delete task.github_issue;
  writeTasks(tasks);
  console.log(`[queue] ✓ Unlinked: ${task.id} (was ${old})`);
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
  airun queue dashboard             Rich overview with sessions & cost
  airun queue import <issue#>       Import GitHub issue as a task
  airun queue link <id> <issue#>    Link existing task to GitHub issue
  airun queue unlink <id>           Remove GitHub issue link from task
  airun queue help                  This help

Add options:
  --agent <name>        Assign agent
  --tag <tag>           Add tag (repeatable)

Issue format:
  #42                   Issue in current repo
  owner/repo#42         Issue in specific repo

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
    case "dashboard":
    case "dash":    exitCode = cmdDashboard(); break;
    case "import":  exitCode = cmdImport(args); break;
    case "link":    exitCode = cmdLink(args); break;
    case "unlink":  exitCode = cmdUnlink(args); break;
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
