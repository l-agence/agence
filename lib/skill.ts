#!/usr/bin/env bun
// lib/skill.ts — Skill Command Orchestrator
//
// The glue between dispatch.ts (artifact routing), peers.ts (consensus),
// router.sh (LLM calls), and SKILL.md definitions.
//
// Pipeline:
//   1. Parse skill command + optional @agent hint
//   2. Resolve agent (registry → best match for skill)
//   3. Load SKILL.md if exists (context injection)
//   4. Execute: single-agent (router) or multi-agent (peers)
//   5. Save artifact via dispatch routing
//
// Usage:
//   airun skill fix auth.ts                    — single agent, auto-pick
//   airun skill review --agent @ralph src/     — explicit agent
//   airun skill solve --peers "CI is slow"     — multi-agent consensus
//   airun skill list                           — list available skills
//   airun skill help

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { execSync, spawnSync } from "child_process";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const ORG = "l-agence.org"; // TODO: resolve from @ symlink

// ─── Types ───────────────────────────────────────────────────────────────────

interface SkillDef {
  name: string;
  artifact: string;       // artifact type for dispatch routing
  peerSkill?: string;     // peers.ts skill name if applicable
  description: string;
  systemPrompt: string;   // injected as system context
  skillMd?: string;       // loaded SKILL.md content
}

interface AgentMeta {
  name: string;
  role: string;
  tier: string;
  skills: string[];
}

interface SkillResult {
  skill: string;
  agent: string;
  model: string;
  output: string;
  artifact?: string;      // saved artifact path
  timestamp: string;
  latencyMs: number;
}

// ─── Skill Definitions ──────────────────────────────────────────────────────
// Maps ^command names to skill metadata.

