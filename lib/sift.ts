#!/usr/bin/env bun
// lib/sift.ts — Generic LLM pipe filter/summarizer
//
// ^sift: reads stdin, sends through LLM for filtering/summarization,
// writes result to stdout. Zero-artifact, pure pipe.
//
// Usage:
//   <any command> | airun skill sift [instruction] [--format text|table|json] [--max-input N]
//
// Examples:
//   airun memory recall --grep "security" | airun skill sift
//   airun memory recall --grep "peer" | airun skill sift "deduplicate and rank by importance"
//   git log --oneline -30 | airun skill sift --format table "categorize by type"
//   cat THREAT-MODEL.md | airun skill sift --format json "extract open items"

import { join } from "path";
import { callRouter } from "./skill-exec.ts";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_INSTRUCTION = "Summarize the following input. Deduplicate repetitive entries, keep only distinct facts. Be concise.";
const MAX_INPUT_BYTES = 128 * 1024; // 128KB default stdin cap

type OutputFormat = "text" | "table" | "json";

// ─── System Prompts ──────────────────────────────────────────────────────────

const SYSTEM_BASE = `You are a pipe filter. You receive raw input (grep results, logs, file contents, etc.) and produce a filtered, summarized version.

Rules:
- Be concise. Remove redundancy and noise.
- Preserve all distinct facts, names, identifiers, and numbers.
- Do not add information that isn't in the input.
- Do not add preamble like "Here is the summary" — output the result directly.`;

const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  text: "Output as clean, readable plain text. Use bullet points for lists.",
  table: "Output as a markdown table with appropriate column headers derived from the data.",
  json: "Output as a JSON array of objects with appropriate keys derived from the data. Output only valid JSON, no markdown fences.",
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.error(`sift — LLM pipe filter/summarizer

Usage:
  <command> | airun skill sift [instruction] [options]

Options:
  --format <fmt>    Output format: text (default), table, json
  --max-input <N>   Max input bytes (default: 131072 / 128KB)
  --help, -h        Show this help

The instruction is an optional free-text directive:
  "deduplicate"
  "categorize by type"
  "extract only errors"
  "rank by severity"

Examples:
  airun memory recall --grep "security" | airun skill sift
  git log --oneline -30 | airun skill sift --format table "categorize"
  cat report.md | airun skill sift --format json "extract action items"`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);

  // Parse args
  let format: OutputFormat = "text";
  let maxInput = MAX_INPUT_BYTES;
  const instructionParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      return 0;
    } else if (args[i] === "--format" && args[i + 1]) {
      const f = args[++i];
      if (f !== "text" && f !== "table" && f !== "json") {
        console.error(`[sift] Invalid format: "${f}". Valid: text, table, json`);
        return 1;
      }
      format = f;
    } else if (args[i] === "--max-input" && args[i + 1]) {
      maxInput = parseInt(args[++i], 10);
      if (isNaN(maxInput) || maxInput <= 0) {
        console.error("[sift] --max-input must be a positive number");
        return 1;
      }
    } else {
      instructionParts.push(args[i]);
    }
  }

  // Read stdin
  if (process.stdin.isTTY) {
    console.error("[sift] No input on stdin. Pipe something into sift:");
    console.error("  <command> | airun skill sift [instruction]");
    return 1;
  }

  let input: string;
  try {
    input = await new Response(process.stdin as any).text();
  } catch (err: any) {
    console.error(`[sift] Failed to read stdin: ${err.message}`);
    return 1;
  }

  if (!input.trim()) {
    console.error("[sift] Empty input on stdin, nothing to sift.");
    return 0;
  }

  // Truncate if too large
  if (input.length > maxInput) {
    console.error(`[sift] Input truncated: ${input.length} → ${maxInput} bytes`);
    input = input.slice(0, maxInput);
  }

  // Build prompt
  const instruction = instructionParts.join(" ") || DEFAULT_INSTRUCTION;
  const systemPrompt = `${SYSTEM_BASE}\n\n${FORMAT_INSTRUCTIONS[format]}`;
  const userMsg = `Instruction: ${instruction}\n\n--- INPUT BEGIN ---\n${input}\n--- INPUT END ---`;

  console.error(`[sift] ${input.split("\n").length} lines → LLM (format: ${format})`);

  try {
    const output = callRouter(systemPrompt, userMsg);
    if (!output) {
      console.error("[sift] Empty response from LLM");
      return 1;
    }
    console.log(output);
    return 0;
  } catch (err: any) {
    console.error(`[sift] LLM error: ${err.message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main());
}
