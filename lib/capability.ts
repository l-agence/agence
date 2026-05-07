#!/usr/bin/env bun
// lib/capability.ts — MLS capability token system (v0.8.0)
//
// Implements POSIX-inspired capability tokens for agent access control.
// Each agent is granted a set of capabilities in registry.json.
// Guard.ts checks capabilities alongside tier classification.
//
// Design principles (from Trusted Solaris / Tru64 MLS model):
//   - Bell–LaPadula: no read up, no write down (confidentiality)
//   - Biba: no read down, no write up (integrity)
//   - Capability tokens are MANDATORY — not advisory
//   - TCB = router + policy + guard + capability engine
//   - Agents are UNTRUSTED by default (fail-closed)
//
// Architecture:
//   registry.json declares per-agent capabilities
//   guard.ts calls checkCapability(agent, command) before allow/deny
//   If agent lacks required capability → T3 deny (even if tier allows)

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Capability Definitions ──────────────────────────────────────────────────
// Modeled after POSIX capabilities (cap_sys_admin, cap_net_raw, etc.)
// Each capability gates a class of operations.

export const CAPABILITIES = {
  // Data access (Bell-LaPadula)
  CAP_READ_HERMETIC:    "CAP_READ_HERMETIC",     // Read hermetic (private) knowledge
  CAP_READ_NEXUS:       "CAP_READ_NEXUS",        // Read nexus (local state/sessions)
  CAP_WRITE_SYNTHETIC:  "CAP_WRITE_SYNTHETIC",   // Write to shared synthetic store
  CAP_WRITE_ORGANIC:    "CAP_WRITE_ORGANIC",     // Write to organic work artifacts

  // Execution
  CAP_EXEC_SHELL:       "CAP_EXEC_SHELL",        // Execute shell commands
  CAP_EXEC_INFRA:       "CAP_EXEC_INFRA",        // Run terraform/docker/k8s/aws
  CAP_EXEC_BUILD:       "CAP_EXEC_BUILD",        // Run build tools (npm, bun, make)

  // Network
  CAP_NET_EGRESS:       "CAP_NET_EGRESS",        // Outbound network requests (curl, fetch)

  // IPC & agents
  CAP_SIGNAL_HUMAN:     "CAP_SIGNAL_HUMAN",      // Use ^ask/^notify/^prompt IPC
  CAP_SPAWN_AGENT:      "CAP_SPAWN_AGENT",       // Launch sub-agents / tangents

  // Git & publishing
  CAP_MUTATE_GIT:       "CAP_MUTATE_GIT",        // git push/commit/rebase/merge
  CAP_PUBLISH:          "CAP_PUBLISH",           // npm publish, gh release create

  // Security operations
  CAP_RED_TEAM:         "CAP_RED_TEAM",          // Run ^hack/^break probes
  CAP_POLICY_READ:      "CAP_POLICY_READ",       // Read AIPOLICY.yaml / guard internals
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

// ─── Security Labels (MLS Data Classification) ───────────────────────────────
// Bell-LaPadula dominance lattice: L0 < L1 < L2 < L3 < L4
// An agent at clearance C can read data at label L iff C >= L

export const SECURITY_LEVELS = {
  L0_PUBLIC:    0,   // Unrestricted (README, help text)
  L1_ORGANIC:   1,   // Team work artifacts (tasks, workflows, jobs)
  L2_SYNTHETIC: 2,   // Shared knowledge (plans, lessons, docs)
  L3_NEXUS:     3,   // Local state (sessions, ledger, signals)
  L4_HERMETIC:  4,   // Private (personal todos, brainstorms, secrets)
} as const;

export type SecurityLevel = typeof SECURITY_LEVELS[keyof typeof SECURITY_LEVELS];

// Agent clearance derived from capabilities
export function agentClearance(caps: Capability[]): SecurityLevel {
  if (caps.includes(CAPABILITIES.CAP_READ_HERMETIC)) return SECURITY_LEVELS.L4_HERMETIC;
  if (caps.includes(CAPABILITIES.CAP_READ_NEXUS))    return SECURITY_LEVELS.L3_NEXUS;
  // All agents can read synthetic + organic by default
  return SECURITY_LEVELS.L2_SYNTHETIC;
}

// ─── Command → Required Capability Mapping ───────────────────────────────────
// Maps command patterns to required capabilities.
// Guard calls requiredCapabilities(command) to determine what caps are needed.

interface CapabilityRule {
  pattern: RegExp;
  capabilities: Capability[];
  description: string;
}

const CAPABILITY_RULES: CapabilityRule[] = [
  // Infrastructure
  { pattern: /^terraform\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "terraform commands" },
  { pattern: /^docker\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "docker commands" },
  { pattern: /^kubectl\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "kubernetes commands" },
  { pattern: /^aws\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "AWS CLI" },
  { pattern: /^az\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "Azure CLI" },
  { pattern: /^gcloud\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "GCP CLI" },
  { pattern: /^nomad\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "Nomad CLI" },
  { pattern: /^skupper\s/, capabilities: [CAPABILITIES.CAP_EXEC_INFRA], description: "Skupper CLI" },

  // Git mutations
  { pattern: /^git\s+(push|commit|rebase|merge|reset|cherry-pick|tag)/, capabilities: [CAPABILITIES.CAP_MUTATE_GIT], description: "git mutations" },
  { pattern: /^gh\s+pr\s+(merge|close|create)/, capabilities: [CAPABILITIES.CAP_MUTATE_GIT], description: "GitHub PR mutations" },

  // Publishing
  { pattern: /^npm\s+publish/, capabilities: [CAPABILITIES.CAP_PUBLISH], description: "npm publish" },
  { pattern: /^gh\s+release\s+create/, capabilities: [CAPABILITIES.CAP_PUBLISH], description: "GitHub release" },

  // Network egress
  { pattern: /^curl\s/, capabilities: [CAPABILITIES.CAP_NET_EGRESS], description: "curl" },
  { pattern: /^wget\s/, capabilities: [CAPABILITIES.CAP_NET_EGRESS], description: "wget" },
  { pattern: /^fetch\s/, capabilities: [CAPABILITIES.CAP_NET_EGRESS], description: "fetch" },
  { pattern: /^ssh\s/, capabilities: [CAPABILITIES.CAP_NET_EGRESS], description: "ssh" },
  { pattern: /^scp\s/, capabilities: [CAPABILITIES.CAP_NET_EGRESS], description: "scp" },

  // Build tools
  { pattern: /^(npm|bun|yarn|pnpm)\s+(install|build|run|test)/, capabilities: [CAPABILITIES.CAP_EXEC_BUILD], description: "package manager" },
  { pattern: /^make\s/, capabilities: [CAPABILITIES.CAP_EXEC_BUILD], description: "make" },
  { pattern: /^cargo\s/, capabilities: [CAPABILITIES.CAP_EXEC_BUILD], description: "cargo" },

  // Agent spawn
  { pattern: /^(agentd|swarm)\s+(tangent|launch|create)/, capabilities: [CAPABILITIES.CAP_SPAWN_AGENT], description: "agent spawn" },

  // Red team
  { pattern: /^airun\s+(hack|break)/, capabilities: [CAPABILITIES.CAP_RED_TEAM], description: "red team skill" },

  // Signal IPC
  { pattern: /^airun\s+signal\s+(ask|prompt|notify|inject|instruct)/, capabilities: [CAPABILITIES.CAP_SIGNAL_HUMAN], description: "signal IPC" },

  // Shell execution (catch-all for unmatched commands that aren't read-only)
  // Note: this is checked LAST — specific rules above take priority
];

// ─── Capability Resolution ───────────────────────────────────────────────────

// SEC: Shell metacharacters that indicate command chaining/injection.
// If ANY of these appear unquoted, the command is NOT read-only regardless of prefix.
const SHELL_METACHAR_RE = /[;|&`$(){}]/;

export function requiredCapabilities(command: string): Capability[] {
  const trimmed = command.trim();
  const required: Set<Capability> = new Set();

  for (const rule of CAPABILITY_RULES) {
    if (rule.pattern.test(trimmed)) {
      for (const cap of rule.capabilities) required.add(cap);
    }
  }

  // If no specific rule matched and command isn't read-only git/status,
  // require CAP_EXEC_SHELL as baseline.
  // SEC (B1): Commands with shell metacharacters are NEVER read-only.
  if (required.size === 0 && !isReadOnlyCommand(trimmed)) {
    required.add(CAPABILITIES.CAP_EXEC_SHELL);
  }

  return Array.from(required);
}

function isReadOnlyCommand(cmd: string): boolean {
  // SEC (B1): Reject any command containing shell metacharacters — these can chain
  // destructive operations after a read-only prefix (e.g., `git status; rm -rf /`).
  if (SHELL_METACHAR_RE.test(cmd)) return false;

  const readOnly = [
    /^git\s+(status|log|show|diff|branch|tag|reflog|describe|remote|shortlog)/,
    /^ls\b/, /^cat\b/, /^head\b/, /^tail\b/, /^wc\b/, /^file\b/,
    // SEC (B2): find REMOVED — -exec/-delete/-fls provide RCE/file-write
    /^grep\b/, /^rg\b/, /^fd\b/, /^tree\b/,
    /^echo\b/, /^printf\b/, /^date\b/, /^whoami\b/, /^pwd\b/,
    /^gh\s+(pr|issue|run|repo)\s+(list|view|status)/,
    /^aws\s+\S+\s+(describe|get|list|head)-/,
    /^terraform\s+(show|plan|output|state\s+list|validate|fmt)/,
    // SEC (B5): bun test REMOVED — executes arbitrary code
  ];
  return readOnly.some(r => r.test(cmd));
}

// ─── Agent Capability Loading ────────────────────────────────────────────────
// Loads capabilities from codex/agents/registry.json + AIPOLICY.yaml capabilities section

interface AgentCapabilities {
  agent: string;
  capabilities: Capability[];
  clearance: SecurityLevel;
}

let _capCache: Map<string, AgentCapabilities> | null = null;

export function loadAgentCapabilities(): Map<string, AgentCapabilities> {
  if (_capCache) return _capCache;

  const cache = new Map<string, AgentCapabilities>();
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");

  if (!existsSync(registryPath)) {
    process.stderr.write(`[capability] WARNING: registry not found: ${registryPath}\n`);
    return cache;
  }

  try {
    const raw = JSON.parse(readFileSync(registryPath, "utf-8"));
    const agents = raw.agents || {};

    for (const [name, def] of Object.entries(agents)) {
      const agentDef = def as Record<string, unknown>;
      const caps = resolveAgentCaps(name, agentDef);
      cache.set(name, {
        agent: name,
        capabilities: caps,
        clearance: agentClearance(caps),
      });
    }
  } catch (e: any) {
    process.stderr.write(`[capability] ERROR: Failed to load registry: ${e.message}\n`);
  }

  _capCache = cache;
  return cache;
}

function resolveAgentCaps(name: string, def: Record<string, unknown>): Capability[] {
  // Explicit capabilities field (v0.8.0+)
  if (Array.isArray(def.capabilities)) {
    const validCaps = new Set(Object.values(CAPABILITIES));
    return (def.capabilities as string[]).filter(c => validCaps.has(c as Capability)) as Capability[];
  }

  // Backward compat: derive from tier + type + skills
  return deriveCapabilitiesFromTier(name, def);
}

function deriveCapabilitiesFromTier(name: string, def: Record<string, unknown>): Capability[] {
  const tier = (def.tier as string) || "T2";
  const type = (def.type as string) || "persona";
  const skills = (def.skills as string[]) || [];
  const caps: Capability[] = [];

  // All agents get basic read
  caps.push(CAPABILITIES.CAP_WRITE_ORGANIC);

  // Tier-based grants
  switch (tier) {
    case "T0":
      caps.push(CAPABILITIES.CAP_EXEC_SHELL);
      caps.push(CAPABILITIES.CAP_EXEC_BUILD);
      caps.push(CAPABILITIES.CAP_READ_NEXUS);
      break;
    case "T1":
      caps.push(CAPABILITIES.CAP_EXEC_SHELL);
      caps.push(CAPABILITIES.CAP_EXEC_BUILD);
      caps.push(CAPABILITIES.CAP_SIGNAL_HUMAN);
      caps.push(CAPABILITIES.CAP_READ_NEXUS);
      break;
    case "T2":
      caps.push(CAPABILITIES.CAP_EXEC_SHELL);
      caps.push(CAPABILITIES.CAP_EXEC_BUILD);
      caps.push(CAPABILITIES.CAP_NET_EGRESS);
      caps.push(CAPABILITIES.CAP_SIGNAL_HUMAN);
      caps.push(CAPABILITIES.CAP_MUTATE_GIT);
      caps.push(CAPABILITIES.CAP_READ_NEXUS);
      caps.push(CAPABILITIES.CAP_WRITE_SYNTHETIC);
      break;
    case "T3":
      caps.push(CAPABILITIES.CAP_EXEC_SHELL);
      caps.push(CAPABILITIES.CAP_EXEC_BUILD);
      caps.push(CAPABILITIES.CAP_EXEC_INFRA);
      caps.push(CAPABILITIES.CAP_NET_EGRESS);
      caps.push(CAPABILITIES.CAP_SIGNAL_HUMAN);
      caps.push(CAPABILITIES.CAP_MUTATE_GIT);
      caps.push(CAPABILITIES.CAP_PUBLISH);
      caps.push(CAPABILITIES.CAP_SPAWN_AGENT);
      caps.push(CAPABILITIES.CAP_READ_NEXUS);
      caps.push(CAPABILITIES.CAP_READ_HERMETIC);
      caps.push(CAPABILITIES.CAP_WRITE_SYNTHETIC);
      break;
    case "T4":
      // Ensemble — full capabilities
      caps.push(...Object.values(CAPABILITIES));
      break;
  }

  // Skill-based grants
  if (skills.includes("hack") || skills.includes("break")) {
    caps.push(CAPABILITIES.CAP_RED_TEAM);
  }
  if (skills.includes("recon")) {
    caps.push(CAPABILITIES.CAP_NET_EGRESS);
  }

  // Type-based grants
  if (type === "tool") {
    caps.push(CAPABILITIES.CAP_EXEC_SHELL);
  }

  // Deduplicate
  return [...new Set(caps)];
}

// ─── Capability Check (called by guard.ts) ───────────────────────────────────

export interface CapabilityDecision {
  allowed: boolean;
  agent: string;
  command: string;
  required: Capability[];
  missing: Capability[];
  reason: string;
}

export function checkCapability(agent: string, command: string): CapabilityDecision {
  const required = requiredCapabilities(command);

  // If no capabilities required (read-only), always allow
  if (required.length === 0) {
    return {
      allowed: true, agent, command, required: [], missing: [],
      reason: "No capabilities required (read-only)",
    };
  }

  const agentCaps = loadAgentCapabilities();
  const agentEntry = agentCaps.get(agent);

  // Unknown agent → fail-closed (deny all capabilities)
  if (!agentEntry) {
    return {
      allowed: false, agent, command, required, missing: required,
      reason: `Unknown agent "${agent}" — no capabilities granted (fail-closed)`,
    };
  }

  const missing = required.filter(cap => !agentEntry.capabilities.includes(cap));

  if (missing.length > 0) {
    return {
      allowed: false, agent, command, required, missing,
      reason: `Agent "${agent}" missing capabilities: ${missing.join(", ")}`,
    };
  }

  return {
    allowed: true, agent, command, required, missing: [],
    reason: `Agent "${agent}" has all required capabilities`,
  };
}

// ─── Data Label Check (Bell-LaPadula) ────────────────────────────────────────
// Checks if an agent can access data at a given security level.

export function checkDataAccess(agent: string, dataLevel: SecurityLevel): { allowed: boolean; reason: string } {
  const agentCaps = loadAgentCapabilities();
  const agentEntry = agentCaps.get(agent);

  if (!agentEntry) {
    return { allowed: false, reason: `Unknown agent "${agent}" — no clearance` };
  }

  if (agentEntry.clearance >= dataLevel) {
    return { allowed: true, reason: `Agent clearance ${agentEntry.clearance} >= data level ${dataLevel}` };
  }

  return {
    allowed: false,
    reason: `Bell-LaPadula violation: agent clearance ${agentEntry.clearance} < data level ${dataLevel} (no read up)`,
  };
}

// ─── Path → Security Label Resolution ────────────────────────────────────────
// Maps file paths to their MLS security label based on directory hierarchy.

export function pathSecurityLevel(filePath: string): SecurityLevel {
  // SEC (B7): Canonicalize to resolve ../ traversal before label matching.
  // Without this, `organic/../../knowledge/private/x` would match organic/ → L1
  // instead of its true target knowledge/private/ → L4.
  const absPath = filePath.startsWith("/")
    ? resolve(filePath)
    : resolve(AGENCE_ROOT, filePath);

  // SEC (B7): Paths resolving outside AGENCE_ROOT are treated as L4 (highest).
  // A traversal like `organic/../../etc/passwd` escapes the managed tree —
  // deny by default (fail-closed) rather than defaulting to L0_PUBLIC.
  if (!absPath.startsWith(AGENCE_ROOT + "/") && absPath !== AGENCE_ROOT) {
    return SECURITY_LEVELS.L4_HERMETIC;
  }
  const rel = absPath.slice(AGENCE_ROOT.length + 1);

  // Hermetic (L4) — private knowledge
  if (/^knowledge\/private\//.test(rel)) return SECURITY_LEVELS.L4_HERMETIC;
  if (/^knowledge\/hermetic\//.test(rel)) return SECURITY_LEVELS.L4_HERMETIC;

  // Nexus (L3) — local state, sessions, signals, ledger
  if (/^nexus\//.test(rel)) return SECURITY_LEVELS.L3_NEXUS;
  if (/^\.ailedger/.test(rel)) return SECURITY_LEVELS.L3_NEXUS;

  // Synthetic (L2) — shared knowledge
  if (/^knowledge\//.test(rel)) return SECURITY_LEVELS.L2_SYNTHETIC;
  if (/^codex\//.test(rel)) return SECURITY_LEVELS.L2_SYNTHETIC;

  // Organic (L1) — work artifacts
  if (/^organic\//.test(rel)) return SECURITY_LEVELS.L1_ORGANIC;

  // Default: public (L0)
  return SECURITY_LEVELS.L0_PUBLIC;
}

// ─── Cache Management ────────────────────────────────────────────────────────

export function resetCapabilityCache(): void {
  _capCache = null;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`Usage: airun capability <subcommand>

Subcommands:
  check <agent> <command>     Check if agent has capabilities for command
  list [agent]                List capabilities for agent (or all)
  required <command>          Show capabilities required for a command
  labels <path>              Show security label for a path
  help                       Show this help`);
}

function cmdCheck(args: string[]): void {
  if (args.length < 2) {
    process.stderr.write("Usage: airun capability check <agent> <command>\n");
    process.exit(2);
  }
  const agent = args[0];
  const command = args.slice(1).join(" ");
  const decision = checkCapability(agent, command);

  if (decision.allowed) {
    console.log(`✓ ALLOWED — ${decision.reason}`);
    if (decision.required.length > 0) {
      console.log(`  Required: ${decision.required.join(", ")}`);
    }
  } else {
    console.log(`✗ DENIED — ${decision.reason}`);
    console.log(`  Required: ${decision.required.join(", ")}`);
    console.log(`  Missing:  ${decision.missing.join(", ")}`);
    process.exit(1);
  }
}

function cmdList(args: string[]): void {
  const caps = loadAgentCapabilities();

  if (args.length > 0) {
    const agent = args[0];
    const entry = caps.get(agent);
    if (!entry) {
      console.log(`Unknown agent: ${agent}`);
      process.exit(1);
    }
    console.log(`Agent: ${entry.agent}`);
    console.log(`Clearance: L${entry.clearance}`);
    console.log(`Capabilities (${entry.capabilities.length}):`);
    for (const cap of entry.capabilities.sort()) {
      console.log(`  ${cap}`);
    }
    return;
  }

  // List all agents
  console.log("Agent Capabilities:\n");
  const sorted = [...caps.entries()].sort((a, b) => b[1].clearance - a[1].clearance);
  for (const [name, entry] of sorted) {
    console.log(`  ${name.padEnd(12)} L${entry.clearance}  [${entry.capabilities.length} caps]`);
  }
}

function cmdRequired(args: string[]): void {
  if (args.length === 0) {
    process.stderr.write("Usage: airun capability required <command>\n");
    process.exit(2);
  }
  const command = args.join(" ");
  const caps = requiredCapabilities(command);
  if (caps.length === 0) {
    console.log(`No capabilities required (read-only): ${command}`);
  } else {
    console.log(`Required for "${command}":`);
    for (const cap of caps) console.log(`  ${cap}`);
  }
}

function cmdLabels(args: string[]): void {
  if (args.length === 0) {
    process.stderr.write("Usage: airun capability labels <path>\n");
    process.exit(2);
  }
  const level = pathSecurityLevel(args[0]);
  const names = Object.entries(SECURITY_LEVELS).find(([_, v]) => v === level);
  console.log(`${args[0]} → ${names ? names[0] : `L${level}`} (level ${level})`);
}

// ─── Main (only when run directly, not imported) ─────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const subcmd = args[0] || "help";

  switch (subcmd) {
    case "check":    cmdCheck(args.slice(1)); break;
    case "list":     cmdList(args.slice(1)); break;
    case "required": cmdRequired(args.slice(1)); break;
    case "labels":   cmdLabels(args.slice(1)); break;
    case "help":
    case "--help":   printHelp(); break;
    default:
      process.stderr.write(`Unknown subcommand: ${subcmd}\n`);
      printHelp();
      process.exit(2);
  }
}