const SKILLS: Record<string, SkillDef> = {
  // Code skills (SKILL-002)
  fix:       { name: "fix",       artifact: "solution", description: "Fix a bug or error",
               systemPrompt: "You are an expert debugger. Identify the root cause and provide a minimal, correct fix. Output a clear explanation followed by the code patch." },
  build:     { name: "build",     artifact: "result",   description: "Build or compile a project",
               systemPrompt: "You are a build engineer. Analyze build issues and provide working solutions. Focus on minimal changes to get a successful build." },
  feature:   { name: "feature",   artifact: "solution", description: "Implement a new feature",
               systemPrompt: "You are a feature engineer. Implement the requested feature with clean, idiomatic code. Consider edge cases and provide tests if appropriate." },
  refactor:  { name: "refactor",  artifact: "pattern",  description: "Refactor code for quality",
               systemPrompt: "You are a refactoring specialist. Improve code structure, readability, and maintainability without changing behavior. Explain each change." },
  solve:     { name: "solve",     artifact: "solution", peerSkill: "solve",
               description: "Solve a hard technical problem",
               systemPrompt: "You are a problem solver. Analyze the problem deeply, consider multiple approaches, and recommend the best solution with trade-off analysis." },

  // Review skills (SKILL-003)
  review:    { name: "review",    artifact: "report",   peerSkill: "review",
               description: "Code or design review",
               systemPrompt: "You are a code reviewer. Assess correctness, security, performance, and maintainability. Flag critical issues, suggest improvements, rate overall quality." },
  precommit: { name: "precommit", artifact: "report",   description: "Pre-commit review check",
               systemPrompt: "You are a pre-commit reviewer. Check the staged diff for bugs, security issues, style violations, and incomplete changes. Be concise and actionable." },
  simplify:  { name: "simplify",  artifact: "pattern",  description: "Simplify complex code",
               systemPrompt: "You are a simplification expert. Reduce complexity while preserving correctness. Remove unnecessary abstractions, dead code, and over-engineering." },

  // Analysis skills (SKILL-004)
  analyse:   { name: "analyse",   artifact: "analysis", peerSkill: "analyze",
               description: "Deep analysis of code/system/data",
               systemPrompt: "You are an analyst. Perform thorough analysis identifying patterns, risks, dependencies, and recommendations. Structure findings clearly." },
  design:    { name: "design",    artifact: "design",   peerSkill: "plan",
               description: "Architecture or system design",
               systemPrompt: "You are a system architect. Create clear, pragmatic designs with component diagrams, interfaces, data flow, and implementation guidance." },
  pattern:   { name: "pattern",   artifact: "pattern",  description: "Extract reusable pattern",
               systemPrompt: "You are a pattern engineer. Extract a reusable, well-documented pattern from the given code or problem. Include usage examples and constraints." },
  scope:     { name: "scope",     artifact: "analysis", description: "Scope analysis for a change",
               systemPrompt: "You are a scope analyst. Determine blast radius, affected files, dependencies, and risk level for the proposed change." },
  spec:      { name: "spec",      artifact: "document", description: "Write a specification",
               systemPrompt: "You are a spec writer. Produce clear, testable requirements from the given description. Include acceptance criteria and edge cases." },
  split:     { name: "split",     artifact: "analysis", description: "Split large task into subtasks",
               systemPrompt: "You are a task decomposer. Break the work into small, independently testable subtasks with clear acceptance criteria and dependency ordering." },

  // Peer skills (SKILL-005) — always route through peers.ts
  "peer-design":  { name: "peer-design",  artifact: "design",   peerSkill: "plan",
                    description: "Multi-agent design consensus",
                    systemPrompt: "Architecture design via 3-agent consensus." },
  "peer-review":  { name: "peer-review",  artifact: "report",   peerSkill: "review",
                    description: "Multi-agent code review",
                    systemPrompt: "Code review via 3-agent consensus." },
  "peer-solve":   { name: "peer-solve",   artifact: "solution", peerSkill: "solve",
                    description: "Multi-agent problem solving",
                    systemPrompt: "Problem solving via 3-agent consensus." },
  "peer-analyse": { name: "peer-analyse", artifact: "analysis", peerSkill: "analyze",
                    description: "Multi-agent analysis",
                    systemPrompt: "Analysis via 3-agent consensus." },

  // Red team skills (SKILL-006)
  hack:      { name: "hack",      artifact: "report",   description: "Security vulnerability probe",
               systemPrompt: "You are a security researcher (red team). Analyze the target for vulnerabilities: injection, auth bypass, data exposure, SSRF, path traversal. Report findings with severity and proof-of-concept." },
  break:     { name: "break",     artifact: "report",   description: "Adversarial stress testing",
               systemPrompt: "You are a chaos engineer. Find ways to break the system: edge cases, race conditions, resource exhaustion, malformed input. Report each failure mode with reproduction steps." },

  // Knowledge skills (SKILL-007)
  document:  { name: "document",  artifact: "document", description: "Generate documentation",
               systemPrompt: "You are a technical writer. Produce clear, accurate documentation from the given code or system. Include usage examples, API reference, and architecture notes." },
  test:      { name: "test",      artifact: "result",   description: "Generate or analyze tests",
               systemPrompt: "You are a test engineer. Write comprehensive tests covering happy path, edge cases, error handling, and boundary conditions. Use the project's existing test framework." },
  recon:     { name: "recon",     artifact: "analysis", description: "Reconnaissance of codebase/system",
               systemPrompt: "You are a recon specialist. Survey the target: structure, dependencies, entry points, data flows, configuration. Produce a concise intelligence report." },
  grasp:     { name: "grasp",     artifact: "analysis", description: "Quick understanding of code",
               systemPrompt: "You are a code comprehension expert. Rapidly understand the given code and explain: purpose, key abstractions, data flow, and important design decisions. Be concise." },
  glimpse:   { name: "glimpse",   artifact: "analysis", description: "High-level overview",
               systemPrompt: "You are an overview specialist. Provide a bird's-eye view: what this is, why it exists, how it fits into the larger system, and key things to know." },

  // Ops skills (SKILL-008)
  deploy:    { name: "deploy",    artifact: "result",   description: "Deployment and release operations",
               systemPrompt: "You are a deployment engineer. Plan and execute deployments safely: pre-flight checks, rollback strategy, health verification, and post-deploy validation." },
  brainstorm: { name: "brainstorm", artifact: "analysis", description: "Ideation and divergent thinking",
               systemPrompt: "You are a creative strategist. Generate diverse ideas, explore unconventional approaches, challenge assumptions, and map possibility space. Organize ideas by feasibility and impact." },
};

