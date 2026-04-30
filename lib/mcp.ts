#!/usr/bin/env bun
// lib/mcp.ts — Agence MCP Server (Model Context Protocol)
//
// Exposes agence capabilities as MCP tools over stdio transport.
// This is the machine interface — bin/agence is the human interface.
//
// Tools:
//   guard_check     — Check a command against AIPOLICY.yaml
//   guard_classify  — Classify a command's tier without side effects
//   skill_run       — Execute a skill (^fix, ^review, ^design, etc.)
//   skill_list      — List all available skills
//   memory_retain   — Store a memory row
//   memory_recall   — Query memory by tags
//   memory_stats    — Show memory store statistics
//   peers_run       — Run multi-LLM consensus
//   ledger_status   — Show ledger health
//   ledger_verify   — Verify Merkle chain integrity
//
// Resources:
//   agence://policy     — AIPOLICY.yaml contents
//   agence://registry   — Agent registry
//   agence://agents/*   — Individual agent persona files
//
// Usage:
//   bun run lib/mcp.ts                     # stdio transport (default)
//   AGENCE_ROOT=/path/to/.agence bun run lib/mcp.ts
//
// Integration:
//   Claude Desktop: add to claude_desktop_config.json
//   VS Code:       add to .vscode/mcp.json
//   Any MCP host:  stdio transport, command: "bun run lib/mcp.ts"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const BUN = process.env.BUN_PATH || "bun";

// Helper: run a subprocess safely using argument arrays (no shell interpolation)
function runSafe(args: string[], timeoutMs = 30_000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = spawnSync(args[0], args.slice(1), {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,  // 1MB
    });
    return {
      stdout: result.stdout?.toString("utf-8") ?? "",
      stderr: result.stderr?.toString("utf-8") ?? "",
      exitCode: result.status ?? 1,
    };
  } catch (err: any) {
    return { stdout: "", stderr: err.message, exitCode: 1 };
  }
}

// ─── Server Setup ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agence",
  version: "1.0.0",
});

// ─── Tools ───────────────────────────────────────────────────────────────────

// 1. Guard: check command against AIPOLICY
server.tool(
  "guard_check",
  "Check a command against AIPOLICY.yaml and return the guard decision (tier, approved/denied, reason). Every command an agent runs should pass through this gate first.",
  { command: z.string().describe("The shell command to check (e.g. 'git push origin main')") },
  async ({ command }) => {
    const r = runSafe([BUN, "run", "lib/guard.ts", "classify", command]);
    try {
      const decision = JSON.parse(r.stdout);
      return { content: [{ type: "text" as const, text: JSON.stringify(decision, null, 2) }] };
    } catch {
      return { content: [{ type: "text" as const, text: r.stdout || r.stderr || "Guard check failed" }] };
    }
  }
);

// 2. Guard: classify (no side effects, no ledger write)
server.tool(
  "guard_classify",
  "Classify a command's AIPOLICY tier without logging to the ledger. Returns JSON with tier (T0-T3), action, and matched rule.",
  { command: z.string().describe("The shell command to classify") },
  async ({ command }) => {
    const r = runSafe([BUN, "run", "lib/guard.ts", "classify", command]);
    try {
      const decision = JSON.parse(r.stdout);
      return { content: [{ type: "text" as const, text: JSON.stringify(decision, null, 2) }] };
    } catch {
      return { content: [{ type: "text" as const, text: r.stdout || r.stderr || "Classification failed" }] };
    }
  }
);

// 3. Skill: run a skill command
server.tool(
  "skill_run",
  "Execute an agence skill command (e.g. ^fix, ^review, ^design, ^hack). Dispatches to the appropriate agent based on skill type and routing rules.",
  {
    skill: z.string().describe("Skill name without ^ prefix (e.g. 'fix', 'review', 'design')"),
    query: z.string().describe("The task description or query for the skill"),
    agent: z.string().optional().describe("Optional agent override (e.g. '@sonya', '@ralph', '@linus')"),
    peers: z.boolean().optional().describe("Route through multi-LLM consensus (3 peers)"),
    noSave: z.boolean().optional().describe("Don't save the artifact to synthetic/"),
  },
  async ({ skill, query, agent, peers, noSave }) => {
    // SEC-012: Validate skill name (alphanumeric + hyphen only)
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(skill)) {
      return { content: [{ type: "text" as const, text: `Invalid skill name: ${skill}` }], isError: true };
    }
    const args = [BUN, "run", "lib/skill.ts", skill, query];
    if (agent) {
      // SEC-012: Validate agent name (@ prefix + alphanumeric/dot)
      if (!/^@[a-zA-Z][a-zA-Z0-9.]*$/.test(agent)) {
        return { content: [{ type: "text" as const, text: `Invalid agent name: ${agent}` }], isError: true };
      }
      args.push("--agent", agent);
    }
    if (peers) args.push("--peers");
    if (noSave) args.push("--no-save");
    const r = runSafe(args, 120_000);  // skills can take a while
    return {
      content: [{ type: "text" as const, text: r.stdout || r.stderr || "Skill execution completed" }],
      isError: r.exitCode !== 0,
    };
  }
);

// 4. Skill: list available skills
server.tool(
  "skill_list",
  "List all available agence skills with their groups and descriptions.",
  {},
  async () => {
    const r = runSafe([BUN, "run", "lib/skill.ts", "list"]);
    return { content: [{ type: "text" as const, text: r.stdout || "No skills found" }] };
  }
);

