#!/usr/bin/env bun
// lib/signal.ts — Human↔Agent IPC Primitives (Bun)
//
// Two planes, six primitives:
//
//   HUMAN CONTROL PLANE (downlink):
//     ^inject  <agent> <text>     — send text to agent pane
//     ^instruct <agent> <text>    — write .instructions, signal reload
//     ^input   <agent>            — (v0.5+ socket, stub for now)
//
//   AGENT SIGNAL PLANE (uplink, guard-gated):
//     ^prompt  <question>         — block agent, deliver y/n to human, wait
//     ^notify  <message>          — non-blocking alert to human
//     ^output  <data>             — structured result to human pane
//
// Transport hierarchy (auto-detected):
//   1. tmux   — if $TMUX is set (primary, production)
//   2. file   — always works (fallback, polling-based)
//   3. (future: socket, IDE adapter)
//
// Usage:
//   airun signal inject @ralph "git status"
//   airun signal prompt "Deploy to staging? [yes/no]"
//   airun signal notify "Build complete: 0 errors"
//   airun signal output '{"status":"ok","tests":91}'
//   airun signal help

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync, watchFile, unwatchFile, chmodSync } from "fs";
import { join, basename } from "path";
import { execSync, spawnSync } from "child_process";
import { createHmac } from "crypto";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const SIGNAL_DIR = join(AGENCE_ROOT, "nexus", "signals");
const SESSION_BASE = join(AGENCE_ROOT, "nexus", ".aisessions");
const SESSION_DIR = SESSION_BASE;

// ─── Types ───────────────────────────────────────────────────────────────────

type Transport = "tmux" | "file";

interface SignalEnvelope {
  type: "inject" | "instruct" | "input" | "prompt" | "notify" | "output" | "ask";
  from: string;       // agent or "human"
  to: string;         // agent or "human"
  payload: string;
  timestamp: string;
  id: string;         // unique signal ID for correlation
  hmac?: string;      // SEC-004: HMAC-SHA256 envelope signature
}

interface PromptResponse {
  signal_id: string;
  answer: "yes" | "no" | "timeout";
  responder: string;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function signalId(): string {
  const hex = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(hex).map(b => b.toString(16).padStart(2, "0")).join("");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // SEC-004: signals dir owner-only rwx
    try { chmodSync(dir, 0o700); } catch {}
  }
}

// ─── SEC-004: Signal Envelope HMAC ──────────────────────────────────────────
// Prevents signal forgery by signing envelopes with a per-session secret.
// Secret lives in nexus/.signal-secret (owner-only, 0o600).
// Any forged or tampered signal will fail HMAC verification.

const SIGNAL_SECRET_PATH = join(AGENCE_ROOT, "nexus", ".signal-secret");

function getSignalSecret(): string {
  if (existsSync(SIGNAL_SECRET_PATH)) {
    return readFileSync(SIGNAL_SECRET_PATH, "utf-8").trim();
  }
  // Generate a new secret (32 random bytes hex)
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const nexusDir = join(AGENCE_ROOT, "nexus");
  if (!existsSync(nexusDir)) mkdirSync(nexusDir, { recursive: true });
  writeFileSync(SIGNAL_SECRET_PATH, secret + "\n", { mode: 0o600 });
  return secret;
}

