#!/usr/bin/env bun
// lib/watch.ts — Pipe-pane Stream Watcher (^watch / ^expect)
//
// Tails an agent's pipe-pane typescript log (or any file), watches for
// patterns, and fires signals/callbacks when matches occur.
//
// Use cases:
//   - Detect agent decision checkpoints (errors, prompts, completion)
//   - Intelligent capture: filter noisy streams to extract key events
//   - Skill learning: identify patterns in agent behavior for training
//   - ^expect: wait for a specific pattern, then return (blocking)
//
// Architecture:
//   watch.ts tails the log file, applies regex/keyword patterns,
//   and on match can:
//     1. Print to stdout (for piping / logging)
//     2. Fire a signal via signal.ts (^notify to human)
//     3. Write to a capture file (filtered extract)
//     4. Exit with success (^expect mode — pattern found)
//
// Usage:
//   airun watch tail <logfile> [--pattern <regex>] [--signal] [--capture <file>]
//   airun watch expect <logfile> --pattern <regex> [--timeout <sec>]
//   airun watch list                    — list active watch sessions
//   airun watch help
//
// Integration:
//   agentd can launch watch.ts as a background process per tangent,
//   feeding the pipe-pane typescript log. On pattern match, watch.ts
//   fires ^notify to human and/or writes filtered output for skill learning.

