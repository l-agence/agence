#!/usr/bin/env bun
// lib/runs.ts — Task-Session Linkage (Ledger-First Architecture)
//
// A "run" = one activation of a task within a session. The ledger is the
// single chain of record. The cache (nexus/.airuns/) is a materialized view
// rebuildable from the ledger at any time.
//
// Ledger decision_types for task lifecycle:
//   run:start   — task activated (links task_id + session_id + agent)
//   run:end     — task finalized (outcome + cost summary)
//   sequent     — ordered step within a task (step N)
//   tangent     — divergence/exploration (parent_id = what branched from)
//   resultant   — concrete output produced (artifact = commit/file/url)
//   cost        — token usage (model, tokens_in, tokens_out, cost_usd)
//
// SWE statistics (computed views over the chain):
//   cycle_time    — elapsed time from run:start to run:end
//   tangent_ratio — tangents / sequents (exploration overhead)
//   first_pass    — resolved without tangents (boolean)
//   cost_per_task — total USD spent on a task
//   rework_count  — number of re-opens (multiple run:start for same task_id)
//
// Cache: nexus/.airuns/<task_id>.json (rebuildable, gitignored)
//
// Usage:
//   airun runs start <task_id> [title]       — activate task, link session
//   airun runs end <task_id> [outcome]       — finalize task
//   airun runs sequent <task_id> <desc>      — log ordered step
//   airun runs tangent <task_id> <reason>    — log divergence
//   airun runs resultant <task_id> <artifact> [desc] — log output
//   airun runs cost <task_id> <model> <in> <out>     — log token usage
//   airun runs status <task_id>              — show run state from ledger
//   airun runs list [--active|--all]         — list runs
//   airun runs audit <task_id>               — full ledger trail for task
//   airun runs stats [task_id]               — SWE statistics
//   airun runs rebuild                       — rebuild cache from ledger
//   airun runs help

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  append, queryByTaskId, readShardEntries,
  type LedgerEntry, type AppendExtras,
} from "./ailedger.ts";
import { calculateCost } from "./cost.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const CACHE_DIR = join(AGENCE_ROOT, "nexus", ".airuns");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RunManifest {
  task_id: string;
  title: string;
  state: "active" | "completed" | "failed" | "paused" | "handed-off";
  sessions: string[];
  agents: string[];
  started: string;
  ended: string | null;
  sequents: number;
  tangents: number;
  resultants: number;
  commits: string[];
  total_cost_usd: number;
  total_tokens: number;
  outcome: string | null;
}

export interface SWEStats {
  task_id: string;
  cycle_time_s: number | null;     // seconds from start to end
  tangent_ratio: number;           // tangents / max(sequents, 1)
  first_pass: boolean;             // no tangents
  cost_per_task_usd: number;
  rework_count: number;            // number of run:start entries
  sequents: number;
  tangents: number;
  resultants: number;
  sessions: number;
}

// ─── Ledger Integration ──────────────────────────────────────────────────────
// All mutations go through the ledger. The cache is rebuilt from it.

export function startRun(taskId: string, title?: string): void {
  append("run:start", title || taskId, taskId, "", 0);
}

export function endRun(taskId: string, outcome: string = "completed"): void {
  // Aggregate cost for the summary
  const entries = queryByTaskId(taskId);
  const costEntries = entries.filter(e => e.decision_type === "cost");
  const totalCost = costEntries.reduce((sum, e) => sum + (e.cost_usd || 0), 0);
  const totalTokens = costEntries.reduce((sum, e) => sum + (e.tokens_in || 0) + (e.tokens_out || 0), 0);

  append("run:end", `outcome:${outcome}`, taskId, "", 0, {
    outcome,
    cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    tokens_in: totalTokens,
  });
}

export function logSequent(taskId: string, description: string, step?: number): void {
  // Auto-compute step number if not provided
  if (step === undefined) {
    const entries = queryByTaskId(taskId);
    step = entries.filter(e => e.decision_type === "sequent").length + 1;
  }
  append("sequent", description, taskId, "", 0, { step });
}

export function logTangent(taskId: string, reason: string, parentId?: string): void {
  append("tangent", reason, taskId, "", 0, { parent_id: parentId });
}

export function logResultant(taskId: string, artifact: string, description?: string): void {
  append("resultant", description || artifact, taskId, "", 0, { artifact });
}