function signEnvelope(envelope: SignalEnvelope): string {
  const secret = getSignalSecret();
  const data = `${envelope.type}:${envelope.from}:${envelope.to}:${envelope.id}:${envelope.timestamp}:${envelope.payload}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

function verifyEnvelope(envelope: SignalEnvelope): boolean {
  if (!envelope.hmac) return false;
  const expected = signEnvelope(envelope);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== envelope.hmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ envelope.hmac.charCodeAt(i);
  }
  return diff === 0;
}

function validateEnvelopeFields(env: any): env is SignalEnvelope {
  return (
    typeof env === "object" && env !== null &&
    typeof env.type === "string" &&
    typeof env.from === "string" &&
    typeof env.to === "string" &&
    typeof env.payload === "string" &&
    typeof env.timestamp === "string" &&
    typeof env.id === "string" &&
    /^[a-f0-9]{8}$/.test(env.id) &&
    /^\d{4}-\d{2}-\d{2}T/.test(env.timestamp)
  );
}

function shellSafe(s: string): string {
  // SEC-005: Strip control characters (0x00-0x1f except \t) that could
  // be interpreted as tmux key sequences or terminal escape codes.
  // SEC-013: Also strip \n (0x0a) — in tmux send-keys, newlines inside
  // single quotes split into multiple commands (command injection).
  // Then single-quote escape for shell: replace ' with '\''.
  const stripped = s.replace(/[\x00-\x08\x0a\x0b\x0c\x0e-\x1f\x7f]/g, "");
  return stripped.replace(/'/g, "'\\''");
}

// SEC-005: Validate pane target format to prevent tmux command injection.
// Valid format: session:window.pane (e.g., "agence:0.1")
function isValidPaneTarget(target: string): boolean {
  return /^[a-zA-Z0-9_-]+:\d+\.\d+$/.test(target);
}

// ─── Transport Detection ─────────────────────────────────────────────────────

function detectTransport(): Transport {
  if (process.env.TMUX) return "tmux";
  return "file";
}

function hasTmux(): boolean {
  try {
    execSync("tmux list-sessions", { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// Resolve tmux pane target for an agent.
// Convention from bin/swarm:
//   session:window.0 = human (ibash)
//   session:window.1 = agent (aibash)
//
// If AGENCE_TMUX_SESSION is set, use it. Otherwise scan tmux env vars.
function resolveTmuxPane(agent: string, role: "human" | "agent"): string | null {
  const session = process.env.AGENCE_TMUX_SESSION || "agence";
  const paneIndex = role === "agent" ? "1" : "0";

  // Try to find the window by name (swarm names windows after agents)
  const agentName = agent.replace(/^@/, "");
  try {
    const windows = execSync(
      `tmux list-windows -t "${session}" -F "#{window_index}:#{window_name}"`,
      { timeout: 2000, encoding: "utf-8" },
    ).trim().split("\n");

    for (const line of windows) {
      const [idx, name] = line.split(":", 2);
      if (name === agent || name === agentName || name === `@${agentName}`) {
        return `${session}:${idx}.${paneIndex}`;
      }
    }
    // Fallback: first window
    return `${session}:0.${paneIndex}`;
  } catch {
    return null;
  }
}

// ─── Transport: tmux ─────────────────────────────────────────────────────────

function tmuxSendKeys(paneTarget: string, text: string): boolean {
  // SEC-005: Validate pane target format
  if (!isValidPaneTarget(paneTarget)) {
    process.stderr.write(`[signal] SEC-005: rejected invalid pane target: ${paneTarget}\n`);
    return false;
  }
  try {
    // send-keys sends literal text; Enter sends the Return key
    execSync(
      `tmux send-keys -t '${shellSafe(paneTarget)}' '${shellSafe(text)}' Enter`,
      { timeout: 3000, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

function tmuxDisplayMessage(paneTarget: string, message: string): boolean {
  // SEC-005: Validate pane target format
  if (!isValidPaneTarget(paneTarget)) {
    process.stderr.write(`[signal] SEC-005: rejected invalid pane target: ${paneTarget}\n`);
    return false;
  }
  try {
    execSync(
      `tmux display-message -t '${shellSafe(paneTarget)}' '${shellSafe(message)}'`,
      { timeout: 3000, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Transport: file ─────────────────────────────────────────────────────────

function fileWriteSignal(envelope: SignalEnvelope): string {
  ensureDir(SIGNAL_DIR);
  // SEC-004: Sign envelope before writing
  envelope.hmac = signEnvelope(envelope);
  const path = join(SIGNAL_DIR, `${envelope.id}.signal.json`);
  // SEC-004: Restrictive permissions — owner-only read/write (0o600)
  writeFileSync(path, JSON.stringify(envelope, null, 2) + "\n", { mode: 0o600 });
  return path;
}

function fileWaitForResponse(signalId: string, timeoutMs: number): PromptResponse | null {
  const responsePath = join(SIGNAL_DIR, `${signalId}.response.json`);
  const deadline = Date.now() + timeoutMs;

  // Poll-based wait (file transport is the fallback — not latency-critical)
  while (Date.now() < deadline) {
    if (existsSync(responsePath)) {
      try {
        const data = JSON.parse(readFileSync(responsePath, "utf-8"));
        // SEC-004: Verify response HMAC if present
        if (data.hmac) {
          const expected = createHmac("sha256", getSignalSecret())
            .update(`response:${data.signal_id}:${data.answer}:${data.responder}:${data.timestamp}`)
            .digest("hex");
          if (data.hmac !== expected) {
            process.stderr.write(`[signal] WARNING: response HMAC verification failed — possible forgery\n`);
            return null;
          }
        }
        // Cleanup
        try { unlinkSync(responsePath); } catch {}
        try { unlinkSync(join(SIGNAL_DIR, `${signalId}.signal.json`)); } catch {}
        return data as PromptResponse;
      } catch {
        return null;
      }
    }
    // Sleep 500ms (Bun-compatible)
    Bun.sleepSync(500);
  }

  // Timeout — cleanup signal file
  try { unlinkSync(join(SIGNAL_DIR, `${signalId}.signal.json`)); } catch {}
  return { signal_id: signalId, answer: "timeout", responder: "system", timestamp: isoNow() };
}

// ─── Primitives ──────────────────────────────────────────────────────────────

// DOWNLINK: Human → Agent

function doInject(agent: string, text: string): number {
  const transport = detectTransport();
  const id = signalId();

  // SEC-012: Guard-gate injected commands before sending to agent panes.
  // Only gate if caller is agentic (human callers bypass — they ARE the authority).
  if (process.env.AI_ROLE === "agentic") {
    const guardTs = join(AGENCE_ROOT, "lib/guard.ts");
    if (existsSync(guardTs)) {
      const gResult = spawnSync("bun", ["run", guardTs, "classify", text], {
        cwd: AGENCE_ROOT, timeout: 10_000,
        env: { ...process.env, AGENCE_ROOT },
      });
      try {
        const decision = JSON.parse(gResult.stdout?.toString("utf-8") ?? "{}");
        if (decision.action === "escalate" || decision.action === "deny") {
          process.stderr.write(`[signal] SEC-012: inject blocked by guard (${decision.tier} ${decision.action}): ${text.slice(0, 60)}\n`);
          return 1;
        }
      } catch {
        // Guard parse failure → fail-closed
        process.stderr.write(`[signal] SEC-012: inject blocked — guard unavailable (fail-closed)\n`);
        return 1;
      }
    }
  }

  const envelope: SignalEnvelope = {
    type: "inject", from: "human", to: agent,
    payload: text, timestamp: isoNow(), id,
  };

  process.stderr.write(`[signal] inject → ${agent}: ${text.slice(0, 60)}${text.length > 60 ? "..." : ""}\n`);

  if (transport === "tmux") {
    const pane = resolveTmuxPane(agent, "agent");
    if (pane && tmuxSendKeys(pane, text)) {
      fileWriteSignal(envelope); // audit trail
      return 0;
    }
    process.stderr.write(`[signal] tmux send-keys failed, falling back to file\n`);
  }

  // File fallback: write signal, agent polls
  fileWriteSignal(envelope);
  process.stderr.write(`[signal] wrote ${SIGNAL_DIR}/${id}.signal.json (file transport)\n`);
  return 0;
}

function doInstruct(agent: string, text: string): number {
  const id = signalId();
  const envelope: SignalEnvelope = {
    type: "instruct", from: "human", to: agent,
    payload: text, timestamp: isoNow(), id,
  };

  // Write instructions to agent-specific file
  const instrFile = join(SIGNAL_DIR, `${agent.replace(/^@/, "")}.instructions`);
  ensureDir(SIGNAL_DIR);
  writeFileSync(instrFile, text + "\n", { mode: 0o600 });
  fileWriteSignal(envelope); // audit trail

  process.stderr.write(`[signal] instruct → ${agent}: wrote ${instrFile}\n`);

  // If tmux available, also notify agent pane
  if (detectTransport() === "tmux") {
    const pane = resolveTmuxPane(agent, "agent");
    if (pane) {
      tmuxDisplayMessage(pane, `📋 New instructions from human`);
    }
  }

  return 0;
}

// UPLINK: Agent → Human (guard-gated)

// ^ask — Focused boolean authorization (quick y/n with session ref)
// Designed for guard T2 escalation. One-liner, no verbosity.
// Human can drill into session/signal if they need context.
function doAsk(summary: string, timeoutSec: number = 15): number {
  const agent = process.env.AI_AGENT || "unknown";
  const sessionId = process.env.AI_SESSION || "unknown";
  const transport = detectTransport();
  const id = signalId();
  const envelope: SignalEnvelope = {
    type: "ask" as any, from: agent, to: "human",
    payload: summary, timestamp: isoNow(), id,
  };

  fileWriteSignal(envelope);

  // Mark awaiting
  ensureDir(SESSION_DIR);
  const awaitingPath = join(SESSION_DIR, `${sessionId}.awaiting`);
  writeFileSync(awaitingPath, JSON.stringify({ signal_id: id, type: "ask", summary, timestamp: isoNow() }) + "\n", { mode: 0o600 });

  process.stderr.write(`[signal] ^ask → human: ${summary} [${sessionId.slice(0, 8)}]\n`);

  if (transport === "tmux") {
    const humanPane = resolveTmuxPane(agent, "human");
    if (humanPane) {
      const responsePath = join(SIGNAL_DIR, `${id}.response.json`);
      // SEC-005: Hardened one-liner — $_ans is restricted to y/yes/n/no only.
      // Any other input is treated as "no" to prevent shell injection via answer field.
      // The answer is validated before being written to JSON.
      const askCmd = `read -t ${timeoutSec} -p '⚡ ${shellSafe(agent)} ${shellSafe(summary)} [${sessionId.slice(0, 8)}] (y/n): ' _ans && `
        + `case "$_ans" in [yY]|[yY][eE][sS]) _a=yes;; *) _a=no;; esac && `
        + `printf '{"signal_id":"${id}","answer":"%s","responder":"human","timestamp":"%s"}\\n' "$_a" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > '${shellSafe(responsePath)}' `
        + `|| printf '{"signal_id":"${id}","answer":"timeout","responder":"system","timestamp":"%s"}\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > '${shellSafe(responsePath)}'`;
      tmuxSendKeys(humanPane, askCmd);
    }
  }

  const response = fileWaitForResponse(id, timeoutSec * 1000 + 2000);
  try { unlinkSync(awaitingPath); } catch {}

  if (!response || response.answer === "timeout") {
    process.stderr.write(`[signal] ^ask timed out → deny\n`);
    console.log(`export _SIGNAL_ANSWER=timeout`);
    console.log(`export _SIGNAL_APPROVED=0`);
    console.log(`export _SIGNAL_ID=${id}`);
    return 1;
  }

  const approved = /^y(es)?$/i.test(response.answer);
  console.log(`export _SIGNAL_ANSWER='${shellSafe(response.answer)}'`);
  console.log(`export _SIGNAL_APPROVED=${approved ? 1 : 0}`);
  console.log(`export _SIGNAL_ID=${id}`);
  process.stderr.write(`[signal] ^ask → ${response.answer} (${approved ? "approved" : "denied"})\n`);
  return approved ? 0 : 1;
}

