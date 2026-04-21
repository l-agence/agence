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
import { join, basename, dirname, resolve, relative } from "path";
import { execSync, spawnSync } from "child_process";

// MEM-003: Memory-aware skill context injection
import { recall, readMnemonic, retain, parseTags, distill, stats } from "./memory.ts";
import type { MemoryRow, MemorySource, DistillOpts } from "./memory.ts";

import { resolveOrg } from "./org.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const ORG = resolveOrg(AGENCE_ROOT);

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
  type?: "persona" | "tool" | "ensemble" | "loop";
  binary?: string | string[];
  launchFlags?: string;
  modelFlag?: string;
  defaultModel?: string;
  install?: string;
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
  ken:       { name: "ken",       artifact: "analysis", description: "Knowledge Extraction cycle (grasp+glimpse+recon+distill)",
               systemPrompt: "You are a knowledge extraction specialist. Synthesize prior knowledge (grasp), working context (glimpse), and fresh reconnaissance (recon) into a unified intelligence report. Identify key insights worth promoting to long-term memory. Structure output with: SITUATION, KEY INSIGHTS, CONNECTIONS, RECOMMENDATIONS." },

  // Ops skills (SKILL-008)
  deploy:    { name: "deploy",    artifact: "result",   description: "Deployment and release operations",
               systemPrompt: "You are a deployment engineer. Plan and execute deployments safely: pre-flight checks, rollback strategy, health verification, and post-deploy validation." },
  brainstorm: { name: "brainstorm", artifact: "analysis", description: "Ideation and divergent thinking",
               systemPrompt: "You are a creative strategist. Generate diverse ideas, explore unconventional approaches, challenge assumptions, and map possibility space. Organize ideas by feasibility and impact." },
  integrate: { name: "integrate", artifact: "report",   description: "CI/CD integration loop — find→break→fix→verify",
               systemPrompt: `You are a DevOps integration engineer running a continuous improvement loop.
Your cycle: DISCOVER → BREAK → FIX → VERIFY → REPORT.

Phase 1 — DISCOVER: Identify integration points, boundaries, contracts, and assumptions.
Phase 2 — BREAK: Run non-destructive probes. What fails? What's fragile? What's unguarded?
Phase 3 — FIX: Propose minimal, targeted fixes for each finding. Rank by severity.
Phase 4 — VERIFY: Define how to confirm each fix works (test commands, assertions, expected output).
Phase 5 — REPORT: Structured output with findings, fixes, verification steps, and remaining gaps.

CONSTRAINTS:
- ALL probes MUST be non-destructive (read-only, dry-run, sandbox).
- Never modify production state, delete files, or execute destructive commands.
- If a probe requires write access, document it as a MANUAL_VERIFY item for human execution.
- Output JSON array of findings: { id, severity, component, finding, fix, verify, status }.` },
};

// ─── Agent Resolution ────────────────────────────────────────────────────────
// Load agents from dispatch.ts infrastructure and pick best for skill.

function loadAgents(): AgentMeta[] {
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
  if (existsSync(registryPath)) {
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      if (data.agents && typeof data.agents === "object") {
        return Object.entries(data.agents)
          .filter(([_, v]: any) => v.type !== "ensemble") // exclude @peers — handled separately
          .map(([name, v]: any) => ({
            name,
            role: v.description || "",
            tier: v.tier || "T2",
            skills: v.skills || [],
            type: v.type || "persona",
            binary: v.binary,
            launchFlags: v.launch_flags,
            modelFlag: v.model_flag,
            defaultModel: v.default_model,
            install: v.install,
          }));
      }
    } catch { /* fall through */ }
  }

  // Fallback: hardcoded mapping (mirrors dispatch.ts)
  return [
    { name: "copilot", role: "general coder",     tier: "T2", skills: ["fix", "build", "feature", "refactor", "test"], type: "persona" },
    { name: "haiku",   role: "fast coder",         tier: "T0", skills: ["fix", "split", "build", "break", "glimpse"], type: "persona" },
    { name: "sonya",   role: "architect",           tier: "T1", skills: ["design", "solve", "refactor", "analyse", "scope"], type: "persona" },
    { name: "ralph",   role: "test & QA",           tier: "T1", skills: ["test", "review", "precommit", "break"], type: "loop" },
    { name: "linus",   role: "harsh reviewer",      tier: "T3", skills: ["review", "simplify", "refactor"], type: "persona" },
    { name: "feynman", role: "explainer",            tier: "T2", skills: ["document", "analyse", "grasp", "glimpse"], type: "persona" },
    { name: "aleph",   role: "red team",             tier: "T3", skills: ["hack", "break", "recon"], type: "persona" },
    { name: "chad",    role: "DevOps/infra",         tier: "T1", skills: ["scope", "spec", "split", "pattern", "build", "integrate"], type: "persona" },
  ];
}

