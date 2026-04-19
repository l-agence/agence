#!/usr/bin/env bun
// lib/matrix.ts — Task state matrix + dependency DAG + scoring (Bun)
//
// Implements the MATRICES.md spec: 3-tier model (Tasks → Workflows → Projects)
// with linear algebra scoring, DAG blocking propagation, and agent routing.
//
// All state lives in Git-committed JSON files (no database):
//   organic/tasks.json     — task state matrix
//   organic/deps.json      — dependency adjacency list
//   organic/workflows.json — workflow → task mapping
//   organic/projects.json  — project → workflow mapping
//
// Scoring formula: score = 10*P + 25*S + 100*H
//   P = priority (1-5), S = stars (0+), H = heat (0.0-1.0)
//
// State symbols (from SYMBOLS.md):
//   ~ human-assigned  $ human-working  % agent-assigned  & agent-executing
//   + pending  - completed  _ paused  # held  ! failure  ? awaiting-input
//
// Usage:
//   airun matrix score                  — score + rank all tasks
//   airun matrix runnable               — tasks eligible for agent pickup
//   airun matrix blocked                — show blocking chains
//   airun matrix status                 — summary: counts, completion %
//   airun matrix workflow <id>          — workflow completion detail
//   airun matrix add <id> <title>       — add task (state=~, priority=1)
//   airun matrix set <id> <field> <val> — update task field
//   airun matrix assign <id> <agent>    — assign task to agent
//   airun matrix complete <id>          — mark task completed
//   airun matrix dep <from> <to> [type] — add dependency (default: ^hard)
//   airun matrix init                   — create empty data files
//   airun matrix help

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash, randomBytes } from "crypto";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const DATA_DIR = join(AGENCE_ROOT, "organic");
const TASKS_FILE = join(DATA_DIR, "tasks.json");
const DEPS_FILE = join(DATA_DIR, "deps.json");
const WORKFLOWS_FILE = join(DATA_DIR, "workflows.json");
const PROJECTS_FILE = join(DATA_DIR, "projects.json");

// ─── Types ───────────────────────────────────────────────────────────────────

// State symbols from SYMBOLS.md
type TaskState = "~" | "$" | "%" | "&" | "+" | "-" | "_" | "#" | "!" | "?";

interface Task {
  id: string;
  repo: string;
  title: string;
  state: TaskState;
  priority: number;    // 1-5
  stars: number;       // 0+ human priority override
  heat: number;        // 0.0-1.0 complexity/urgency
  agent: string | null;
  created: string;     // ISO timestamp
  updated: string;
}

interface DepEdge {
  from: string;        // task ID that must complete first
  to: string;          // task ID that depends on "from"
  type: "^" | ";";     // ^ hard dependency, ; soft dependency
}

interface Workflow {
  id: string;
  title: string;
  tasks: string[];     // task IDs
}

interface Project {
  id: string;
  title: string;
  workflows: string[]; // workflow IDs
}

interface TasksData { tasks: Task[] }
interface DepsData { edges: DepEdge[] }
interface WorkflowsData { workflows: Workflow[] }
interface ProjectsData { projects: Project[] }

interface ScoredTask extends Task {
  score: number;
  blocked: boolean;
  blockedBy: string[];
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function loadJSON<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    process.stderr.write(`warning: failed to parse ${path}\n`);
    return fallback;
  }
}