function doPrompt(question: string): number {
  // Non-blocking: fire question to human, return immediately.
  // Tangent continues working. Human responds later via `signal respond <id>`.
  // Agent can check response with `signal poll <id>` when needed.
  const agent = process.env.AI_AGENT || "unknown";
  const transport = detectTransport();
  const id = signalId();
  const envelope: SignalEnvelope = {
    type: "prompt", from: agent, to: "human",
    payload: question, timestamp: isoNow(), id,
  };

  fileWriteSignal(envelope);

  process.stderr.write(`[signal] ^prompt → human: ${question} [${id}]\n`);

  if (transport === "tmux") {
    const humanPane = resolveTmuxPane(agent, "human");
    if (humanPane) {
      // Deliver to human pane — non-blocking, no read, just display + instructions
      const responsePath = join(SIGNAL_DIR, `${id}.response.json`);
      const promptCmd = `echo "💬 ${shellSafe(agent)} [${id}]: ${shellSafe(question)}" && echo "  → reply: airun signal respond ${id} <answer>"`;
      tmuxSendKeys(humanPane, promptCmd);
    }
  }

  // Emit signal ID so agent can poll later
  console.log(`export _SIGNAL_ID=${id}`);
  console.log(`export _SIGNAL_TYPE=prompt`);
  return 0;
}

