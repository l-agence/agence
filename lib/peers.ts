#!/usr/bin/env bun
// lib/peers.ts — Multi-Agent Consensus Engine (2-or-3 LLM ensemble)
//
// @peers: Calls 3 LLM APIs in parallel (3-tangent consensus)
// @pair:  Calls 2 LLM APIs in parallel (2-tangent lightweight consensus)
//
// Flavors:
//   code   — Best coding models (sonnet, gpt-4o, gemini-2-pro)
//   light  — Fast/cheap models (haiku, gpt-4o-mini, gemini-flash)
//   heavy  — Heavyweight reasoning (opus, gpt-4-turbo, o1-pro)
//   pair   — 2-tangent: copilot (anthropic) + aider (openai)
//
// Usage:
//   airun peers solve "problem description"
//   airun peers review "code or design to review"
//   airun peers analyze "subject to analyze"
//   airun peers plan "initiative to plan"
//   airun peers --pair solve "lightweight 2-way consensus"
//   airun peers help
//
// Each peer returns JSON: { finding, confidence, reasoning }
// Consensus = expertise-weighted aggregation across all peers.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { resolveOrg } from "./org.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Types ───────────────────────────────────────────────────────────────────

type Flavor = "code" | "light" | "heavy" | "pair";
type Skill = "solve" | "review" | "analyze" | "plan";

interface PeerConfig {
  name: string;
  provider: "anthropic" | "openai" | "gemini";
  model: string;
  weights: Record<string, number>;  // domain → weighting factor
}

interface PeerResponse {
  peer: string;
  model: string;
  finding: string;
  confidence: number;       // 0-100
  reasoning: string;
  raw?: string;
  error?: string;
  latencyMs: number;
}

interface ConsensusResult {
  skill: Skill;
  flavor: Flavor;
  query: string;
  peers: PeerResponse[];
  consensus: {
    finding: string;
    avgConfidence: number;
    weightedScore: number;
    agreement: "unanimous" | "majority" | "split";
  };
  dissent: string[];
  timestamp: string;
}

// ─── Flavor Configurations ───────────────────────────────────────────────────
// Each flavor defines 3 peers with provider, model, and domain weights.

const FLAVORS: Record<Flavor, PeerConfig[]> = {
  code: [
    {
      name: "claude",
      provider: "anthropic",
      model: process.env.PEERS_CODE_ANTHROPIC || "claude-sonnet-4-5-20250514",
      weights: { architecture: 0.95, implementation: 0.90, debugging: 0.85, review: 0.92 },
    },
    {
      name: "gpt",
      provider: "openai",
      model: process.env.PEERS_CODE_OPENAI || "gpt-4o",
      weights: { architecture: 0.90, implementation: 0.95, debugging: 0.90, review: 0.88 },
    },
    {
      name: "gemini",
      provider: "gemini",
      model: process.env.PEERS_CODE_GEMINI || "gemini-2.0-pro",
      weights: { architecture: 0.85, implementation: 0.88, debugging: 0.92, review: 0.85 },
    },
  ],
  light: [
    {
      name: "haiku",
      provider: "anthropic",
      model: process.env.PEERS_LIGHT_ANTHROPIC || "claude-haiku-3-5-20241022",
      weights: { speed: 0.90, clarity: 0.85, brainstorm: 0.80, review: 0.78 },
    },
    {
      name: "mini",
      provider: "openai",
      model: process.env.PEERS_LIGHT_OPENAI || "gpt-4o-mini",
      weights: { speed: 0.88, clarity: 0.90, brainstorm: 0.85, review: 0.82 },
    },
    {
      name: "flash",
      provider: "gemini",
      model: process.env.PEERS_LIGHT_GEMINI || "gemini-2.0-flash",
      weights: { speed: 0.92, clarity: 0.80, brainstorm: 0.88, review: 0.80 },
    },
  ],
  heavy: [
    {
      name: "opus",
      provider: "anthropic",
      model: process.env.PEERS_HEAVY_ANTHROPIC || "claude-opus-4-5-20250514",
      weights: { reasoning: 0.95, planning: 0.93, rca: 0.92, strategy: 0.94 },
    },
    {
      name: "gpt4",
      provider: "openai",
      model: process.env.PEERS_HEAVY_OPENAI || "gpt-4-turbo",
      weights: { reasoning: 0.92, planning: 0.90, rca: 0.95, strategy: 0.88 },
    },
    {
      name: "gemini-pro",
      provider: "gemini",
      model: process.env.PEERS_HEAVY_GEMINI || "gemini-2.0-pro",
      weights: { reasoning: 0.88, planning: 0.87, rca: 0.85, strategy: 0.90 },
    },
  ],

  // @pair: 2-tangent lightweight consensus (copilot + aider)
  // Intentionally 2 quality models competing/collaborating before synthesizing
  pair: [
    {
      name: "copilot",
      provider: "anthropic",
      model: process.env.PAIR_ANTHROPIC || "claude-sonnet-4-5-20250514",
      weights: { architecture: 0.93, implementation: 0.90, debugging: 0.88, review: 0.92, reasoning: 0.90, planning: 0.88 },
    },
    {
      name: "aider",
      provider: "openai",
      model: process.env.PAIR_OPENAI || "gpt-4o",
      weights: { architecture: 0.90, implementation: 0.93, debugging: 0.90, review: 0.88, reasoning: 0.88, planning: 0.85 },
    },
  ],
};

