#!/usr/bin/env bun
// lib/aibash.ts — Agentic shell configuration module (Bun)
//
// Thin data layer for bin/aibash. Handles:
//   - Argument parsing and defaults
//   - Session ID generation
//   - Session metadata init (delegates to session.ts logic)
//   - Policy validation (future: guard.ts integration)
//
// Outputs eval-safe shell exports to stdout.
// Human-readable messages go to stderr.
//
// Usage (from bash):
//   eval "$(airun aibash init [args...])"
//   eval "$(airun aibash init --session abc --agent ralph --role agentic)"
//
// Exit codes: 0 = success, 1 = config error, 2 = policy violation

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes, createHash } from "crypto";

const AI_ROOT = process.env.AI_ROOT || process.env.AGENCE_ROOT || join(import.meta.dir, "..");
const SESSION_BASE = join(AI_ROOT, "nexus", ".aisessions");

/** Return day-sharded session dir (DD/) with monthly recycling */
function sessionDayDir(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dayDir = join(SESSION_BASE, day);
  mkdirSync(dayDir, { recursive: true });

  const marker = join(dayDir, ".month");
  if (existsSync(marker)) {
    const stored = require("fs").readFileSync(marker, "utf-8").trim();
    if (stored !== currentMonth) {
      // Recycle: delete old session files from previous month
      for (const f of require("fs").readdirSync(dayDir)) {
        if (f.endsWith(".typescript") || f.endsWith(".meta.json")) {
          require("fs").unlinkSync(join(dayDir, f));
        }
      }
      writeFileSync(marker, currentMonth + "\n");
    }
  } else {
    writeFileSync(marker, currentMonth + "\n");
  }
  return dayDir;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AibashConfig {
  session_id: string;
  agent: string;
  role: string;
  shell: string;
  git_root: string;
  session_log: string;
  session_meta: string;
  pipe_pane: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Map agent name → 3-letter LLM model tag */
function modelTag(agent: string): string {
  switch (agent) {
    case "copilot": case "pilot": return "gpt";
    case "ralph":                  return "son";
    case "sonya":  case "sonny":   return "son";
    case "aider":                  return "son";
    case "haiku":                  return "hku";
    case "claude": case "claudia": return "cld";
    case "human":                  return "hum";
    default:                       return agent.slice(0, 3);
  }
}

function generateSessionId(agent: string): string {
  const time = new Date();
  const hhmm = String(time.getHours()).padStart(2, "0")
    + String(time.getMinutes()).padStart(2, "0");
  const a5 = agent.slice(0, 5);
  const m3 = modelTag(agent);
  return `${a5}-${m3}-${hhmm}`;
}

/** Emit eval-safe shell variable. Values are single-quoted to prevent injection. */
function shellExport(key: string, value: string): string {
  // Single-quote escaping: replace ' with '\'' (end quote, escaped quote, start quote)
  const safe = value.replace(/'/g, "'\\''");
  return `export ${key}='${safe}'`;
}

// ─── Parse Args ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  session?: string;
  agent?: string;
  role?: string;
  shell?: string;
  command: string[];
} {
  const result: ReturnType<typeof parseArgs> = { command: [] };
  let i = 0;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--session":
        result.session = argv[++i];
        break;
      case "--agent":
        result.agent = argv[++i];
        break;
      case "--role":
        result.role = argv[++i];
        break;
      case "--shell":
        result.shell = argv[++i];
        break;
      case "--":
        result.command = argv.slice(++i);
        i = argv.length; // break loop
        break;
      default:
        result.command.push(argv[i]);
        break;
    }
    i++;
  }
  return result;
}

// ─── Init: resolve config and emit shell exports ─────────────────────────────

function cmdInit(argv: string[]): number {
  const parsed = parseArgs(argv);

  // Resolve defaults
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  const role = parsed.role || process.env.AI_ROLE || (isTTY ? "interactive" : "agentic");
  const agent = parsed.agent || process.env.AI_AGENT || "copilot";
  const shell = parsed.shell || "bash";
  const gitRoot = process.env.GIT_ROOT || AI_ROOT;
  const sessionId = parsed.session || process.env.AI_SESSION || generateSessionId(agent);
  const pipePane = process.env.AGENCE_PIPE_PANE === "1" && !!process.env.TMUX;

  // Derive paths — use day-sharded session dir
  const dayDir = sessionDayDir();
  const sessionLog = join(dayDir, `${sessionId}.typescript`);
  const sessionMeta = join(dayDir, `${sessionId}.meta.json`);

  // Write session metadata (same schema as session.ts init)
  if (!existsSync(sessionMeta)) {
    const meta = {
      session_id: sessionId,
      agent,
      role,
      shell,
      git_root: gitRoot,
      timestamp: isoNow(),
      status: "active",
      exit_code: null,
      verification_status: "unverified",
    };
    writeFileSync(sessionMeta, JSON.stringify(meta, null, 2) + "\n");
    process.stderr.write(`[aibash.ts] session ${sessionId.slice(0, 8)} initialized\n`);
  }

  // Emit eval-safe exports (bash sources these)
  const exports = [
    shellExport("AI_SESSION", sessionId),
    shellExport("AI_AGENT", agent),
    shellExport("AI_ROLE", role),
    shellExport("SHELL_TYPE", shell),
    shellExport("GIT_ROOT", gitRoot),
    shellExport("SESSION_LOG", sessionLog),
    shellExport("SESSION_META", sessionMeta),
  ];

  // Pass command through if present
  if (parsed.command.length > 0) {
    exports.push(shellExport("_AIBASH_COMMAND", parsed.command.join(" ")));
  }

  // Pipe-pane flag
  if (pipePane) {
    exports.push('export _AIBASH_PIPE_PANE=1');
  } else {
    exports.push('export _AIBASH_PIPE_PANE=0');
  }

  console.log(exports.join("\n"));
  return 0;
}

