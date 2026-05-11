#!/usr/bin/env bun
// lib/peers.ts — Multi-Agent Consensus CLI (thin entry point)
//
// @peers: Calls 3 LLM APIs in parallel (3-tangent consensus)
// @pair:  Calls 2 LLM APIs in parallel (2-tangent lightweight consensus)
//
// All consensus logic lives in lib/consensus.ts (pure computation).
// All API transport lives in lib/external-agent.ts (N-agent loop).
// This file is CLI arg parsing + help text.
//
// Usage:
//   airun peers solve "problem description"
//   airun peers review --consensus judge "code to review"
//   airun peers analyze --consensus merge "subject to analyze"
//   airun peers plan "initiative to plan"
//   airun peers --pair solve "lightweight 2-way consensus"
//   airun peers consensus "decision question"
//   airun peers help

import { runPeers, type Flavor, FLAVORS } from "./external-agent.ts";
import type { ConsensusAlgo } from "./consensus.ts";

const VALID_SKILLS = ["solve", "review", "analyze", "plan", "consensus"];

function cmdHelp(): number {
  console.log(`peers — Multi-Agent Consensus Engine

Usage:
  airun peers <skill> [--flavor code|light|heavy] [--consensus winner|judge|merge] [--json] <query...>
  airun peers <skill> --pair [--json] <query...>

Skills:
  solve       Tackle stuck/insolvable problems via multi-perspective consensus
  review      Code/design review with independent assessments
  analyze     Multi-perspective analysis of systems, data, trends
  plan        Strategic planning with spec + roadmap output
  consensus   Multi-agent decision protocol (real ^consensus skill)

Modes:
  @peers    3-tangent consensus (default) — 3 independent LLMs
  @pair     2-tangent consensus — copilot (anthropic) + aider (openai)

Flavors (3-tangent only):
  code      Best coding models (sonnet + gpt-4o + gemini-pro)    [default]
  light     Fast/cheap models (haiku + gpt-4o-mini + gemini-flash)
  heavy     Heavyweight reasoning (opus + gpt-4-turbo + o1-pro)

Consensus algorithms:
  winner    Highest weighted-score peer wins (fast, deterministic)  [default]
  judge     4th LLM synthesises best answer from all peers (slower, better)
  merge     Delphi: peers revise after seeing others, then judge (slowest, best)

Options:
  --pair            2-tangent mode: copilot + aider (faster, cheaper)
  --flavor <f>      Select model flavor (default: code)
  --consensus <a>   Consensus algorithm: winner|judge|merge (default: winner)
  --json            Output raw JSON instead of formatted table
  --help            Show this help

Environment (override individual peer models):
  PEERS_CODE_ANTHROPIC, PEERS_CODE_OPENAI, PEERS_CODE_GEMINI
  PEERS_LIGHT_ANTHROPIC, PEERS_LIGHT_OPENAI, PEERS_LIGHT_GEMINI
  PEERS_HEAVY_ANTHROPIC, PEERS_HEAVY_OPENAI, PEERS_HEAVY_GEMINI
  PAIR_ANTHROPIC, PAIR_OPENAI

Requires: ANTHROPIC_API_KEY, OPENAI_API_KEY (and GEMINI_API_KEY for 3-tangent)
  (Peers with missing keys are skipped; at least 1 must work)

Examples:
  airun peers solve "Our CI takes 45 minutes, how to cut to 10?"
  airun peers review --flavor heavy < src/auth.ts
  airun peers analyze --json "Why are deploys failing on Mondays?"
  airun peers --pair solve "Quick 2-way consensus on this approach"
  airun peers plan "Migrate from REST to gRPC across 4 services"
  airun peers consensus "Should we migrate from Postgres to CockroachDB?"
`);
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    return cmdHelp();
  }

  // Handle --pair before or after skill name
  let pairMode = false;
  const filteredArgs = args.filter(a => {
    if (a === "--pair") { pairMode = true; return false; }
    return true;
  });

  const skill = filteredArgs[0];
  if (!VALID_SKILLS.includes(skill)) {
    console.error(`[peers] Unknown skill: ${skill}`);
    console.error(`  Valid skills: ${VALID_SKILLS.join(", ")}`);
    return 1;
  }

  // Parse flags
  let flavor: Flavor = pairMode ? "pair" : "code";
  let format: "text" | "json" = "text";
  let algo: ConsensusAlgo = "winner";
  const queryParts: string[] = [];

  for (let i = 1; i < filteredArgs.length; i++) {
    switch (filteredArgs[i]) {
      case "--flavor":
        flavor = (filteredArgs[++i] || "code") as Flavor;
        if (!(flavor in FLAVORS)) {
          console.error(`[peers] Unknown flavor: ${flavor}`);
          console.error(`  Valid flavors: ${Object.keys(FLAVORS).join(", ")}`);
          return 1;
        }
        break;
      case "--consensus":
        algo = (filteredArgs[++i] || "winner") as ConsensusAlgo;
        if (!["winner", "judge", "merge"].includes(algo)) {
          console.error(`[peers] Unknown consensus algorithm: ${algo}`);
          return 1;
        }
        break;
      case "--json":
      case "-j":
        format = "json";
        break;
      default:
        queryParts.push(filteredArgs[i]);
    }
  }

  // Query from args or stdin
  let query = queryParts.join(" ");
  if (!query && process.stdin.isTTY === false) {
    query = await new Response(process.stdin as any).text();
  }

  if (!query.trim()) {
    console.error("[peers] No query provided");
    return 1;
  }

  const { exitCode } = await runPeers(skill, query, flavor, format, algo);
  return exitCode;
}

process.exit(await main());
