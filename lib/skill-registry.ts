#!/usr/bin/env bun
// lib/skill-registry.ts — Skill definitions + agent resolution
//
// Separates "real" skills (have code) from "prompt" skills (alias commands).
// Real skills: break, hack, integrate, bundle, recon, redoc, verify, ken
// Prompt skills: everything else → dispatched via SKILLS map or commands.json

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { resolveOrg } from "./org.ts";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const ORG = resolveOrg(AGENCE_ROOT);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillDef {
  name: string;
  artifact: string;
  peerSkill?: string;
  description: string;
  systemPrompt: string;
  skillMd?: string;
  /** True if skill has real code logic (not just a prompt template) */
  hasCode: boolean;
}

export interface AgentMeta {
  name: string;
  role: string;
  tier: string;
  skills: string[];
  type?: "persona" | "tool" | "ensemble" | "loop";
  category?: "agent" | "persona" | "harness" | "ensemble";
  binary?: string | string[];
  launchFlags?: string;
  modelFlag?: string;
  defaultModel?: string;
  install?: string;
}

// ─── Skill Definitions ──────────────────────────────────────────────────────
// Real skills (have actual code in lib/ or complex multi-step logic)
// vs prompt skills (template + LLM call, no special code path)

export const REAL_SKILLS: ReadonlySet<string> = new Set([
  "break", "hack", "integrate", "bundle", "recon", "redoc",
  "verify", "extract", "consensus",
]);

