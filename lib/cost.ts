#!/usr/bin/env bun
// lib/cost.ts — Token cost tracking, budget enforcement, and cost-aware scoring (Bun)
//
// Tracks per-call token usage, computes costs from pricing table, enforces
// daily/monthly budgets, and provides cost factor for matrix scorer.
//
// Storage: nexus/cost/ (JSONL per day, git-ignored)
//   2026-04-30.jsonl — one line per API call
//
// Pricing: codex/agents/registry.json → models.{name}.pricing
//   { input_per_1m: 3.00, output_per_1m: 15.00 }  (USD per 1M tokens)
//
// Budget: env vars or config:
//   AGENCE_BUDGET_DAILY_USD=10.00
//   AGENCE_BUDGET_MONTHLY_USD=300.00
//   AGENCE_BUDGET_ALERT=0.8   (alert at 80%)
//   AGENCE_BUDGET_ENFORCE=1   (block calls when exceeded)
//
// Usage:
//   airun cost log <model> <input_tokens> <output_tokens> [agent] [task_id]
//   airun cost today                — today's usage summary
//   airun cost month                — current month summary
//   airun cost budget               — budget status (remaining, %)
//   airun cost estimate <model> <tokens> — estimate cost for a call
//   airun cost rank                 — rank models by cost efficiency
//   airun cost help

import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync } from "fs";
import { join } from "path";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const COST_DIR = join(AGENCE_ROOT, "nexus", "cost");
const REGISTRY_PATH = join(AGENCE_ROOT, "codex", "agents", "registry.json");

const BUDGET_DAILY_USD = parseFloat(process.env.AGENCE_BUDGET_DAILY_USD || "10.00");
const BUDGET_MONTHLY_USD = parseFloat(process.env.AGENCE_BUDGET_MONTHLY_USD || "300.00");
const BUDGET_ALERT_THRESHOLD = parseFloat(process.env.AGENCE_BUDGET_ALERT || "0.8");
const BUDGET_ENFORCE = process.env.AGENCE_BUDGET_ENFORCE === "1";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelPricing {
  input_per_1m: number;   // USD per 1M input tokens
  output_per_1m: number;  // USD per 1M output tokens
}

export interface CostEntry {
  timestamp: string;
  model: string;
  provider: string;
  agent: string;
  task_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  session_id: string;
}

export interface UsageSummary {
  period: string;
  entries: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  by_model: Record<string, { calls: number; tokens: number; cost_usd: number }>;
  by_agent: Record<string, { calls: number; tokens: number; cost_usd: number }>;
}

export interface BudgetStatus {
  daily_limit_usd: number;
  daily_spent_usd: number;
  daily_remaining_usd: number;
  daily_pct: number;
  monthly_limit_usd: number;
  monthly_spent_usd: number;
  monthly_remaining_usd: number;
  monthly_pct: number;
  alert: boolean;
  exceeded: boolean;
}

// ─── Pricing Table ───────────────────────────────────────────────────────────
// Loaded from registry.json's models section.

let _pricingCache: Record<string, ModelPricing> | null = null;

export function loadPricing(): Record<string, ModelPricing> {
  if (_pricingCache) return _pricingCache;

  const pricing: Record<string, ModelPricing> = {};

  if (existsSync(REGISTRY_PATH)) {
    try {
      const reg = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
      if (reg.pricing) {
        for (const [model, p] of Object.entries(reg.pricing)) {
          const mp = p as any;
          if (mp.input_per_1m !== undefined && mp.output_per_1m !== undefined) {
            pricing[model] = { input_per_1m: mp.input_per_1m, output_per_1m: mp.output_per_1m };
          }
        }
      }
    } catch { /* fallback to defaults */ }
  }

  // Fallback defaults (April 2026 pricing) if registry lacks pricing
  const defaults: Record<string, ModelPricing> = {
    "claude-opus-4-5":    { input_per_1m: 15.00, output_per_1m: 75.00 },
    "claude-sonnet-4-5":  { input_per_1m: 3.00,  output_per_1m: 15.00 },
    "claude-haiku-3-5":   { input_per_1m: 0.80,  output_per_1m: 4.00 },
    "gpt-4o":             { input_per_1m: 2.50,  output_per_1m: 10.00 },
    "gpt-4o-mini":        { input_per_1m: 0.15,  output_per_1m: 0.60 },
    "gpt-4-turbo":        { input_per_1m: 10.00, output_per_1m: 30.00 },
    "o1-pro":             { input_per_1m: 15.00, output_per_1m: 60.00 },
    "gemini-2-pro":       { input_per_1m: 1.25,  output_per_1m: 5.00 },
    "gemini-2-flash":     { input_per_1m: 0.10,  output_per_1m: 0.40 },
    "deepseek-coder-v2":  { input_per_1m: 0.14,  output_per_1m: 0.28 },
    "qwen-2.5-coder":    { input_per_1m: 0.30,  output_per_1m: 0.60 },
    "llama-3.1-70b":     { input_per_1m: 0.80,  output_per_1m: 0.80 },
  };

  // Merge: registry pricing overrides defaults
  for (const [model, p] of Object.entries(defaults)) {
    if (!pricing[model]) pricing[model] = p;
  }

  _pricingCache = pricing;
  return pricing;
}