import { existsSync, readFileSync, writeFileSync, appendFileSync, statSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const WATCH_DIR = join(AGENCE_ROOT, "nexus", "watches");

// ─── Types ───────────────────────────────────────────────────────────────────

interface WatchConfig {
  logFile: string;
  patterns: RegExp[];
  signal: boolean;         // fire ^notify on match
  captureFile?: string;    // append matches to this file
  expectMode: boolean;     // exit on first match (blocking)
  timeout: number;         // seconds (0 = no timeout)
  context: number;         // lines of context around match
  agent?: string;          // agent name for signal routing
}

interface WatchMatch {
  timestamp: string;
  line: number;
  text: string;
  pattern: string;
  context: string[];       // surrounding lines
}

// ─── Built-in Pattern Library ────────────────────────────────────────────────
// Common patterns for detecting agent decision points.

const BUILTIN_PATTERNS: Record<string, RegExp> = {
  error:      /(?:error|Error|ERROR|FAIL|FAILED|fatal|panic|exception|traceback)/i,
  prompt:     /(?:\?\s*$|y\/n|yes\/no|\[Y\/n\]|\[y\/N\]|confirm|proceed\?)/i,
  complete:   /(?:✔|✓|done|complete|success|passed|PASS|finished)/i,
  warning:    /(?:warn|WARN|warning|WARNING|deprecated|DEPRECATED)/i,
  checkpoint: /(?:checkpoint|CHECKPOINT|saving|SAVING|snapshot)/i,
  exit:       /(?:exit code|exited with|process exited|return code)/i,
  test:       /(?:\d+ passing|\d+ failing|\d+ tests?|\d+ specs?|test.*(?:pass|fail))/i,
  build:      /(?:build (?:complete|failed|succeeded)|compiled|bundled|webpack|esbuild)/i,
};

// ─── File Tail ───────────────────────────────────────────────────────────────
// Efficient file tailing using byte offsets (no inotify dependency).

async function tailFile(
  config: WatchConfig,
  onMatch: (match: WatchMatch) => void,
  onLine?: (line: string, lineNum: number) => void
): Promise<number> {
  const { logFile, patterns, expectMode, timeout } = config;

  if (!existsSync(logFile)) {
    console.error(`[watch] File not found: ${logFile}`);
    return 1;
  }

  let offset = statSync(logFile).size;  // start from current end
  let lineNum = 0;
  const ringBuffer: string[] = [];      // keep last N lines for context
  const ctxSize = config.context || 3;
  const startTime = Date.now();
  const timeoutMs = timeout * 1000;

  // Count existing lines to start line numbering correctly
  const existing = readFileSync(logFile, "utf-8");
  lineNum = existing.split("\n").length;

  console.error(`[watch] Tailing ${logFile} (offset=${offset}, patterns=${patterns.length})`);

  while (true) {
    // Check timeout
    if (timeoutMs > 0 && Date.now() - startTime > timeoutMs) {
      if (expectMode) {
        console.error(`[watch] Timeout after ${timeout}s — pattern not found`);
        return 2;  // timeout exit code
      }
      console.error(`[watch] Timeout after ${timeout}s — stopping`);
      return 0;
    }

    // Check for new data
    let currentSize: number;
    try {
      currentSize = statSync(logFile).size;
    } catch {
      // File deleted / inaccessible
      await Bun.sleep(500);
      continue;
    }

    if (currentSize > offset) {
      // Read new bytes
      const fd = Bun.file(logFile);
      const blob = fd.slice(offset, currentSize);
      const newData = await blob.text();
      offset = currentSize;

      // Process line by line
      const lines = newData.split("\n");
      for (const line of lines) {
        if (!line) continue;
        lineNum++;

        // Ring buffer for context
        ringBuffer.push(line);
        if (ringBuffer.length > ctxSize * 2 + 1) ringBuffer.shift();

        onLine?.(line, lineNum);

        // Check patterns
        for (const pat of patterns) {
          if (pat.test(line)) {
            const match: WatchMatch = {
              timestamp: new Date().toISOString(),
              line: lineNum,
              text: line,
              pattern: pat.source,
              context: [...ringBuffer],
            };
            onMatch(match);

            if (expectMode) {
              // First match → success
              return 0;
            }
          }
        }
      }
    } else if (currentSize < offset) {
      // File was truncated (log rotation) — reset
      offset = 0;
      console.error("[watch] File truncated — resetting to beginning");
    }

    // Poll interval: 200ms (balances responsiveness vs CPU)
    await Bun.sleep(200);
  }
}

// ─── Signal Integration ──────────────────────────────────────────────────────

function fireSignal(match: WatchMatch, agent?: string): void {
  const msg = `[watch] Pattern match at line ${match.line}: ${match.text.slice(0, 120)}`;
  try {
    const signalTs = join(AGENCE_ROOT, "lib", "signal.ts");
    if (existsSync(signalTs)) {
      execSync(
        `bun run "${signalTs}" notify "${msg.replace(/"/g, '\\"')}"`,
        { timeout: 5000, stdio: "pipe" }
      );
    } else {
      // Fallback: write signal file
      const sigDir = join(AGENCE_ROOT, "nexus", "signals");
      const sigFile = join(sigDir, `watch-${Date.now()}.json`);
      writeFileSync(sigFile, JSON.stringify({
        type: "notify",
        from: agent || "watch",
        to: "human",
        payload: msg,
        match,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }
  } catch (err) {
    console.error(`[watch] Signal failed: ${err}`);
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdTail(args: string[]): Promise<number> {
  const config = parseWatchArgs(args, false);
  if (!config) return 1;

  let matchCount = 0;

  return tailFile(config, (match) => {
    matchCount++;
    // Print match
    console.log(`[${match.timestamp}] L${match.line} /${match.pattern}/ → ${match.text}`);

    // Capture to file
    if (config.captureFile) {
      appendFileSync(config.captureFile, JSON.stringify(match) + "\n");
    }

    // Fire signal
    if (config.signal) {
      fireSignal(match, config.agent);
    }
  });
}

async function cmdExpect(args: string[]): Promise<number> {
  const config = parseWatchArgs(args, true);
  if (!config) return 1;

  if (config.patterns.length === 0) {
    console.error("[watch] ^expect requires --pattern");
    return 1;
  }

  const code = await tailFile(config, (match) => {
    console.log(match.text);
    if (config.captureFile) {
      appendFileSync(config.captureFile, JSON.stringify(match) + "\n");
    }
    if (config.signal) {
      fireSignal(match, config.agent);
    }
  });

  return code;
}

function cmdList(): number {
  // List active watch PID files
  if (!existsSync(WATCH_DIR)) {
    console.log("[watch] No active watches");
    return 0;
  }

  const files = new Bun.Glob("*.pid").scanSync(WATCH_DIR);
  let count = 0;
  for (const f of files) {
    const content = readFileSync(join(WATCH_DIR, f), "utf-8").trim();
    console.log(`  ${f.replace(".pid", "").padEnd(20)} pid=${content}`);
    count++;
  }

  if (count === 0) {
    console.log("[watch] No active watches");
  } else {
    console.log(`\n  ${count} active watch(es)`);
  }
  return 0;
}

function cmdPatterns(): number {
  console.log("[watch] Built-in pattern library:\n");
  for (const [name, pat] of Object.entries(BUILTIN_PATTERNS)) {
    console.log(`  ${name.padEnd(14)} ${pat.source}`);
  }
  console.log(`\nUse --pattern @<name> to reference built-in patterns.`);
  console.log(`Use --pattern <regex> for custom patterns.`);
  return 0;
}

// ─── Argument Parsing ────────────────────────────────────────────────────────

function parseWatchArgs(args: string[], expectMode: boolean): WatchConfig | null {
  let logFile = "";
  const patterns: RegExp[] = [];
  let signal = false;
  let captureFile: string | undefined;
  let timeout = expectMode ? 60 : 0;  // expect defaults to 60s timeout
  let context = 3;
  let agent: string | undefined;

  let i = 0;
  // First non-flag arg is the log file
  if (i < args.length && !args[i].startsWith("-")) {
    logFile = args[i++];
  }

  while (i < args.length) {
    switch (args[i]) {
      case "--pattern":
      case "-p": {
        const raw = args[++i] || "";
        if (raw.startsWith("@")) {
          // Built-in pattern reference
          const name = raw.slice(1);
          const builtin = BUILTIN_PATTERNS[name];
          if (builtin) {
            patterns.push(builtin);
          } else {
            console.error(`[watch] Unknown built-in pattern: @${name}`);
            console.error(`  Available: ${Object.keys(BUILTIN_PATTERNS).join(", ")}`);
            return null;
          }
        } else {
          patterns.push(new RegExp(raw, "i"));
        }
        break;
      }
      case "--signal":
      case "-s":
        signal = true;
        break;
      case "--capture":
      case "-c":
        captureFile = args[++i];
        break;
      case "--timeout":
      case "-t":
        timeout = parseInt(args[++i] || "60", 10);
        break;
      case "--context":
        context = parseInt(args[++i] || "3", 10);
        break;
      case "--agent":
        agent = args[++i];
        break;
      default:
        if (!logFile) {
          logFile = args[i];
        } else {
          console.error(`[watch] Unknown flag: ${args[i]}`);
        }
    }
    i++;
  }

  if (!logFile) {
    console.error("[watch] No log file specified");
    return null;
  }

  // If no patterns specified for tail mode, use all built-in
  if (patterns.length === 0 && !expectMode) {
    patterns.push(...Object.values(BUILTIN_PATTERNS));
  }

  return { logFile, patterns, signal, captureFile, expectMode, timeout, context, agent };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdHelp(): number {
  console.log(`watch — Pipe-pane Stream Watcher (^watch / ^expect)

Usage:
  airun watch tail <logfile> [options]     Tail and filter log for patterns
  airun watch expect <logfile> [options]   Block until pattern matches (or timeout)
  airun watch list                         List active watch sessions
  airun watch patterns                     Show built-in pattern library
  airun watch help                         Show this help

Options:
  --pattern <regex>    Match lines against regex (repeatable)
  --pattern @<name>    Use built-in pattern (error, prompt, complete, warning, etc.)
  --signal             Fire ^notify to human on each match
  --capture <file>     Append match JSON to capture file (for skill learning)
  --timeout <sec>      Stop after N seconds (default: 0=forever for tail, 60 for expect)
  --context <lines>    Lines of context around match (default: 3)
  --agent <name>       Agent name for signal routing

Built-in patterns:
  @error       Errors, failures, panics, exceptions
  @prompt      Interactive prompts (y/n, confirm, proceed)
  @complete    Success markers (done, passed, ✔)
  @warning     Warnings, deprecation notices
  @checkpoint  Checkpoints, saves, snapshots
  @exit        Process exit codes
  @test        Test results (passing/failing counts)
  @build       Build completion/failure

Exit codes:
  0  Success (pattern found for ^expect, clean exit for ^tail)
  1  Error (missing file, bad args)
  2  Timeout (^expect only — pattern not found within timeout)

Examples:
  airun watch tail nexus/.aisessions/01/copil-1420-a3b2.typescript --pattern @error --signal
  airun watch expect /tmp/build.log --pattern "BUILD SUCCESSFUL" --timeout 120
  airun watch tail agent.log -p @error -p @prompt -p @complete --capture filtered.jsonl
  airun watch tail agent.log -p "TASK-[A-Z0-9]+ completed" --signal --agent copilot
`);
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    return cmdHelp();
  }

  switch (args[0]) {
    case "tail":    return cmdTail(args.slice(1));
    case "expect":  return cmdExpect(args.slice(1));
    case "list":    return cmdList();
    case "patterns": return cmdPatterns();
    default:
      console.error(`[watch] Unknown command: ${args[0]}`);
      console.error("  Run 'airun watch help' for usage.");
      return 1;
  }
}

process.exit(await main());