export const SKILLS: Record<string, SkillDef> = {
  // Code skills
  fix:       { name: "fix",       artifact: "solution", description: "Fix a bug or error", hasCode: false,
               systemPrompt: "You are an expert debugger. Identify the root cause and provide a minimal, correct fix. Output a clear explanation followed by the code patch." },
  build:     { name: "build",     artifact: "result",   description: "Build or compile a project", hasCode: false,
               systemPrompt: "You are a build engineer. Analyze build issues and provide working solutions. Focus on minimal changes to get a successful build." },
  feature:   { name: "feature",   artifact: "solution", description: "Implement a new feature", hasCode: false,
               systemPrompt: "You are a feature engineer. Implement the requested feature with clean, idiomatic code. Consider edge cases and provide tests if appropriate." },
  refactor:  { name: "refactor",  artifact: "pattern",  description: "Refactor code for quality", hasCode: false,
               systemPrompt: "You are a refactoring specialist. Improve code structure, readability, and maintainability without changing behavior. Explain each change." },
  solve:     { name: "solve",     artifact: "solution", peerSkill: "solve", description: "Solve a hard technical problem", hasCode: false,
               systemPrompt: "You are a problem solver. Analyze the problem deeply, consider multiple approaches, and recommend the best solution with trade-off analysis." },

  // Review skills
  review:    { name: "review",    artifact: "report",   peerSkill: "review", description: "Code or design review", hasCode: false,
               systemPrompt: "You are a code reviewer. Assess correctness, security, performance, and maintainability. Flag critical issues, suggest improvements, rate overall quality." },
  precommit: { name: "precommit", artifact: "report",   description: "Pre-commit review check", hasCode: false,
               systemPrompt: "You are a pre-commit reviewer. Check the staged diff for bugs, security issues, style violations, and incomplete changes. Be concise and actionable." },
  simplify:  { name: "simplify",  artifact: "pattern",  description: "Simplify complex code", hasCode: false,
               systemPrompt: "You are a simplification expert. Reduce complexity while preserving correctness. Remove unnecessary abstractions, dead code, and over-engineering." },

  // Analysis skills
  analyse:   { name: "analyse",   artifact: "analysis", peerSkill: "analyze", description: "Deep analysis", hasCode: false,
               systemPrompt: "You are an analyst. Perform thorough analysis identifying patterns, risks, dependencies, and recommendations. Structure findings clearly." },
  design:    { name: "design",    artifact: "design",   peerSkill: "plan", description: "Architecture or system design", hasCode: false,
               systemPrompt: "You are a system architect. Create clear, pragmatic designs with component diagrams, interfaces, data flow, and implementation guidance." },
  pattern:   { name: "pattern",   artifact: "pattern",  description: "Extract reusable pattern", hasCode: false,
               systemPrompt: "You are a pattern engineer. Extract a reusable, well-documented pattern from the given code or problem. Include usage examples and constraints." },
  scope:     { name: "scope",     artifact: "analysis", description: "Scope analysis for a change", hasCode: false,
               systemPrompt: "You are a scope analyst. Determine blast radius, affected files, dependencies, and risk level for the proposed change." },
  spec:      { name: "spec",      artifact: "document", description: "Write a specification", hasCode: false,
               systemPrompt: "You are a spec writer. Produce clear, testable requirements from the given description. Include acceptance criteria and edge cases." },
  split:     { name: "split",     artifact: "analysis", description: "Split large task into subtasks", hasCode: false,
               systemPrompt: "You are a task decomposer. Break the work into small, independently testable subtasks with clear acceptance criteria and dependency ordering." },

  // Peer skills (always route through consensus)
  "peer-design":  { name: "peer-design",  artifact: "design",   peerSkill: "plan", description: "Multi-agent design consensus", hasCode: false,
                    systemPrompt: "Architecture design via 3-agent consensus." },
  "peer-review":  { name: "peer-review",  artifact: "report",   peerSkill: "review", description: "Multi-agent code review", hasCode: false,
                    systemPrompt: "Code review via 3-agent consensus." },
  "peer-solve":   { name: "peer-solve",   artifact: "solution", peerSkill: "solve", description: "Multi-agent problem solving", hasCode: false,
                    systemPrompt: "Problem solving via 3-agent consensus." },
  "peer-analyse": { name: "peer-analyse", artifact: "analysis", peerSkill: "analyze", description: "Multi-agent analysis", hasCode: false,
                    systemPrompt: "Analysis via 3-agent consensus." },

  // Red team skills (REAL CODE)
  hack:      { name: "hack",      artifact: "report",   description: "Security vulnerability probe", hasCode: true,
               systemPrompt: "You are a security researcher (red team). Analyze the target for vulnerabilities: injection, auth bypass, data exposure, SSRF, path traversal. Report findings with severity and proof-of-concept." },
  break:     { name: "break",     artifact: "report",   description: "Adversarial stress testing", hasCode: true,
               systemPrompt: "You are a chaos engineer. Find ways to break the system: edge cases, race conditions, resource exhaustion, malformed input. Report each failure mode with reproduction steps." },
  integrate: { name: "integrate", artifact: "report",   description: "CI/CD integration loop", hasCode: true,
               systemPrompt: "You are a DevOps integration engineer. DISCOVER → BREAK → FIX → VERIFY → REPORT." },

  // Knowledge skills
  document:  { name: "document",  artifact: "document", description: "Generate documentation", hasCode: false,
               systemPrompt: "You are a technical writer. Produce clear, accurate documentation from the given code or system." },
  test:      { name: "test",      artifact: "result",   description: "Generate or analyze tests", hasCode: false,
               systemPrompt: "You are a test engineer. Write comprehensive tests covering happy path, edge cases, error handling, and boundary conditions." },
  recon:     { name: "recon",     artifact: "analysis", description: "Codebase reconnaissance", hasCode: true,
               systemPrompt: "You are a recon specialist. Survey the target: structure, dependencies, entry points, data flows, configuration." },
  grasp:     { name: "grasp",     artifact: "analysis", description: "Quick code understanding", hasCode: false,
               systemPrompt: "You are a code comprehension expert. Rapidly understand the given code and explain: purpose, key abstractions, data flow, design decisions." },
  glimpse:   { name: "glimpse",   artifact: "analysis", description: "High-level overview", hasCode: false,
               systemPrompt: "You are an overview specialist. Provide a bird's-eye view: what this is, why it exists, how it fits." },
  extract:   { name: "extract",   artifact: "analysis", description: "Knowledge Extraction cycle (grasp+glimpse+recon+distill)", hasCode: true,
               systemPrompt: "You are a knowledge extraction specialist. Synthesize grasp + glimpse + recon into unified intelligence." },

  // Ops skills
  deploy:    { name: "deploy",    artifact: "result",   description: "Deployment operations", hasCode: false,
               systemPrompt: "You are a deployment engineer. Plan and execute deployments safely." },
  brainstorm: { name: "brainstorm", artifact: "analysis", description: "Ideation and divergent thinking", hasCode: false,
               systemPrompt: "You are a creative strategist. Generate diverse ideas, explore unconventional approaches." },
  redoc:     { name: "redoc",     artifact: "document", description: "Save, version, publish docs", hasCode: true,
               systemPrompt: "You are a documentation publisher." },
  bundle:    { name: "bundle",    artifact: "result",   description: "Full CI/CD pipeline", hasCode: true,
               systemPrompt: "You are the release engineer. Run the ^bundle pipeline." },
  consensus: { name: "consensus", artifact: "report",   peerSkill: "consensus", description: "Multi-agent decision protocol", hasCode: true,
               systemPrompt: "You are a consensus coordinator. Present the question to multiple agents and aggregate their findings." },
};

// ─── Agent Resolution ────────────────────────────────────────────────────────

