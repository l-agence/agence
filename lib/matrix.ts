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
import { claimTask } from "./scope.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const DATA_DIR = join(AGENCE_ROOT, "organic");
const DASHBOARDS_DIR = join(DATA_DIR, "dashboards");
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
  scope?: string[];    // file paths this task owns (scope collision prevention)
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

// ─── Dashboard Generation ────────────────────────────────────────────────────
// Regenerates TASKS.md, WORKFLOWS.md, PROJECTS.md from organic/ JSON sources.
// Triggered by: airun matrix dashboard | agence ^regen | post-commit hook

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function genTasksDashboard(
  tasks: Task[], edges: DepEdge[], blocking: Map<string, string[]>
): string {
  const scored = tasks.map(t => ({
    ...t, score: computeScore(t), blockedBy: blocking.get(t.id) || [],
  })).sort((a, b) => b.score - a.score);

  const total = tasks.length;
  const completed = tasks.filter(t => t.state === "-").length;
  const running = tasks.filter(t => t.state === "&" || t.state === "$").length;
  const pending = tasks.filter(t => RUNNABLE_STATES.has(t.state)).length;
  const blocked = tasks.filter(t => (blocking.get(t.id) || []).length > 0).length;
  const failed = tasks.filter(t => t.state === "!").length;

  // State distribution
  const stateCounts = new Map<string, number>();
  for (const t of tasks) stateCounts.set(t.state, (stateCounts.get(t.state) || 0) + 1);

  const stateLabels: Record<string, string> = {
    "+": "Pending", "~": "Human-assigned", "$": "Human-working",
    "%": "Agent-assigned", "&": "Agent-executing", "-": "Completed",
    "_": "Paused", "#": "Held", "!": "Failure", "?": "Awaiting-input",
  };

  let md = `# Tasks Dashboard\n\n`;
  md += `> **Source**: \`organic/tasks.json\` | **Formula**: score = 10P + 25S + 100H\n`;
  md += `> **Generated**: ${dateStamp()} | **Project**: PROJ-LAGENCE\n\n---\n\n`;

  // Active Tasks table
  md += `## Active Tasks\n\n`;
  md += `| ID | Title | State | Pri | Stars | Heat | Score | Agent | Blocked By |\n`;
  md += `|----|-------|-------|-----|-------|------|-------|-------|------------|\n`;
  for (const s of scored) {
    const done = s.state === "-";
    const id = done ? `~~${s.id}~~` : s.id;
    const title = done ? `~~${s.title}~~` : s.title;
    const blk = s.blockedBy.length > 0
      ? s.blockedBy.map(b => {
          const bt = tasks.find(t => t.id === b);
          return bt && bt.state === "-" ? `~~${b}~~` : b;
        }).join(", ")
      : "\u2014";
    md += `| ${id} | ${title} | \`${s.state}\` | ${s.priority} | ${s.stars} | ${s.heat} | **${s.score}** | ${s.agent || "\u2014"} | ${blk} |\n`;
  }

  // Summary
  md += `\n## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total tasks | ${total} |\n`;
  md += `| Runnable | ${pending} |\n`;
  md += `| Blocked | ${blocked} |\n`;
  md += `| Completed | ${completed} |\n`;
  md += `| Failed | ${failed} |\n`;

  // State Distribution
  md += `\n## State Distribution\n\n`;
  md += `| State | Symbol | Count |\n|-------|--------|-------|\n`;
  for (const [sym, count] of stateCounts) {
    md += `| ${stateLabels[sym] || sym} | \`${sym}\` | ${count} |\n`;
  }

  // Scoring Leaderboard (top 10)
  md += `\n---\n\n## Scoring Leaderboard\n\n`;
  md += `*Top 10 tasks by score (highest first):*\n\n`;
  md += `| Rank | ID | Score | State |\n|------|----|-------|-------|\n`;
  const top10 = scored.slice(0, 10);
  for (let i = 0; i < top10.length; i++) {
    const s = top10[i];
    const done = s.state === "-";
    const id = done ? `~~${s.id}~~` : s.id;
    const stateStr = done ? `\`-\` \u2705` : `\`${s.state}\``;
    md += `| ${i + 1} | ${id} | ${s.score} | ${stateStr} |\n`;
  }

  // Dependency Graph (ASCII)
  md += `\n---\n\n## Dependency Graph\n\n`;
  const taskMap = new Map<string, Task>();
  for (const t of tasks) taskMap.set(t.id, t);

  // Group edges into chains
  const rendered = new Set<string>();
  for (const e of edges) {
    const key = `${e.from}->${e.to}`;
    if (rendered.has(key)) continue;
    rendered.add(key);
    const fromT = taskMap.get(e.from);
    const toT = taskMap.get(e.to);
    const fromDone = fromT?.state === "-" ? " \u2705" : ` ${fromT?.state || "?"}`;
    const toDone = toT?.state === "-" ? " \u2705" : ` ${toT?.state || "?"}`;
    const arrow = e.type === "^" ? "\u2500\u2500^\u2500\u2500>" : "\u2500\u2500 ; \u2500\u2500>";
    md += `${e.from}${fromDone} ${arrow} ${e.to}${toDone}\n\n`;
  }
  md += `^ = hard block | ; = soft advisory\n\n`;

  md += `---\n\n*Regenerate: \`airun matrix dashboard\` | Spec: MATRICES.md | Symbols: SYMBOLS.md*\n`;
  return md;
}

