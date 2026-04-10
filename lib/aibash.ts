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
const SESSION_DIR = join(AI_ROOT, "nexus", ".aisessions");

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

function generateSessionId(role: string): string {
  const hex = randomBytes(4).toString("hex");
  return role === "agentic" ? `robo${hex}` : `term${hex}`;
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
  const agent = parsed.agent || process.env.AI_AGENT || "@";
  const shell = parsed.shell || "bash";
  const gitRoot = process.env.GIT_ROOT || AI_ROOT;
  const sessionId = parsed.session || process.env.AI_SESSION || generateSessionId(role);
  const pipePane = process.env.AGENCE_PIPE_PANE === "1" && !!process.env.TMUX;

  // Derive paths
  const sessionLog = join(SESSION_DIR, `${sessionId}.typescript`);
  const sessionMeta = join(SESSION_DIR, `${sessionId}.meta.json`);

  // Ensure session directory exists
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

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
    // Forward guard's shell exports to caller
    const stdout = result.stdout.toString();
    if (stdout.trim()) console.log(stdout.trim());
    // Forward guard's stderr (trace messages) to stderr
    const stderr = result.stderr.toString();
    if (stderr.trim()) process.stderr.write(stderr.trim() + "\n");
    // Map guard exit → validation flag
    const approved = result.exitCode === 0;
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
