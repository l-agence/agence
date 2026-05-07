#!/usr/bin/env bun
// lib/skill.ts — Skill Command Orchestrator (slim entry point)
//
// Imports real logic from:
//   skill-registry.ts  — SKILLS map, agent resolution, loaders
//   skill-exec.ts      — callRouter, callTool, callLoop, callPeers
//   skill-bundle.ts    — ^bundle CI/CD pipeline
//   skill-ken.ts       — ^ken knowledge extraction cycle
//   skill-artifact.ts  — artifact routing + save
//
// This file retains: runSkill(), CLI parsing, main(), cmdList, cmdHelp,
// project-instruction loading, and the delegation table.

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

import { SKILLS, ALIASES, resolveAgent, loadSkillMd, loadPersona, isValidAgentName } from "./skill-registry.ts";
import { callRouter, callTool, callLoop, callPeers, buildMemoryContext, retainReconFindings } from "./skill-exec.ts";
import { runBundle } from "./skill-bundle.ts";
import { runKen } from "./skill-ken.ts";
import { saveArtifact } from "./skill-artifact.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const BUN = process.env.BUN_PATH || "bun";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SkillResult {
  skill: string;
  agent: string;
  model: string;
  output: string;
  artifact?: string;
  timestamp: string;
  latencyMs: number;
}

// ─── Project Instructions Loader (AGENCE.md convention) ──────────────────────

const MAX_PROJECT_INSTRUCTIONS_SIZE = 32 * 1024;

function loadProjectInstructions(): string | undefined {
  const gitRoot = process.env.GIT_ROOT || process.env.PWD || process.cwd();
  // SEC-014: Reject GIT_ROOT containing path traversal components
  if (gitRoot.includes("..") || !resolve(gitRoot).startsWith("/")) {
    process.stderr.write(`[skill] SEC-014: rejected GIT_ROOT with path traversal: ${gitRoot}\n`);
    return undefined;
  }
  for (const name of ["AGENCE.md", ".agence.md"]) {
    const filePath = join(gitRoot, name);
    if (!resolve(filePath).startsWith(resolve(gitRoot))) continue;
    // SEC-014: Reject symlinks
    try {
      const stat = require("fs").lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        process.stderr.write(`[skill] SEC-014: rejected symlinked AGENCE.md: ${filePath}\n`);
        continue;
      }
    } catch { continue; }
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      if (content.length > MAX_PROJECT_INSTRUCTIONS_SIZE) {
        process.stderr.write(`[skill] AGENCE.md exceeds size limit (${content.length} > ${MAX_PROJECT_INSTRUCTIONS_SIZE}), truncated\n`);
        return content.slice(0, MAX_PROJECT_INSTRUCTIONS_SIZE);
      }
      process.stderr.write(`[skill] Loaded project instructions from ${name}\n`);
      return content;
    }
  }
  return undefined;
}

// ─── Main Skill Runner ──────────────────────────────────────────────────────

async function runSkill(
  skillName: string,
  query: string,
  opts: { agent?: string; peers?: boolean; flavor?: string; json?: boolean; save?: boolean }
): Promise<number> {
  // MEM-005: ^ken has its own orchestrator
  if (skillName === "ken") return runKen(query, opts);

  // ^bundle — local CI/CD pipeline (no LLM, just run the chain)
  if (skillName === "bundle") return runBundle();

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
    systemPrompt += `[PERSONA-BEGIN agent=${agentName}]\n${personaMd}\n[PERSONA-END]\n\n`;
  }
  systemPrompt += def.systemPrompt;
  if (skillMd) {
    systemPrompt += `\n\n[SKILL-REF-BEGIN skill=${skillName}]\n${skillMd}\n[SKILL-REF-END]`;
  }

  // AGENCE.md convention: inject project-level instructions
  const projectInstructions = loadProjectInstructions();
  if (projectInstructions) {
    const sanitized = projectInstructions
      .replace(/\[PROJECT-INSTRUCTIONS-BEGIN\]/g, "[PROJECT-INSTRUCTIONS-BEGIN (stripped)]")
      .replace(/\[PROJECT-INSTRUCTIONS-END\]/g, "[PROJECT-INSTRUCTIONS-END (stripped)]");
    systemPrompt += `\n\n[PROJECT-INSTRUCTIONS-BEGIN]\n${sanitized}\n[PROJECT-INSTRUCTIONS-END]`;
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

  // AUTO-PIPE: ^integrate output → ^verify ingest (queue MANUAL_VERIFY items)
  if (skillName === "integrate" && output) {
    try {
      const { ingestFindings } = await import("./verify.ts");
      const { added, skipped } = ingestFindings(output, "integrate");
      if (added > 0) {
        console.error(`[skill] Auto-ingested: ${added} MANUAL_VERIFY items queued (${skipped} skipped)`);
      }
    } catch { /* verify module not available — skip */ }
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
    "Ops":       ["deploy", "bundle", "brainstorm", "integrate"],
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

Examples:
  airun skill fix "TypeError in auth.ts line 42"
  airun skill review --agent @linus < src/server.ts
  airun skill solve --peers "How to reduce CI from 45min"
  airun skill analyse --json "Why do Monday deploys fail?"
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

  // Delegation table: subcommands that spawn separate .ts files
  const DELEGATES: Record<string, string> = {
    mcp:     "lib/mcp-client.ts",
    sequent: "lib/sequent.ts",
    redoc:   "lib/redoc.ts",
    verify:  "lib/verify.ts",
    queue:   "lib/queue.ts",
    diff:    "lib/diff.ts",
    btw:     "lib/btw.ts",
  };

  if (args[0] in DELEGATES) {
    const target = DELEGATES[args[0]];
    const subArgs = args.slice(1);
    const result = spawnSync(BUN, ["run", join(AGENCE_ROOT, target), ...subArgs], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
      stdio: "inherit",
    });
    return result.status ?? 1;
  }

  // Routes delegation (special case: routes → router.ts routes)
  if (args[0] === "routes") {
    const result = spawnSync(BUN, ["run", join(AGENCE_ROOT, "lib", "router.ts"), "routes"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
      stdio: "inherit",
    });
    return result.status ?? 1;
  }

  const skillName = args[0];

  // WIRE-003: normalize spelling aliases
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
        if (agent?.replace(/^@/, "") === "peers") {
          peers = true;
          agent = undefined;
        }
        if (agent?.replace(/^@/, "") === "pair") {
          peers = true;
          flavor = "pair";
          agent = undefined;
        }
        // SEC-006: Validate agent name early
        if (agent) {
          const cleanAgent = agent.replace(/^@/, "");
          const parts = cleanAgent.split(".");
          const allValid = parts.every(p => isValidAgentName(p));
          if (!allValid || parts.length > 2) {
            console.error(`[skill] SEC-006: invalid agent name: ${agent}`);
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

  if (!query.trim() && canonicalSkill !== "bundle") {
    console.error(`[skill] No query provided for '${canonicalSkill}'`);
    return 1;
  }

  return runSkill(canonicalSkill, query, { agent, peers, flavor, json, save });
}

process.exit(await main());