function saveJSON(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function loadTasks(): TasksData {
  return loadJSON<TasksData>(TASKS_FILE, { tasks: [] });
}

function loadDeps(): DepsData {
  return loadJSON<DepsData>(DEPS_FILE, { edges: [] });
}

function loadWorkflows(): WorkflowsData {
  return loadJSON<WorkflowsData>(WORKFLOWS_FILE, { workflows: [] });
}

function loadProjects(): ProjectsData {
  return loadJSON<ProjectsData>(PROJECTS_FILE, { projects: [] });
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Generate hex8 task ID: md5(repo + timestamp + entropy).slice(0,8) */
function generateTaskId(repo: string): string {
  const payload = `${repo}:${Date.now()}:${randomBytes(4).toString("hex")}`;
  return createHash("md5").update(payload).digest("hex").slice(0, 8);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
// score = 10*P + 25*S + 100*H  (from MATRICES.md)

function computeScore(t: Task): number {
  return (t.priority * 10) + (t.stars * 25) + (t.heat * 100);
}

// ─── DAG Blocking ────────────────────────────────────────────────────────────
// A task is blocked if ANY hard dependency (^) is not in state "-" (completed).
// Soft dependencies (;) don't block — they're advisory ordering.

function computeBlocking(tasks: Task[], edges: DepEdge[]): Map<string, string[]> {
  const stateMap = new Map<string, TaskState>();
  for (const t of tasks) stateMap.set(t.id, t.state);

  const blocked = new Map<string, string[]>();

  for (const t of tasks) {
    const hardDeps = edges.filter(e => e.to === t.id && e.type === "^");
    const blockers: string[] = [];
    for (const dep of hardDeps) {
      const depState = stateMap.get(dep.from);
      if (depState !== "-") {
        blockers.push(dep.from);
      }
    }
    blocked.set(t.id, blockers);
  }

  return blocked;
}

// ─── Runnable Filter ─────────────────────────────────────────────────────────
// Runnable = pending states (+ ~ % ?) AND not blocked AND not paused/held/failed

const RUNNABLE_STATES: Set<TaskState> = new Set(["+" , "~", "%", "?"]);
const TERMINAL_STATES: Set<TaskState> = new Set(["-", "_", "#", "!"]);

function isRunnable(t: Task, blockers: string[]): boolean {
  return RUNNABLE_STATES.has(t.state) && blockers.length === 0;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdScore(): void {
  const { tasks } = loadTasks();
  const { edges } = loadDeps();
  const blocking = computeBlocking(tasks, edges);

  const scored: ScoredTask[] = tasks.map(t => ({
    ...t,
    score: computeScore(t),
    blocked: (blocking.get(t.id) || []).length > 0,
    blockedBy: blocking.get(t.id) || [],
  }));

  scored.sort((a, b) => b.score - a.score);

  console.log("ID\tScore\tState\tBlocked\tAgent\tTitle");
  console.log("─".repeat(72));
  for (const s of scored) {
    const blk = s.blocked ? `⛔ ${s.blockedBy.join(",")}` : "✓";
    console.log(`${s.id}\t${s.score}\t${s.state}\t${blk}\t${s.agent || "-"}\t${s.title}`);
  }
}

function cmdRunnable(): void {
  const { tasks } = loadTasks();
  const { edges } = loadDeps();
  const blocking = computeBlocking(tasks, edges);

  const runnable = tasks
    .filter(t => isRunnable(t, blocking.get(t.id) || []))
    .map(t => ({ ...t, score: computeScore(t) }))
    .sort((a, b) => b.score - a.score);

  if (runnable.length === 0) {
    console.log("No runnable tasks.");
    return;
  }

  // JSON output for programmatic consumption
  console.log(JSON.stringify(runnable, null, 2));
}

function cmdBlocked(): void {
  const { tasks } = loadTasks();
  const { edges } = loadDeps();
  const blocking = computeBlocking(tasks, edges);

  let found = false;
  for (const t of tasks) {
    const blockers = blocking.get(t.id) || [];
    if (blockers.length > 0) {
      found = true;
      console.log(`${t.id} ⛔ blocked by: ${blockers.join(", ")}`);
    }
  }
  if (!found) console.log("No blocked tasks.");
}

function cmdStatus(): void {
  const { tasks } = loadTasks();
  const { edges } = loadDeps();
  const blocking = computeBlocking(tasks, edges);

  const total = tasks.length;
  const completed = tasks.filter(t => t.state === "-").length;
  const running = tasks.filter(t => t.state === "&" || t.state === "$").length;
  const pending = tasks.filter(t => RUNNABLE_STATES.has(t.state)).length;
  const blocked = tasks.filter(t => (blocking.get(t.id) || []).length > 0).length;
  const paused = tasks.filter(t => t.state === "_" || t.state === "#").length;
  const failed = tasks.filter(t => t.state === "!").length;

  const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";

  console.log(`Tasks: ${total} total`);
  console.log(`  ✓ completed: ${completed} (${pct}%)`);
  console.log(`  ▶ running:   ${running}`);
  console.log(`  ○ pending:   ${pending}`);
  console.log(`  ⛔ blocked:   ${blocked}`);
  console.log(`  ⏸ paused:    ${paused}`);
  console.log(`  ✗ failed:    ${failed}`);
  console.log(`  deps:        ${edges.length} edges`);

  // Workflow summaries
  const { workflows } = loadWorkflows();
  if (workflows.length > 0) {
    console.log(`\nWorkflows: ${workflows.length}`);
    const taskMap = new Map<string, Task>();
    for (const t of tasks) taskMap.set(t.id, t);

    for (const wf of workflows) {
      const wfTasks = wf.tasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];
      const wfTotal = wfTasks.length;
      const wfDone = wfTasks.filter(t => t.state === "-").length;
      const wfPct = wfTotal > 0 ? ((wfDone / wfTotal) * 100).toFixed(0) : "0";
      console.log(`  ${wf.id}: ${wfDone}/${wfTotal} (${wfPct}%) — ${wf.title}`);
    }
  }
}

function cmdWorkflow(id: string): void {
  const { workflows } = loadWorkflows();
  const wf = workflows.find(w => w.id === id);
  if (!wf) {
    process.stderr.write(`error: workflow '${id}' not found\n`);
    process.exit(1);
  }

  const { tasks } = loadTasks();
  const taskMap = new Map<string, Task>();
  for (const t of tasks) taskMap.set(t.id, t);

  console.log(`Workflow: ${wf.id} — ${wf.title}`);
  console.log("─".repeat(60));

  let done = 0;
  for (const tid of wf.tasks) {
    const t = taskMap.get(tid);
    if (!t) {
      console.log(`  ${tid}\t?\tMISSING`);
      continue;
    }
    const sym = t.state === "-" ? "✓" : t.state === "!" ? "✗" : "○";
    console.log(`  ${sym} ${t.id}\t[${t.state}]\t${t.title}`);
    if (t.state === "-") done++;
  }

  const pct = wf.tasks.length > 0
    ? ((done / wf.tasks.length) * 100).toFixed(0)
    : "0";
  console.log(`\nCompletion: ${done}/${wf.tasks.length} (${pct}%)`);
}

// ─── Mutation Commands ───────────────────────────────────────────────────────

function cmdAdd(id: string | undefined, title: string): void {
  const data = loadTasks();

  const repo = (() => {
    try {
      return execSync("git remote get-url origin", { encoding: "utf-8" }).trim()
        .replace(/^.*[/:]([^/]+\/[^/]+?)(?:\.git)?$/, "$1");
    } catch {
      return "local";
    }
  })();

  // Auto-generate hex8 ID if not supplied
  const taskId = id || generateTaskId(repo);

  if (data.tasks.some(t => t.id === taskId)) {
    process.stderr.write(`error: task '${taskId}' already exists\n`);
    process.exit(1);
  }

  const now = isoNow();
  data.tasks.push({
    id: taskId,
    repo,
    title,
    state: "+",
    priority: 1,
    stars: 0,
    heat: 0,
    agent: null,
    created: now,
    updated: now,
  });

  saveJSON(TASKS_FILE, data);
  console.log(`+ ${taskId}: ${title}`);
}

function cmdSet(id: string, field: string, value: string): void {
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    process.stderr.write(`error: task '${id}' not found\n`);
    process.exit(1);
  }

  const VALID_FIELDS: Record<string, (v: string) => unknown> = {
    state: (v) => {
      if (!"~$%&+-_#!?".includes(v) || v.length !== 1) {
        throw new Error(`invalid state '${v}' — must be one of: ~ $ % & + - _ # ! ?`);
      }
      return v as TaskState;
    },
    priority: (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 1 || n > 5) throw new Error("priority must be 1-5");
      return n;
    },
    stars: (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 0) throw new Error("stars must be >= 0");
      return n;
    },
    heat: (v) => {
      const n = parseFloat(v);
      if (isNaN(n) || n < 0 || n > 1) throw new Error("heat must be 0.0-1.0");
      return n;
    },
    title: (v) => v,
    agent: (v) => v === "null" ? null : v,
  };

  const parser = VALID_FIELDS[field];
  if (!parser) {
    process.stderr.write(`error: unknown field '${field}' — valid: ${Object.keys(VALID_FIELDS).join(", ")}\n`);
    process.exit(1);
  }

  try {
    (task as Record<string, unknown>)[field] = parser(value);
  } catch (e: unknown) {
    process.stderr.write(`error: ${(e as Error).message}\n`);
    process.exit(1);
  }

  task.updated = isoNow();
  saveJSON(TASKS_FILE, data);
  console.log(`= ${id}.${field} → ${value}`);
}

