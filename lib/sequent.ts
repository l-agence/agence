#!/usr/bin/env bun
// lib/sequent.ts — Tournament Tangent Orchestration
//
// A SEQUENT is a bounded set of tangents exploring the same task in parallel.
// The winning tangent's commits become the RESULTANT — cherry-picked back to
// the parent branch. Losers are discarded. This is selection, not merge.
//
// Terminology:
//   tangent    → single execution branch (live agent instance on worktree)
//   sequent    → orchestrated set of tangents (exploration plan)
//   resultant  → chosen outcome (winning tangent's commits)
//
// Usage:
//   airun sequent create <n> [--task <desc>] [--agents a1,a2,...]
//   airun sequent status [id]
//   airun sequent list
//   airun sequent score <id>
//   airun sequent pick <id> <tangent-id>
//   airun sequent destroy <id>
//   airun sequent help

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { createHash, randomBytes } from "crypto";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
const SEQUENT_DIR = join(AGENCE_ROOT, "nexus", "agentd", "sequents");
const AGENTD_BIN = join(AGENCE_ROOT, "bin", "agentd");
const BUN = process.env.BUN_PATH || "bun";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SequentTangent {
  id: string;
  agent: string;
  status: "running" | "done" | "failed" | "picked";
  commits: number;
  testsPassed: boolean | null;
  score: number | null;
  startedAt: string;
  finishedAt: string | null;
}

interface Sequent {
  id: string;
  task: string;
  tangents: SequentTangent[];
  status: "running" | "scored" | "resolved" | "destroyed";
  resultant: string | null; // winning tangent ID
  createdAt: string;
  resolvedAt: string | null;
  parentBranch: string;
  parentCommit: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

// SEC-016: Validate IDs to prevent path traversal (only hex8 or hex8-N format)
const SEQUENT_ID_RE = /^[0-9a-f]{8}$/;
const TANGENT_ID_RE = /^[0-9a-f]{8}-\d{1,2}$/;

function isValidSequentId(id: string): boolean {
  return SEQUENT_ID_RE.test(id);
}

function isValidTangentId(id: string): boolean {
  return TANGENT_ID_RE.test(id);
}

function sequentPath(id: string): string {
  if (!isValidSequentId(id)) throw new Error(`Invalid sequent ID: ${id}`);
  return join(SEQUENT_DIR, `${id}.json`);
}

function loadSequent(id: string): Sequent | null {
  if (!isValidSequentId(id)) return null;
  const p = sequentPath(id);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); }
  catch { return null; }
}

function saveSequent(seq: Sequent): void {
  ensureDir(SEQUENT_DIR);
  writeFileSync(sequentPath(seq.id), JSON.stringify(seq, null, 2) + "\n", { mode: 0o600 });
}