export function logCost(taskId: string, model: string, tokensIn: number, tokensOut: number): void {
  const costUsd = calculateCost(model, tokensIn, tokensOut);
  append("cost", `${model}:${tokensIn}+${tokensOut}`, taskId, "", 0, {
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
  });
}

// ─── Query / Manifest ────────────────────────────────────────────────────────

export function buildManifest(taskId: string): RunManifest | null {
  const entries = queryByTaskId(taskId);
  if (entries.length === 0) return null;

  const starts = entries.filter(e => e.decision_type === "run:start");
  const ends = entries.filter(e => e.decision_type === "run:end");
  const sequents = entries.filter(e => e.decision_type === "sequent");
  const tangents = entries.filter(e => e.decision_type === "tangent");
  const resultants = entries.filter(e => e.decision_type === "resultant");
  const costs = entries.filter(e => e.decision_type === "cost");

  const sessions = [...new Set(entries.map(e => e.session_id))];
  const agents = [...new Set(entries.map(e => e.agent).filter(a => a !== "unknown"))];
  const commits = [...new Set(entries.map(e => e.commit).filter(Boolean))] as string[];
  const totalCost = costs.reduce((sum, e) => sum + (e.cost_usd || 0), 0);
  const totalTokens = costs.reduce((sum, e) => sum + (e.tokens_in || 0) + (e.tokens_out || 0), 0);

  const lastEnd = ends.length > 0 ? ends[ends.length - 1] : null;
  const firstStart = starts.length > 0 ? starts[0] : entries[0];

  let state: RunManifest["state"] = "active";
  if (lastEnd) {
    const outcome = lastEnd.outcome || "completed";
    if (outcome === "completed") state = "completed";
    else if (outcome === "failed") state = "failed";
    else if (outcome === "paused") state = "paused";
    else if (outcome === "handed-off") state = "handed-off";
    else state = "completed";
  }

  return {
    task_id: taskId,
    title: firstStart.rationale_tag || taskId,
    state,
    sessions,
    agents,
    started: firstStart.timestamp,
    ended: lastEnd?.timestamp || null,
    sequents: sequents.length,
    tangents: tangents.length,
    resultants: resultants.length,
    commits,
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    total_tokens: totalTokens,
    outcome: lastEnd?.outcome || null,
  };
}

export function listRuns(filter: "active" | "all" = "all"): RunManifest[] {
  const entries = readShardEntries();
  const taskIds = [...new Set(entries.filter(e => e.task_id).map(e => e.task_id))];
  const manifests: RunManifest[] = [];

  for (const taskId of taskIds) {
    // Only include tasks that have explicit run:start entries
    const taskEntries = entries.filter(e => e.task_id === taskId);
    const hasRunStart = taskEntries.some(e => e.decision_type === "run:start");
    if (!hasRunStart) continue;

    const m = buildManifest(taskId);
    if (!m) continue;
    if (filter === "active" && m.state !== "active") continue;
    manifests.push(m);
  }

  return manifests;
}

// ─── SWE Statistics ──────────────────────────────────────────────────────────

export function computeStats(taskId: string): SWEStats | null {
  const entries = queryByTaskId(taskId);
  if (entries.length === 0) return null;

  const starts = entries.filter(e => e.decision_type === "run:start");
  const ends = entries.filter(e => e.decision_type === "run:end");
  const sequents = entries.filter(e => e.decision_type === "sequent");
  const tangents = entries.filter(e => e.decision_type === "tangent");
  const resultants = entries.filter(e => e.decision_type === "resultant");
  const costs = entries.filter(e => e.decision_type === "cost");
  const sessions = [...new Set(entries.map(e => e.session_id))];

  // Cycle time: first run:start → last run:end
  let cycleTimeS: number | null = null;
  if (starts.length > 0 && ends.length > 0) {
    const startTs = new Date(starts[0].timestamp).getTime();
    const endTs = new Date(ends[ends.length - 1].timestamp).getTime();
    cycleTimeS = Math.round((endTs - startTs) / 1000);
  }

  const totalCost = costs.reduce((sum, e) => sum + (e.cost_usd || 0), 0);

  return {
    task_id: taskId,
    cycle_time_s: cycleTimeS,
    tangent_ratio: tangents.length / Math.max(sequents.length, 1),
    first_pass: tangents.length === 0,
    cost_per_task_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    rework_count: starts.length,
    sequents: sequents.length,
    tangents: tangents.length,
    resultants: resultants.length,
    sessions: sessions.length,
  };
}