function resolveAgent(skillName: string, explicitAgent?: string): AgentMeta | null {
  const agents = loadAgents();

  // Explicit agent requested
  if (explicitAgent) {
    const raw = explicitAgent.replace(/^@/, "");

    // Dot-notation: @agent.model or @agent.binary (e.g. @ralph.gpt4o, @ralph.aider)
    // The part after the dot overrides the default model or selects a different inner binary.
    const dotIdx = raw.indexOf(".");
    let name = raw;
    let modelOverride: string | undefined;
    if (dotIdx > 0) {
      name = raw.slice(0, dotIdx);
      modelOverride = raw.slice(dotIdx + 1);
    }

    const base = agents.find(a => a.name === name) || { name, role: "unknown", tier: "T2", skills: [] } as AgentMeta;

    if (modelOverride) {
      // Check if the override is a known binary (aider, claude, etc.) or a model alias
      const toolAgents = agents.filter(a => a.type === "tool");
      const matchedTool = toolAgents.find(a => a.name === modelOverride);
      if (matchedTool) {
        // @ralph.aider → ralph harness wrapping aider binary
        base.binary = matchedTool.binary;
        base.launchFlags = matchedTool.launchFlags;
        base.modelFlag = matchedTool.modelFlag;
        base.defaultModel = matchedTool.defaultModel;
      } else {
        // @ralph.gpt4o → ralph harness with model override
        base.defaultModel = modelOverride;
      }
    }
    return base;
  }

  // Find best agent for this skill (first match by skills array)
  const match = agents.find(a => a.skills.includes(skillName));
  return match || agents[0]; // fallback to first agent
}

// ─── SEC-006: Input Validation Helpers ───────────────────────────────────────

// Agent names must be alphanumeric + hyphens only — no dots, slashes, or path chars
const AGENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;

function isValidAgentName(name: string): boolean {
  return AGENT_NAME_RE.test(name);
}

// SEC-006: Maximum persona file size (64KB) to prevent resource exhaustion
const MAX_PERSONA_SIZE = 64 * 1024;

// SEC-006: Maximum skill.md file size (128KB)
const MAX_SKILL_MD_SIZE = 128 * 1024;

// ─── SKILL.md Loader ─────────────────────────────────────────────────────────
// SKILL-008: Skills live at synthetic/skills/ (root, not org-scoped).
// Skills are generic, reusable, contain no PII or IP.
// Fallback to legacy org-scoped path for backward compat.