function genWorkflowsDashboard(
  tasks: Task[], edges: DepEdge[], workflows: Workflow[], blocking: Map<string, string[]>
): string {
  const taskMap = new Map<string, Task>();
  for (const t of tasks) taskMap.set(t.id, t);

  let md = `# Workflows Dashboard\n\n`;
  md += `> **Source**: \`organic/workflows.json\` + \`organic/tasks.json\`\n`;
  md += `> **Generated**: ${dateStamp()} | **Project**: PROJ-LAGENCE\n\n---\n\n`;

  // Summary table
  md += `## Active Workflows\n\n`;
  md += `| ID | Title | Tasks | Completed | Remaining | Completion % | Status |\n`;
  md += `|----|-------|-------|-----------|-----------|-------------|--------|\n`;
  for (const wf of workflows) {
    const wfTasks = wf.tasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];
    const wfTotal = wfTasks.length;
    const wfDone = wfTasks.filter(t => t.state === "-").length;
    const pct = wfTotal > 0 ? Math.round((wfDone / wfTotal) * 100) : 0;
    const status = pct === 100 ? "\u2705 Done" : pct > 0 ? "\uD83D\uDFE1 In progress" : "\u26AA Not started";
    md += `| ${wf.id} | ${wf.title} | ${wfTotal} | ${wfDone} | ${wfTotal - wfDone} | ${pct}% | ${status} |\n`;
  }

  // Per-workflow detail
  md += `\n---\n\n## Workflow Detail\n`;
  for (const wf of workflows) {
    const wfTasks = wf.tasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];
    md += `\n### ${wf.id} \u2014 ${wf.title} (${wfTasks.length} tasks)\n\n`;
    md += `| ID | Title | State | Score | Blocked |\n`;
    md += `|----|-------|-------|-------|---------|\n`;
    for (const t of wfTasks) {
      const score = computeScore(t);
      const blockers = blocking.get(t.id) || [];
      const blk = blockers.length > 0
        ? blockers.map(b => {
            const bt = taskMap.get(b);
            return bt && bt.state === "-" ? `~~${b}~~` : b;
          }).join(", ")
        : "\u2014";
      md += `| ${t.id} | ${t.title} | \`${t.state}\` | ${score} | ${blk} |\n`;
    }
  }

  md += `\n---\n\n## Completion Formula\n\n`;
  md += `$$\\text{completion}(W) = \\frac{|\\{t \\in W : \\text{state}(t) = \\texttt{\"-\"}\\}|}{|W|} \\times 100\\%$$\n\n`;
  md += `A workflow is **complete** when all its tasks reach state \`-\`.\n\n`;
  md += `---\n\n*Regenerate: \`airun matrix dashboard\` | Spec: [MATRICES.md](../MATRICES.md)*\n`;
  return md;
}