// ─── Cost Calculation ────────────────────────────────────────────────────────

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = loadPricing();
  const p = pricing[model];
  if (!p) return 0; // Unknown model — can't price

  const inputCost = (inputTokens / 1_000_000) * p.input_per_1m;
  const outputCost = (outputTokens / 1_000_000) * p.output_per_1m;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}

export function estimateCost(model: string, totalTokens: number, outputRatio: number = 0.3): number {
  // Estimate assuming output_ratio of total tokens are output
  const outputTokens = Math.round(totalTokens * outputRatio);
  const inputTokens = totalTokens - outputTokens;
  return calculateCost(model, inputTokens, outputTokens);
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function todayFile(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return join(COST_DIR, `${yyyy}-${mm}-${dd}.jsonl`);
}

function monthFiles(): string[] {
  if (!existsSync(COST_DIR)) return [];
  const now = new Date();
  const prefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return readdirSync(COST_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith(".jsonl"))
    .map(f => join(COST_DIR, f))
    .sort();
}

function readEntries(files: string[]): CostEntry[] {
  const entries: CostEntry[] = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf-8").trim().split("\n").filter(l => l);
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  }
  return entries;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

export function logUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  agent?: string,
  taskId?: string,
): CostEntry {
  mkdirSync(COST_DIR, { recursive: true });

  const cost = calculateCost(model, inputTokens, outputTokens);
  const entry: CostEntry = {
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    model,
    provider: resolveProvider(model),
    agent: agent || process.env.AI_AGENT || "unknown",
    task_id: taskId || process.env.AI_TASK_ID || "",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cost_usd: cost,
    session_id: process.env.AI_SESSION_ID || `ts-${process.pid}`,
  };

  appendFileSync(todayFile(), JSON.stringify(entry) + "\n");
  return entry;
}

function resolveProvider(model: string): string {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o1")) return "openai";
  if (model.startsWith("gemini")) return "google";
  if (model.startsWith("deepseek")) return "deepseek";
  if (model.startsWith("qwen")) return "alibaba";
  if (model.startsWith("llama")) return "meta";
  return "unknown";
}

// ─── Summaries ───────────────────────────────────────────────────────────────

export function summarize(entries: CostEntry[], period: string): UsageSummary {
  const byModel: Record<string, { calls: number; tokens: number; cost_usd: number }> = {};
  const byAgent: Record<string, { calls: number; tokens: number; cost_usd: number }> = {};
  let totalInput = 0, totalOutput = 0, totalCost = 0;

  for (const e of entries) {
    totalInput += e.input_tokens;
    totalOutput += e.output_tokens;
    totalCost += e.cost_usd;

    if (!byModel[e.model]) byModel[e.model] = { calls: 0, tokens: 0, cost_usd: 0 };
    byModel[e.model].calls++;
    byModel[e.model].tokens += e.total_tokens;
    byModel[e.model].cost_usd += e.cost_usd;

    if (!byAgent[e.agent]) byAgent[e.agent] = { calls: 0, tokens: 0, cost_usd: 0 };
    byAgent[e.agent].calls++;
    byAgent[e.agent].tokens += e.total_tokens;
    byAgent[e.agent].cost_usd += e.cost_usd;
  }

  return {
    period,
    entries: entries.length,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_tokens: totalInput + totalOutput,
    total_cost_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
    by_model: byModel,
    by_agent: byAgent,
  };
}