// 5. Memory: retain (store a memory)
server.tool(
  "memory_retain",
  "Store a memory row in one of the 5 COGNOS tiers. Memory is persistent and queryable.",
  {
    source: z.enum(["eidetic", "semantic", "episodic", "kinesthetic", "masonic"])
      .describe("Memory tier to store in"),
    tags: z.string().describe("Comma-separated tags for the memory (e.g. 'jwt,auth,security')"),
    content: z.string().describe("The memory content to store"),
    importance: z.number().min(0).max(1).optional().describe("Importance score 0-1 (default: 0.5)"),
  },
  async ({ source, tags, content, importance }) => {
    const args = [BUN, "run", "lib/memory.ts", "retain", source, tags, content];
    if (importance !== undefined) args.push("--importance", String(importance));
    const r = runSafe(args);
    return {
      content: [{ type: "text" as const, text: r.stdout || r.stderr || "Memory retained" }],
      isError: r.exitCode !== 0,
    };
  }
);

// 6. Memory: recall (query memories)
server.tool(
  "memory_recall",
  "Query memories by tags across all COGNOS tiers. Returns ranked results by importance × recency.",
  {
    tags: z.string().describe("Comma-separated tags to search for"),
    source: z.enum(["eidetic", "semantic", "episodic", "kinesthetic", "masonic"]).optional()
      .describe("Optional: restrict search to one tier"),
    max: z.number().optional().describe("Maximum results to return (default: 10)"),
  },
  async ({ tags, source, max }) => {
    const args = [BUN, "run", "lib/memory.ts", "recall", tags];
    if (source) args.push("--source", source);
    if (max) args.push("--max", String(max));
    const r = runSafe(args);
    return { content: [{ type: "text" as const, text: r.stdout || "No memories found" }] };
  }
);

// 7. Memory: stats
server.tool(
  "memory_stats",
  "Show memory statistics across all COGNOS tiers — row counts per store.",
  {},
  async () => {
    const r = runSafe([BUN, "run", "lib/memory.ts", "stats"]);
    return { content: [{ type: "text" as const, text: r.stdout || "No stats available" }] };
  }
);

// 8. Peers: multi-LLM consensus
server.tool(
  "peers_run",
  "Run multi-LLM consensus (3 independent LLMs). Skills: solve, review, analyze, plan. Returns weighted aggregate of findings, confidence scores, and reasoning from each peer.",
  {
    skill: z.enum(["solve", "review", "analyze", "plan"]).describe("Peer skill to run"),
    query: z.string().describe("The question or task for consensus"),
    flavor: z.enum(["code", "light", "heavy", "pair"]).optional()
      .describe("Model flavor: code (default), light, heavy, or pair (2-peer)"),
  },
  async ({ skill, query, flavor }) => {
    const args = [BUN, "run", "lib/peers.ts", skill, query];
    if (flavor) args.push("--flavor", flavor);
    const r = runSafe(args, 120_000);
    return {
      content: [{ type: "text" as const, text: r.stdout || r.stderr || "Peer consensus completed" }],
      isError: r.exitCode !== 0,
    };
  }
);

// 9. Ledger: status
server.tool(
  "ledger_status",
  "Show the Merkle-chained audit ledger status — entry count, chain validity, last entry.",
  {},
  async () => {
    const r = runSafe([BUN, "run", "lib/ledger.ts", "status"]);
    return { content: [{ type: "text" as const, text: r.stdout || r.stderr || "Ledger status unavailable" }] };
  }
);

// 10. Ledger: verify chain integrity
server.tool(
  "ledger_verify",
  "Verify the Merkle chain integrity of the audit ledger. Returns OK if chain is valid, or reports the first broken link.",
  {},
  async () => {
    const r = runSafe(["bash", "bin/ailedger", "verify"]);
    return {
      content: [{ type: "text" as const, text: r.stdout || r.stderr || "Verification complete" }],
      isError: r.exitCode !== 0,
    };
  }
);

// ─── Resources ───────────────────────────────────────────────────────────────

// AIPOLICY.yaml — the governance rules
server.resource(
  "policy",
  "agence://policy",
  { description: "AIPOLICY.yaml — the tiered command governance rules (120+ rules, T0-T3)" },
  async () => {
    const policyPath = join(AGENCE_ROOT, "codex", "AIPOLICY.yaml");
    const content = existsSync(policyPath) ? readFileSync(policyPath, "utf-8") : "AIPOLICY.yaml not found";
    return { contents: [{ uri: "agence://policy", text: content, mimeType: "text/yaml" }] };
  }
);

// Agent registry
server.resource(
  "registry",
  "agence://registry",
  { description: "Agent registry — types, models, binaries, skills for all 16 agents" },
  async () => {
    const regPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
    const content = existsSync(regPath) ? readFileSync(regPath, "utf-8") : "registry.json not found";
    return { contents: [{ uri: "agence://registry", text: content, mimeType: "application/json" }] };
  }
);

// ─── Resource Templates: Agent Personas ──────────────────────────────────────

server.resource(
  "agents",
  "agence://agents",
  { description: "List all agent persona definitions available in codex/agents/" },
  async () => {
    const agentsDir = join(AGENCE_ROOT, "codex", "agents");
    const agents: string[] = [];
    if (existsSync(agentsDir)) {
      for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const agentMd = join(agentsDir, entry.name, "agent.md");
          if (existsSync(agentMd)) agents.push(entry.name);
        }
      }
    }
    const listing = agents.length > 0
      ? agents.map(a => `- ${a} (agence://agents/${a})`).join("\n")
      : "No agent personas found";
    return { contents: [{ uri: "agence://agents", text: listing, mimeType: "text/plain" }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[mcp] agence MCP server running (stdio) — ${Object.keys(server).length ? "ready" : "ready"}`);
  console.error(`[mcp] AGENCE_ROOT=${AGENCE_ROOT}`);
}

main().catch((err) => {
  console.error("[mcp] Fatal:", err);
  process.exit(1);
});