function loadSkillMd(skillName: string): string | undefined {
  // SEC-006: Validate skill name to prevent path traversal
  if (!AGENT_NAME_RE.test(skillName)) {
    process.stderr.write(`[skill] SEC-006: rejected invalid skill name: ${skillName}\n`);
    return undefined;
  }
  // Primary: synthetic/skills/<skill-name>/SKILL.md (generic, shared)
  const rootSkillFile = join(AGENCE_ROOT, "synthetic", "skills", skillName, "SKILL.md");
  // SEC-006: Verify resolved path is within expected directory
  const expectedRoot = resolve(AGENCE_ROOT, "synthetic", "skills");
  if (!resolve(rootSkillFile).startsWith(expectedRoot)) {
    process.stderr.write(`[skill] SEC-006: path traversal blocked for skill: ${skillName}\n`);
    return undefined;
  }
  if (existsSync(rootSkillFile)) {
    const content = readFileSync(rootSkillFile, "utf-8");
    if (content.length > MAX_SKILL_MD_SIZE) {
      process.stderr.write(`[skill] SEC-006: SKILL.md exceeds size limit (${content.length} > ${MAX_SKILL_MD_SIZE})\n`);
      return content.slice(0, MAX_SKILL_MD_SIZE);
    }
    return content;
  }
  // Fallback: synthetic/<org>/skills/<skill-name>/SKILL.md (legacy)
  const orgSkillFile = join(AGENCE_ROOT, "synthetic", ORG, "skills", skillName, "SKILL.md");
  if (existsSync(orgSkillFile)) {
    const content = readFileSync(orgSkillFile, "utf-8");
    if (content.length > MAX_SKILL_MD_SIZE) return content.slice(0, MAX_SKILL_MD_SIZE);
    return content;
  }
  return undefined;
}

// ─── Agent Persona Loader ────────────────────────────────────────────────────
// WIRE-004: Load codex/agents/<name>/agent.md for system prompt persona injection.
// SEC-006: Path traversal protection, size limits, content boundary markers.

function loadPersona(agentName: string): string | undefined {
  if (!agentName || agentName === "auto") return undefined;

  // SEC-006: Validate agent name — alphanumeric + hyphens only
  const cleanName = agentName.replace(/^@/, "");
  if (!isValidAgentName(cleanName)) {
    process.stderr.write(`[skill] SEC-006: rejected invalid agent name: ${agentName}\n`);
    return undefined;
  }

  // SEC-006: Verify resolved path stays within codex/agents/
  const personaFile = join(AGENCE_ROOT, "codex", "agents", cleanName, "agent.md");
  const expectedDir = resolve(AGENCE_ROOT, "codex", "agents");
  if (!resolve(personaFile).startsWith(expectedDir)) {
    process.stderr.write(`[skill] SEC-006: path traversal blocked for agent: ${agentName}\n`);
    return undefined;
  }

  if (existsSync(personaFile)) {
    const content = readFileSync(personaFile, "utf-8");
    // SEC-006: Size limit to prevent prompt stuffing
    if (content.length > MAX_PERSONA_SIZE) {
      process.stderr.write(`[skill] SEC-006: persona exceeds size limit (${content.length} > ${MAX_PERSONA_SIZE}), truncated\n`);
      return content.slice(0, MAX_PERSONA_SIZE);
    }
    return content;
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

// ─── MEM-003: Memory-Aware Skill Context ────────────────────────────────────
// Skills ^grasp, ^glimpse, ^recon inject relevant memory into their LLM context.
//   ^grasp   — recall from all stores, inject as "prior knowledge"
//   ^glimpse — read mnemonic cache, inject as "working context"
//   ^recon   — after LLM output, auto-retain findings into semantic store

const MEMORY_SKILLS: ReadonlySet<string> = new Set(["grasp", "glimpse", "recon", "ken"]);
const MAX_MEMORY_CONTEXT = 8 * 1024; // 8KB budget for injected memory

/**
 * Build memory context block for injection into system prompt.
 * Returns empty string if no relevant memory found.
 */
function buildMemoryContext(skillName: string, query: string): string {
  if (!MEMORY_SKILLS.has(skillName)) return "";

  try {
    // Extract tags from query: split on whitespace + common delimiters, keep alphanumeric
    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s,._-]/g, " ")
      .split(/[\s,]+/)
      .filter(w => w.length >= 2 && w.length <= 64);
    // Dedupe and take top 8 as search tags
    const tags = [...new Set(words)].slice(0, 8);
    if (tags.length === 0) return "";

    let rows: MemoryRow[] = [];

    if (skillName === "glimpse") {
      // ^glimpse reads from mnemonic (the pre-hydrated working-set cache)
      rows = readMnemonic();
      // Filter to tag-relevant subset
      const tagSet = new Set(tags);
      rows = rows.filter(r =>
        r.tags.some(t => tagSet.has(t.toLowerCase()))
      );
    } else {
      // ^grasp and ^recon query all persistent stores
      rows = recall(tags, { max: 15 });
    }

    if (rows.length === 0) return "";

    // Format memory rows into a concise context block
    let block = "\n\n[MEMORY-CONTEXT-BEGIN]\n";
    block += `Relevant memories (${rows.length} rows from ${[...new Set(rows.map(r => r.source))].join(", ")}):\n\n`;
    let budget = MAX_MEMORY_CONTEXT;

    for (const row of rows) {
      const line = `[${row.source}] [${row.tags.join(",")}] ${row.content}\n`;
      if (budget - line.length < 0) break;
      block += line;
      budget -= line.length;
    }
    block += "[MEMORY-CONTEXT-END]";
    return block;
  } catch {
    // Memory read failure is non-fatal — skill runs without memory
    return "";
  }
}