function doNotify(message: string): number {
  const agent = process.env.AI_AGENT || "unknown";
  const transport = detectTransport();
  const id = signalId();
  const envelope: SignalEnvelope = {
    type: "notify", from: agent, to: "human",
    payload: message, timestamp: isoNow(), id,
  };

  fileWriteSignal(envelope); // audit trail

  process.stderr.write(`[signal] ^notify → human: ${message.slice(0, 80)}\n`);

  if (transport === "tmux") {
    const humanPane = resolveTmuxPane(agent, "human");
    if (humanPane) {
      // Use display-message for non-blocking notification
      tmuxDisplayMessage(humanPane, `🔔 ${agent}: ${message.slice(0, 120)}`);
      return 0;
    }
  }

  // File fallback: terminal title via OSC escape
  process.stderr.write(`\x1b]0;🔔 ${agent}: ${message.slice(0, 60)}\x07`);
  return 0;
}

function doOutput(data: string): number {
  const agent = process.env.AI_AGENT || "unknown";
  const transport = detectTransport();
  const id = signalId();
  const envelope: SignalEnvelope = {
    type: "output", from: agent, to: "human",
    payload: data, timestamp: isoNow(), id,
  };

  fileWriteSignal(envelope); // audit trail

  if (transport === "tmux") {
    const humanPane = resolveTmuxPane(agent, "human");
    if (humanPane) {
      // Echo structured output into human pane
      const preview = data.length > 200 ? data.slice(0, 197) + "..." : data;
      tmuxSendKeys(humanPane, `echo '${shellSafe(preview)}'`);
    }
  }

  // Always write to stdout (caller can capture)
  console.log(data);
  return 0;
}

