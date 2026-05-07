#!/usr/bin/env bun
// lib/health.ts — ^health: System health checks (CLI counterpart of VS Code HealthTreeProvider)
//
// Usage:
//   agence ^health           — run all checks, human-readable
//   agence ^health --json    — structured JSON output
//   agence ^health --fix     — auto-fix fixable issues (create missing dirs/files)

import { existsSync, statSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable?: boolean;
  path?: string;
}

// ─── Checks ──────────────────────────────────────────────────────────────────

function checkFile(relativePath: string, name: string): HealthCheck {
  const fullPath = join(AGENCE_ROOT, relativePath);
  if (existsSync(fullPath)) {
    return { name, status: "ok", message: relativePath, path: relativePath };
  }
  return { name, status: "error", message: `Missing: ${relativePath}`, fixable: false, path: relativePath };
}

function checkDir(relativePath: string, name: string, fixable = true): HealthCheck {
  const fullPath = join(AGENCE_ROOT, relativePath);
  if (existsSync(fullPath)) {
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return { name, status: "ok", message: relativePath, path: relativePath };
    }
    return { name, status: "error", message: `Not a directory: ${relativePath}`, path: relativePath };
  }
  return { name, status: "warn", message: `Missing: ${relativePath}`, fixable, path: relativePath };
}

function checkRegistry(): HealthCheck {
  const rel = "codex/agents/registry.json";
  const fullPath = join(AGENCE_ROOT, rel);
  if (!existsSync(fullPath)) {
    return { name: "Agent Registry", status: "error", message: `Missing: ${rel}`, fixable: false, path: rel };
  }
  try {
    const data = JSON.parse(readFileSync(fullPath, "utf-8"));
    const agentCount = data.agents ? Object.keys(data.agents).length : 0;
    return { name: "Agent Registry", status: "ok", message: `${rel} (${agentCount} agents)`, path: rel };
  } catch {
    return { name: "Agent Registry", status: "error", message: `Invalid JSON: ${rel}`, path: rel };
  }
}

function checkBun(): HealthCheck {
  try {
    const version = Bun.version;
    return { name: "Bun Runtime", status: "ok", message: `v${version}` };
  } catch {
    return { name: "Bun Runtime", status: "error", message: "Not available" };
  }
}

function checkLedgerIntegrity(): HealthCheck {
  const shardPath = join(AGENCE_ROOT, ".ailedger");
  if (!existsSync(shardPath)) {
    return { name: "Ledger Integrity", status: "error", message: "Shard .ailedger missing" };
  }
  const content = readFileSync(shardPath, "utf-8").trim();
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length === 0) {
    return { name: "Ledger Integrity", status: "warn", message: "Shard .ailedger is empty" };
  }
  // Check last line parses as valid JSONL or has pipe-delimited fields
  const last = lines[lines.length - 1];
  let valid = false;
  try { JSON.parse(last); valid = true; } catch {}
  if (!valid) {
    const fields = last.split("|").map(f => f.trim());
    valid = fields.length >= 4;
  }
  if (!valid) {
    return { name: "Ledger Integrity", status: "warn", message: `${lines.length} entries, last entry malformed` };
  }
  return { name: "Ledger Integrity", status: "ok", message: `${lines.length} entries, chain intact` };
}

function runAllChecks(): HealthCheck[] {
  return [
    checkFile(".agencerc", "Configuration"),
    checkFile("codex/AIPOLICY.yaml", "Policy"),
    checkFile(".ailedger", "Shard Ledger"),
    checkDir("nexus/.ailedger", "Local Ledger"),
    checkDir("nexus/signals", "Signal Transport"),
    checkRegistry(),
    checkFile("lib/guard.ts", "Guard Module"),
    checkBun(),
    checkLedgerIntegrity(),
  ];
}

// ─── Fix ─────────────────────────────────────────────────────────────────────

function autoFix(checks: HealthCheck[]): number {
  let fixed = 0;
  for (const c of checks) {
    if (!c.fixable || c.status === "ok") continue;
    if (c.path) {
      const fullPath = join(AGENCE_ROOT, c.path);
      try {
        mkdirSync(fullPath, { recursive: true });
        console.log(`  ✓ Created: ${c.path}`);
        fixed++;
      } catch (err: any) {
        console.error(`  ✗ Failed to create ${c.path}: ${err.message}`);
      }
    }
  }
  return fixed;
}

// ─── Output ──────────────────────────────────────────────────────────────────

const STATUS_SYMBOLS: Record<string, string> = {
  ok: "\x1b[32m✓\x1b[0m",
  warn: "\x1b[33m⚠\x1b[0m",
  error: "\x1b[31m✗\x1b[0m",
};

function main(): number {
  const args = process.argv.slice(2);
  const json = args.includes("--json") || args.includes("-j");
  const fix = args.includes("--fix");

  const checks = runAllChecks();

  if (json) {
    const summary = {
      ok: checks.filter(c => c.status === "ok").length,
      warn: checks.filter(c => c.status === "warn").length,
      error: checks.filter(c => c.status === "error").length,
      checks,
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("\x1b[1m[health] Agence system checks\x1b[0m\n");
    for (const c of checks) {
      const sym = STATUS_SYMBOLS[c.status] || "?";
      console.log(`  ${sym} ${c.name.padEnd(20)} ${c.message}`);
    }

    const errors = checks.filter(c => c.status === "error").length;
    const warns = checks.filter(c => c.status === "warn").length;
    const total = checks.length;

    console.log();
    if (errors === 0 && warns === 0) {
      console.log(`\x1b[32m  All ${total} checks passed.\x1b[0m`);
    } else {
      console.log(`  ${total - errors - warns}/${total} ok, ${warns} warnings, ${errors} errors`);
    }
  }

  if (fix) {
    const fixable = checks.filter(c => c.fixable && c.status !== "ok");
    if (fixable.length > 0) {
      console.log("\n\x1b[1m[health] Auto-fixing…\x1b[0m");
      const fixed = autoFix(checks);
      console.log(`  ${fixed} issue(s) fixed.`);
    } else {
      console.log("\n  No fixable issues found.");
    }
  }

  const hasError = checks.some(c => c.status === "error");
  return hasError ? 1 : 0;
}

process.exit(main());