function cmdAssign(id: string, agent: string): void {
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    process.stderr.write(`error: task '${id}' not found\n`);
    process.exit(1);
  }

  task.agent = agent.startsWith("@") ? agent : `@${agent}`;
  task.state = "%";  // agent-assigned
  task.updated = isoNow();
  saveJSON(TASKS_FILE, data);
  console.log(`% ${id} → ${task.agent}`);
}

function cmdComplete(id: string): void {
  const data = loadTasks();
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    process.stderr.write(`error: task '${id}' not found\n`);
    process.exit(1);
  }

  task.state = "-";
  task.updated = isoNow();
  saveJSON(TASKS_FILE, data);
  console.log(`- ${id}: completed`);
}

function cmdDep(from: string, to: string, type: string = "^"): void {
  if (type !== "^" && type !== ";") {
    process.stderr.write(`error: dep type must be ^ (hard) or ; (soft)\n`);
    process.exit(1);
  }

  const data = loadDeps();

  // Prevent duplicate edges
  if (data.edges.some(e => e.from === from && e.to === to)) {
    process.stderr.write(`warning: dep ${from} → ${to} already exists\n`);
    return;
  }

  // Prevent self-dep
  if (from === to) {
    process.stderr.write(`error: task cannot depend on itself\n`);
    process.exit(1);
  }

  // Cycle detection: DFS from 'from' following existing edges — if we reach 'to' → cycle
  const visited = new Set<string>();
  function hasCycle(current: string): boolean {
    if (current === from) return true;  // found cycle back to 'from' via 'to'
    if (visited.has(current)) return false;
    visited.add(current);
    for (const e of data.edges) {
      if (e.from === current && hasCycle(e.to)) return true;
    }
    return false;
  }
  // Check if adding from→to creates a cycle: can 'to' reach 'from' via existing edges?
  if (hasCycle(to)) {
    process.stderr.write(`error: adding ${from} → ${to} would create a cycle\n`);
    process.exit(1);
  }

  data.edges.push({ from, to, type: type as "^" | ";" });
  saveJSON(DEPS_FILE, data);
  console.log(`${type} ${from} → ${to}`);
}