export function todaySummary(): UsageSummary {
  const entries = readEntries([todayFile()]);
  const now = new Date();
  return summarize(entries, `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`);
}

export function monthSummary(): UsageSummary {
  const entries = readEntries(monthFiles());
  const now = new Date();
  return summarize(entries, `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
}

// ─── Budget Enforcement ──────────────────────────────────────────────────────

export function budgetStatus(): BudgetStatus {
  const daily = todaySummary();
  const monthly = monthSummary();

  const dailyPct = BUDGET_DAILY_USD > 0 ? daily.total_cost_usd / BUDGET_DAILY_USD : 0;
  const monthlyPct = BUDGET_MONTHLY_USD > 0 ? monthly.total_cost_usd / BUDGET_MONTHLY_USD : 0;

  return {
    daily_limit_usd: BUDGET_DAILY_USD,
    daily_spent_usd: daily.total_cost_usd,
    daily_remaining_usd: Math.max(0, BUDGET_DAILY_USD - daily.total_cost_usd),
    daily_pct: Math.round(dailyPct * 100) / 100,
    monthly_limit_usd: BUDGET_MONTHLY_USD,
    monthly_spent_usd: monthly.total_cost_usd,
    monthly_remaining_usd: Math.max(0, BUDGET_MONTHLY_USD - monthly.total_cost_usd),
    monthly_pct: Math.round(monthlyPct * 100) / 100,
    alert: dailyPct >= BUDGET_ALERT_THRESHOLD || monthlyPct >= BUDGET_ALERT_THRESHOLD,
    exceeded: dailyPct >= 1.0 || monthlyPct >= 1.0,
  };
}

export function checkBudget(): { allowed: boolean; reason?: string } {
  if (!BUDGET_ENFORCE) return { allowed: true };

  const status = budgetStatus();
  if (status.daily_pct >= 1.0) {
    return { allowed: false, reason: `Daily budget exceeded: $${status.daily_spent_usd.toFixed(4)} / $${BUDGET_DAILY_USD}` };
  }
  if (status.monthly_pct >= 1.0) {
    return { allowed: false, reason: `Monthly budget exceeded: $${status.monthly_spent_usd.toFixed(4)} / $${BUDGET_MONTHLY_USD}` };
  }
  return { allowed: true };
}

// ─── Cost-Aware Matrix Scorer ────────────────────────────────────────────────
// Provides a cost factor that can adjust task scoring based on
// estimated cost vs. available budget.
//
// Integration point: matrix.ts score = 10*P + 25*S + 100*H - costPenalty
//
// costPenalty = estimated_call_cost * COST_SENSITIVITY / budget_remaining
// Higher penalty when budget is tight, lower when plenty of budget remains.

const COST_SENSITIVITY = parseFloat(process.env.AGENCE_COST_SENSITIVITY || "50");

export function costPenalty(model: string, estimatedTokens: number): number {
  const status = budgetStatus();
  if (status.daily_remaining_usd <= 0) return Infinity; // Budget exceeded → block

  const estCost = estimateCost(model, estimatedTokens);
  // Penalty scales with cost relative to remaining budget
  const budgetPressure = estCost / status.daily_remaining_usd;
  return Math.round(budgetPressure * COST_SENSITIVITY * 100) / 100;
}

export function modelRank(): Array<{ model: string; cost_per_1k_mixed: number }> {
  const pricing = loadPricing();
  const ranked: Array<{ model: string; cost_per_1k_mixed: number }> = [];

  for (const [model, p] of Object.entries(pricing)) {
    // Mixed cost: assume 70% input, 30% output
    const mixed = (0.7 * p.input_per_1m + 0.3 * p.output_per_1m) / 1000;
    ranked.push({ model, cost_per_1k_mixed: Math.round(mixed * 1_000_000) / 1_000_000 });
  }

  ranked.sort((a, b) => a.cost_per_1k_mixed - b.cost_per_1k_mixed);
  return ranked;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "log": {
      const [model, inputStr, outputStr, agent, taskId] = args;
      if (!model || !inputStr || !outputStr) {
        console.error("Usage: airun cost log <model> <input_tokens> <output_tokens> [agent] [task_id]");
        process.exit(2);
      }
      const entry = logUsage(model, parseInt(inputStr), parseInt(outputStr), agent, taskId);
      console.log(JSON.stringify(entry, null, 2));
      break;
    }

    case "today": {
      const s = todaySummary();
      console.log(`[cost] Today (${s.period}): ${s.entries} calls, ${s.total_tokens.toLocaleString()} tokens, $${s.total_cost_usd.toFixed(4)}`);
      if (s.entries > 0) {
        console.log("  By model:");
        for (const [m, d] of Object.entries(s.by_model).sort((a, b) => b[1].cost_usd - a[1].cost_usd)) {
          console.log(`    ${m}: ${d.calls} calls, ${d.tokens.toLocaleString()} tokens, $${d.cost_usd.toFixed(4)}`);
        }
        console.log("  By agent:");
        for (const [a, d] of Object.entries(s.by_agent).sort((a, b) => b[1].cost_usd - a[1].cost_usd)) {
          console.log(`    ${a}: ${d.calls} calls, $${d.cost_usd.toFixed(4)}`);
        }
      }
      break;
    }

    case "month": {
      const s = monthSummary();
      console.log(`[cost] Month (${s.period}): ${s.entries} calls, ${s.total_tokens.toLocaleString()} tokens, $${s.total_cost_usd.toFixed(4)}`);
      if (s.entries > 0) {
        console.log("  By model:");
        for (const [m, d] of Object.entries(s.by_model).sort((a, b) => b[1].cost_usd - a[1].cost_usd)) {
          console.log(`    ${m}: ${d.calls} calls, ${d.tokens.toLocaleString()} tokens, $${d.cost_usd.toFixed(4)}`);
        }
      }
      break;
    }

    case "budget": {
      const b = budgetStatus();
      console.log(`[cost] Budget status:`);
      console.log(`  Daily:   $${b.daily_spent_usd.toFixed(4)} / $${b.daily_limit_usd} (${(b.daily_pct * 100).toFixed(1)}%)`);
      console.log(`  Monthly: $${b.monthly_spent_usd.toFixed(4)} / $${b.monthly_limit_usd} (${(b.monthly_pct * 100).toFixed(1)}%)`);
      if (b.alert) console.log("  ⚠ ALERT: Budget threshold exceeded!");
      if (b.exceeded) console.log("  ✗ EXCEEDED: Budget limit reached.");
      break;
    }

    case "estimate": {
      const [model, tokensStr] = args;
      if (!model || !tokensStr) {
        console.error("Usage: airun cost estimate <model> <tokens>");
        process.exit(2);
      }
      const cost = estimateCost(model, parseInt(tokensStr));
      console.log(`[cost] Estimated: ${model} × ${parseInt(tokensStr).toLocaleString()} tokens → $${cost.toFixed(6)}`);
      break;
    }

    case "rank": {
      const ranked = modelRank();
      console.log("[cost] Model cost ranking (cheapest first, per 1K mixed tokens):");
      for (const r of ranked) {
        console.log(`  $${r.cost_per_1k_mixed.toFixed(6)}/1K — ${r.model}`);
      }
      break;
    }

    case "--help":
    case "help":
      console.error(`Usage: airun cost <log|today|month|budget|estimate|rank|help>

Subcommands:
  log <model> <in> <out> [agent] [task]  Record API call usage
  today                                  Today's cost summary
  month                                  Current month summary
  budget                                 Budget status (remaining, %)
  estimate <model> <tokens>              Estimate cost for a call
  rank                                   Rank models by cost (cheapest first)

Environment:
  AGENCE_BUDGET_DAILY_USD=10.00    Daily budget limit
  AGENCE_BUDGET_MONTHLY_USD=300.00 Monthly budget limit
  AGENCE_BUDGET_ALERT=0.8         Alert threshold (0.0-1.0)
  AGENCE_BUDGET_ENFORCE=1         Block calls when budget exceeded
  AGENCE_COST_SENSITIVITY=50      Matrix scorer cost weight`);
      process.exit(0);
      break;

    default:
      console.error(`[cost] Unknown command: ${cmd || "(none)"}`);
      console.error("Usage: airun cost <log|today|month|budget|estimate|rank|help>");
      process.exit(2);
  }
}
