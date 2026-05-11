#!/usr/bin/env bun
// lib/external-agent.ts — N-Agent Parallel Invocation Loop
//
// Dispatches a query to N external LLM agents in parallel and aggregates
// results via the consensus engine (lib/consensus.ts).
//
// Architecture:
//   Default:  1 tangent  (single agent call, no consensus)
//   @pair:    2 tangents  (copilot + aider)
//   @peers:   3 tangents  (claude + gpt + gemini)
//
// This module owns:
//   - API transport (Anthropic, OpenAI, Gemini REST callers)
//   - Flavor configurations (model + weight matrices)
//   - Parallel dispatch (Promise.all)
//   - Consensus delegation (imports consensus.ts)
//   - Artifact persistence (saves to knowledge/analyses/)

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveOrg } from "./org.ts";
import {
  type PeerResponse,
  type ConsensusAlgo,
  type ConsensusResult,
  consensusWinner,
  buildJudgePrompt,
  parseJudgeResponse,
  buildRevisionPrompt,
  buildPeerSystemPrompt,
  parsePeerResponse,
  renderConsensus,
} from "./consensus.ts";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Types ───────────────────────────────────────────────────────────────────

export type Flavor = "code" | "light" | "heavy" | "pair";

export interface PeerConfig {
  name: string;
  provider: "anthropic" | "openai" | "gemini";
  model: string;
  weights: Record<string, number>;
}

// ─── Flavor Configurations ───────────────────────────────────────────────────

export const FLAVORS: Record<Flavor, PeerConfig[]> = {
  code: [
    {
      name: "claude", provider: "anthropic",
      model: process.env.PEERS_CODE_ANTHROPIC || "claude-sonnet-4-5-20250514",
      weights: { architecture: 0.95, implementation: 0.90, debugging: 0.85, review: 0.92, reasoning: 0.90, planning: 0.88 },
    },
    {
      name: "gpt", provider: "openai",
      model: process.env.PEERS_CODE_OPENAI || "gpt-4o",
      weights: { architecture: 0.90, implementation: 0.95, debugging: 0.90, review: 0.88, reasoning: 0.88, planning: 0.85 },
    },
    {
      name: "gemini", provider: "gemini",
      model: process.env.PEERS_CODE_GEMINI || "gemini-2.0-pro",
      weights: { architecture: 0.85, implementation: 0.88, debugging: 0.92, review: 0.85, reasoning: 0.85, planning: 0.83 },
    },
  ],
  light: [
    {
      name: "haiku", provider: "anthropic",
      model: process.env.PEERS_LIGHT_ANTHROPIC || "claude-haiku-3-5-20241022",
      weights: { speed: 0.90, clarity: 0.85, brainstorm: 0.80, review: 0.78, reasoning: 0.75, planning: 0.73 },
    },
    {
      name: "mini", provider: "openai",
      model: process.env.PEERS_LIGHT_OPENAI || "gpt-4o-mini",
      weights: { speed: 0.88, clarity: 0.90, brainstorm: 0.85, review: 0.82, reasoning: 0.80, planning: 0.78 },
    },
    {
      name: "flash", provider: "gemini",
      model: process.env.PEERS_LIGHT_GEMINI || "gemini-2.0-flash",
      weights: { speed: 0.92, clarity: 0.80, brainstorm: 0.88, review: 0.80, reasoning: 0.78, planning: 0.75 },
    },
  ],
  heavy: [
    {
      name: "opus", provider: "anthropic",
      model: process.env.PEERS_HEAVY_ANTHROPIC || "claude-opus-4-5-20250514",
      weights: { reasoning: 0.95, planning: 0.93, rca: 0.92, strategy: 0.94, implementation: 0.88, review: 0.90 },
    },
    {
      name: "gpt4", provider: "openai",
      model: process.env.PEERS_HEAVY_OPENAI || "gpt-4-turbo",
      weights: { reasoning: 0.92, planning: 0.90, rca: 0.95, strategy: 0.88, implementation: 0.90, review: 0.88 },
    },
    {
      name: "gemini-pro", provider: "gemini",
      model: process.env.PEERS_HEAVY_GEMINI || "gemini-2.0-pro",
      weights: { reasoning: 0.88, planning: 0.87, rca: 0.85, strategy: 0.90, implementation: 0.85, review: 0.83 },
    },
  ],
  pair: [
    {
      name: "copilot", provider: "anthropic",
      model: process.env.PAIR_ANTHROPIC || "claude-sonnet-4-5-20250514",
      weights: { architecture: 0.93, implementation: 0.90, debugging: 0.88, review: 0.92, reasoning: 0.90, planning: 0.88 },
    },
    {
      name: "aider", provider: "openai",
      model: process.env.PAIR_OPENAI || "gpt-4o",
      weights: { architecture: 0.90, implementation: 0.93, debugging: 0.90, review: 0.88, reasoning: 0.88, planning: 0.85 },
    },
  ],
};