export function computeAllStats(): SWEStats[] {
  const entries = readShardEntries();
  const taskIds = [...new Set(entries.filter(e => e.task_id).map(e => e.task_id))];
  const stats: SWEStats[] = [];

  for (const taskId of taskIds) {
    const taskEntries = entries.filter(e => e.task_id === taskId);
    if (!taskEntries.some(e => e.decision_type === "run:start")) continue;
    const s = computeStats(taskId);
    if (s) stats.push(s);
  }

  return stats;
}

export function computeAggregate(): {
  total_tasks: number;
  completed: number;
  avg_cycle_time_s: number | null;
  avg_tangent_ratio: number;
  first_pass_rate: number;
  total_cost_usd: number;
  avg_cost_per_task_usd: number;
  total_rework: number;
} {
  const stats = computeAllStats();
  if (stats.length === 0) {
    return {
      total_tasks: 0, completed: 0, avg_cycle_time_s: null,
      avg_tangent_ratio: 0, first_pass_rate: 0, total_cost_usd: 0,
      avg_cost_per_task_usd: 0, total_rework: 0,
    };
  }

  const cycleTimes = stats.filter(s => s.cycle_time_s !== null).map(s => s.cycle_time_s!);
  const completed = stats.filter(s => s.cycle_time_s !== null).length;

  return {
    total_tasks: stats.length,
    completed,
    avg_cycle_time_s: cycleTimes.length > 0
      ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
      : null,
    avg_tangent_ratio: Math.round(
      (stats.reduce((sum, s) => sum + s.tangent_ratio, 0) / stats.length) * 100
    ) / 100,
    first_pass_rate: Math.round(
      (stats.filter(s => s.first_pass).length / stats.length) * 100
    ) / 100,
    total_cost_usd: Math.round(
      stats.reduce((sum, s) => sum + s.cost_per_task_usd, 0) * 1_000_000
    ) / 1_000_000,
    avg_cost_per_task_usd: Math.round(
      (stats.reduce((sum, s) => sum + s.cost_per_task_usd, 0) / stats.length) * 1_000_000
    ) / 1_000_000,
    total_rework: stats.reduce((sum, s) => sum + Math.max(0, s.rework_count - 1), 0),
  };
}

// ─── Cache (Rebuildable) ─────────────────────────────────────────────────────
// nexus/.airuns/<task_id>.json — ephemeral, rebuilt from ledger on demand