// ─── Validate: delegate to guard.ts for policy enforcement ───────────────────

function cmdValidate(argv: string[]): number {
  const command = argv.join(" ").trim();
  if (!command) {
    console.log("export _AIBASH_VALIDATED=1");
    return 0;
  }

  // Delegate to guard.ts (separate Bun process — non-bypassable gate)
  try {
    const airunPath = join(AI_ROOT, "bin", "airun");
    const result = Bun.spawnSync(
      [airunPath, "guard", "check", ...argv],
      { cwd: AI_ROOT, env: process.env, stdout: "pipe", stderr: "pipe" },
    );
    // Parse guard's shell exports
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    if (stderr.trim()) process.stderr.write(stderr.trim() + "\n");

    // Extract tier from guard output
    const tierMatch = stdout.match(/export _GUARD_TIER=(\S+)/);
    const tier = tierMatch ? tierMatch[1] : "T3";

    // T2 escalation: ask human via ^ask (quick boolean auth) before denying
    if (result.exitCode !== 0 && tier === "T2") {
      process.stderr.write(`[aibash] T2 escalation — requesting human approval via ^ask\n`);
      const promptResult = Bun.spawnSync(
        [airunPath, "signal", "ask", `${command}`],
        { cwd: AI_ROOT, env: process.env, stdout: "pipe", stderr: "pipe" },
      );
      const promptOut = promptResult.stdout.toString();
      const promptErr = promptResult.stderr.toString();
      if (promptErr.trim()) process.stderr.write(promptErr.trim() + "\n");

      if (promptResult.exitCode === 0) {
        // Human approved — override guard denial
        if (stdout.trim()) console.log(stdout.trim().replace(/_GUARD_APPROVED=0/, "_GUARD_APPROVED=1"));
        if (promptOut.trim()) console.log(promptOut.trim());
        console.log(`export _AIBASH_VALIDATED=1`);
        return 0;
      }
      // Human denied or timeout — keep denial
      if (stdout.trim()) console.log(stdout.trim());
      if (promptOut.trim()) console.log(promptOut.trim());
      console.log(`export _AIBASH_VALIDATED=0`);
      return 1;
    }

    // T0/T1 (approved) or T3 (hard deny) — forward as-is
    if (stdout.trim()) console.log(stdout.trim());
    const approved = result.exitCode === 0;

    // T1 flag: approved but notify human for awareness
    if (approved && tier === "T1") {
      Bun.spawnSync(
        [airunPath, "signal", "notify", `T1 flagged: ${command}`],
        { cwd: AI_ROOT, env: process.env, stdout: "ignore", stderr: "ignore" },
      );
    }

    console.log(`export _AIBASH_VALIDATED=${approved ? 1 : 0}`);
    return result.exitCode;
  } catch (err) {
    // If guard.ts fails to run, deny by default (fail-closed)
    process.stderr.write(`[aibash] guard.ts unavailable — denying command\n`);
    console.log("export _AIBASH_VALIDATED=0");
    console.log('export _GUARD_REASON="guard.ts process failed"');
    return 1;
  }
}

// ─── CLI dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "init":
    process.exit(cmdInit(args));
    break;
  case "validate":
    process.exit(cmdValidate(args));
    break;
  case "--help":
  case "help":
    console.error(`Usage: airun aibash <init|validate> [options...]
  init     Resolve config, create session, emit shell exports
  validate Check policy via guard.ts (fail-closed)

Options (for init):
  --session <id>   Session ID (auto-generated if omitted)
  --agent <name>   Agent name (default: @)
  --role <role>    Role: agentic|interactive (auto-detected)
  --shell <type>   Shell type (default: bash)
  -- <command...>  Command to pass through`);
    process.exit(0);
    break;
  default:
    console.error(`Unknown command: ${cmd || "(none)"}. Try: airun aibash help`);
    process.exit(1);
}