function generateId(): string {
  return createHash("md5")
    .update(`${AGENCE_ROOT}:${Date.now()}:${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 8);
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function getCurrentBranch(): string {
  const r = spawnSync("git", ["-C", AGENCE_ROOT, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf-8", timeout: 5000,
  });
  return (r.stdout || "").trim() || "HEAD";
}

function getCurrentCommit(): string {
  const r = spawnSync("git", ["-C", AGENCE_ROOT, "rev-parse", "HEAD"], {
    encoding: "utf-8", timeout: 5000,
  });
  return (r.stdout || "").trim().slice(0, 12);
}

// ─── Tangent Integration ─────────────────────────────────────────────────────
// Calls agentd tangent create/destroy via subprocess (agentd is bash, not importable)

function agentdTangentCreate(tangentId: string, agent: string, taskId: string): boolean {
  const r = spawnSync(AGENTD_BIN, ["tangent", "create", "--task", taskId, tangentId, agent], {
    cwd: AGENCE_ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, AGENCE_ROOT },
  });
  if (r.status !== 0) {
    process.stderr.write(`[sequent] Failed to create tangent ${tangentId}: ${r.stderr || r.stdout}\n`);
    return false;
  }
  process.stderr.write(`[sequent] Tangent created: ${tangentId} (agent=${agent})\n`);
  return true;
}

function agentdTangentDestroy(tangentId: string): void {
  spawnSync(AGENTD_BIN, ["tangent", "destroy", tangentId], {
    cwd: AGENCE_ROOT,
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, AGENCE_ROOT },
  });
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
// Score a tangent based on: commit count, test pass, and optional human weight.
// This is the tournament judge — simple heuristic, extensible.

function scoreTangent(seq: Sequent, tangent: SequentTangent): number {
  // SEC-016: validate tangent ID before constructing filesystem path
  if (!isValidTangentId(tangent.id)) {
    process.stderr.write(`[sequent] Invalid tangent ID in stored data: ${tangent.id}\n`);
    tangent.score = 0;
    return 0;
  }
  const worktreePath = join(AGENCE_ROOT, "nexus", "agentd", "worktrees", tangent.id);

  // Count commits ahead of parent
  const commitResult = spawnSync("git", [
    "-C", worktreePath, "rev-list", "--count", `${seq.parentCommit}..HEAD`,
  ], { encoding: "utf-8", timeout: 5000 });
  const commits = parseInt((commitResult.stdout || "").trim(), 10) || 0;
  tangent.commits = commits;

  // Run tests if bun test exists
  let testsPassed: boolean | null = null;
  const bunfile = join(worktreePath, "package.json");
  if (existsSync(bunfile)) {
    const testResult = spawnSync("bun", ["test"], {
      cwd: worktreePath,
      encoding: "utf-8",
      timeout: 120_000,
      env: { ...process.env, AGENCE_ROOT: worktreePath },
    });
    testsPassed = testResult.status === 0;
  }
  tangent.testsPassed = testsPassed;

  // Score formula:
  //   base = commits * 10 (rewarded progress)
  //   bonus = tests pass → +50, tests fail → -30, no tests → 0
  //   penalty = 0 commits → score 0 (no work done)
  let score = commits * 10;
  if (testsPassed === true) score += 50;
  else if (testsPassed === false) score -= 30;
  if (commits === 0) score = 0;

  tangent.score = score;
  return score;
}

// ─── Cherry-Pick Resultant ───────────────────────────────────────────────────
// Extract the winning tangent's commits back to the parent branch.

function cherryPickResultant(seq: Sequent, tangentId: string): boolean {
  // SEC-016: validate tangent ID before path construction
  if (!isValidTangentId(tangentId)) {
    process.stderr.write(`[sequent] Invalid tangent ID: ${tangentId}\n`);
    return false;
  }
  const worktreePath = join(AGENCE_ROOT, "nexus", "agentd", "worktrees", tangentId);
  if (!existsSync(worktreePath)) {
    process.stderr.write(`[sequent] Worktree not found: ${worktreePath}\n`);
    return false;
  }

  // Get list of commits ahead of parent (oldest first)
  const logResult = spawnSync("git", [
    "-C", worktreePath, "rev-list", "--reverse", `${seq.parentCommit}..HEAD`,
  ], { encoding: "utf-8", timeout: 5000 });

  const commits = (logResult.stdout || "").trim().split("\n").filter(Boolean);
  if (commits.length === 0) {
    process.stderr.write(`[sequent] No commits to cherry-pick from ${tangentId}\n`);
    return false;
  }

  // Cherry-pick each commit onto the parent branch
  process.stderr.write(`[sequent] Cherry-picking ${commits.length} commit(s) from ${tangentId}...\n`);
  const cpResult = spawnSync("git", [
    "-C", AGENCE_ROOT, "cherry-pick", ...commits,
  ], { encoding: "utf-8", timeout: 60_000 });

  if (cpResult.status !== 0) {
    process.stderr.write(`[sequent] Cherry-pick failed: ${cpResult.stderr}\n`);
    process.stderr.write(`[sequent] Aborting cherry-pick...\n`);
    spawnSync("git", ["-C", AGENCE_ROOT, "cherry-pick", "--abort"], { timeout: 5000 });
    return false;
  }

  process.stderr.write(`[sequent] ✓ Resultant applied: ${commits.length} commit(s) from ${tangentId}\n`);
  return true;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdCreate(args: string[]): number {
  let n = 2; // default: 2 tangents
  let task = "";
  let agents: string[] = [];

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task" && args[i + 1]) { task = args[++i]; continue; }
    if (args[i] === "--agents" && args[i + 1]) { agents = args[++i].split(","); continue; }
    if (/^\d+$/.test(args[i])) { n = parseInt(args[i], 10); continue; }
    // Bare string = task description
    if (!task) task = args[i];
  }

  if (n < 2 || n > 8) {
    process.stderr.write("[sequent] Error: tangent count must be 2-8\n");
    return 2;
  }

  if (!task) {
    process.stderr.write("Usage: airun sequent create <n> [--task <desc>] [--agents a1,a2,...]\n");
    return 2;
  }

  // Default agents: rotate through available agents
  const defaultAgents = ["copilot", "claude", "gemini", "gpt"];
  if (agents.length === 0) {
    agents = Array.from({ length: n }, (_, i) => defaultAgents[i % defaultAgents.length]);
  }
  while (agents.length < n) agents.push(agents[agents.length - 1]);

  const seqId = generateId();
  const parentBranch = getCurrentBranch();
  const parentCommit = getCurrentCommit();
  const taskId = generateId(); // shared task across all tangents

  process.stderr.write(`[sequent] Creating sequent ${seqId}: ${n} tangents for "${task}"\n`);
  process.stderr.write(`[sequent] Parent: ${parentBranch}@${parentCommit}\n`);

  const tangents: SequentTangent[] = [];

  for (let i = 0; i < n; i++) {
    const tangentId = `${seqId}-${i}`;
    const agent = agents[i];

    if (!agentdTangentCreate(tangentId, agent, taskId)) {
      process.stderr.write(`[sequent] ✗ Failed to create tangent ${i + 1}/${n}. Rolling back...\n`);
      // Rollback: destroy any created tangents
      for (const t of tangents) agentdTangentDestroy(t.id);
      return 1;
    }

    tangents.push({
      id: tangentId,
      agent,
      status: "running",
      commits: 0,
      testsPassed: null,
      score: null,
      startedAt: isoNow(),
      finishedAt: null,
    });
  }

  const seq: Sequent = {
    id: seqId,
    task,
    tangents,
    status: "running",
    resultant: null,
    createdAt: isoNow(),
    resolvedAt: null,
    parentBranch,
    parentCommit,
  };

  saveSequent(seq);

  // Inject the task into all tangents
  for (const t of tangents) {
    const injectResult = spawnSync(AGENTD_BIN, ["inject", t.id, task], {
      cwd: AGENCE_ROOT,
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, AGENCE_ROOT },
    });
    if (injectResult.status !== 0) {
      process.stderr.write(`[sequent] ⚠ inject to ${t.id} failed (tangent may need manual start)\n`);
    }
  }

  console.log(JSON.stringify({ sequent: seqId, tangents: tangents.map(t => t.id), task }, null, 2));
  process.stderr.write(`[sequent] ✓ Sequent ${seqId} started. ${n} tangents racing.\n`);
  process.stderr.write(`  Score:  airun sequent score ${seqId}\n`);
  process.stderr.write(`  Pick:   airun sequent pick ${seqId} <tangent-id>\n`);
  process.stderr.write(`  Status: airun sequent status ${seqId}\n`);
  return 0;
}

function cmdStatus(args: string[]): number {
  const id = args[0];
  if (!id) {
    // Show all sequents
    return cmdList();
  }

  // SEC-016: validate ID before filesystem access
  if (!isValidSequentId(id)) {
    process.stderr.write(`[sequent] Invalid sequent ID format: ${id}\n`);
    return 1;
  }

  const seq = loadSequent(id);
  if (!seq) {
    process.stderr.write(`[sequent] Not found: ${id}\n`);
    return 1;
  }

  console.log(`Sequent: ${seq.id} [${seq.status}]`);
  console.log(`Task:    ${seq.task}`);
  console.log(`Parent:  ${seq.parentBranch}@${seq.parentCommit}`);
  console.log(`Created: ${seq.createdAt}`);
  if (seq.resolvedAt) console.log(`Resolved: ${seq.resolvedAt}`);
  if (seq.resultant) console.log(`Resultant: ${seq.resultant}`);
  console.log(`\nTangents (${seq.tangents.length}):`);
  console.log(`  ${"ID".padEnd(16)} ${"AGENT".padEnd(10)} ${"STATUS".padEnd(10)} ${"COMMITS".padEnd(8)} ${"TESTS".padEnd(6)} SCORE`);
  console.log(`  ${"—".repeat(16)} ${"—".repeat(10)} ${"—".repeat(10)} ${"—".repeat(8)} ${"—".repeat(6)} ${"—".repeat(5)}`);
  for (const t of seq.tangents) {
    const tests = t.testsPassed === null ? "—" : t.testsPassed ? "✓" : "✗";
    const score = t.score === null ? "—" : String(t.score);
    const mark = t.id === seq.resultant ? " ★" : "";
    console.log(`  ${t.id.padEnd(16)} ${t.agent.padEnd(10)} ${t.status.padEnd(10)} ${String(t.commits).padEnd(8)} ${tests.padEnd(6)} ${score}${mark}`);
  }
  return 0;
}

function cmdList(): number {
  ensureDir(SEQUENT_DIR);
  const files = readdirSync(SEQUENT_DIR).filter(f => f.endsWith(".json") && SEQUENT_ID_RE.test(f.replace(".json", "")));
  if (files.length === 0) {
    console.log("[sequent] No active sequents.");
    return 0;
  }
  console.log(`[sequent] ${files.length} sequent(s):\n`);
  console.log(`  ${"ID".padEnd(10)} ${"STATUS".padEnd(10)} ${"TANGENTS".padEnd(10)} ${"TASK".padEnd(40)}`);
  console.log(`  ${"—".repeat(10)} ${"—".repeat(10)} ${"—".repeat(10)} ${"—".repeat(40)}`);
  for (const f of files) {
    try {
      const seq: Sequent = JSON.parse(readFileSync(join(SEQUENT_DIR, f), "utf-8"));
      const task = seq.task.length > 38 ? seq.task.slice(0, 35) + "..." : seq.task;
      console.log(`  ${seq.id.padEnd(10)} ${seq.status.padEnd(10)} ${String(seq.tangents.length).padEnd(10)} ${task}`);
    } catch { /* skip corrupt */ }
  }
  return 0;
}

function cmdScore(args: string[]): number {
  const id = args[0];
  if (!id) {
    process.stderr.write("Usage: airun sequent score <sequent-id>\n");
    return 2;
  }

  // SEC-016: validate ID before filesystem access
  if (!isValidSequentId(id)) {
    process.stderr.write(`[sequent] Invalid sequent ID format: ${id}\n`);
    return 1;
  }

  const seq = loadSequent(id);
  if (!seq) {
    process.stderr.write(`[sequent] Not found: ${id}\n`);
    return 1;
  }
  if (seq.status === "resolved" || seq.status === "destroyed") {
    process.stderr.write(`[sequent] Sequent ${id} already ${seq.status}\n`);
    return 1;
  }

  process.stderr.write(`[sequent] Scoring ${seq.tangents.length} tangent(s) for sequent ${id}...\n`);

  for (const t of seq.tangents) {
    if (t.status === "running" || t.status === "done") {
      const worktreePath = join(AGENCE_ROOT, "nexus", "agentd", "worktrees", t.id);
      if (!existsSync(worktreePath)) {
        t.status = "failed";
        t.score = 0;
        continue;
      }
      scoreTangent(seq, t);
      if (t.commits > 0) t.status = "done";
      t.finishedAt = t.finishedAt || isoNow();
    }
  }

  seq.status = "scored";
  saveSequent(seq);

  // Display results
  const sorted = [...seq.tangents].sort((a, b) => (b.score || 0) - (a.score || 0));
  process.stderr.write(`\n[sequent] Scores for ${id}:\n`);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "  ";
    const tests = t.testsPassed === null ? "no tests" : t.testsPassed ? "tests ✓" : "tests ✗";
    process.stderr.write(`  ${medal} ${t.id} (${t.agent}): score=${t.score}, commits=${t.commits}, ${tests}\n`);
  }

  if (sorted[0] && sorted[0].score! > 0) {
    process.stderr.write(`\n[sequent] Recommended: airun sequent pick ${id} ${sorted[0].id}\n`);
  } else {
    process.stderr.write(`\n[sequent] ⚠ No tangent has commits. Wait for agents to finish.\n`);
  }
  return 0;
}

function cmdPick(args: string[]): number {
  const [id, tangentId] = args;
  if (!id || !tangentId) {
    process.stderr.write("Usage: airun sequent pick <sequent-id> <tangent-id>\n");
    return 2;
  }

  // SEC-016: validate IDs before any filesystem/git operation
  if (!isValidSequentId(id)) {
    process.stderr.write(`[sequent] Invalid sequent ID format: ${id}\n`);
    return 1;
  }
  if (!isValidTangentId(tangentId)) {
    process.stderr.write(`[sequent] Invalid tangent ID format: ${tangentId}\n`);
    return 1;
  }

  const seq = loadSequent(id);
  if (!seq) {
    process.stderr.write(`[sequent] Not found: ${id}\n`);
    return 1;
  }
  if (seq.status === "resolved") {
    process.stderr.write(`[sequent] Already resolved (resultant: ${seq.resultant})\n`);
    return 1;
  }

  const tangent = seq.tangents.find(t => t.id === tangentId);
  if (!tangent) {
    process.stderr.write(`[sequent] Tangent ${tangentId} not in sequent ${id}\n`);
    process.stderr.write(`  Available: ${seq.tangents.map(t => t.id).join(", ")}\n`);
    return 1;
  }

  // Cherry-pick the winner's commits
  process.stderr.write(`[sequent] Picking resultant: ${tangentId} (${tangent.agent})\n`);
  if (!cherryPickResultant(seq, tangentId)) {
    process.stderr.write(`[sequent] ✗ Cherry-pick failed. Sequent not resolved.\n`);
    return 1;
  }

  // Mark resultant
  tangent.status = "picked";
  seq.resultant = tangentId;
  seq.status = "resolved";
  seq.resolvedAt = isoNow();
  saveSequent(seq);

  // Destroy all tangents (winner already cherry-picked, losers discarded)
  process.stderr.write(`[sequent] Cleaning up tangents...\n`);
  for (const t of seq.tangents) {
    agentdTangentDestroy(t.id);
  }

  process.stderr.write(`[sequent] ✓ Sequent ${id} resolved. Resultant: ${tangentId}\n`);
  process.stderr.write(`  Commits cherry-picked to ${seq.parentBranch}\n`);
  return 0;
}

function cmdDestroy(args: string[]): number {
  const id = args[0];
  if (!id) {
    process.stderr.write("Usage: airun sequent destroy <sequent-id>\n");
    return 2;
  }

  // SEC-016: validate ID before filesystem access
  if (!isValidSequentId(id)) {
    process.stderr.write(`[sequent] Invalid sequent ID format: ${id}\n`);
    return 1;
  }

  const seq = loadSequent(id);
  if (!seq) {
    process.stderr.write(`[sequent] Not found: ${id}\n`);
    return 1;
  }

  process.stderr.write(`[sequent] Destroying sequent ${id} (${seq.tangents.length} tangents)...\n`);
  for (const t of seq.tangents) {
    agentdTangentDestroy(t.id);
  }

  seq.status = "destroyed";
  saveSequent(seq);

  process.stderr.write(`[sequent] ✓ Sequent ${id} destroyed.\n`);
  return 0;
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "create":
    process.exit(cmdCreate(args));
    break;
  case "status":
    process.exit(cmdStatus(args));
    break;
  case "list":
    process.exit(cmdList());
    break;
  case "score":
    process.exit(cmdScore(args));
    break;
  case "pick":
    process.exit(cmdPick(args));
    break;
  case "destroy":
    process.exit(cmdDestroy(args));
    break;
  case "--help":
  case "help":
    console.error(`Usage: airun sequent <command> [args...]

Tournament Tangents — N agents explore same task, pick resultant.

Commands:
  create <n> [--task <desc>] [--agents a1,a2,...]   Fan out N tangents
  status [id]                                       Show sequent status
  list                                              List all sequents
  score <id>                                        Score tangents (commits + tests)
  pick <id> <tangent-id>                            Pick winner, cherry-pick, cleanup
  destroy <id>                                      Discard all tangents (no winner)

Workflow:
  1. airun sequent create 3 --task "implement feature X"
  2. (agents work in parallel on isolated worktrees...)
  3. airun sequent score <id>           # score when agents finish
  4. airun sequent pick <id> <winner>   # cherry-pick winner, destroy losers

Scoring: commits×10 + tests_pass(+50) + tests_fail(-30). 0 commits = 0 score.
Agents: defaults to copilot,claude,gemini rotation. Override with --agents.
Limit: 2-8 tangents per sequent.`);
    process.exit(0);
    break;
  default:
    if (cmd) {
      console.error(`[sequent] Unknown command: ${cmd}. Try: airun sequent help`);
    } else {
      console.error("Usage: airun sequent <create|status|list|score|pick|destroy|help>");
    }
    process.exit(2);
}