// ─── List pending signals ────────────────────────────────────────────────────

function doList(): number {
  ensureDir(SIGNAL_DIR);
  const { readdirSync } = require("fs");
  const files = readdirSync(SIGNAL_DIR).filter((f: string) => f.endsWith(".signal.json"));
  if (files.length === 0) {
    console.log("[signal] No pending signals");
    return 0;
  }
  console.log(`[signal] ${files.length} pending signal(s):`);
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(SIGNAL_DIR, f), "utf-8"));
      // SEC-004: Verify HMAC on list display
      const verified = validateEnvelopeFields(data) && data.hmac && verifyEnvelope(data);
      const mark = verified ? "✓" : data.hmac ? "✗ UNVERIFIED" : "⚠ unsigned";
      console.log(`  [${mark}] ${data.type} ${data.from}→${data.to}: ${data.payload.slice(0, 60)} [${data.id}]`);
    } catch {
      console.log(`  (corrupt: ${f})`);
    }
  }
  return 0;
}

// ─── Respond (human responds to a ^prompt or ^ask) ──────────────────────────

function doRespond(sigId: string, answer: string): number {
  // SEC-004: Validate signal ID format to prevent path traversal
  if (!/^[a-f0-9]{8}$/.test(sigId)) {
    console.error(`[signal] Invalid signal ID format: ${sigId}`);
    return 2;
  }
  const responsePath = join(SIGNAL_DIR, `${sigId}.response.json`);
  ensureDir(SIGNAL_DIR);
  const response: PromptResponse = {
    signal_id: sigId,
    answer: answer as "yes" | "no",
    responder: process.env.USER || "human",
    timestamp: isoNow(),
  };
  // SEC-004: Sign response + restrictive permissions
  const hmac = createHmac("sha256", getSignalSecret())
    .update(`response:${sigId}:${response.answer}:${response.responder}:${response.timestamp}`)
    .digest("hex");
  const signed = { ...response, hmac };
  writeFileSync(responsePath, JSON.stringify(signed, null, 2) + "\n", { mode: 0o600 });
  process.stderr.write(`[signal] responded to ${sigId}: ${answer}\n`);
  return 0;
}