function cacheManifest(manifest: RunManifest): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const safeName = manifest.task_id.replace(/[^a-zA-Z0-9_-]/g, "_");
  writeFileSync(
    join(CACHE_DIR, `${safeName}.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

export function rebuildCache(): number {
  const manifests = listRuns("all");
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const m of manifests) {
    cacheManifest(m);
  }
  return manifests.length;
}

function getCached(taskId: string): RunManifest | null {
  const safeName = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const p = join(CACHE_DIR, `${safeName}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === "help") {
    process.stderr.write("Usage: airun runs <command> [args]\n");
    process.stderr.write("Commands:\n");
    process.stderr.write("  start <task_id> [title]            Activate task, link to current session\n");
    process.stderr.write("  end <task_id> [outcome]            Finalize task (completed|failed|paused|handed-off)\n");
    process.stderr.write("  sequent <task_id> <description>    Log ordered step\n");
    process.stderr.write("  tangent <task_id> <reason>         Log divergence/exploration\n");
    process.stderr.write("  resultant <task_id> <artifact> [d] Log concrete output\n");
    process.stderr.write("  cost <task_id> <model> <in> <out>  Log token usage to ledger\n");
    process.stderr.write("  status <task_id>                   Show run manifest\n");
    process.stderr.write("  list [--active|--all]              List tracked runs\n");
    process.stderr.write("  audit <task_id>                    Full ledger trail\n");
    process.stderr.write("  stats [task_id]                    SWE statistics\n");
    process.stderr.write("  rebuild                            Rebuild cache from ledger\n");
    process.stderr.write("  help                               Show this help\n");
    process.exit(cmd === "help" ? 0 : 2);
  }

  switch (cmd) {
    case "start": {
      const [taskId, ...rest] = args;
      if (!taskId) {
        process.stderr.write("Usage: airun runs start <task_id> [title]\n");
        process.exit(2);
      }
      const title = rest.join(" ") || undefined;
      startRun(taskId, title);
      process.stderr.write(`[runs] Started: ${taskId}\n`);
      break;
    }

    case "end": {
      const [taskId, outcome] = args;
      if (!taskId) {
        process.stderr.write("Usage: airun runs end <task_id> [outcome]\n");
        process.exit(2);
      }
      endRun(taskId, outcome || "completed");
      process.stderr.write(`[runs] Ended: ${taskId} → ${outcome || "completed"}\n`);
      break;
    }

    case "sequent": {
      const [taskId, ...rest] = args;
      if (!taskId || rest.length === 0) {
        process.stderr.write("Usage: airun runs sequent <task_id> <description>\n");
        process.exit(2);
      }
      logSequent(taskId, rest.join(" "));
      process.stderr.write(`[runs] Sequent logged for ${taskId}\n`);
      break;
    }

    case "tangent": {
      const [taskId, ...rest] = args;
      if (!taskId || rest.length === 0) {
        process.stderr.write("Usage: airun runs tangent <task_id> <reason>\n");
        process.exit(2);
      }
      logTangent(taskId, rest.join(" "));
      process.stderr.write(`[runs] Tangent logged for ${taskId}\n`);
      break;
    }

    case "resultant": {
      const [taskId, artifact, ...rest] = args;
      if (!taskId || !artifact) {
        process.stderr.write("Usage: airun runs resultant <task_id> <artifact> [description]\n");
        process.exit(2);
      }
      logResultant(taskId, artifact, rest.join(" ") || undefined);
      process.stderr.write(`[runs] Resultant logged for ${taskId}: ${artifact}\n`);
      break;
    }

    case "cost": {
      const [taskId, model, tokIn, tokOut] = args;
      if (!taskId || !model || !tokIn || !tokOut) {
        process.stderr.write("Usage: airun runs cost <task_id> <model> <input_tokens> <output_tokens>\n");
        process.exit(2);
      }
      logCost(taskId, model, parseInt(tokIn), parseInt(tokOut));
      process.stderr.write(`[runs] Cost logged for ${taskId}: ${model}\n`);
      break;
    }

    case "status": {
      const [taskId] = args;
      if (!taskId) {
        process.stderr.write("Usage: airun runs status <task_id>\n");
        process.exit(2);
      }
      const manifest = buildManifest(taskId);
      if (!manifest) {
        process.stderr.write(`[runs] No entries found for task: ${taskId}\n`);
        process.exit(1);
      }
      console.log(JSON.stringify(manifest, null, 2));
      break;
    }

    case "list": {
      const filter = args[0] === "--active" ? "active" : "all";
      const runs = listRuns(filter);
      if (runs.length === 0) {
        process.stderr.write("[runs] No tracked runs found.\n");
      } else {
        console.log(JSON.stringify(runs, null, 2));
      }
      break;
    }

    case "audit": {
      const [taskId] = args;
      if (!taskId) {
        process.stderr.write("Usage: airun runs audit <task_id>\n");
        process.exit(2);
      }
      const entries = queryByTaskId(taskId);
      if (entries.length === 0) {
        process.stderr.write(`[runs] No ledger entries for task: ${taskId}\n`);
        process.exit(1);
      }
      for (const e of entries) {
        console.log(JSON.stringify(e));
      }
      break;
    }

    case "stats": {
      const [taskId] = args;
      if (taskId) {
        const s = computeStats(taskId);
        if (!s) {
          process.stderr.write(`[runs] No stats for task: ${taskId}\n`);
          process.exit(1);
        }
        console.log(JSON.stringify(s, null, 2));
      } else {
        const agg = computeAggregate();
        console.log(JSON.stringify(agg, null, 2));
        const all = computeAllStats();
        if (all.length > 0) {
          process.stderr.write(`\n[runs] Per-task breakdown (${all.length} tasks):\n`);
          for (const s of all) {
            const ct = s.cycle_time_s !== null ? `${s.cycle_time_s}s` : "active";
            process.stderr.write(
              `  ${s.task_id}: ${ct}, ${s.sequents}seq/${s.tangents}tan/${s.resultants}res, $${s.cost_per_task_usd.toFixed(4)}, rework=${s.rework_count}\n`
            );
          }
        }
      }
      break;
    }

    case "rebuild": {
      const count = rebuildCache();
      process.stderr.write(`[runs] Rebuilt cache: ${count} manifests written to ${CACHE_DIR}\n`);
      break;
    }

    default:
      process.stderr.write(`[runs] Unknown command: ${cmd}\n`);
      process.exit(2);
  }
}