/**
 * After ^recon output, extract and retain key findings into semantic store.
 * Parses structured sections from recon output.
 */
function retainReconFindings(output: string, query: string): void {
  try {
    // Extract tags from query
    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s,._-]/g, " ")
      .split(/[\s,]+/)
      .filter(w => w.length >= 2 && w.length <= 64);
    const tags = [...new Set(words)].slice(0, 6);
    if (tags.length === 0) return;

    // Add "recon" tag for provenance
    const reconTags = [...new Set(["recon", ...tags])].slice(0, 8);

    // Retain a summary of the recon output (first 2KB)
    const summary = output.length > 2048
      ? output.slice(0, 2048) + "\n[truncated]"
      : output;

    retain("semantic" as MemorySource, reconTags, summary, { importance: 0.6 });
    process.stderr.write(`[skill] MEM-003: recon findings retained → semantic [${reconTags.join(",")}]\n`);
  } catch {
    // Non-fatal — recon still produces output even if retain fails
  }
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

// ─── Tool Agent Dispatch ────────────────────────────────────────────────────
// For type="tool" agents: spawn their CLI binary in a tmux pane with pipe-pane
// capture, inject the skill context, and collect output.

function resolveToolBinary(agent: AgentMeta): string | null {
  const bins = Array.isArray(agent.binary) ? agent.binary : agent.binary ? [agent.binary] : [];
  for (const bin of bins) {
    // Check if binary exists on PATH
    const which = spawnSync("which", [bin.split(" ")[0]], { encoding: "utf-8" });
    if (which.status === 0) return bin;
  }
  return null;
}

function callTool(agent: AgentMeta, systemPrompt: string, query: string): string {
  const binary = resolveToolBinary(agent);
  if (!binary) {
    const installHint = agent.install ? `\n  Install: ${agent.install}` : "";
    throw new Error(`Tool agent @${agent.name}: binary not found (${JSON.stringify(agent.binary)})${installHint}`);
  }

  // Build the command: binary [model-flag model] [launch-flags] <prompt>
  const parts: string[] = [binary];

  // Resolve model alias → full name from registry
  if (agent.modelFlag && agent.defaultModel) {
    const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
    let fullModel = agent.defaultModel;
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      fullModel = data.models?.[agent.defaultModel] || agent.defaultModel;
    } catch { /* use as-is */ }
    parts.push(agent.modelFlag, fullModel);
  }

  if (agent.launchFlags) {
    parts.push(...agent.launchFlags.split(/\s+/).filter(Boolean));
  }

  // Tool-specific prompt injection: pipe system+user as stdin for headless tools
  const prompt = `${systemPrompt}\n\n---\n\n${query}`;

  // Check if we're in tmux — if so, use pipe-pane capture via tangent
  const inTmux = !!process.env.TMUX;

  if (inTmux) {
    // Tmux path: create a tangent pane, pipe-pane capture, inject, collect
    return callToolTmux(agent.name, parts, prompt);
  } else {
    // Headless path: spawn directly with stdin, collect stdout
    return callToolDirect(parts, prompt);
  }
}