// ─── Agent Resolution ────────────────────────────────────────────────────────
// Load agents from dispatch.ts infrastructure and pick best for skill.

function loadAgents(): AgentMeta[] {
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
  if (existsSync(registryPath)) {
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      if (data.agents && typeof data.agents === "object") {
        // registry.json uses {name: {type, provider, ...}} format
        return Object.entries(data.agents)
          .filter(([_, v]: any) => v.type === "persona")
          .map(([name, v]: any) => ({
            name,
            role: v.description || "",
            tier: v.tier || "T2",
            skills: v.skills || [],
          }));
      }
    } catch { /* fall through */ }
  }

  // Fallback: hardcoded mapping (mirrors dispatch.ts)
  return [
    { name: "copilot", role: "general coder",     tier: "T2", skills: ["fix", "build", "feature", "refactor", "test"] },
    { name: "haiku",   role: "fast coder",         tier: "T0", skills: ["fix", "split", "build", "break", "glimpse"] },
    { name: "sonya",   role: "architect",           tier: "T1", skills: ["design", "solve", "refactor", "analyse", "scope"] },
    { name: "ralph",   role: "test & QA",           tier: "T1", skills: ["test", "review", "precommit", "break"] },
    { name: "linus",   role: "harsh reviewer",      tier: "T3", skills: ["review", "simplify", "refactor"] },
    { name: "feynman", role: "explainer",            tier: "T2", skills: ["document", "analyse", "grasp", "glimpse"] },
    { name: "aleph",   role: "red team",             tier: "T3", skills: ["hack", "break", "recon"] },
    { name: "chad",    role: "DevOps/infra",         tier: "T1", skills: ["scope", "spec", "split", "pattern", "build"] },
  ];
}

function resolveAgent(skillName: string, explicitAgent?: string): AgentMeta | null {
  const agents = loadAgents();

  // Explicit agent requested
  if (explicitAgent) {
    const name = explicitAgent.replace(/^@/, "");
    return agents.find(a => a.name === name) || { name, role: "unknown", tier: "T2", skills: [] };
  }

  // Find best agent for this skill (first match by skills array)
  const match = agents.find(a => a.skills.includes(skillName));
  return match || agents[0]; // fallback to first agent
}

// ─── SKILL.md Loader ─────────────────────────────────────────────────────────
// SKILL-008: Skills live at synthetic/skills/ (root, not org-scoped).
// Skills are generic, reusable, contain no PII or IP.
// Fallback to legacy org-scoped path for backward compat.

function loadSkillMd(skillName: string): string | undefined {
  // Primary: synthetic/skills/<skill-name>/SKILL.md (generic, shared)
  const rootSkillFile = join(AGENCE_ROOT, "synthetic", "skills", skillName, "SKILL.md");
  if (existsSync(rootSkillFile)) {
    return readFileSync(rootSkillFile, "utf-8");
  }
  // Fallback: synthetic/<org>/skills/<skill-name>/SKILL.md (legacy)
  const orgSkillFile = join(AGENCE_ROOT, "synthetic", ORG, "skills", skillName, "SKILL.md");
  if (existsSync(orgSkillFile)) {
    return readFileSync(orgSkillFile, "utf-8");
  }
  return undefined;
}

// ─── Artifact Routing ────────────────────────────────────────────────────────
// Re-use dispatch.ts route logic inline (avoid spawning subprocess)

const ARTIFACT_ROUTES: Record<string, { scope: string; subdir: string }> = {
  skill:    { scope: "synthetic", subdir: "skills" },
  report:   { scope: "synthetic", subdir: "reports" },
  solution: { scope: "synthetic", subdir: "solutions" },
  analysis: { scope: "synthetic", subdir: "analyses" },
  document: { scope: "synthetic", subdir: "docs" },
  pattern:  { scope: "objectcode", subdir: "patterns" },
  design:   { scope: "objectcode", subdir: "designs" },
  result:   { scope: "organic", subdir: "results" },
};

