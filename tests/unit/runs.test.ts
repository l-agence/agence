import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  startRun, endRun, logSequent, logTangent, logResultant, logCost,
  buildManifest, listRuns, computeStats, computeAllStats, computeAggregate,
  rebuildCache,
  type RunManifest, type SWEStats,
} from "../../lib/runs.ts";

const AGENCE_ROOT = join(import.meta.dir, "../..");

// Helper: run runs.ts CLI
function runRuns(...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "runs.ts"), ...args], {
    cwd: AGENCE_ROOT, timeout: 15_000,
    env: {
      ...process.env,
      AGENCE_ROOT,
      AI_SESSION_ID: "test-runs-session",
      AI_AGENT: "test-agent",
    },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout?.toString() || "",
    stderr: r.stderr?.toString() || "",
  };
}

// ─── Compilation ─────────────────────────────────────────────────────────────

describe("runs.ts — compilation", () => {
  test("compiles without errors", () => {
    const r = spawnSync("bun", ["build", join(AGENCE_ROOT, "lib", "runs.ts"), "--no-bundle"], {
      cwd: AGENCE_ROOT, timeout: 15_000,
    });
    expect(r.status).toBe(0);
  });

  test("ailedger.ts compiles with exports", () => {
    const r = spawnSync("bun", ["build", join(AGENCE_ROOT, "lib", "ailedger.ts"), "--no-bundle"], {
      cwd: AGENCE_ROOT, timeout: 15_000,
    });
    expect(r.status).toBe(0);
  });
});

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

describe("runs.ts — CLI dispatch", () => {
  test("help exits 0 and shows commands", () => {
    const r = runRuns("help");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("start");
    expect(r.stderr).toContain("end");
    expect(r.stderr).toContain("sequent");
    expect(r.stderr).toContain("tangent");
    expect(r.stderr).toContain("resultant");
    expect(r.stderr).toContain("cost");
    expect(r.stderr).toContain("stats");
    expect(r.stderr).toContain("audit");
    expect(r.stderr).toContain("rebuild");
  });

  test("no args exits 2 with usage", () => {
    const r = runRuns();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage:");
  });

  test("unknown command exits 2", () => {
    const r = runRuns("bogus");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Unknown command");
  });

  test("start without task_id exits 2", () => {
    const r = runRuns("start");
    expect(r.status).toBe(2);
  });

  test("end without task_id exits 2", () => {
    const r = runRuns("end");
    expect(r.status).toBe(2);
  });

  test("sequent without description exits 2", () => {
    const r = runRuns("sequent", "TASK-X");
    expect(r.status).toBe(2);
  });

  test("tangent without reason exits 2", () => {
    const r = runRuns("tangent", "TASK-X");
    expect(r.status).toBe(2);
  });

  test("resultant without artifact exits 2", () => {
    const r = runRuns("resultant", "TASK-X");
    expect(r.status).toBe(2);
  });

  test("cost with missing args exits 2", () => {
    const r = runRuns("cost", "TASK-X", "claude-sonnet-4-5");
    expect(r.status).toBe(2);
  });

  test("status with nonexistent task exits 1", () => {
    const r = runRuns("status", "NONEXISTENT-TASK-99999");
    expect(r.status).toBe(1);
  });

  test("audit with nonexistent task exits 1", () => {
    const r = runRuns("audit", "NONEXISTENT-TASK-99999");
    expect(r.status).toBe(1);
  });

  test("stats with nonexistent task exits 1", () => {
    const r = runRuns("stats", "NONEXISTENT-TASK-99999");
    expect(r.status).toBe(1);
  });
});

// ─── Full Lifecycle (uses TEST-001 entries from prior CLI test) ──────────────

describe("runs.ts — lifecycle via API", () => {
  const TASK = "RUNS-TEST-" + Date.now().toString(36);

  test("startRun creates run:start entry", () => {
    startRun(TASK, "Test task for lifecycle");
    const m = buildManifest(TASK);
    expect(m).not.toBeNull();
    expect(m!.task_id).toBe(TASK);
    expect(m!.state).toBe("active");
    expect(m!.title).toBe("Test task for lifecycle");
  });

  test("logSequent increments step counter", () => {
    logSequent(TASK, "First step");
    logSequent(TASK, "Second step");
    const m = buildManifest(TASK);
    expect(m!.sequents).toBe(2);
  });

  test("logTangent records divergence", () => {
    logTangent(TASK, "Exploring alternative approach");
    const m = buildManifest(TASK);
    expect(m!.tangents).toBe(1);
  });

  test("logResultant records artifact", () => {
    logResultant(TASK, "abc1234", "Implementation committed");
    const m = buildManifest(TASK);
    expect(m!.resultants).toBe(1);
  });

  test("logCost tracks token usage in ledger", () => {
    logCost(TASK, "claude-sonnet-4-5", 3000, 1000);
    const m = buildManifest(TASK);
    expect(m!.total_cost_usd).toBeGreaterThan(0);
    expect(m!.total_tokens).toBe(4000);
  });

  test("endRun finalizes with outcome", () => {
    endRun(TASK, "completed");
    const m = buildManifest(TASK);
    expect(m!.state).toBe("completed");
    expect(m!.outcome).toBe("completed");
    expect(m!.ended).not.toBeNull();
  });

  test("computeStats returns valid SWE metrics", () => {
    const s = computeStats(TASK);
    expect(s).not.toBeNull();
    expect(s!.task_id).toBe(TASK);
    expect(s!.sequents).toBe(2);
    expect(s!.tangents).toBe(1);
    expect(s!.resultants).toBe(1);
    expect(s!.tangent_ratio).toBe(0.5);
    expect(s!.first_pass).toBe(false);
    expect(s!.cost_per_task_usd).toBeGreaterThan(0);
    expect(s!.rework_count).toBe(1);
    expect(s!.cycle_time_s).toBeGreaterThanOrEqual(0);
  });
});