export function loadAgents(): AgentMeta[] {
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
  if (existsSync(registryPath)) {
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      if (data.agents && typeof data.agents === "object") {
        return Object.entries(data.agents)
          .filter(([_, v]: any) => v.type !== "ensemble")
          .map(([name, v]: any) => ({
            name,
            role: v.description || "",
            tier: v.tier || "T2",
            skills: v.skills || [],
            type: v.type || "persona",
            category: v.category || (v.type === "tool" ? "agent" : "persona"),
            binary: v.binary,
            launchFlags: v.launch_flags,
            modelFlag: v.model_flag,
            defaultModel: v.default_model,
            install: v.install,
          }));
      }
    } catch { /* fall through */ }
  }
  return [
    { name: "copilot", role: "general coder", tier: "T2", skills: ["fix", "build", "feature", "refactor", "test"], type: "persona" },
    { name: "haiku",   role: "fast coder",    tier: "T0", skills: ["fix", "split", "build", "break", "glimpse"], type: "persona" },
  ];
}

// SEC-006: Agent name validation
const AGENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
export function isValidAgentName(name: string): boolean {
  return AGENT_NAME_RE.test(name);
}

export function resolveAgent(skillName: string, explicitAgent?: string): AgentMeta | null {
  const agents = loadAgents();

  if (explicitAgent) {
    const raw = explicitAgent.replace(/^@/, "");
    const dotIdx = raw.indexOf(".");
    let name = raw;
    let modelOverride: string | undefined;
    if (dotIdx > 0) {
      name = raw.slice(0, dotIdx);
      modelOverride = raw.slice(dotIdx + 1);
    }

    const base = agents.find(a => a.name === name)
      || { name, role: "unknown", tier: "T2", skills: [] } as AgentMeta;

    if (modelOverride) {
      const toolAgents = agents.filter(a => a.type === "tool");
      const matchedTool = toolAgents.find(a => a.name === modelOverride);
      if (matchedTool) {
        base.binary = matchedTool.binary;
        base.launchFlags = matchedTool.launchFlags;
        base.modelFlag = matchedTool.modelFlag;
        base.defaultModel = matchedTool.defaultModel;
      } else {
        base.defaultModel = modelOverride;
      }
    }
    return base;
  }

  const match = agents.find(a => a.skills.includes(skillName));
  return match || agents[0];
}

// ─── SKILL.md + Persona Loaders ─────────────────────────────────────────────

const MAX_SKILL_MD_SIZE = 128 * 1024;
const MAX_PERSONA_SIZE = 64 * 1024;

export function loadSkillMd(skillName: string): string | undefined {
  if (!AGENT_NAME_RE.test(skillName)) return undefined;

  const rootSkillFile = join(AGENCE_ROOT, "synthetic", "skills", skillName, "SKILL.md");
  const expectedRoot = resolve(AGENCE_ROOT, "synthetic", "skills");
  if (!resolve(rootSkillFile).startsWith(expectedRoot)) return undefined;

  if (existsSync(rootSkillFile)) {
    const content = readFileSync(rootSkillFile, "utf-8");
    return content.length > MAX_SKILL_MD_SIZE ? content.slice(0, MAX_SKILL_MD_SIZE) : content;
  }

  // Fallback: org-scoped
  const orgSkillFile = join(AGENCE_ROOT, "synthetic", ORG, "skills", skillName, "SKILL.md");
  if (existsSync(orgSkillFile)) {
    const content = readFileSync(orgSkillFile, "utf-8");
    return content.length > MAX_SKILL_MD_SIZE ? content.slice(0, MAX_SKILL_MD_SIZE) : content;
  }
  return undefined;
}

export function loadPersona(agentName: string): string | undefined {
  if (!agentName || agentName === "auto") return undefined;
  const cleanName = agentName.replace(/^@/, "");
  if (!isValidAgentName(cleanName)) return undefined;

  const personaFile = join(AGENCE_ROOT, "codex", "agents", cleanName, "agent.md");
  const expectedDir = resolve(AGENCE_ROOT, "codex", "agents");
  if (!resolve(personaFile).startsWith(expectedDir)) return undefined;

  if (existsSync(personaFile)) {
    const content = readFileSync(personaFile, "utf-8");
    return content.length > MAX_PERSONA_SIZE ? content.slice(0, MAX_PERSONA_SIZE) : content;
  }
  return undefined;
}

// ─── Skill listing ──────────────────────────────────────────────────────────

export function listSkills(): { name: string; description: string; hasCode: boolean }[] {
  return Object.values(SKILLS).map(s => ({
    name: s.name,
    description: s.description,
    hasCode: s.hasCode,
  }));
}

// Spelling aliases + legacy renames
export const ALIASES: Record<string, string> = {
  "analyze": "analyse",
  "peer-analyze": "peer-analyse",
  "ken": "extract",
};
