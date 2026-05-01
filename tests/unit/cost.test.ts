import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, rmSync, mkdirSync, readFileSync } from "fs";
import {
  loadPricing, calculateCost, estimateCost,
  logUsage, todaySummary, monthSummary,
  budgetStatus, checkBudget, costPenalty, modelRank,
} from "../../lib/cost.ts";

const AGENCE_ROOT = join(import.meta.dir, "../..");
const COST_DIR = join(AGENCE_ROOT, "nexus", "cost");

// Helper: run cost.ts CLI
function runCost(...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "cost.ts"), ...args], {
    cwd: AGENCE_ROOT, timeout: 10_000,
    env: { ...process.env, AGENCE_ROOT, AGENCE_BUDGET_DAILY_USD: "10.00", AGENCE_BUDGET_MONTHLY_USD: "300.00" },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout?.toString() || "",
    stderr: r.stderr?.toString() || "",
  };
}

// ─── Pricing Tests ───────────────────────────────────────────────────────────

describe("cost.ts: pricing", () => {
  test("loadPricing returns known models", () => {
    const pricing = loadPricing();
    expect(pricing["claude-sonnet-4-5"]).toBeDefined();
    expect(pricing["claude-sonnet-4-5"].input_per_1m).toBe(3.0);
    expect(pricing["claude-sonnet-4-5"].output_per_1m).toBe(15.0);
  });

  test("loadPricing includes all default models", () => {
    const pricing = loadPricing();
    expect(Object.keys(pricing).length).toBeGreaterThanOrEqual(10);
    expect(pricing["gpt-4o"]).toBeDefined();
    expect(pricing["claude-haiku-3-5"]).toBeDefined();
  });

  test("calculateCost — sonnet 1K input + 500 output", () => {
    const cost = calculateCost("claude-sonnet-4-5", 1000, 500);
    // 1000/1M * 3.00 + 500/1M * 15.00 = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  test("calculateCost — haiku is much cheaper", () => {
    const haikuCost = calculateCost("claude-haiku-3-5", 1000, 500);
    const sonnetCost = calculateCost("claude-sonnet-4-5", 1000, 500);
    expect(haikuCost).toBeLessThan(sonnetCost);
  });

  test("calculateCost — unknown model returns 0", () => {
    const cost = calculateCost("unknown-model-xyz", 1000, 500);
    expect(cost).toBe(0);
  });

  test("estimateCost uses output ratio", () => {
    // Default 30% output ratio
    const est = estimateCost("claude-sonnet-4-5", 1000);
    expect(est).toBeGreaterThan(0);
    expect(est).toBeLessThan(0.02); // Should be under 2 cents for 1K tokens
  });
});

// ─── Model Ranking Tests ─────────────────────────────────────────────────────

describe("cost.ts: model ranking", () => {
  test("rank returns sorted list (cheapest first)", () => {
    const ranked = modelRank();
    expect(ranked.length).toBeGreaterThanOrEqual(10);
    // Verify sorted ascending
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].cost_per_1k_mixed).toBeGreaterThanOrEqual(ranked[i - 1].cost_per_1k_mixed);
    }
  });

  test("opus is most expensive", () => {
    const ranked = modelRank();
    const last = ranked[ranked.length - 1];
    expect(last.model).toBe("claude-opus-4-5");
  });

  test("flash/deepseek are cheapest", () => {
    const ranked = modelRank();
    const cheapest = ranked[0].model;
    expect(["deepseek-coder-v2", "gemini-2-flash"]).toContain(cheapest);
  });
});

// ─── Logging Tests ───────────────────────────────────────────────────────────

describe("cost.ts: usage logging", () => {
  test("logUsage creates entry with correct fields", () => {
    const entry = logUsage("claude-haiku-3-5", 2000, 400, "@aiko", "TEST-001");
    expect(entry.model).toBe("claude-haiku-3-5");
    expect(entry.provider).toBe("anthropic");
    expect(entry.agent).toBe("@aiko");
    expect(entry.task_id).toBe("TEST-001");
    expect(entry.input_tokens).toBe(2000);
    expect(entry.output_tokens).toBe(400);
    expect(entry.total_tokens).toBe(2400);
    expect(entry.cost_usd).toBeGreaterThan(0);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("logUsage writes to JSONL file", () => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const expected = join(COST_DIR, `${yyyy}-${mm}-${dd}.jsonl`);
    logUsage("gpt-4o", 500, 100, "@chad");
    expect(existsSync(expected)).toBe(true);
  });

  test("todaySummary aggregates logged entries", () => {
    const s = todaySummary();
    expect(s.entries).toBeGreaterThanOrEqual(2); // We logged at least 2 above
    expect(s.total_tokens).toBeGreaterThan(0);
    expect(s.total_cost_usd).toBeGreaterThan(0);
  });
});

// ─── Budget Tests ────────────────────────────────────────────────────────────

describe("cost.ts: budget enforcement", () => {
  test("budgetStatus returns valid structure", () => {
    const b = budgetStatus();
    expect(b.daily_limit_usd).toBeGreaterThan(0);
    expect(b.monthly_limit_usd).toBeGreaterThan(0);
    expect(b.daily_pct).toBeGreaterThanOrEqual(0);
    expect(b.daily_pct).toBeLessThanOrEqual(1);
  });

  test("checkBudget allows when under limit", () => {
    const result = checkBudget();
    expect(result.allowed).toBe(true);
  });

  test("costPenalty is finite when budget available", () => {
    const penalty = costPenalty("claude-sonnet-4-5", 2000);
    expect(penalty).toBeGreaterThanOrEqual(0);
    expect(isFinite(penalty)).toBe(true);
  });

  test("costPenalty increases with more expensive models", () => {
    const cheapPenalty = costPenalty("claude-haiku-3-5", 1000);
    const expensivePenalty = costPenalty("claude-opus-4-5", 1000);
    expect(expensivePenalty).toBeGreaterThan(cheapPenalty);
  });
});

// ─── CLI Tests ───────────────────────────────────────────────────────────────

describe("cost.ts: CLI", () => {
  test("rank exits 0 with output", () => {
    const r = runCost("rank");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("cheapest first");
  });

  test("today exits 0", () => {
    const r = runCost("today");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Today");
  });

  test("budget exits 0", () => {
    const r = runCost("budget");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Budget status");
  });

  test("estimate exits 0 with cost output", () => {
    const r = runCost("estimate", "claude-sonnet-4-5", "5000");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Estimated");
    expect(r.stdout).toContain("$");
  });

  test("log with valid args exits 0", () => {
    const r = runCost("log", "gpt-4o-mini", "100", "50", "@test", "T-999");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("gpt-4o-mini");
  });

  test("log with missing args exits 2", () => {
    const r = runCost("log", "gpt-4o");
    expect(r.status).toBe(2);
  });

  test("unknown command exits 2", () => {
    const r = runCost("bogus");
    expect(r.status).toBe(2);
  });

  test("help exits 0", () => {
    const r = runCost("help");
    expect(r.status).toBe(0);
  });
});
