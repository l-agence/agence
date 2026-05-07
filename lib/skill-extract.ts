#!/usr/bin/env bun
// lib/skill-extract.ts — ^extract: Knowledge Extraction Cycle
//
// MEM-005: Orchestrates grasp → glimpse → recon → distill in a compound pass.
// 1. grasp:   recall from all persistent stores (prior knowledge)
// 2. glimpse: read working memory cache (working context)
// 3. recon:   LLM synthesis + auto-retain findings to shared
// 4. distill: batch promote mature rows (private→shared)

import { recall, readWorking, retain, distill, stats } from "./memory.ts";
import type { MemoryRow, MemorySource } from "./memory.ts";
import { SKILLS, resolveAgent, loadPersona, loadSkillMd } from "./skill-registry.ts";
import { callRouter, callTool, callLoop, callPeers, retainReconFindings, MAX_MEMORY_CONTEXT } from "./skill-exec.ts";
import { saveArtifact } from "./skill-artifact.ts";

interface SkillResult {
  skill: string;
  agent: string;
  model: string;
  output: string;
  artifact?: string;
  timestamp: string;
  latencyMs: number;
}

export async function runExtract(
  query: string,
  opts: { agent?: string; peers?: boolean; flavor?: string; json?: boolean; save?: boolean }
): Promise<number> {
  const def = SKILLS["extract"];
  if (!def) return 1;

  console.error("[extract] MEM-005: Knowledge Extraction cycle starting…");
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
      console.error(`[extract] grasp: ${graspRows.length} rows recalled from ${[...new Set(graspRows.map(r => r.source))].join(", ") || "∅"}`);
    } catch { console.error("[extract] grasp: recall failed (non-fatal)"); }
  } else {
    console.error("[extract] grasp: no tags extracted — skipping recall");
  }

  // ── Step 2: GLIMPSE — read working memory cache ──
  let glimpseRows: MemoryRow[] = [];
  try {
    glimpseRows = readWorking();
    if (tags.length > 0) {
      const tagSet = new Set(tags);
      glimpseRows = glimpseRows.filter(r => r.tags.some(t => tagSet.has(t.toLowerCase())));
    }
    console.error(`[extract] glimpse: ${glimpseRows.length} rows from working memory`);
  } catch { console.error("[extract] glimpse: working memory read failed (non-fatal)"); }

  // ── Step 3: RECON — LLM synthesis with combined memory context ──
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
  const agent = resolveAgent("extract", opts.agent);
  const agentName = agent?.name || "auto";
  const personaMd = loadPersona(agentName);
  const skillMd = loadSkillMd("extract");

  let systemPrompt = "";
  if (personaMd) {
    systemPrompt += `[PERSONA-BEGIN agent=${agentName}]\n${personaMd}\n[PERSONA-END]\n\n`;
  }
  systemPrompt += def.systemPrompt;
  if (skillMd) {
    systemPrompt += `\n\n[SKILL-REF-BEGIN skill=extract]\n${skillMd}\n[SKILL-REF-END]`;
  }
  if (memoryBlock) {
    systemPrompt += memoryBlock;
    console.error(`[extract] recon: memory context injected (${allRows.length} rows)`);
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
      output = callLoop(agent, systemPrompt, query, "extract");
    } else {
      output = callRouter(systemPrompt, query, agent?.name);
    }
  } catch (err: any) {
    console.error(`[extract] recon: LLM call failed: ${err.message}`);
    return 1;
  }

  if (!output) {
    console.error("[extract] recon: empty response");
    return 1;
  }

  // Auto-retain recon findings to shared
  retainReconFindings(output, query);
  console.error("[extract] recon: findings retained → shared");

  // ── Step 4: DISTILL — batch promote mature rows ──
  const distillPaths: Array<[MemorySource, MemorySource]> = [
    ["private" as MemorySource, "shared" as MemorySource],
  ];
  let totalPromoted = 0;
  let totalDuplicates = 0;
  for (const [from, to] of distillPaths) {
    try {
      const result = distill({ from, to, minImportance: 0.6, minAgeDays: 1 });
      totalPromoted += result.promoted.length;
      totalDuplicates += result.duplicates;
      if (result.promoted.length > 0) {
        console.error(`[extract] distill: ${result.promoted.length} promoted ${from}→${to} (${result.skipped} skipped, ${result.duplicates} dupes)`);
      }
    } catch {
      // Non-fatal
    }
  }
  if (totalPromoted === 0) {
    console.error("[extract] distill: nothing to promote (all recent or below threshold)");
  }

  const latencyMs = Date.now() - start;

  // Output
  if (opts.json) {
    const result: SkillResult = {
      skill: "extract",
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
    const saved = saveArtifact(def.artifact, output, "extract");
    if (saved) console.error(`[extract] Artifact saved: ${saved}`);
  }

  // Summary
  const memStats = stats();
  console.error(`[extract] MEM-005: cycle complete in ${latencyMs}ms | grasp:${graspRows.length} glimpse:${glimpseRows.length} promoted:${totalPromoted} dupes:${totalDuplicates}`);
  console.error(`[extract] stores: ${Object.entries(memStats).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  return 0;
}