function saveArtifact(artifactType: string, content: string, skillName: string): string | null {
  const route = ARTIFACT_ROUTES[artifactType];
  if (!route) return null;

  let targetDir: string;
  if (route.scope === "synthetic") {
    targetDir = join(AGENCE_ROOT, route.scope, ORG, route.subdir);
  } else {
    targetDir = join(AGENCE_ROOT, route.scope, route.subdir);
  }

  mkdirSync(targetDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${skillName}-${ts}.md`;
  const targetPath = join(targetDir, filename);
  writeFileSync(targetPath, content, "utf-8");
  return targetPath;
}

// ─── LLM Execution ──────────────────────────────────────────────────────────
// For single-agent: use router.sh via bash subprocess.
// For multi-agent (peer-*): delegate to peers.ts.

function callRouter(system: string, userMsg: string, agent?: string): string {
  // Build env overrides for agent routing
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (agent) {
    env.AGENCE_AGENT_PARAM = agent;

    // Resolve agent → provider + model from registry
    const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      const entry = data.agents?.[agent];
      if (entry?.provider && entry.provider !== "copilot") {
        env.AGENCE_LLM_PROVIDER = entry.provider;
      }
      if (entry?.default_model) {
        // Resolve alias → full model name
        const fullModel = data.models?.[entry.default_model] || entry.default_model;
        env.AGENCE_LLM_MODEL = fullModel;
      }
    } catch { /* registry lookup failed, let router auto-detect */ }
  }

  // Use router.sh router_chat via bash
  const script = `
    source "${AGENCE_ROOT}/lib/router.sh" 2>/dev/null
    router_load_config 2>/dev/null
    router_chat "$1"
  `;

  // Combine system + user into a single prompt for router_chat
  const prompt = `${system}\n\n---\n\n${userMsg}`;

  const result = spawnSync("bash", ["-c", script, "--", prompt], {
    env,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    const err = result.stderr?.trim() || "router call failed";
    throw new Error(err);
  }

  return result.stdout?.trim() || "";
}

function callPeers(peerSkill: string, query: string, flavor = "code"): string {
  const peersTs = join(AGENCE_ROOT, "lib", "peers.ts");
  const result = spawnSync("bun", ["run", peersTs, peerSkill, "--flavor", flavor, query], {
    env: process.env as Record<string, string>,
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    const err = result.stderr?.trim() || "peers call failed";
    throw new Error(err);
  }

  return result.stdout?.trim() || "";
}

// ─── Main Skill Runner ──────────────────────────────────────────────────────

async function runSkill(
  skillName: string,
  query: string,
  opts: { agent?: string; peers?: boolean; flavor?: string; json?: boolean; save?: boolean }
): Promise<number> {
  const def = SKILLS[skillName];
  if (!def) {
    console.error(`[skill] Unknown skill: ${skillName}`);
    console.error(`  Run 'airun skill list' for available skills.`);
    return 1;
  }

  // Force peers mode for peer-* skills
  const usePeers = opts.peers || skillName.startsWith("peer-") || false;
  const peerSkill = def.peerSkill;

  if (usePeers && !peerSkill) {
    console.error(`[skill] Skill '${skillName}' does not support --peers mode`);
    return 1;
  }

  // Resolve agent
  const agent = resolveAgent(skillName, opts.agent);
  const agentName = agent?.name || "auto";

  // Load SKILL.md context
  const skillMd = loadSkillMd(skillName);
  let systemPrompt = def.systemPrompt;
  if (skillMd) {
    systemPrompt += `\n\n--- Skill Reference ---\n${skillMd}`;
  }

  console.error(`[skill] ${skillName} via ${usePeers ? "peers" : `@${agentName}`} | artifact → ${def.artifact}`);

  const start = Date.now();
  let output: string;

  try {
    if (usePeers && peerSkill) {
      output = callPeers(peerSkill, `${systemPrompt}\n\n${query}`, opts.flavor || "code");
    } else {
      output = callRouter(systemPrompt, query, agent?.name);
    }
  } catch (err: any) {
    console.error(`[skill] Error: ${err.message}`);
    return 1;
  }

  const latencyMs = Date.now() - start;

  if (!output) {
    console.error("[skill] Empty response from agent");
    return 1;
  }

  // Output
  if (opts.json) {
    const result: SkillResult = {
      skill: skillName,
      agent: agentName,
      model: usePeers ? "peers" : "auto",
      output,
      timestamp: new Date().toISOString(),
      latencyMs,
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(output);
  }

  // Save artifact (default: yes, unless --no-save)
  if (opts.save !== false) {
    const saved = saveArtifact(def.artifact, output, skillName);
    if (saved) {
      console.error(`[skill] Artifact saved: ${saved}`);
    }
  }

  console.error(`[skill] Done in ${latencyMs}ms`);
  return 0;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdList(): number {
  console.log("[skills] Available skill commands:\n");

  const groups: Record<string, string[]> = {
    "Code":      ["fix", "build", "feature", "refactor", "solve"],
    "Review":    ["review", "precommit", "simplify"],
    "Analysis":  ["analyse", "design", "pattern", "scope", "spec", "split"],
    "Peer":      ["peer-design", "peer-review", "peer-solve", "peer-analyse"],
    "Red Team":  ["hack", "break"],
    "Knowledge": ["document", "test", "recon", "grasp", "glimpse"],
    "Ops":       ["deploy", "brainstorm"],
  };

  for (const [group, names] of Object.entries(groups)) {
    console.log(`  ${group}:`);
    for (const name of names) {
      const def = SKILLS[name];
      if (def) {
        console.log(`    ^${name.padEnd(16)} ${def.description}`);
      }
    }
    console.log();
  }

  return 0;
}

function cmdHelp(): number {
  console.log(`skill — Skill Command Orchestrator

Usage:
  airun skill <command> [options] <query|file...>

Commands:
  <skill>              Execute a skill (see 'list' for all skills)
  list                 List all available skills
  help                 Show this help

Options:
  --agent @<name>      Route to specific agent (default: auto-pick best)
  --peers              Use 3-agent consensus (available for solve/review/analyze/plan)
  --flavor <f>         Peer flavor: code|light|heavy (default: code)
  --json               Output structured JSON
  --no-save            Don't save artifact to disk

Pipeline:
  1. Resolve agent (registry best-match or explicit @agent)
  2. Load SKILL.md context if exists (synthetic/*/skills/<name>/)
  3. Execute via router (single) or peers (consensus)
  4. Save artifact to correct scope (synthetic/objectcode/organic)

Examples:
  airun skill fix "TypeError in auth.ts line 42"
  airun skill review --agent @linus < src/server.ts
  airun skill solve --peers "How to reduce CI from 45min to 10min"
  airun skill analyse --json "Why do Monday deploys fail?"
  airun skill hack src/api/
  airun skill design "gRPC migration for 4 services"
`);
  return 0;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    return cmdHelp();
  }

  if (args[0] === "list") {
    return cmdList();
  }

  const skillName = args[0];

  // WIRE-003: normalize spelling aliases
  const ALIASES: Record<string, string> = {
    "analyze": "analyse",
    "peer-analyze": "peer-analyse",
  };
  const canonicalSkill = ALIASES[skillName] || skillName;

  // Parse options
  let agent: string | undefined;
  let peers = false;
  let flavor: string | undefined;
  let json = false;
  let save = true;
  const queryParts: string[] = [];

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--agent":
        agent = args[++i];
        // WIRE-001: @peers always means peers mode, never single-agent
        if (agent?.replace(/^@/, "") === "peers") {
          peers = true;
          agent = undefined;
        }
        // @pair → peers mode with pair flavor (2-tangent)
        if (agent?.replace(/^@/, "") === "pair") {
          peers = true;
          flavor = "pair";
          agent = undefined;
        }
        break;
      case "--peers":
        peers = true;
        break;
      case "--flavor":
        flavor = args[++i];
        break;
      case "--json":
      case "-j":
        json = true;
        break;
      case "--no-save":
        save = false;
        break;
      default:
        queryParts.push(args[i]);
    }
  }

  // Query from args or stdin
  let query = queryParts.join(" ");
  if (!query && !process.stdin.isTTY) {
    query = await new Response(process.stdin as any).text();
  }

  if (!query.trim()) {
    console.error(`[skill] No query provided for '${canonicalSkill}'`);
    return 1;
  }

  return runSkill(canonicalSkill, query, { agent, peers, flavor, json, save });
}

process.exit(await main());