function cmdInit(): void {
  const files: Array<[string, unknown]> = [
    [TASKS_FILE, { tasks: [] }],
    [DEPS_FILE, { edges: [] }],
    [WORKFLOWS_FILE, { workflows: [] }],
    [PROJECTS_FILE, { projects: [] }],
  ];

  for (const [path, data] of files) {
    if (existsSync(path)) {
      console.log(`  exists: ${path}`);
    } else {
      saveJSON(path, data);
      console.log(`  created: ${path}`);
    }
  }
  console.log("Matrix initialized.");
}

function cmdHelp(): void {
  console.log(`matrix — Task state matrix + dependency DAG + scoring

Commands:
  score               Score + rank all tasks (highest first)
  runnable            Tasks eligible for agent pickup (JSON)
  blocked             Show blocking dependency chains
  status              Summary: counts, completion %, workflows
  workflow <id>       Workflow detail with per-task status

  add <id> <title>    Add new task (state=~, priority=1)
  set <id> <f> <v>    Update task field (state/priority/stars/heat/title/agent)
  assign <id> <agent> Assign task to agent (state → %)
  complete <id>       Mark task completed (state → -)
  dep <from> <to> [^|;]  Add dependency (default: ^ hard)

  init                Create empty data files
  help                This message

Scoring: score = 10*P + 25*S + 100*H
  P = priority (1-5), S = stars (0+), H = heat (0.0-1.0)

States: ~ human-assigned, $ human-working, % agent-assigned,
        & agent-executing, + pending, - completed,
        _ paused, # held, ! failure, ? awaiting-input`);
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "score":
    cmdScore();
    break;

  case "runnable":
    cmdRunnable();
    break;

  case "blocked":
    cmdBlocked();
    break;

  case "status":
    cmdStatus();
    break;

  case "workflow":
    if (!args[0]) { process.stderr.write("usage: matrix workflow <id>\n"); process.exit(2); }
    cmdWorkflow(args[0]);
    break;

  case "add":
    if (!args[0]) { process.stderr.write("usage: matrix add [id] <title>\n"); process.exit(2); }
    // If only one arg, it's the title (auto-gen ID). If 2+, first is ID.
    if (args.length === 1) {
      cmdAdd(undefined, args[0]);
    } else {
      cmdAdd(args[0], args.slice(1).join(" "));
    }
    break;

  case "set":
    if (!args[0] || !args[1] || !args[2]) { process.stderr.write("usage: matrix set <id> <field> <value>\n"); process.exit(2); }
    cmdSet(args[0], args[1], args[2]);
    break;

  case "assign":
    if (!args[0] || !args[1]) { process.stderr.write("usage: matrix assign <id> <agent>\n"); process.exit(2); }
    cmdAssign(args[0], args[1]);
    break;

  case "complete":
    if (!args[0]) { process.stderr.write("usage: matrix complete <id>\n"); process.exit(2); }
    cmdComplete(args[0]);
    break;

  case "dep":
    if (!args[0] || !args[1]) { process.stderr.write("usage: matrix dep <from> <to> [^|;]\n"); process.exit(2); }
    cmdDep(args[0], args[1], args[2] || "^");
    break;

  case "init":
    cmdInit();
    break;

  case "help":
  case undefined:
    cmdHelp();
    break;

  default:
    process.stderr.write(`error: unknown command '${cmd}'\n`);
    cmdHelp();
    process.exit(2);
}
