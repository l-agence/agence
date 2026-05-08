#!/usr/bin/env bun
// lib/consensus.ts — Consensus Engine (pure computation, no I/O)
//
// Three algorithms for aggregating N independent peer responses:
//   winner  — Highest expertise-weighted score wins (fast, deterministic)
//   judge   — Synthesis LLM merges all findings (N+1 calls total)
//   merge   — Delphi: peers revise after seeing others, then judge (2N+1 calls)
//
// This module is PURE — it receives parsed responses and returns results.
// All API transport lives in external-agent.ts.

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConsensusAlgo = "winner" | "judge" | "merge";
export type Agreement = "unanimous" | "majority" | "split";

export interface PeerResponse {
  peer: string;
  model: string;
  finding: string;
  confidence: number;       // 0-100
  reasoning: string;
  raw?: string;
  error?: string;
  latencyMs: number;
}

export interface ScoredPeer extends PeerResponse {
  weight: number;
  weightedScore: number;
}

export interface ConsensusResult {
  skill: string;
  flavor: string;
  query: string;
  algo: ConsensusAlgo;
  peers: ScoredPeer[];
  consensus: {
    finding: string;
    avgConfidence: number;
    weightedScore: number;
    agreement: Agreement;
  };
  dissent: string[];
  timestamp: string;
}

// Weight keys per skill domain
export const SKILL_DOMAIN: Record<string, string> = {
  solve:     "implementation",
  review:    "review",
  analyze:   "reasoning",
  plan:      "planning",
  consensus: "reasoning",
};

// ─── Agreement Detection ─────────────────────────────────────────────────────
// Word-overlap heuristic (fast, no external deps).
// Compares pairwise against first peer, filters stopwords.

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
  "this", "that", "these", "those", "it", "its", "they", "them", "we",
  "i", "you", "he", "she", "my", "your", "his", "her", "our", "their",
]);

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

export function detectAgreement(findings: string[]): Agreement {
  if (findings.length < 2) return "unanimous";

  const tokenSets = findings.map(tokenize);
  let totalOverlap = 0;
  let comparisons = 0;

  // Pairwise overlap (not just against peer[0])
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      const shared = [...a].filter(w => b.has(w)).length;
      const maxSize = Math.max(a.size, b.size, 1);
      totalOverlap += shared / maxSize;
      comparisons++;
    }
  }

  const avgOverlap = totalOverlap / Math.max(comparisons, 1);
  if (avgOverlap > 0.5) return "unanimous";
  if (avgOverlap > 0.3) return "majority";
  return "split";
}

// ─── Score Peers ─────────────────────────────────────────────────────────────

export function scorePeers(
  peers: PeerResponse[],
  weights: Record<string, number>[],
  domain: string,
): ScoredPeer[] {
  // SEC: Cap self-reported confidence at 95 (B3) — prevents adversarial
  // peer from auto-winning by claiming 100% confidence
  const CAP = 95;
  return peers.map((p, i) => {
    const w = weights[i]?.[domain] ?? 0.85;
    const capped = Math.min(p.confidence, CAP);
    return {
      ...p,
      weight: w,
      weightedScore: (capped / 100) * w * 100,
    };
  });
}

// ─── Winner Algorithm ────────────────────────────────────────────────────────
// Highest weighted-score peer's finding IS the consensus.

export function consensusWinner(
  skill: string,
  flavor: string,
  query: string,
  peers: PeerResponse[],
  weights: Record<string, number>[],
): ConsensusResult {
  const domain = SKILL_DOMAIN[skill] || "implementation";
  const scored = scorePeers(peers, weights, domain);

  const agreement = detectAgreement(scored.map(s => s.finding));
  const best = scored.reduce((a, b) => a.weightedScore >= b.weightedScore ? a : b);
  const avgConfidence = scored.reduce((s, p) => s + p.confidence, 0) / scored.length;
  const avgWeightedScore = scored.reduce((s, p) => s + p.weightedScore, 0) / scored.length;

  const dissent = scored
    .filter(p => p.finding !== best.finding && p.confidence > 40)
    .map(p => `${p.peer} (${p.model}, ${p.confidence}%): ${p.finding}`);

  return {
    skill, flavor, query,
    algo: "winner",
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

// ─── Judge Algorithm ─────────────────────────────────────────────────────────
// Build the judge prompt + parse the judge response. The actual LLM call
// is performed by the caller (external-agent.ts) — this module stays pure.

export function buildJudgePrompt(
  query: string,
  peers: PeerResponse[],
): { system: string; message: string } {
  const peerSummaries = peers.map((p, i) =>
    `── Peer ${i + 1}: ${p.peer} (${p.model}, confidence: ${p.confidence}%) ──\n${p.finding}\n\nReasoning: ${p.reasoning}`
  ).join("\n\n");

  const system = `You are a judge synthesising the best answer from ${peers.length} independent expert responses.
Evaluate each response for correctness, completeness, and insight.
Produce a single definitive answer that takes the best from each.
Respond ONLY with valid JSON:
{
  "finding": "Your synthesised answer (comprehensive, 3-8 sentences)",
  "confidence": <number 0-100>,
  "reasoning": "Why you chose to emphasise certain responses over others (2-4 sentences)",
  "agreement": "unanimous" | "majority" | "split"
}`;

  const message = `Original query: ${query}\n\n${peerSummaries}`;
  return { system, message };
}

export function parseJudgeResponse(
  raw: string,
  skill: string,
  flavor: string,
  query: string,
  peers: PeerResponse[],
  weights: Record<string, number>[],
): ConsensusResult {
  const domain = SKILL_DOMAIN[skill] || "implementation";
  const scored = scorePeers(peers, weights, domain);

  let finding = "";
  let confidence = 50;
  let reasoning = "";
  let agreement: Agreement = "majority";
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    const parsed = JSON.parse(cleaned);
    finding = String(parsed.finding || "");
    confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));
    reasoning = String(parsed.reasoning || "");
    if (["unanimous", "majority", "split"].includes(parsed.agreement)) {
      agreement = parsed.agreement;
    }
  } catch {
    finding = raw.slice(0, 1000);
    reasoning = "(judge response was not structured JSON)";
  }

  const avgConfidence = peers.reduce((s, p) => s + p.confidence, 0) / peers.length;
  const avgWeightedScore = scored.reduce((s, p) => s + p.weightedScore, 0) / scored.length;

  return {
    skill, flavor, query,
    algo: "judge",
    peers: scored,
    consensus: {
      finding, confidence,
      avgConfidence: Math.round(avgConfidence),
      weightedScore: Math.round(avgWeightedScore * 10) / 10,
      agreement,
    } as any,
    dissent: [],
    timestamp: new Date().toISOString(),
  };
}