function callToolDirect(cmdParts: string[], prompt: string): string {
  // For tools that accept piped input (claude -p, aider --message)
  // Most CLI tools accept a prompt via stdin with -p flag or similar
  const cmd = cmdParts[0];

  // Tool-specific stdin flags
  let args = cmdParts.slice(1);
  if (cmd === "claude") {
    args.push("-p"); // headless mode
  } else if (cmd === "aider") {
    args.push("--message"); // non-interactive
  }

  const result = spawnSync(cmd, args, {
    input: prompt,
    env: process.env as Record<string, string>,
    timeout: 300_000, // 5min for tool agents (they're slower)
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf-8",
    cwd: AGENCE_ROOT,
  });

  if (result.status !== 0 && !result.stdout?.trim()) {
    const err = result.stderr?.trim() || `${cmd} exited with code ${result.status}`;
    throw new Error(err);
  }

  return result.stdout?.trim() || "";
}

function callToolTmux(agentName: string, cmdParts: string[], prompt: string): string {
  // Create an ephemeral tangent for the tool agent, wire pipe-pane, inject prompt
  const tangentId = `tool-${agentName}-${Date.now().toString(36)}`;
  const sessionDir = join(AGENCE_ROOT, "nexus", ".aisessions");
  const sid = `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const logFile = join(sessionDir, `${sid}.typescript`);

  mkdirSync(sessionDir, { recursive: true });

  // Write prompt to a temp file for the tool to read
  const promptFile = join(AGENCE_ROOT, "nexus", "tmp", `${tangentId}.prompt.md`);
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(promptFile, prompt);

  const session = process.env.AGENCE_TMUX_SESSION || "agence";

  // Create tmux window for the tool
  const cmdStr = cmdParts.join(" ");
  const toolCmd = cmdParts[0] === "claude"
    ? `cat '${promptFile}' | ${cmdStr} -p --dangerously-skip-permissions`
    : cmdParts[0] === "aider"
    ? `${cmdStr} --message "$(cat '${promptFile}')" --yes`
    : `${cmdStr} < '${promptFile}'`;

  const windowCmd = `${toolCmd}; echo '__AGENCE_TOOL_DONE__' >> '${logFile}'; sleep 2`;

  // Launch in a new tmux window
  spawnSync("tmux", [
    "new-window", "-t", session, "-n", `@${tangentId}`,
    "-d", // don't switch focus
    "bash", "-c", windowCmd,
  ], { encoding: "utf-8" });

  // Wire pipe-pane for output capture
  const paneTarget = `${session}:@${tangentId}`;
  spawnSync("tmux", [
    "pipe-pane", "-o", "-t", paneTarget,
    `cat >> '${logFile}'`,
  ], { encoding: "utf-8" });

  // Poll for completion (max 5 min)
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    if (existsSync(logFile)) {
      const content = readFileSync(logFile, "utf-8");
      if (content.includes("__AGENCE_TOOL_DONE__")) {
        // Cleanup: kill the window, remove prompt file
        spawnSync("tmux", ["kill-window", "-t", paneTarget], { encoding: "utf-8" });
        try { require("fs").unlinkSync(promptFile); } catch {}
        return content.replace("__AGENCE_TOOL_DONE__", "").trim();
      }
    }
    // Sleep 2s between polls (sync via spawnSync to avoid blocking event loop)
    spawnSync("sleep", ["2"]);
  }

  // Timeout — kill window and return partial
  spawnSync("tmux", ["kill-window", "-t", paneTarget], { encoding: "utf-8" });
  const partial = existsSync(logFile) ? readFileSync(logFile, "utf-8").trim() : "";
  throw new Error(`Tool @${agentName} timed out after 5min${partial ? ". Partial output captured." : ""}`);
}

// ─── Loop Agent Dispatch ────────────────────────────────────────────────────
// For type="loop" agents (ralph): launch bin/loop with the agent's config.
// The loop primitive handles iteration, pipe-pane capture, and backpressure.

function callLoop(agent: AgentMeta, systemPrompt: string, query: string, skillName: string): string {
  const loopBin = join(AGENCE_ROOT, "bin", "loop");

  // Write the prompt for the loop to consume
  const promptFile = join(AGENCE_ROOT, "nexus", "tmp", `loop-${agent.name}-${Date.now().toString(36)}.prompt.md`);
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(promptFile, `${systemPrompt}\n\n---\n\n${query}`);

  // Resolve model
  let model = agent.defaultModel || "sonnet";
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
  try {
    const data = JSON.parse(readFileSync(registryPath, "utf-8"));
    model = data.models?.[model] || model;
  } catch {}

  // Resolve the tool binary for the inner loop (default: claude)
  let innerBinary = "claude";
  if (agent.binary) {
    const resolved = resolveToolBinary(agent);
    if (resolved) innerBinary = resolved;
  }

  const result = spawnSync("bash", [loopBin, "--prompt", promptFile, "--binary", innerBinary,
    "--model", model, "--agent", agent.name, "--skill", skillName, "--max", "5"], {
    env: process.env as Record<string, string>,
    timeout: 600_000, // 10min for loops
    maxBuffer: 4 * 1024 * 1024,
    encoding: "utf-8",
    cwd: AGENCE_ROOT,
  });

  // Cleanup prompt file
  try { require("fs").unlinkSync(promptFile); } catch {}

  if (result.status !== 0 && !result.stdout?.trim()) {
    const err = result.stderr?.trim() || `loop @${agent.name} failed (exit ${result.status})`;
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

// ─── MEM-005: ^ken — Knowledge Extraction Cycle ─────────────────────────────
// Orchestrates grasp → glimpse → recon → distill in a single compound pass.
// 1. grasp:   recall from all persistent stores (prior knowledge)
// 2. glimpse: read mnemonic cache (working context)
// 3. recon:   LLM synthesis + auto-retain findings to semantic
// 4. distill: batch promote mature rows (episodic→eidetic, kinesthetic→semantic)

async function runKen(
  query: string,
  opts: { agent?: string; peers?: boolean; flavor?: string; json?: boolean; save?: boolean }
): Promise<number> {
  const def = SKILLS["ken"];
  if (!def) return 1;

  console.error("[ken] MEM-005: Knowledge Extraction cycle starting…");
  const start = Date.now();

  // Extract tags from query
  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s,._-]/g, " ")
    .split(/[\s,]+/)
    .filter(w => w.length >= 2 && w.length <= 64);
  const tags = [...new Set(words)].slice(0, 8);

  // ── Step 1: GRASP — recall from all persistent stores ──
  let graspRows: MemoryRow[] = [];
  if (tags.length > 0) {
    try {
      graspRows = recall(tags, { max: 20 });
      console.error(`[ken] grasp: ${graspRows.length} rows recalled from ${[...new Set(graspRows.map(r => r.source))].join(", ") || "∅"}`);
    } catch { console.error("[ken] grasp: recall failed (non-fatal)"); }
  } else {
    console.error("[ken] grasp: no tags extracted — skipping recall");
  }

  // ── Step 2: GLIMPSE — read mnemonic working-set cache ──
  let glimpseRows: MemoryRow[] = [];
  try {
    glimpseRows = readMnemonic();
    if (tags.length > 0) {
      const tagSet = new Set(tags);
      glimpseRows = glimpseRows.filter(r => r.tags.some(t => tagSet.has(t.toLowerCase())));
    }
    console.error(`[ken] glimpse: ${glimpseRows.length} rows from mnemonic`);
  } catch { console.error("[ken] glimpse: mnemonic read failed (non-fatal)"); }

  // ── Step 3: RECON — LLM synthesis with combined memory context ──
  // Build combined memory context from grasp + glimpse
  const allRows = [...graspRows, ...glimpseRows];
  let memoryBlock = "";
  if (allRows.length > 0) {
    memoryBlock = "\n\n[MEMORY-CONTEXT-BEGIN]\n";
    memoryBlock += `Prior knowledge (${graspRows.length} grasp + ${glimpseRows.length} glimpse):\n\n`;
    let budget = MAX_MEMORY_CONTEXT;
    for (const row of allRows) {
      const line = `[${row.source}] [${row.tags.join(",")}] ${row.content}\n`;
      if (budget - line.length < 0) break;
      memoryBlock += line;
      budget -= line.length;
    }
    memoryBlock += "[MEMORY-CONTEXT-END]";
  }

  // Resolve agent + build system prompt
  const agent = resolveAgent("ken", opts.agent);
  const agentName = agent?.name || "auto";
  const personaMd = loadPersona(agentName);
  const skillMd = loadSkillMd("ken");

  let systemPrompt = "";
  if (personaMd) {
    systemPrompt += `[PERSONA-BEGIN agent=${agentName}]\n${personaMd}\n[PERSONA-END]\n\n`;
  }
  systemPrompt += def.systemPrompt;
  if (skillMd) {
    systemPrompt += `\n\n[SKILL-REF-BEGIN skill=ken]\n${skillMd}\n[SKILL-REF-END]`;
  }
  if (memoryBlock) {
    systemPrompt += memoryBlock;
    console.error(`[ken] recon: memory context injected (${allRows.length} rows)`);
  }

  // Call LLM for synthesis
  let output: string;
  try {
    const agentType = agent?.type || "persona";
    if (opts.peers) {
      output = callPeers("analyse", `${systemPrompt}\n\n${query}`, opts.flavor || "code");
    } else if (agentType === "tool" && agent) {
      output = callTool(agent, systemPrompt, query);
    } else if (agentType === "loop" && agent) {
      output = callLoop(agent, systemPrompt, query, "ken");
    } else {
      output = callRouter(systemPrompt, query, agent?.name);
    }
  } catch (err: any) {
    console.error(`[ken] recon: LLM call failed: ${err.message}`);
    return 1;
  }

  if (!output) {
    console.error("[ken] recon: empty response");
    return 1;
  }

  // Auto-retain recon findings to semantic
  retainReconFindings(output, query);
  console.error("[ken] recon: findings retained → semantic");

  // ── Step 4: DISTILL — batch promote mature rows ──
  const distillPaths: Array<[MemorySource, MemorySource]> = [
    ["episodic" as MemorySource, "eidetic" as MemorySource],
    ["kinesthetic" as MemorySource, "semantic" as MemorySource],
  ];
  let totalPromoted = 0;
  let totalDuplicates = 0;
  for (const [from, to] of distillPaths) {
    try {
      const result = distill({ from, to, minImportance: 0.6, minAgeDays: 1 });
      totalPromoted += result.promoted.length;
      totalDuplicates += result.duplicates;
      if (result.promoted.length > 0) {
        console.error(`[ken] distill: ${result.promoted.length} promoted ${from}→${to} (${result.skipped} skipped, ${result.duplicates} dupes)`);
      }
    } catch {
      // Non-fatal — store may be empty or path invalid
    }
  }
  if (totalPromoted === 0) {
    console.error("[ken] distill: nothing to promote (all recent or below threshold)");
  }

  const latencyMs = Date.now() - start;

  // Output
  if (opts.json) {
    const result: SkillResult = {
      skill: "ken",
      agent: agentName,
      model: opts.peers ? "peers" : "auto",
      output,
      timestamp: new Date().toISOString(),
      latencyMs,
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(output);
  }

  // Save artifact
  if (opts.save !== false) {
    const saved = saveArtifact(def.artifact, output, "ken");
    if (saved) console.error(`[ken] Artifact saved: ${saved}`);
  }

  // Summary
  const memStats = stats();
  console.error(`[ken] MEM-005: cycle complete in ${latencyMs}ms | grasp:${graspRows.length} glimpse:${glimpseRows.length} promoted:${totalPromoted} dupes:${totalDuplicates}`);
  console.error(`[ken] stores: ${Object.entries(memStats).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  return 0;
}

// ─── Main Skill Runner ──────────────────────────────────────────────────────

async function runSkill(
  skillName: string,
  query: string,
  opts: { agent?: string; peers?: boolean; flavor?: string; json?: boolean; save?: boolean }
): Promise<number> {
  // MEM-005: ^ken has its own orchestrator
  if (skillName === "ken") return runKen(query, opts);

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

  // WIRE-004 + SEC-006: Load agent persona with hardened boundary markers
  const personaMd = loadPersona(agentName);

  // Load SKILL.md context
  const skillMd = loadSkillMd(skillName);
  let systemPrompt = "";
  if (personaMd) {
    // SEC-006: Boundary markers prevent persona content from overriding system instructions.
    // The persona is sandboxed between markers — LLM should treat it as role context only.
    systemPrompt += `[PERSONA-BEGIN agent=${agentName}]\n${personaMd}\n[PERSONA-END]\n\n`;
  }
  systemPrompt += def.systemPrompt;
  if (skillMd) {
    systemPrompt += `\n\n[SKILL-REF-BEGIN skill=${skillName}]\n${skillMd}\n[SKILL-REF-END]`;
  }

  // MEM-003: Inject relevant memory context for memory-aware skills
  const memoryContext = buildMemoryContext(skillName, query);
  if (memoryContext) {
    systemPrompt += memoryContext;
    console.error(`[skill] MEM-003: memory context injected for ^${skillName}`);
  }

  const agentType = agent?.type || "persona";
  const routeLabel = usePeers ? "peers" : agentType === "tool" ? `tool:@${agentName}` : agentType === "loop" ? `loop:@${agentName}` : `@${agentName}`;
  console.error(`[skill] ${skillName} via ${routeLabel} | artifact → ${def.artifact}`);

  const start = Date.now();
  let output: string;

  try {
    if (usePeers && peerSkill) {
      output = callPeers(peerSkill, `${systemPrompt}\n\n${query}`, opts.flavor || "code");
    } else if (agentType === "tool" && agent) {
      output = callTool(agent, systemPrompt, query);
    } else if (agentType === "loop" && agent) {
      output = callLoop(agent, systemPrompt, query, skillName);
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

  // MEM-003: ^recon auto-retains findings into semantic store
  if (skillName === "recon" && output) {
    retainReconFindings(output, query);
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
    "Knowledge": ["document", "test", "recon", "grasp", "glimpse", "ken"],
    "Ops":       ["deploy", "brainstorm", "integrate"],
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
  --agent @<a>.<model> Override model: @ralph.gpt4o, @sonya.opus
  --agent @<a>.<tool>  Override binary: @ralph.aider (ralph loop via aider CLI)
  --peers              Use 3-tangent consensus (available for solve/review/analyze/plan)
  --flavor <f>         Peer flavor: code|light|heavy (default: code)
  --json               Output structured JSON
  --no-save            Don't save artifact to disk

Pipeline:
  1. Resolve agent (registry best-match or explicit @agent)
  2. Dispatch by agent type:
     persona → router.sh LLM call with persona injection
     tool    → spawn external CLI binary (aider, claude, gh, az)
     loop    → bin/loop iteration harness (ralph pattern)
     ensemble→ peers.ts tangent sequent (@peers=3, @pair=2)
  3. Load SKILL.md context if exists (synthetic/skills/<name>/)
  4. Save artifact to correct scope (synthetic/objectcode/organic)

Examples:
  airun skill fix "TypeError in auth.ts line 42"
  airun skill review --agent @linus < src/server.ts
  airun skill fix --agent @aider "Fix the auth bug"      # tool: launches aider CLI
  airun skill fix --agent @claude "Fix the auth bug"      # tool: launches claude CLI
  airun skill test --agent @ralph "Add unit tests"        # loop: ralph iteration harness
  airun skill solve --peers "How to reduce CI from 45min" # ensemble: 3-tangent consensus
  airun skill solve --agent @pair "Optimize query"        # ensemble: 2-tangent consensus
  airun skill analyse --json "Why do Monday deploys fail?"
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
        // SEC-006: Validate agent name early
        // Supports dot-notation: @agent.model (e.g. @ralph.gpt4o, @ralph.aider)
        if (agent) {
          const cleanAgent = agent.replace(/^@/, "");
          const parts = cleanAgent.split(".");
          const allValid = parts.every(p => isValidAgentName(p));
          if (!allValid || parts.length > 2) {
            console.error(`[skill] SEC-006: invalid agent name: ${agent} (alphanumeric + hyphens, optional .model suffix, max 32 chars per part)`);
            return 2;
          }
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