// ─── Poll (agent checks if a ^prompt response has arrived) ───────────────────

function doPoll(sigId: string): number {
  // SEC-004: Validate signal ID format
  if (!/^[a-f0-9]{8}$/.test(sigId)) {
    console.error(`[signal] Invalid signal ID format: ${sigId}`);
    return 2;
  }
  const responsePath = join(SIGNAL_DIR, `${sigId}.response.json`);
  if (!existsSync(responsePath)) {
    console.log(`export _SIGNAL_ANSWERED=0`);
    console.log(`export _SIGNAL_ID=${sigId}`);
    return 1; // no response yet
  }
  try {
    const data = JSON.parse(readFileSync(responsePath, "utf-8")) as PromptResponse;
    // SEC-004: Verify response HMAC if present
    if (data.hmac) {
      const expected = createHmac("sha256", getSignalSecret())
        .update(`response:${data.signal_id}:${data.answer}:${data.responder}:${data.timestamp}`)
        .digest("hex");
      if (data.hmac !== expected) {
        process.stderr.write(`[signal] WARNING: HMAC verification failed for response ${sigId} — possible forgery\n`);
        console.log(`export _SIGNAL_ANSWERED=0`);
        console.log(`export _SIGNAL_ID=${sigId}`);
        return 1;
      }
    }
    console.log(`export _SIGNAL_ANSWERED=1`);
    console.log(`export _SIGNAL_ANSWER='${data.answer.replace(/'/g, "'\\''")}'`);
    console.log(`export _SIGNAL_ID=${sigId}`);
    // Cleanup
    try { unlinkSync(responsePath); } catch {}
    try { unlinkSync(join(SIGNAL_DIR, `${sigId}.signal.json`)); } catch {}
    return 0;
  } catch {
    console.log(`export _SIGNAL_ANSWERED=0`);
    return 1;
  }
}

// ─── Signal Prune ────────────────────────────────────────────────────────────