// Skill → domain weight key mapping
const SKILL_DOMAIN: Record<Skill, string> = {
  solve:   "implementation",
  review:  "review",
  analyze: "reasoning",
  plan:    "planning",
};

// ─── API Callers ─────────────────────────────────────────────────────────────
// Each provider has its own REST format. All return the response text.

async function callAnthropic(
  system: string, message: string, model: string, maxTokens = 4096
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: message }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data.content?.[0]?.text || "";
}

async function callOpenAI(
  system: string, message: string, model: string, maxTokens = 4096
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(
  system: string, message: string, model: string, maxTokens = 4096
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  // SEC-002: API key in header, not URL query param (avoids log/history exposure)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Provider dispatch
async function callPeer(
  peer: PeerConfig, system: string, message: string
): Promise<string> {
  switch (peer.provider) {
    case "anthropic": return callAnthropic(system, message, peer.model);
    case "openai":    return callOpenAI(system, message, peer.model);
    case "gemini":    return callGemini(system, message, peer.model);
  }
}

// ─── Peer Prompt Construction ────────────────────────────────────────────────

function buildSystemPrompt(skill: Skill, peerCount = 3): string {
  const base = `You are a peer in a ${peerCount}-agent consensus system. You will analyze the given problem independently.

IMPORTANT: Respond ONLY with valid JSON (no markdown fences, no extra text). Use this exact schema:
{
  "finding": "Your main recommendation or conclusion (1-3 sentences)",
  "confidence": <number 0-100>,
  "reasoning": "Key reasoning steps that led to your finding (2-5 sentences)"
}`;

  const skillContext: Record<Skill, string> = {
    solve: "You are solving a technical problem. Focus on correctness, feasibility, and trade-offs.",
    review: "You are reviewing code or a design. Focus on correctness, security, maintainability, and edge cases.",
    analyze: "You are analyzing a system, data, or situation. Focus on root causes, patterns, and implications.",
    plan: "You are creating a strategic plan. Focus on phases, dependencies, risks, and milestones.",
  };

  return `${base}\n\nContext: ${skillContext[skill]}`;
}

// ─── Response Parsing ────────────────────────────────────────────────────────

function parsePeerResponse(raw: string, peerName: string, model: string, latencyMs: number): PeerResponse {
  const base: PeerResponse = {
    peer: peerName,
    model,
    finding: "",
    confidence: 50,
    reasoning: "",
    raw,
    latencyMs,
  };

  try {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(cleaned);
    return {
      ...base,
      finding: String(parsed.finding || ""),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
      reasoning: String(parsed.reasoning || ""),
    };
  } catch {
    // Fallback: treat entire response as finding
    return {
      ...base,
      finding: raw.slice(0, 500),
      confidence: 30,  // low confidence for unparseable
      reasoning: "(response was not structured JSON)",
    };
  }
}

// ─── Consensus Engine ────────────────────────────────────────────────────────

function computeConsensus(
  skill: Skill,
  flavor: Flavor,
  query: string,
  peers: PeerResponse[],
  configs: PeerConfig[]
): ConsensusResult {
  const domain = SKILL_DOMAIN[skill] || "implementation";

  // Calculate weighted scores
  const scored = peers.map((p, i) => {
    const weight = configs[i]?.weights[domain] ?? 0.85;
    return {
      ...p,
      weight,
      weightedScore: (p.confidence / 100) * weight * 100,
    };
  });

  // Determine agreement level
  // Simple heuristic: if all findings share >50% of words, it's unanimous
  const findings = scored.map(s => s.finding.toLowerCase());
  const words0 = new Set(findings[0]?.split(/\s+/) || []);
  const overlaps = findings.slice(1).map(f => {
    const words = f.split(/\s+/);
    const shared = words.filter(w => words0.has(w)).length;
    return shared / Math.max(words.length, 1);
  });
  const avgOverlap = overlaps.reduce((a, b) => a + b, 0) / Math.max(overlaps.length, 1);
  const agreement: "unanimous" | "majority" | "split" =
    avgOverlap > 0.5 ? "unanimous" : avgOverlap > 0.3 ? "majority" : "split";

  // Consensus = highest weighted score peer's finding
  const best = scored.reduce((a, b) => a.weightedScore >= b.weightedScore ? a : b);
  const avgConfidence = scored.reduce((s, p) => s + p.confidence, 0) / scored.length;
  const avgWeightedScore = scored.reduce((s, p) => s + p.weightedScore, 0) / scored.length;

  // Dissenting views
  const dissent = scored
    .filter(p => p.finding !== best.finding && p.confidence > 40)
    .map(p => `${p.peer} (${p.model}, ${p.confidence}%): ${p.finding}`);

  return {
    skill,
    flavor,
    query,
    peers: scored,
    consensus: {
      finding: best.finding,
      avgConfidence: Math.round(avgConfidence),
      weightedScore: Math.round(avgWeightedScore * 10) / 10,
      agreement,
    },
    dissent,
    timestamp: new Date().toISOString(),
  };
}

// ─── Output Rendering ────────────────────────────────────────────────────────

function renderConsensus(result: ConsensusResult, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  const domain = SKILL_DOMAIN[result.skill] || "general";
  const lines: string[] = [];

  lines.push(`[peers] ${result.skill} (${result.flavor}) — ${result.consensus.agreement} consensus`);
  lines.push("");

  // Results table
  lines.push("  PEER          MODEL                    CONFIDENCE  WEIGHT  SCORE");
  lines.push("  ─────────────────────────────────────────────────────────────────");

  for (const p of result.peers) {
    const w = (p as any).weight ?? 0.85;
    const ws = (p as any).weightedScore ?? 0;
    lines.push(
      `  ${p.peer.padEnd(14)}${p.model.padEnd(25)}${String(p.confidence + "%").padEnd(12)}${w.toFixed(2).padEnd(8)}${ws.toFixed(1)}`
    );
  }
  lines.push("");

  // Consensus
  lines.push(`  CONSENSUS: ${result.consensus.finding}`);
  lines.push(`  Agreement: ${result.consensus.agreement} | Avg confidence: ${result.consensus.avgConfidence}% | Weighted score: ${result.consensus.weightedScore}`);
  lines.push("");

  // Per-peer reasoning
  lines.push("  ── Peer Reasoning ──");
  for (const p of result.peers) {
    lines.push(`  ${p.peer} (${p.model}):`);
    lines.push(`    Finding: ${p.finding}`);
    lines.push(`    Reasoning: ${p.reasoning}`);
    lines.push(`    Latency: ${p.latencyMs}ms`);
    lines.push("");
  }

  // Dissent
  if (result.dissent.length > 0) {
    lines.push("  ── Dissenting Views ──");
    for (const d of result.dissent) {
      lines.push(`  ⚠ ${d}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

async function runPeers(
  skill: Skill,
  query: string,
  flavor: Flavor = "code",
  format: "text" | "json" = "text"
): Promise<number> {
  const configs = FLAVORS[flavor];
  if (!configs) {
    console.error(`[peers] Unknown flavor: ${flavor}`);
    return 1;
  }

  const system = buildSystemPrompt(skill, configs.length);
  const userMsg = `Task: ${skill}\n\nQuery:\n${query}`;

  const mode = configs.length === 2 ? "pair" : `${flavor}`;
  console.error(`[peers] Dispatching to ${configs.length} ${mode} peers: ${configs.map(c => c.name).join(", ")}...`);

  // Call all 3 peers in parallel
  const promises = configs.map(async (peer): Promise<PeerResponse> => {
    const start = Date.now();
    try {
      const raw = await callPeer(peer, system, userMsg);
      return parsePeerResponse(raw, peer.name, peer.model, Date.now() - start);
    } catch (err: any) {
      return {
        peer: peer.name,
        model: peer.model,
        finding: "",
        confidence: 0,
        reasoning: "",
        error: err.message || String(err),
        latencyMs: Date.now() - start,
      };
    }
  });

  const responses = await Promise.all(promises);

  // Report errors
  const errors = responses.filter(r => r.error);
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[peers] ${e.peer} error: ${e.error}`);
    }
  }

  // Need at least 1 successful response
  const valid = responses.filter(r => !r.error && r.finding);
  if (valid.length === 0) {
    console.error("[peers] All peers failed — no consensus possible");
    return 1;
  }

  const result = computeConsensus(skill, flavor, query, valid, configs);

  // Output
  console.log(renderConsensus(result, format));

  // Save to synthetic/analyses/ if successful
  const outDir = join(AGENCE_ROOT, "synthetic", resolveOrg(AGENCE_ROOT), "analyses");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `peers-${skill}-${Date.now()}.json`);
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.error(`[peers] Saved: ${outFile}`);

  return 0;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdHelp(): number {
  console.log(`peers — Multi-Agent Consensus Engine

Usage:
  airun peers <skill> [--flavor code|light|heavy] [--json] <query...>
  airun peers <skill> --pair [--json] <query...>

Skills:
  solve     Tackle stuck/insolvable problems via multi-perspective consensus
  review    Code/design review with independent assessments
  analyze   Multi-perspective analysis of systems, data, trends
  plan      Strategic planning with spec + roadmap output

Modes:
  @peers    3-tangent consensus (default) — 3 independent LLMs
  @pair     2-tangent consensus — copilot (anthropic) + aider (openai)

Flavors (3-tangent only):
  code      Best coding models (sonnet + gpt-4o + gemini-pro)    [default]
  light     Fast/cheap models (haiku + gpt-4o-mini + gemini-flash)
  heavy     Heavyweight reasoning (opus + gpt-4-turbo + o1-pro)

Options:
  --pair         2-tangent mode: copilot + aider (faster, cheaper)
  --flavor <f>   Select model flavor (default: code)
  --json         Output raw JSON instead of formatted table
  --help         Show this help

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

  const skill = filteredArgs[0] as Skill;
  if (!["solve", "review", "analyze", "plan"].includes(skill)) {
    console.error(`[peers] Unknown skill: ${skill}`);
    console.error("  Valid skills: solve, review, analyze, plan");
    return 1;
  }

  // Parse flags
  let flavor: Flavor = pairMode ? "pair" : "code";
  let format: "text" | "json" = "text";
  const queryParts: string[] = [];

  for (let i = 1; i < filteredArgs.length; i++) {
    switch (filteredArgs[i]) {
      case "--flavor":
        flavor = (filteredArgs[++i] || "code") as Flavor;
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
  if (!query && !process.stdin.isTTY) {
    query = await new Response(process.stdin as any).text();
  }

  if (!query.trim()) {
    console.error("[peers] No query provided");
    return 1;
  }

  return runPeers(skill, query, flavor, format);
}

process.exit(await main());
