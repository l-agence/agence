#!/usr/bin/env bun
// lib/btw.ts — Steering comments / context injection
//
// Usage:
//   airun btw <text>              Append steering note to active context
//   airun btw show                Show recent notes
//   airun btw clear               Clear notes for current session
//   airun btw help
//
// Notes are appended to nexus/btw/<session_or_task>.jsonl
// They surface in agent context windows as inline steering.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// ─── Environment ─────────────────────────────────────────────────────────────

function getRoot(): string {
  return process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
}
export function getBtwDir(): string {
  return process.env.AGENCE_BTW_DIR || join(getRoot(), "nexus", "btw");
}
function getContextId(): string {
  // Prefer task → session → "default"
  const raw = process.env.AGENCE_TASK_ID || process.env.AI_SESSION || "default";
  // SEC: sanitize for use as filename — only allow alnum, dash, underscore, dot
  return raw.replace(/[^a-zA-Z0-9\-_.]/g, "_").slice(0, 64);
}
function getBtwFile(): string {
  return join(getBtwDir(), `${getContextId()}.jsonl`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BtwNote {
  timestamp: string;
  text: string;
  agent?: string;
  context_id: string;
}

// ─── Operations ──────────────────────────────────────────────────────────────

function ensureDir(): void {
  const dir = getBtwDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Append a steering note */
export function addNote(text: string): BtwNote {
  ensureDir();
  const note: BtwNote = {
    timestamp: new Date().toISOString(),
    text,
    agent: process.env.AI_AGENT || undefined,
    context_id: getContextId(),
  };
  appendFileSync(getBtwFile(), JSON.stringify(note) + "\n");
  return note;
}

/** Read notes for the current context */
export function readNotes(): BtwNote[] {
  const file = getBtwFile();
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8").split("\n").filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as BtwNote[];
}

/** Read all notes across all contexts (most recent first) */
export function readAllNotes(max = 20): BtwNote[] {
  const dir = getBtwDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith(".jsonl"));
  const all: BtwNote[] = [];
  for (const f of files) {
    const lines = readFileSync(join(dir, f), "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try { all.push(JSON.parse(line)); } catch {}
    }
  }
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return all.slice(0, max);
}

/** Clear notes for current context */
export function clearNotes(): number {
  const file = getBtwFile();
  if (!existsSync(file)) return 0;
  const count = readNotes().length;
  writeFileSync(file, "");
  return count;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function cmdShow(args: string[]): number {
  const all = args.includes("--all");
  const notes = all ? readAllNotes() : readNotes();
  if (notes.length === 0) {
    console.log("[btw] No steering notes.");
    return 0;
  }
  for (const n of notes) {
    const ts = n.timestamp.slice(11, 19);
    const ctx = all ? ` [${n.context_id.slice(0, 8)}]` : "";
    const agent = n.agent ? ` @${n.agent}` : "";
    console.log(`  ${ts}${agent}${ctx}: ${n.text}`);
  }
  return 0;
}

function cmdClear(): number {
  const cleared = clearNotes();
  console.log(`[btw] Cleared ${cleared} notes for context ${getContextId().slice(0, 8)}.`);
  return 0;
}

function cmdHelp(): number {
  console.log(`btw — Steering comments and context injection

Usage:
  airun btw <text>             Append steering note to active context
  airun btw show [--all]       Show notes (--all = all contexts)
  airun btw clear              Clear notes for current context
  airun btw help               This help

Notes are keyed to AGENCE_TASK_ID > AI_SESSION > "default".
They surface as inline context when agents read their working state.

Environment:
  AGENCE_BTW_DIR     Storage directory (default: nexus/btw/)
`);
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  let exitCode = 0;
  switch (cmd) {
    case "show":    exitCode = cmdShow(args.slice(1)); break;
    case "clear":   exitCode = cmdClear(); break;
    case "help":
    case "--help":
    case "-h":      exitCode = cmdHelp(); break;
    default: {
      // Everything else is the note text
      const text = args.join(" ").trim();
      if (!text) { exitCode = cmdHelp(); break; }
      const note = addNote(text);
      console.log(`[btw] ✓ noted (${getContextId().slice(0, 8)}): ${note.text}`);
      break;
    }
  }

  process.exit(exitCode);
}