function doSignalPrune(args: string[]): number {
  let days = 3;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) days = parseInt(args[++i], 10);
    if (args[i] === "--dry-run") dryRun = true;
  }

  if (!existsSync(SIGNAL_DIR)) {
    process.stderr.write(`[signal] No signals directory\n`);
    return 0;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let pruned = 0;
  let total = 0;

  for (const f of readdirSync(SIGNAL_DIR)) {
    const full = join(SIGNAL_DIR, f);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      total++;
      if (st.mtimeMs < cutoff) {
        if (dryRun) {
          process.stderr.write(`  [dry-run] ${f}\n`);
        } else {
          unlinkSync(full);
        }
        pruned++;
      }
    } catch { /* skip */ }
  }

  process.stderr.write(`[signal] ${dryRun ? "[dry-run] " : ""}Pruned: ${pruned}/${total} signals (older than ${days} days)\n`);
  return 0;
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "inject": {
    const agent = args[0];
    const text = args.slice(1).join(" ");
    if (!agent || !text) { console.error("Usage: airun signal inject <agent> <text...>"); process.exit(2); }
    process.exit(doInject(agent, text));
    break;
  }
  case "instruct": {
    const agent = args[0];
    const text = args.slice(1).join(" ");
    if (!agent || !text) { console.error("Usage: airun signal instruct <agent> <text...>"); process.exit(2); }
    process.exit(doInstruct(agent, text));
    break;
  }
  case "ask": {
    const summary = args.join(" ");
    if (!summary) { console.error("Usage: airun signal ask <summary...>"); process.exit(2); }
    const askTimeout = parseInt(process.env.SIGNAL_TIMEOUT || "15", 10);
    process.exit(doAsk(summary, askTimeout));
    break;
  }
  case "prompt": {
    const question = args.join(" ");
    if (!question) { console.error("Usage: airun signal prompt <question...>"); process.exit(2); }
    process.exit(doPrompt(question));
    break;
  }
  case "notify": {
    const message = args.join(" ");
    if (!message) { console.error("Usage: airun signal notify <message...>"); process.exit(2); }
    process.exit(doNotify(message));
    break;
  }
  case "output": {
    const data = args.join(" ");
    if (!data) { console.error("Usage: airun signal output <data...>"); process.exit(2); }
    process.exit(doOutput(data));
    break;
  }
  case "list":
    process.exit(doList());
    break;
  case "respond": {
    const sigId = args[0];
    const answer = args[1];
    if (!sigId || !answer) { console.error("Usage: airun signal respond <signal-id> <answer>"); process.exit(2); }
    process.exit(doRespond(sigId, answer));
    break;
  }
  case "poll": {
    const pollId = args[0];
    if (!pollId) { console.error("Usage: airun signal poll <signal-id>"); process.exit(2); }
    process.exit(doPoll(pollId));
    break;
  }
  case "prune":
    process.exit(doSignalPrune(args));
    break;
  case "--help":
  case "help":
    console.error(`Usage: airun signal <command> [args...]

Human Control Plane (downlink):
  inject <agent> <text...>      Send text to agent pane (tmux send-keys)
  instruct <agent> <text...>    Write instructions file, notify agent
  
Agent Signal Plane (uplink):
  ask <summary...>              BLOCKING boolean auth (y/n, 15s, session ref)
  prompt <question...>          NON-BLOCKING query (tangent continues working)
  notify <message...>           Non-blocking alert to human
  output <data...>              Structured result to human pane

Utilities:
  list                          Show pending signals
  respond <signal-id> <answer>  Human responds to a ^prompt or ^ask
  poll <signal-id>              Agent checks if ^prompt response arrived
  prune [--days N] [--dry-run]  Remove old signals (default: 3 days)

Transport: auto-detects tmux ($TMUX), falls back to file-based signaling.

Environment:
  AGENCE_TMUX_SESSION   tmux session name (default: "agence")
  SIGNAL_TIMEOUT        ^prompt timeout in seconds (default: 30)
  AI_AGENT              Agent identifier
  AI_SESSION            Session ID for awaiting markers

Exit codes: 0 = success/approved, 1 = denied/timeout, 2 = usage error`);
    process.exit(0);
    break;
  default:
    console.error(`[signal] Unknown command: ${cmd || "(none)"}. Try: airun signal help`);
    process.exit(2);
}