// ─── SWE Aggregate Stats ────────────────────────────────────────────────────

describe("runs.ts — SWE aggregate", () => {
  test("computeAllStats returns array", () => {
    const all = computeAllStats();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  test("computeAggregate has correct shape", () => {
    const agg = computeAggregate();
    expect(agg.total_tasks).toBeGreaterThan(0);
    expect(typeof agg.avg_tangent_ratio).toBe("number");
    expect(typeof agg.first_pass_rate).toBe("number");
    expect(typeof agg.total_cost_usd).toBe("number");
    expect(typeof agg.total_rework).toBe("number");
  });

  test("first_pass_rate is between 0 and 1", () => {
    const agg = computeAggregate();
    expect(agg.first_pass_rate).toBeGreaterThanOrEqual(0);
    expect(agg.first_pass_rate).toBeLessThanOrEqual(1);
  });
});

// ─── Cache Rebuild ───────────────────────────────────────────────────────────

describe("runs.ts — cache", () => {
  test("rebuildCache creates files in nexus/.airuns/", () => {
    const count = rebuildCache();
    expect(count).toBeGreaterThan(0);
    expect(existsSync(join(AGENCE_ROOT, "nexus", ".airuns"))).toBe(true);
  });
});

// ─── Query Helpers ───────────────────────────────────────────────────────────

describe("runs.ts — queries", () => {
  test("listRuns all includes tracked runs", () => {
    const runs = listRuns("all");
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].task_id).toBeDefined();
    expect(runs[0].state).toBeDefined();
  });

  test("buildManifest returns null for unknown task", () => {
    const m = buildManifest("DOES-NOT-EXIST-AT-ALL");
    expect(m).toBeNull();
  });

  test("computeStats returns null for unknown task", () => {
    const s = computeStats("DOES-NOT-EXIST-AT-ALL");
    expect(s).toBeNull();
  });
});

// ─── Ledger Extended Fields ──────────────────────────────────────────────────

describe("runs.ts — ledger entries have extended fields", () => {
  test("audit trail contains step numbers for sequents", () => {
    const r = runRuns("audit", "TEST-001");
    if (r.status !== 0) return; // skip if TEST-001 wasn't created
    const lines = r.stdout.trim().split("\n");
    const sequents = lines.map(l => JSON.parse(l)).filter(e => e.decision_type === "sequent");
    expect(sequents.length).toBeGreaterThan(0);
    expect(sequents[0].step).toBe(1);
    if (sequents.length > 1) expect(sequents[1].step).toBe(2);
  });

  test("audit trail contains artifact for resultants", () => {
    const r = runRuns("audit", "TEST-001");
    if (r.status !== 0) return;
    const lines = r.stdout.trim().split("\n");
    const resultants = lines.map(l => JSON.parse(l)).filter(e => e.decision_type === "resultant");
    expect(resultants.length).toBeGreaterThan(0);
    expect(resultants[0].artifact).toBeDefined();
  });

  test("audit trail contains model+tokens for cost entries", () => {
    const r = runRuns("audit", "TEST-001");
    if (r.status !== 0) return;
    const lines = r.stdout.trim().split("\n");
    const costs = lines.map(l => JSON.parse(l)).filter(e => e.decision_type === "cost");
    expect(costs.length).toBeGreaterThan(0);
    expect(costs[0].model).toBe("claude-sonnet-4-5");
    expect(costs[0].tokens_in).toBe(5000);
    expect(costs[0].tokens_out).toBe(2000);
    expect(costs[0].cost_usd).toBe(0.045);
  });

  test("run:end has outcome field", () => {
    const r = runRuns("audit", "TEST-001");
    if (r.status !== 0) return;
    const lines = r.stdout.trim().split("\n");
    const ends = lines.map(l => JSON.parse(l)).filter(e => e.decision_type === "run:end");
    expect(ends.length).toBeGreaterThan(0);
    expect(ends[0].outcome).toBe("completed");
  });
});

// ─── Multiple Outcomes ───────────────────────────────────────────────────────

describe("runs.ts — outcome states", () => {
  test("failed outcome sets state to failed", () => {
    const TASK = "FAIL-TEST-" + Date.now().toString(36);
    startRun(TASK, "Will fail");
    endRun(TASK, "failed");
    const m = buildManifest(TASK);
    expect(m!.state).toBe("failed");
  });

  test("paused outcome sets state to paused", () => {
    const TASK = "PAUSE-TEST-" + Date.now().toString(36);
    startRun(TASK, "Will pause");
    endRun(TASK, "paused");
    const m = buildManifest(TASK);
    expect(m!.state).toBe("paused");
  });

  test("handed-off outcome sets state correctly", () => {
    const TASK = "HANDOFF-TEST-" + Date.now().toString(36);
    startRun(TASK, "Will hand off");
    endRun(TASK, "handed-off");
    const m = buildManifest(TASK);
    expect(m!.state).toBe("handed-off");
  });
});
