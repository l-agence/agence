#!/usr/bin/env bun
// lib/dispatch.ts — Agent dispatch + artifact routing
//
// Generic infrastructure for skill commands (^review, ^fix, ^solve, etc.)
// Routes work to agents and saves output artifacts to the correct scope.
//
// Artifact routing:
//   skills, reports, solutions → synthetic/  (team-shared, prose)
//   patterns, designs         → objectcode/ (AST-chunkable, structural)
//   analysis                  → synthetic/  (team knowledge)
//
// Usage:
//   airun dispatch route <artifact-type>   — print target scope/path
//   airun dispatch agents                  — list available agents
//   airun dispatch save <type> <file>      — save artifact to correct scope

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, basename } from "path";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Artifact Routing ────────────────────────────────────────────────────────
// Maps artifact types to their storage scope and subdirectory.

interface ArtifactRoute {
  scope: "synthetic" | "objectcode" | "organic" | "hermetic";
  subdir: string;
  description: string;
}

const ARTIFACT_ROUTES: Record<string, ArtifactRoute> = {
  // Prose artifacts → synthetic (team-shared)
  skill:    { scope: "synthetic", subdir: "skills",    description: "Reusable skill definition" },
  report:   { scope: "synthetic", subdir: "reports",   description: "Review/analysis report" },
  solution: { scope: "synthetic", subdir: "solutions", description: "Problem → solution pair" },
  analysis: { scope: "synthetic", subdir: "analyses",  description: "Analytical output" },
  document: { scope: "synthetic", subdir: "docs",      description: "Generated documentation" },

  // Structural artifacts → objectcode (AST-chunkable)
  pattern:  { scope: "objectcode", subdir: "patterns", description: "Reusable code pattern" },
  design:   { scope: "objectcode", subdir: "designs",  description: "Architecture/design blueprint" },

  // Work artifacts → organic (team work)
  result:   { scope: "organic", subdir: "results",   description: "Task execution result" },
};

// ─── Agent Registry ──────────────────────────────────────────────────────────
// Minimal agent metadata for dispatch routing.
// Full persona definitions live in codex/agents/<name>/agent.md

interface AgentMeta {
  name: string;
  role: string;
  tier: string;       // "free" | "low" | "medium" | "high"
  skills: string[];   // skill command names this agent is suited for
}

function loadAgents(): AgentMeta[] {
  // Try codex/agents/registry.json first
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
  if (existsSync(registryPath)) {
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      if (data.agents && typeof data.agents === "object") {
        // registry.json uses {name: {type, provider, ...}} object format
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

  // Fallback: hardcoded defaults
  return [
    { name: "copilot", role: "general coder",     tier: "medium", skills: ["fix", "build", "feature", "refactor"] },
    { name: "haiku",   role: "fast coder",         tier: "low",    skills: ["fix", "split", "build", "break"] },
    { name: "sonya",   role: "architect",           tier: "high",   skills: ["design", "solve", "refactor", "analyse"] },
    { name: "ralph",   role: "test & QA",           tier: "low",    skills: ["test", "review", "precommit"] },
    { name: "linus",   role: "harsh reviewer",      tier: "high",   skills: ["review", "simplify"] },
    { name: "feynman", role: "explainer",            tier: "medium", skills: ["document", "skill", "analyse"] },
    { name: "aleph",   role: "red team",             tier: "high",   skills: ["hack", "break", "recon"] },
    { name: "chad",    role: "DevOps/infra",         tier: "low",    skills: ["scope", "spec", "split", "pattern", "skill"] },
  ];
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdRoute(artifactType: string): void {
  const route = ARTIFACT_ROUTES[artifactType];
  if (!route) {
    process.stderr.write(`error: unknown artifact type '${artifactType}'\n`);
    process.stderr.write(`valid types: ${Object.keys(ARTIFACT_ROUTES).join(", ")}\n`);
    process.exit(1);
  }

  // Resolve org path
  const org = "l-agence.org";  // TODO: read from @ symlink
  let targetDir: string;
  if (route.scope === "synthetic") {
    targetDir = join(AGENCE_ROOT, route.scope, org, route.subdir);
  } else {
    targetDir = join(AGENCE_ROOT, route.scope, route.subdir);
  }

  console.log(JSON.stringify({
    type: artifactType,
    scope: route.scope,
    subdir: route.subdir,
    path: targetDir,
    description: route.description,
  }, null, 2));
}

function cmdAgents(): void {
  const agents = loadAgents();
  console.log(JSON.stringify(agents, null, 2));
}

function cmdSave(artifactType: string, filePath: string): void {
  const route = ARTIFACT_ROUTES[artifactType];
  if (!route) {
    process.stderr.write(`error: unknown artifact type '${artifactType}'\n`);
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    process.stderr.write(`error: file not found: ${filePath}\n`);
    process.exit(1);
  }

  const org = "l-agence.org";
  let targetDir: string;
  if (route.scope === "synthetic") {
    targetDir = join(AGENCE_ROOT, route.scope, org, route.subdir);
  } else {
    targetDir = join(AGENCE_ROOT, route.scope, route.subdir);
  }

  mkdirSync(targetDir, { recursive: true });
  const targetPath = join(targetDir, basename(filePath));
  const content = readFileSync(filePath, "utf-8");
  writeFileSync(targetPath, content, "utf-8");
  console.log(`✓ ${artifactType} → ${targetPath}`);
}

function cmdTypes(): void {
  console.log("Artifact Types:");
  for (const [type, route] of Object.entries(ARTIFACT_ROUTES)) {
    const t = type.padEnd(12);
    const s = route.scope.padEnd(12);
    console.log(`  ${t}  ${s}  ${route.scope}/${route.subdir}  ${route.description}`);
  }
}

function cmdHelp(): void {
  console.log(`dispatch — Agent dispatch + artifact routing

Commands:
  route <type>         Show storage path for artifact type
  agents               List available agents + skill mapping
  save <type> <file>   Save artifact to correct scope
  types                List all artifact types + routes
  help                 This message

Artifact Types:
  skill, report, solution, analysis, document → synthetic/ (shared)
  pattern, design                             → objectcode/ (structural)
  result                                      → organic/ (work output)`);
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "route":
    if (!args[0]) { process.stderr.write("usage: dispatch route <type>\n"); process.exit(2); }
    cmdRoute(args[0]);
    break;

  case "agents":
    cmdAgents();
    break;

  case "save":
    if (!args[0] || !args[1]) { process.stderr.write("usage: dispatch save <type> <file>\n"); process.exit(2); }
    cmdSave(args[0], args[1]);
    break;

  case "types":
    cmdTypes();
    break;

  case "help":
  case undefined:
    cmdHelp();
    break;

  default:
    process.stderr.write(`error: unknown command '${cmd}'\n`);
    cmdHelp();
    process.exit(2);
}
