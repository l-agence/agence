#!/usr/bin/env bun
// lib/diff.ts — Colored diff utility (non-git aware, sequent-friendly)
//
// Usage:
//   airun diff <file-a> <file-b>           Compare two files
//   airun diff --stdin                     Read unified diff from stdin and colorize
//   airun diff help
//
// Outputs colored unified diff to stdout (ANSI when TTY, plain otherwise).

import { existsSync, readFileSync } from "fs";
import { basename } from "path";

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  red:    (s: string) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green:  (s: string) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  cyan:   (s: string) => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  bold:   (s: string) => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
  dim:    (s: string) => isTTY ? `\x1b[2m${s}\x1b[0m` : s,
};

// ─── Diff Engine (Myers-style, simple) ───────────────────────────────────────

interface Hunk {
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  lines: string[];
}

/** Compute unified diff between two string arrays */
export function unifiedDiff(a: string[], b: string[], nameA = "a", nameB = "b", context = 3): string[] {
  // LCS-based diff with context
  const lcs = computeLCS(a, b);
  const hunks = buildHunks(a, b, lcs, context);

  if (hunks.length === 0) return [];

  const output: string[] = [
    `--- ${nameA}`,
    `+++ ${nameB}`,
  ];

  for (const hunk of hunks) {
    output.push(`@@ -${hunk.oldStart + 1},${hunk.oldLen} +${hunk.newStart + 1},${hunk.newLen} @@`);
    output.push(...hunk.lines);
  }

  return output;
}

/** Compute LCS table */
function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Build hunks from LCS table */
function buildHunks(a: string[], b: string[], dp: number[][], context: number): Hunk[] {
  // Backtrack to get edit script
  const edits: Array<{ type: "=" | "-" | "+"; line: string; oldIdx: number; newIdx: number }> = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.unshift({ type: "=", line: a[i - 1], oldIdx: i - 1, newIdx: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: "+", line: b[j - 1], oldIdx: i, newIdx: j - 1 });
      j--;
    } else {
      edits.unshift({ type: "-", line: a[i - 1], oldIdx: i - 1, newIdx: j });
      i--;
    }
  }

  // Group changes into hunks with context
  const hunks: Hunk[] = [];
  let hunk: Hunk | null = null;
  let contextAfter = 0;

  for (let k = 0; k < edits.length; k++) {
    const e = edits[k];
    if (e.type !== "=") {
      // Start or extend hunk
      if (!hunk) {
        // Look back for context
        const ctxStart = Math.max(0, k - context);
        hunk = { oldStart: edits[ctxStart].oldIdx, newStart: edits[ctxStart].newIdx, oldLen: 0, newLen: 0, lines: [] };
        for (let c2 = ctxStart; c2 < k; c2++) {
          hunk.lines.push(` ${edits[c2].line}`);
          hunk.oldLen++;
          hunk.newLen++;
        }
      }
      if (e.type === "-") { hunk.lines.push(`-${e.line}`); hunk.oldLen++; }
      else { hunk.lines.push(`+${e.line}`); hunk.newLen++; }
      contextAfter = 0;
    } else {
      if (hunk) {
        contextAfter++;
        if (contextAfter <= context) {
          hunk.lines.push(` ${e.line}`);
          hunk.oldLen++;
          hunk.newLen++;
        }
        if (contextAfter >= context) {
          // Check if next change is within 2*context lines
          let nextChange = -1;
          for (let f = k + 1; f < edits.length && f <= k + context; f++) {
            if (edits[f].type !== "=") { nextChange = f; break; }
          }
          if (nextChange === -1) {
            hunks.push(hunk);
            hunk = null;
            contextAfter = 0;
          }
        }
      }
    }
  }
  if (hunk) hunks.push(hunk);
  return hunks;
}

/** Colorize unified diff lines */
export function colorize(lines: string[]): string {
  return lines.map(line => {
    if (line.startsWith("---") || line.startsWith("+++")) return c.bold(line);
    if (line.startsWith("@@")) return c.cyan(line);
    if (line.startsWith("-")) return c.red(line);
    if (line.startsWith("+")) return c.green(line);
    return line;
  }).join("\n");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdDiff(args: string[]): number {
  if (args.includes("--stdin") || args.includes("-")) {
    // Colorize stdin
    const input = readFileSync("/dev/stdin", "utf-8");
    console.log(colorize(input.split("\n")));
    return 0;
  }

  const fileA = args[0];
  const fileB = args[1];

  if (!fileA || !fileB) {
    console.error("Usage: airun diff <file-a> <file-b>");
    console.error("       airun diff --stdin          (colorize unified diff from stdin)");
    return 2;
  }

  if (!existsSync(fileA)) {
    console.error(`[diff] File not found: ${fileA}`);
    return 1;
  }
  if (!existsSync(fileB)) {
    console.error(`[diff] File not found: ${fileB}`);
    return 1;
  }

  const a = readFileSync(fileA, "utf-8").split("\n");
  const b = readFileSync(fileB, "utf-8").split("\n");

  const lines = unifiedDiff(a, b, basename(fileA), basename(fileB));
  if (lines.length === 0) {
    console.log("[diff] Files are identical.");
    return 0;
  }

  console.log(colorize(lines));
  return 1; // Non-zero when there are differences (like diff(1))
}

function cmdHelp(): number {
  console.log(`diff — Colored unified diff utility

Usage:
  airun diff <file-a> <file-b>     Compare two files
  airun diff --stdin               Colorize unified diff from stdin
  airun diff help                  This help

Exit codes:
  0  Files are identical (or --stdin)
  1  Files differ
  2  Usage error

Features:
  - ANSI color when stdout is a TTY (plain otherwise)
  - Context-aware unified diff (3 lines default)
  - Non-git: works on any two files
  - Pipe-friendly: cat patch.diff | airun diff --stdin
`);
  return 0;
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);

  let exitCode = 0;
  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      exitCode = cmdHelp();
      break;
    default:
      // Treat all args as diff args (no subcommand needed)
      exitCode = cmdDiff(cmd ? [cmd, ...rest] : rest);
  }

  process.exit(exitCode);
}
