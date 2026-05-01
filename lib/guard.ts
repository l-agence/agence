#!/usr/bin/env bun
// lib/guard.ts — Non-bypassable command gate (Bun)
//
// The security boundary for Agence. Runs as a SEPARATE PROCESS from the
// calling shell — the shell cannot bypass this because it doesn't own the
// exec path. Every agent command passes through guard before execution.
//
// Architecture:
//   agent shell → eval "$(airun guard check <command>)" → approved/denied
//   The shell CANNOT execute commands directly — it must call guard first.
//   Guard emits shell exports that the calling shell eval's.
//
// Trust Tiers (from AIPOLICY.yaml):
//   T0: Auto-execute (read-only, safe) — no prompt, no delay
//   T1: Soft confirm (greylist) — log + allow, flag for review
//   T2: Escalate (interactive) — require human approval
//   T3: Block (destructive) — deny, log, alert
//
// Exit codes:
//   0 = approved (shell exports _GUARD_APPROVED=1)
//   1 = denied   (shell exports _GUARD_APPROVED=0, _GUARD_REASON=...)
//   2 = error    (malformed input, missing policy)
//
// Audit: every decision is appended to .ailedger via lib/ailedger.ts
//
// Usage:
//   airun guard check "git status"
//   airun guard check "git push origin main"
//   airun guard check "rm -rf /tmp/test"
//   airun guard classify "terraform apply"
//   airun guard policy                        # dump loaded policy summary
//   airun guard help

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { loadMergedPolicy, confirmDeescalation, type MergedPolicy, type PolicyOverride, type Tier as PolicyTier } from "./policy.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const POLICY_PATH = process.env.AGENCE_POLICY
  || join(AGENCE_ROOT, "codex", "AIPOLICY.yaml");

// ─── Types ───────────────────────────────────────────────────────────────────

type Tier = "T0" | "T1" | "T2" | "T3";

interface GuardDecision {
  approved: boolean;
  tier: Tier;
  command: string;
  reason: string;
  rule: string;        // which policy rule matched
  agent: string;
  timestamp: string;
}

interface PolicyRule {
  tier: Tier;
  action: "allow" | "flag" | "escalate" | "deny";
  pattern: string;     // original pattern from AIPOLICY.yaml
  regex: RegExp;
  source: string;      // e.g. "whitelist.git_cli", "blacklist.linux_shell"
}

// ─── Policy Loader ───────────────────────────────────────────────────────────
// Parses AIPOLICY.yaml into classified rules. Uses simple line parser
// (no yaml dependency — zero external deps).

interface LoadedPolicy {
  globalBlocks: RegExp[];
  rules: PolicyRule[];
}

let _cachedPolicy: LoadedPolicy | null = null;