function genProjectsDashboard(
  tasks: Task[], workflows: Workflow[], projects: Project[],
  blocking: Map<string, string[]>
): string {
  const taskMap = new Map<string, Task>();
  for (const t of tasks) taskMap.set(t.id, t);
  const wfMap = new Map<string, Workflow>();
  for (const wf of workflows) wfMap.set(wf.id, wf);

  let md = `# Projects Dashboard\n\n`;
  md += `> **Source**: \`organic/projects.json\` + \`organic/workflows.json\`\n`;
  md += `> **Generated**: ${dateStamp()} | **Repo**: agence-master\n\n---\n\n`;

  md += `## Active Projects\n\n`;
  md += `| ID | Title | Workflows | Avg Completion % | Status |\n`;
  md += `|----|-------|-----------|-----------------|--------|\n`;

  for (const proj of projects) {
    const projWfs = proj.workflows.map(id => wfMap.get(id)).filter(Boolean) as Workflow[];
    let totalPct = 0;
    for (const wf of projWfs) {
      const wfTasks = wf.tasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];
      const wfDone = wfTasks.filter(t => t.state === "-").length;
      totalPct += wfTasks.length > 0 ? (wfDone / wfTasks.length) * 100 : 0;
    }
    const avgPct = projWfs.length > 0 ? Math.round(totalPct / projWfs.length) : 0;
    const status = avgPct === 100 ? "\u2705 Done" : avgPct > 0 ? "\uD83D\uDFE1 In progress" : "\u26AA Not started";
    md += `| ${proj.id} | ${proj.title} | ${projWfs.length} | ${avgPct}% | ${status} |\n`;
  }

  // Project → Workflow Breakdown
  for (const proj of projects) {
    const projWfs = proj.workflows.map(id => wfMap.get(id)).filter(Boolean) as Workflow[];
    md += `\n## Project \u2192 Workflow Breakdown\n\n`;
    md += `### ${proj.id} \u2014 ${proj.title}\n\n`;
    md += `| Workflow | Title | Tasks | Done | Completion |\n`;
    md += `|----------|-------|-------|------|------------|\n`;
    let grandTotal = 0, grandDone = 0;
    for (const wf of projWfs) {
      const wfTasks = wf.tasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];
      const wfDone = wfTasks.filter(t => t.state === "-").length;
      const pct = wfTasks.length > 0 ? Math.round((wfDone / wfTasks.length) * 100) : 0;
      md += `| ${wf.id} | ${wf.title} | ${wfTasks.length} | ${wfDone} | ${pct}% |\n`;
      grandTotal += wfTasks.length;
      grandDone += wfDone;
    }
    const grandPct = grandTotal > 0 ? Math.round((grandDone / grandTotal) * 100) : 0;
    md += `| **Total** | | **${grandTotal}** | **${grandDone}** | **${grandPct}%** |\n`;

    // Score Heat Map
    md += `\n### Score Heat Map\n\n`;
    md += `| Workflow | Top Score | Total Score | Blocked |\n`;
    md += `|----------|-----------|-------------|---------|\n`;
    for (const wf of projWfs) {
      const wfTasks = wf.tasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];
      const scores = wfTasks.map(t => computeScore(t));
      const topScore = scores.length > 0 ? Math.max(...scores) : 0;
      const totalScore = scores.reduce((a, b) => a + b, 0);
      const blockedCount = wfTasks.filter(t => (blocking.get(t.id) || []).length > 0).length;
      md += `| ${wf.id} | ${topScore} | ${totalScore} | ${blockedCount} |\n`;
    }
  }

  md += `\n---\n\n## Completion Formula\n\n`;
  md += `$$\\text{completion}(P) = \\frac{\\sum_{W \\in P} \\text{completion}(W)}{|P|}$$\n\n`;
  md += `Project completion is the mean of its workflow completions.\n\n`;
  md += `---\n\n*Regenerate: \`airun matrix dashboard\` | Spec: [MATRICES.md](../MATRICES.md)*\n`;
  return md;
}

function cmdDashboard(): void {
  const { tasks } = loadTasks();
  const { edges } = loadDeps();
  const { workflows } = loadWorkflows();
  const { projects } = loadProjects();
  const blocking = computeBlocking(tasks, edges);

  mkdirSync(DASHBOARDS_DIR, { recursive: true });

  const tasksMd = genTasksDashboard(tasks, edges, blocking);
  writeFileSync(join(DASHBOARDS_DIR, "TASKS.md"), tasksMd, "utf-8");

  const workflowsMd = genWorkflowsDashboard(tasks, edges, workflows, blocking);
  writeFileSync(join(DASHBOARDS_DIR, "WORKFLOWS.md"), workflowsMd, "utf-8");

  const projectsMd = genProjectsDashboard(tasks, workflows, projects, blocking);
  writeFileSync(join(DASHBOARDS_DIR, "PROJECTS.md"), projectsMd, "utf-8");

  console.log(`Dashboard regenerated → ${DASHBOARDS_DIR}/`);
  console.log(`  TASKS.md      ${tasks.length} tasks`);
  console.log(`  WORKFLOWS.md  ${workflows.length} workflows`);
  console.log(`  PROJECTS.md   ${projects.length} projects`);
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
  const result = claimTask(id, agent);
  if (!result.success) {
    if (result.conflicts && result.conflicts.length > 0) {
      process.stderr.write(`error: scope collision for '${id}':\n`);
      for (const c of result.conflicts) {
        process.stderr.write(`  ${c.task_id} (${c.agent}): ${c.overlapping_paths.join(", ")}\n`);
      }
    } else {
      process.stderr.write(`error: ${result.reason}\n`);
    }
    process.exit(1);
  }
  console.log(`% ${id} → ${result.agent}`);
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

  dashboard           Regenerate organic/dashboards/ from JSON sources

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

  case "dashboard":
    cmdDashboard();
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