// ─── Merge (Delphi) Prompts ──────────────────────────────────────────────────
// Build round-2 revision prompt for each peer.

export function buildRevisionPrompt(
  query: string,
  self: PeerResponse,
  others: PeerResponse[],
): string {
  const otherSummaries = others.map(o =>
    `Peer ${o.peer} (${o.model}, ${o.confidence}%): ${o.finding}`
  ).join("\n");

  return `You previously answered this query:
"${query}"

Your answer was:
${self.finding}
(confidence: ${self.confidence}%, reasoning: ${self.reasoning})

Here are the other peers' independent answers:
${otherSummaries}

Now revise your answer, incorporating any valid points from other peers.
Keep your original position if you believe it's correct, or update it.
Respond ONLY with valid JSON:
{
  "finding": "Your revised recommendation (1-3 sentences)",
  "confidence": <number 0-100>,
  "reasoning": "What changed or why you maintained your position (2-4 sentences)"
}`;
}

// ─── Response Parsing ────────────────────────────────────────────────────────

export function parsePeerResponse(
  raw: string, peerName: string, model: string, latencyMs: number
): PeerResponse {
  const base: PeerResponse = {
    peer: peerName, model,
    finding: "", confidence: 50, reasoning: "",
    raw, latencyMs,
  };

  try {
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
    // SEC: Flag unparseable responses (B5) — low confidence + error marker
    // so consensus algorithms can filter/deprioritize them
    return {
      ...base,
      finding: raw.slice(0, 500),
      confidence: 10,
      reasoning: "(response was not structured JSON)",
      error: "unparseable",
    };
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export function renderConsensus(result: ConsensusResult, format: "text" | "json"): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`[peers] ${result.skill} (${result.flavor}) — ${result.consensus.agreement} consensus`);
  lines.push("");

  lines.push("  PEER          MODEL                    CONFIDENCE  WEIGHT  SCORE");
  lines.push("  ─────────────────────────────────────────────────────────────────");
  for (const p of result.peers) {
    lines.push(
      `  ${p.peer.padEnd(14)}${p.model.padEnd(25)}${String(p.confidence + "%").padEnd(12)}${p.weight.toFixed(2).padEnd(8)}${p.weightedScore.toFixed(1)}`
    );
  }
  lines.push("");

  lines.push(`  CONSENSUS: ${result.consensus.finding}`);
  lines.push(`  Agreement: ${result.consensus.agreement} | Avg confidence: ${result.consensus.avgConfidence}% | Weighted score: ${result.consensus.weightedScore}`);
  lines.push("");

  lines.push("  ── Peer Reasoning ──");
  for (const p of result.peers) {
    lines.push(`  ${p.peer} (${p.model}):`);
    lines.push(`    Finding: ${p.finding}`);
    lines.push(`    Reasoning: ${p.reasoning}`);
    lines.push(`    Latency: ${p.latencyMs}ms`);
    lines.push("");
  }

  if (result.dissent.length > 0) {
    lines.push("  ── Dissenting Views ──");
    for (const d of result.dissent) {
      lines.push(`  ⚠ ${d}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Peer System Prompt ──────────────────────────────────────────────────────

export function buildPeerSystemPrompt(skill: string, peerCount = 3): string {
  const base = `You are a peer in a ${peerCount}-agent consensus system. You will analyze the given problem independently.

IMPORTANT: Respond ONLY with valid JSON (no markdown fences, no extra text). Use this exact schema:
{
  "finding": "Your main recommendation or conclusion (1-3 sentences)",
  "confidence": <number 0-100>,
  "reasoning": "Key reasoning steps that led to your finding (2-5 sentences)"
}`;

  const skillContext: Record<string, string> = {
    solve: "You are solving a technical problem. Focus on correctness, feasibility, and trade-offs.",
    review: "You are reviewing code or a design. Focus on correctness, security, maintainability, and edge cases.",
    analyze: "You are analyzing a system, data, or situation. Focus on root causes, patterns, and implications.",
    plan: "You are creating a strategic plan. Focus on phases, dependencies, risks, and milestones.",
    consensus: "You are contributing to a multi-agent decision. Focus on the strongest argument with evidence.",
  };

  return `${base}\n\nContext: ${skillContext[skill] || skillContext.solve}`;
}