function loadPolicy(): LoadedPolicy {
  if (_cachedPolicy) return _cachedPolicy;

  // Dynamic policy loading from YAML cascade (codex → org → shard → local)
  const merged = loadMergedPolicy();
  _cachedPolicy = {
    globalBlocks: merged.globalBlocks,
    rules: merged.rules.map(r => ({
      tier: r.tier as Tier,
      action: r.action as "allow" | "flag" | "escalate" | "deny",
      pattern: r.pattern,
      regex: r.regex,
      source: r.source,
    })),
  };

  return _cachedPolicy;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Guard Check ─────────────────────────────────────────────────────────────

function checkCommand(command: string): GuardDecision {
  const policy = loadPolicy();
  const agent = process.env.AI_AGENT || "unknown";
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const trimmed = command.trim();

  // ── Global blocks (always T3 deny) ──
  for (const block of policy.globalBlocks) {
    if (block.test(trimmed)) {
      return {
        approved: false, tier: "T3", command: trimmed,
        reason: `Global block: ${block.source || block.toString()}`,
        rule: "global_rules", agent, timestamp: ts,
      };
    }
  }

  // ── Path traversal check ──
  if (/\.\.\//.test(trimmed) || /\.\.\\/.test(trimmed)) {
    return {
      approved: false, tier: "T3", command: trimmed,
      reason: "Path traversal detected (../)",
      rule: "path_safety", agent, timestamp: ts,
    };
  }

  // ── Match against classified rules (deny first, then escalate, then allow) ──
  for (const rule of policy.rules) {
    if (rule.regex.test(trimmed)) {
      // Check for de-escalation override — requires merkle log + human confirm
      if (rule.source.includes("[override:")) {
        const merged = loadMergedPolicy();
        const override = merged.overrides.find(o => trimmed.startsWith(o.command) || rule.pattern === o.command);
        if (override) {
          if (!confirmDeescalation(override, trimmed)) {
            // Human denied the override — enforce original tier
            return {
              approved: false, tier: override.from as Tier, command: trimmed,
              reason: `De-escalation denied by human (${override.from}→${override.to}): ${rule.pattern}`,
              rule: rule.source, agent, timestamp: ts,
            };
          }
          // Human approved — fall through to normal action
        }
      }

      switch (rule.action) {
        case "deny":
          return {
            approved: false, tier: rule.tier, command: trimmed,
            reason: `Blocked by ${rule.source}: ${rule.pattern}`,
            rule: rule.source, agent, timestamp: ts,
          };
        case "escalate":
          return {
            approved: false, tier: rule.tier, command: trimmed,
            reason: `Requires human approval (${rule.source}): ${rule.pattern}`,
            rule: rule.source, agent, timestamp: ts,
          };
        case "flag":
          return {
            approved: true, tier: rule.tier, command: trimmed,
            reason: `Flagged for review (${rule.source}): ${rule.pattern}`,
            rule: rule.source, agent, timestamp: ts,
          };
        case "allow":
          return {
            approved: true, tier: rule.tier, command: trimmed,
            reason: `Allowed by ${rule.source}: ${rule.pattern}`,
            rule: rule.source, agent, timestamp: ts,
          };
      }
    }
  }

  // ── Default: T2 (unknown command — escalate, require human approval) ──
  // SEC-003: fail-closed. Unknown commands must not auto-allow.
  // SEC-010: Removed AGENCE_GUARD_PERMISSIVE env var — it was exploitable
  // by agents who could set env vars before calling aido/guard.
  return {
    approved: false, tier: "T2", command: trimmed,
    reason: "Unknown command — escalated (fail-closed default)",
    rule: "default", agent, timestamp: ts,
  };
}

// ─── Ledger Integration ──────────────────────────────────────────────────────
// Only T2 (escalate) and T3 (deny) are security-relevant enough for ailedger.
// T0/T1 are captured in session typescripts via aicmd — no need to double-log.

function logDecision(decision: GuardDecision): void {
  if (decision.tier !== "T2" && decision.tier !== "T3") return;

  try {
    const airunPath = join(AGENCE_ROOT, "bin", "airun");
    const tag = decision.tier === "T3" ? "guard:deny" : "guard:escalate";
    const exitCode = decision.approved ? 0 : 1;
    // Truncate command for ledger (avoid bloating entries)
    const cmd = decision.command.length > 120
      ? decision.command.slice(0, 117) + "..."
      : decision.command;
    // SEC-013: Use spawnSync argument array — no shell interpolation.
    // Old execSync template literal allowed $() and backtick expansion
    // in denied commands (the denial path was itself the exploit vector).
    spawnSync(airunPath, ["ailedger", "append", "guard", tag, "", cmd, String(exitCode)], {
      cwd: AGENCE_ROOT, timeout: 5000, stdio: "ignore",
    });
  } catch {
    // Best-effort — don't block execution if ledger fails
    console.error("[guard] Warning: failed to write ledger entry");
  }
}

// ─── Shell Export Emitter ────────────────────────────────────────────────────
// SECURITY: Values are sanitized with printf '%q' style escaping to prevent
// shell injection when the calling shell eval's this output.
// See SEC-001: reason strings could contain $() or backticks from policy
// patterns or attacker-controlled input.

function shellEscape(s: string): string {
  // Replace every character that could be interpreted by shell:
  // backticks, $, ", \, newlines, and control characters.
  // Result is safe to embed inside single quotes (with ' handled via '\'' idiom).
  if (s.length === 0) return "''";
  // Use single-quote wrapping: replace ' with '\'' and wrap in ''
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function emitShellExports(decision: GuardDecision): void {
  const lines: string[] = [
    `export _GUARD_APPROVED=${decision.approved ? 1 : 0}`,
    `export _GUARD_TIER=${decision.tier}`,
    `export _GUARD_REASON=${shellEscape(decision.reason)}`,
    `export _GUARD_RULE=${shellEscape(decision.rule)}`,
    `export _GUARD_TIMESTAMP=${shellEscape(decision.timestamp)}`,
  ];
  console.log(lines.join("\n"));
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

function cmdCheck(argv: string[]): number {
  const command = argv.join(" ").trim();
  if (!command) {
    console.error("[guard] Error: no command provided");
    console.error("Usage: airun guard check <command...>");
    return 2;
  }

  const decision = checkCommand(command);
  logDecision(decision);
  emitShellExports(decision);

  // Also emit human-readable to stderr
  const icon = decision.approved ? "✓" : "✗";
  const color = decision.approved ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  if (process.env.AGENCE_TRACE === "1" || process.env.DEBUG === "1") {
    console.error(`${color}[guard] ${icon} ${decision.tier} ${decision.command}${reset}`);
    console.error(`  → ${decision.reason}`);
  }

  return decision.approved ? 0 : 1;
}

function cmdClassify(argv: string[]): number {
  const command = argv.join(" ").trim();
  if (!command) {
    console.error("Usage: airun guard classify <command...>");
    return 2;
  }

  const decision = checkCommand(command);
  // Output structured classification (no side effects, no ledger)
  const output = {
    command: decision.command,
    tier: decision.tier,
    action: decision.approved
      ? (decision.tier === "T1" ? "flag" : "allow")
      : (decision.tier === "T3" ? "deny" : "escalate"),
    rule: decision.rule,
    reason: decision.reason,
  };
  console.log(JSON.stringify(output, null, 2));
  return 0;
}

function cmdPolicy(): number {
  const policy = loadPolicy();
  const counts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0, global: policy.globalBlocks.length };
  for (const r of policy.rules) {
    counts[r.tier] = (counts[r.tier] || 0) + 1;
  }
  console.log(`[guard] Policy summary (${POLICY_PATH})`);
  console.log(`  Global blocks:  ${counts.global}`);
  console.log(`  T0 (auto-exec): ${counts.T0} rules`);
  console.log(`  T1 (flag):      ${counts.T1} rules`);
  console.log(`  T2 (escalate):  ${counts.T2} rules`);
  console.log(`  T3 (deny):      ${counts.T3} rules`);
  console.log(`  Total rules:    ${policy.rules.length}`);
  return 0;
}

function cmdBatch(argv: string[]): number {
  // Read commands from stdin (one per line), classify each
  const input = readFileSync("/dev/stdin", "utf-8").trim();
  if (!input) { console.error("Usage: echo 'cmd1\\ncmd2' | airun guard batch"); return 2; }
  const lines = input.split("\n").filter(l => l.trim());
  const results = lines.map(line => {
    const d = checkCommand(line.trim());
    return { command: d.command, tier: d.tier, approved: d.approved, rule: d.rule };
  });
  console.log(JSON.stringify(results, null, 2));
  return 0;
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "check":
    process.exit(cmdCheck(args));
    break;
  case "classify":
    process.exit(cmdClassify(args));
    break;
  case "policy":
    process.exit(cmdPolicy());
    break;
  case "batch":
    process.exit(cmdBatch(args));
    break;
  case "--help":
  case "help":
    console.error(`Usage: airun guard <check|classify|policy|batch> [args...]

Subcommands:
  check <command...>     Validate + emit shell exports + log to ledger
  classify <command...>  Classify tier (no side effects, JSON output)
  policy                 Show loaded policy summary
  batch                  Classify commands from stdin (one per line)

Trust Tiers:
  T0  Auto-execute (read-only, safe)
  T1  Flag for review (unknown commands)
  T2  Escalate (requires human approval)
  T3  Deny (destructive, blocked)

Environment:
  AGENCE_POLICY    Path to AIPOLICY.yaml (default: codex/AIPOLICY.yaml)
  AGENCE_TRACE=1   Show guard decisions on stderr
  AI_AGENT         Agent identifier for audit trail

Exit codes:
  0 = approved, 1 = denied, 2 = error`);
    process.exit(0);
    break;
  default:
    console.error(`[guard] Unknown command: ${cmd || "(none)"}. Try: airun guard help`);
    process.exit(2);
}
