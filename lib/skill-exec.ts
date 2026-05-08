#!/usr/bin/env bun
// lib/skill-exec.ts — LLM execution dispatch
//
// Handles all agent dispatch paths:
//   callRouter()     — single-agent via router.sh
//   callTool()       — external CLI binary (aider, claude, etc.)
//   callToolDirect() — headless stdin/stdout spawn
//   callToolTmux()   — tmux pipe-pane capture
//   callLoop()       — iteration harness (ralph pattern)
//   callPeers()      — multi-agent consensus via peers.ts

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { spawnSync } from "child_process";
import type { AgentMeta } from "./skill-registry.ts";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Router Dispatch ─────────────────────────────────────────────────────────

export function callRouter(system: string, userMsg: string, agent?: string): string {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (agent) {
    env.AGENCE_AGENT_PARAM = agent;

    const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
    try {
      const data = JSON.parse(readFileSync(registryPath, "utf-8"));
      const entry = data.agents?.[agent];
      if (entry?.provider && entry.provider !== "copilot") {
        env.AGENCE_LLM_PROVIDER = entry.provider;
      }
      if (entry?.default_model) {
        const fullModel = data.models?.[entry.default_model] || entry.default_model;
        env.AGENCE_LLM_MODEL = fullModel;
      }
    } catch { /* registry lookup failed, let router auto-detect */ }
  }

  const script = `
    source "${AGENCE_ROOT}/lib/router.sh" 2>/dev/null
    router_load_config 2>/dev/null
    router_chat "$1"
  `;

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

// ─── Tool Agent Dispatch ─────────────────────────────────────────────────────

export function resolveToolBinary(agent: AgentMeta): string | null {
  const bins = Array.isArray(agent.binary) ? agent.binary : agent.binary ? [agent.binary] : [];
  for (const bin of bins) {
    const which = spawnSync("which", [bin.split(" ")[0]], { encoding: "utf-8" });
    if (which.status === 0) return bin;
  }
  return null;
}

export function callTool(agent: AgentMeta, systemPrompt: string, query: string): string {
  const binary = resolveToolBinary(agent);
  if (!binary) {
    const installHint = agent.install ? `\n  Install: ${agent.install}` : "";
    throw new Error(`Tool agent @${agent.name}: binary not found (${JSON.stringify(agent.binary)})${installHint}`);
  }

  const parts: string[] = [binary];

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

  const prompt = `${systemPrompt}\n\n---\n\n${query}`;
  const inTmux = !!process.env.TMUX;

  if (inTmux) {
    return callToolTmux(agent.name, parts, prompt);
  } else {
    return callToolDirect(parts, prompt);
  }
}

export function callToolDirect(cmdParts: string[], prompt: string): string {
  const cmd = cmdParts[0];
  let args = cmdParts.slice(1);

  if (cmd === "claude") {
    args.push("-p");
  } else if (cmd === "aider") {
    args.push("--message");
  }

  const result = spawnSync(cmd, args, {
    input: prompt,
    env: process.env as Record<string, string>,
    timeout: 300_000,
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

export function callToolTmux(agentName: string, cmdParts: string[], prompt: string): string {
  const sessionDir = join(AGENCE_ROOT, "nexus", ".aisessions");
  const tangentId = `tool-${agentName}-${Date.now().toString(36)}`;
  const sid = `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const logFile = join(sessionDir, `${sid}.typescript`);

  mkdirSync(sessionDir, { recursive: true });

  const promptFile = join(AGENCE_ROOT, "nexus", "tmp", `${tangentId}.prompt.md`);
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(promptFile, prompt);

  const session = process.env.AGENCE_TMUX_SESSION || "agence";
  const cmdStr = cmdParts.join(" ");
  const toolCmd = cmdParts[0] === "claude"
    ? `cat '${promptFile}' | ${cmdStr} -p --dangerously-skip-permissions`
    : cmdParts[0] === "aider"
    ? `${cmdStr} --message "$(cat '${promptFile}')" --yes`
    : `${cmdStr} < '${promptFile}'`;

  const windowCmd = `${toolCmd}; echo '__AGENCE_TOOL_DONE__' >> '${logFile}'; sleep 2`;

  spawnSync("tmux", [
    "new-window", "-t", session, "-n", `@${tangentId}`,
    "-d", "bash", "-c", windowCmd,
  ], { encoding: "utf-8" });

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
        spawnSync("tmux", ["kill-window", "-t", paneTarget], { encoding: "utf-8" });
        try { require("fs").unlinkSync(promptFile); } catch {}
        return content.replace("__AGENCE_TOOL_DONE__", "").trim();
      }
    }
    spawnSync("sleep", ["2"]);
  }

  spawnSync("tmux", ["kill-window", "-t", paneTarget], { encoding: "utf-8" });
  const partial = existsSync(logFile) ? readFileSync(logFile, "utf-8").trim() : "";
  throw new Error(`Tool @${agentName} timed out after 5min${partial ? ". Partial output captured." : ""}`);
}

// ─── Loop Agent Dispatch ─────────────────────────────────────────────────────

export function callLoop(agent: AgentMeta, systemPrompt: string, query: string, skillName: string): string {
  const loopBin = join(AGENCE_ROOT, "bin", "loop");

  const promptFile = join(AGENCE_ROOT, "nexus", "tmp", `loop-${agent.name}-${Date.now().toString(36)}.prompt.md`);
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(promptFile, `${systemPrompt}\n\n---\n\n${query}`);

  let model = agent.defaultModel || "sonnet";
  const registryPath = join(AGENCE_ROOT, "codex", "agents", "registry.json");
  try {
    const data = JSON.parse(readFileSync(registryPath, "utf-8"));
    model = data.models?.[model] || model;
  } catch {}

  let innerBinary = "claude";
  if (agent.binary) {
    const resolved = resolveToolBinary(agent);
    if (resolved) innerBinary = resolved;
  }

  const result = spawnSync("bash", [loopBin, "--prompt", promptFile, "--binary", innerBinary,
    "--model", model, "--agent", agent.name, "--skill", skillName, "--max", "5"], {
    env: process.env as Record<string, string>,
    timeout: 600_000,
    maxBuffer: 4 * 1024 * 1024,
    encoding: "utf-8",
    cwd: AGENCE_ROOT,
  });

  try { require("fs").unlinkSync(promptFile); } catch {}

  if (result.status !== 0 && !result.stdout?.trim()) {
    const err = result.stderr?.trim() || `loop @${agent.name} failed (exit ${result.status})`;
    throw new Error(err);
  }

  return result.stdout?.trim() || "";
}

// ─── Peers (Multi-Agent Consensus) ──────────────────────────────────────────

export function callPeers(
  peerSkill: string, query: string,
  flavor = "code", algo = "winner",
): string {
  const peersTs = join(AGENCE_ROOT, "lib", "peers.ts");
  const args = [
    "run", peersTs, peerSkill,
    "--flavor", flavor,
    "--consensus", algo,
    query,
  ];
  const result = spawnSync("bun", args, {
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

// ─── Memory Context ──────────────────────────────────────────────────────────

import { recall, readWorking, retain, parseTags } from "./memory.ts";
import type { MemoryRow, MemorySource } from "./memory.ts";

const MEMORY_SKILLS: ReadonlySet<string> = new Set(["grasp", "glimpse", "recon", "extract"]);
export const MAX_MEMORY_CONTEXT = 8 * 1024;

export function buildMemoryContext(skillName: string, query: string): string {
  if (!MEMORY_SKILLS.has(skillName)) return "";

  try {
    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s,._-]/g, " ")
      .split(/[\s,]+/)
      .filter(w => w.length >= 2 && w.length <= 64);
    const tags = [...new Set(words)].slice(0, 8);
    if (tags.length === 0) return "";

    let rows: MemoryRow[] = [];

    if (skillName === "glimpse") {
      rows = readWorking();
      const tagSet = new Set(tags);
      rows = rows.filter(r => r.tags.some(t => tagSet.has(t.toLowerCase())));
    } else {
      rows = recall(tags, { max: 15 });
    }

    if (rows.length === 0) return "";

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
    return "";
  }
}

export function retainReconFindings(output: string, query: string): void {
  try {
    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s,._-]/g, " ")
      .split(/[\s,]+/)
      .filter(w => w.length >= 2 && w.length <= 64);
    const tags = [...new Set(words)].slice(0, 6);
    if (tags.length === 0) return;

    const reconTags = [...new Set(["recon", ...tags])].slice(0, 8);
    const summary = output.length > 2048
      ? output.slice(0, 2048) + "\n[truncated]"
      : output;

    retain("shared" as MemorySource, reconTags, summary, { importance: 0.6 });
    process.stderr.write(`[skill] MEM-003: recon findings retained → shared [${reconTags.join(",")}]\n`);
  } catch {
    // Non-fatal
  }
}