// ─── API Transport ───────────────────────────────────────────────────────────

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
      model, max_tokens: maxTokens, system,
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
    signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${sanitizeErrorBody(body)}`);
  }
  const data = await guardedJson(resp, "OpenAI");
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(
  system: string, message: string, model: string, maxTokens = 4096
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
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
    throw new Error(`Gemini ${resp.status}: ${sanitizeErrorBody(body)}`);
  }
  const data = await guardedJson(resp, "Gemini");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function callProvider(
  peer: PeerConfig, system: string, message: string
): Promise<string> {
  switch (peer.provider) {
    case "anthropic": return callAnthropic(system, message, peer.model);
    case "openai":    return callOpenAI(system, message, peer.model);
    case "gemini":    return callGemini(system, message, peer.model);
  }
}

// ─── Parallel Dispatch ───────────────────────────────────────────────────────

async function dispatchPeers(
  configs: PeerConfig[],
  system: string,
  message: string,
): Promise<PeerResponse[]> {
  const promises = configs.map(async (peer): Promise<PeerResponse> => {
    const start = Date.now();
    try {
      const raw = await callProvider(peer, system, message);
      return parsePeerResponse(raw, peer.name, peer.model, Date.now() - start);
    } catch (err: any) {
      return {
        peer: peer.name, model: peer.model,
        finding: "", confidence: 0, reasoning: "",
        error: err.message || String(err),
        latencyMs: Date.now() - start,
      };
    }
  });
  return Promise.all(promises);
}

// ─── Consensus with LLM Calls ───────────────────────────────────────────────

async function runJudge(
  skill: string, flavor: string, query: string,
  peers: PeerResponse[], configs: PeerConfig[],
): Promise<ConsensusResult> {
  const { system, message } = buildJudgePrompt(query, peers);
  // SEC: Pick a different provider for the judge when possible (B4)
  const judgeConfig = configs.length > 1
    ? configs.find(c => c.provider !== configs[0].provider) || configs[configs.length - 1]
    : configs[0];
  try {
    console.error(`[peers] judge: synthesising via ${judgeConfig.name} (${judgeConfig.model})...`);
    const raw = await callProvider(judgeConfig, system, message);
    return parseJudgeResponse(raw, skill, flavor, query, peers, configs.map(c => c.weights));
  } catch (err: any) {
    console.error(`[peers] judge synthesis failed: ${err.message}`);
    return consensusWinner(skill, flavor, query, peers, configs.map(c => c.weights));
  }
}

async function runMerge(
  skill: string, flavor: string, query: string,
  peers: PeerResponse[], configs: PeerConfig[],
): Promise<ConsensusResult> {
  console.error(`[peers] merge round 2: ${configs.length} peers revising...`);
  const system = buildPeerSystemPrompt(skill, configs.length);

  const round2Promises = peers.map(async (self, i): Promise<PeerResponse> => {
    const others = peers.filter((_, j) => j !== i);
    const msg = buildRevisionPrompt(query, self, others);
    const start = Date.now();
    try {
      const raw = await callProvider(configs[i], system, msg);
      return parsePeerResponse(raw, self.peer, self.model, Date.now() - start);
    } catch {
      return self; // keep round 1 on failure
    }
  });

  const round2Responses = await Promise.all(round2Promises);
  return runJudge(skill, flavor, query, round2Responses, configs);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function runPeers(
  skill: string,
  query: string,
  flavor: Flavor = "code",
  format: "text" | "json" = "text",
  algo: ConsensusAlgo = "winner",
): Promise<{ exitCode: number; result?: ConsensusResult }> {
  const configs = FLAVORS[flavor];
  if (!configs) {
    console.error(`[peers] Unknown flavor: ${flavor}`);
    return { exitCode: 1 };
  }

  const system = buildPeerSystemPrompt(skill, configs.length);
  const userMsg = `Task: ${skill}\n\nQuery:\n${query}`;

  const mode = configs.length === 2 ? "pair" : flavor;
  console.error(`[peers] Dispatching to ${configs.length} ${mode} peers: ${configs.map(c => c.name).join(", ")}...`);

  const responses = await dispatchPeers(configs, system, userMsg);

  // Report errors
  for (const e of responses.filter(r => r.error)) {
    console.error(`[peers] ${e.peer} error: ${e.error}`);
  }

  const valid = responses.filter(r => !r.error && r.finding);
  if (valid.length === 0) {
    console.error("[peers] All peers failed — no consensus possible");
    return { exitCode: 1 };
  }

  let result: ConsensusResult;
  switch (algo) {
    case "judge":
      result = await runJudge(skill, flavor, query, valid, configs);
      break;
    case "merge":
      result = await runMerge(skill, flavor, query, valid, configs);
      break;
    case "winner":
    default:
      result = consensusWinner(skill, flavor, query, valid, configs.map(c => c.weights));
      break;
  }

  // Output
  console.log(renderConsensus(result, format));

  // Save artifact — SEC: sanitize org name (B2) to prevent path traversal
  const org = resolveOrg(AGENCE_ROOT).replace(/\.\./g, "").replace(/[\/\\]/g, "_");
  const outDir = join(AGENCE_ROOT, "knowledge", org, "analyses");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const nonce = Math.random().toString(36).slice(2, 8);
  const outFile = join(outDir, `peers-${skill}-${Date.now()}-${nonce}.json`);
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.error(`[peers] Saved: ${outFile}`);

  return { exitCode: 0, result };
}
