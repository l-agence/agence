#!/usr/bin/env bun
// lib/ledger.ts — Shared ledger (shard) management module (Bun)
//
// Manages the upstream .ailedger submodule lifecycle:
//   init   — Create upstream repo, seed from local shard, add as submodule
//   list   — Show recent entries from the shard
//   show   — Show a specific entry by id/seq
//   add    — Append an entry (delegates to ailedger.ts)
//   sync   — Commit + push shard to upstream
//   status — Show shard health (chain validity, entry count, remote)
//
// Usage:
//   airun ledger init [--remote <url>]
//   airun ledger list [--last N]
//   airun ledger show <id|seq>
//   airun ledger add <type> <tag> [task_id] [command] [exit_code]
//   airun ledger sync
//   airun ledger status
//
// Exit codes: 0 = success, 1 = error

import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join } from "path";
import { execSync, spawnSync } from "child_process";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// Shard paths — submodule lives at .ailedger-upstream/
const SHARD_DIR = join(AGENCE_ROOT, ".ailedger-upstream");
const SHARD_LEDGER = join(SHARD_DIR, "ledger.jsonl");
const OLD_SHARD = join(AGENCE_ROOT, ".ailedger");  // legacy flat shard file

// AI_SHARD: remote URL for the shared ledger repo
const AI_SHARD = process.env.AI_SHARD || "";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id?: string;
  seq: number;
  timestamp: string;
  session_id: string;
  decision_type: string;
  agent: string;
  rationale_tag: string;
  task_id: string;
  command: string;
  exit_code: number | null;
  commit?: string;
  prev_hash: string;
  local_hash?: string;
  upstream_hash?: string;
  prev_upstream?: string;
  redacted?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd: cwd || AGENCE_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e: any) {
    return e.stdout?.trim() || "";
  }
}

function runOrFail(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd: cwd || AGENCE_ROOT, encoding: "utf-8" }).trim();
}

function readEntries(file: string): LedgerEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function stderr(msg: string) {
  process.stderr.write(msg + "\n");
}

// ─── init: create upstream repo + seed from existing shard ───────────────────

function cmdInit(args: string[]): number {
  // Parse --remote flag
  let remote = AI_SHARD;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--remote" && args[i + 1]) {
      remote = args[++i];
    }
  }

  // Auto-derive shard URL from origin when not explicitly configured.
  // Convention: the ailedger lives in a sister repo named "ailedger" in the
  // same org/user as the parent repo.
  //   https://github.com/l-agence/agence.git  →  https://github.com/l-agence/ailedger.git
  //   git@github.com:l-agence/agence.git      →  git@github.com:l-agence/ailedger.git
  if (!remote) {
    const originUrl = run("git remote get-url origin").trim();
    if (originUrl) {
      // Replace the last path/repo segment with "ailedger", preserving .git suffix
      remote = originUrl.replace(/([/:])([^/:]+?)(\.git)?$/, (_m, sep, _repo, dotGit) => `${sep}ailedger${dotGit || ""}`);
      stderr(`[ledger] Auto-derived shard remote from origin: ${remote}`);
      stderr(`  Override: export AI_SHARD=<url>  or add 'shard: <url>' to ~/.agence/config.yaml`);
    }
  }

  if (!remote) {
    stderr(`[ledger] Error: No shard remote URL and could not derive one from git origin.`);
    stderr(`  Set AI_SHARD env var, pass --remote <url>,`);
    stderr(`  or add 'shard: <url>' to ~/.agence/config.yaml`);
    return 1;
  }

  // Check if submodule already exists
  if (existsSync(join(SHARD_DIR, ".git"))) {
    stderr(`[ledger] Shard already initialized at ${SHARD_DIR}`);
    stderr(`  Remote: ${run("git remote get-url origin", SHARD_DIR)}`);
    return 0;
  }

  stderr(`[ledger] Initializing shared shard...`);
  stderr(`  Remote: ${remote}`);

  // Extract org/repo from remote URL for gh CLI
  // Supports: https://github.com/ORG/REPO.git, git@github.com:ORG/REPO.git
  const repoMatch = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  const ghRepo = repoMatch ? repoMatch[1] : "";

  // Create remote repo if it doesn't exist (GitHub only)
  if (ghRepo) {
    const check = run(`gh repo view ${ghRepo} --json name 2>&1`);
    if (!check.includes(`"name"`)) {
      stderr(`  Creating remote repo: ${ghRepo}`);
      try {
        runOrFail(`gh repo create ${ghRepo} --private --description "Shared decision ledger shard for Agence"`);
        stderr(`  ✓ Created ${ghRepo} (private)`);
      } catch (e: any) {
        stderr(`[ledger] Warning: Could not create remote repo: ${e.message || e}`);
        stderr(`  You may need to create it manually: gh repo create ${ghRepo} --private`);
      }
    } else {
      stderr(`  Remote repo ${ghRepo} already exists`);
    }
  }

  // Create shard directory
  mkdirSync(SHARD_DIR, { recursive: true });

  // Seed from existing flat shard file if present
  if (existsSync(OLD_SHARD)) {
    copyFileSync(OLD_SHARD, SHARD_LEDGER);
    stderr(`  Seeded from existing .ailedger (${readEntries(SHARD_LEDGER).length} entries)`);
  }

  // Init git repo
  runOrFail("git init", SHARD_DIR);
  runOrFail("git checkout -b main", SHARD_DIR);

  // Ensure ledger file exists
  if (!existsSync(SHARD_LEDGER)) {
    execSync(`touch "${SHARD_LEDGER}"`, { cwd: SHARD_DIR });
  }

  runOrFail(`git add ledger.jsonl`, SHARD_DIR);
  runOrFail(`git commit -m "genesis: initialize shared ailedger shard"`, SHARD_DIR);

  // Add remote + push
  runOrFail(`git remote add origin ${remote}`, SHARD_DIR);
  try {
    runOrFail(`git push -u origin main`, SHARD_DIR);
    stderr(`[ledger] ✓ Shard initialized and pushed to ${remote}`);
  } catch {
    stderr(`[ledger] ✓ Shard initialized locally at ${SHARD_DIR}`);
    stderr(`  Push failed — retry with: cd ${SHARD_DIR} && git push -u origin main`);
  }
  stderr(`  Update env: export AGENCE_SHARD_LEDGER='${SHARD_LEDGER}'`);

  // Emit eval-safe exports for bash integration
  console.log(`export AGENCE_SHARD_LEDGER='${SHARD_LEDGER.replace(/'/g, "'\\''")}'`);
  console.log(`export AI_SHARD='${remote.replace(/'/g, "'\\''")}'`);

  return 0;
}

// ─── list: show recent shard entries ─────────────────────────────────────────

function cmdList(args: string[]): number {
  // Determine which file to read
  const file = existsSync(SHARD_LEDGER) ? SHARD_LEDGER : OLD_SHARD;
  if (!existsSync(file)) {
    stderr("[ledger] No shard found. Run: ^ledger init");
    return 1;
  }

  const entries = readEntries(file);
  let last = 10;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--last" && args[i + 1]) last = parseInt(args[++i], 10);
    if (args[i] === "--all") last = entries.length;
  }

  const slice = entries.slice(-last);
  const source = file === SHARD_LEDGER ? "upstream" : "legacy";
  stderr(`\n  SHARD LEDGER (${source}) — ${entries.length} total entries\n`);

  for (const e of slice) {
    const id = e.id ? `${e.id} ` : "";
    const redacted = e.redacted ? " [REDACTED]" : "";
    const commit = e.commit ? ` @${e.commit}` : "";
    console.log(`  ${id}#${e.seq} ${e.timestamp.slice(0, 19)}  ${e.decision_type.padEnd(8)} @${e.agent.padEnd(10)} ${e.rationale_tag}${redacted}${commit}`);
  }
  console.log("");

  return 0;
}

// ─── show: display a specific entry by id or seq ─────────────────────────────

function cmdShow(args: string[]): number {
  const query = args[0];
  if (!query) {
    stderr("Usage: ^ledger show <id|seq>");
    return 1;
  }

  const file = existsSync(SHARD_LEDGER) ? SHARD_LEDGER : OLD_SHARD;
  if (!existsSync(file)) {
    stderr("[ledger] No shard found. Run: ^ledger init");
    return 1;
  }

  const entries = readEntries(file);
  const isSeq = /^\d+$/.test(query);

  const entry = entries.find(e =>
    isSeq
      ? e.seq === parseInt(query, 10)
      : (e.id?.startsWith(query) || false)
  );

  if (!entry) {
    stderr(`[ledger] Entry not found: ${query}`);
    return 1;
  }

  console.log(JSON.stringify(entry, null, 2));
  return 0;
}

// ─── add: append entry (delegates to ailedger.ts) ────────────────────────────

function cmdAdd(args: string[]): number {
  // Delegate to ailedger.ts append — same positional args
  const airun = join(import.meta.dir, "..", "bin", "airun");
  try {
    // SEC-013: Use spawnSync argument array — no shell interpolation.
    // Old pattern: runOrFail(`"${airun}" ailedger append ${args.map(...)}`)
    // allowed $() expansion in caller-supplied args.
    const result = spawnSync(airun, ["ailedger", "append", ...args], {
      cwd: AGENCE_ROOT, encoding: "utf-8", timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) throw new Error(result.stderr?.toString() || "append failed");
    console.log(result.stdout?.toString().trim());
    return 0;
  } catch {
    stderr("[ledger] Failed to append entry. Check: airun ailedger append --help");
    return 1;
  }
}

// ─── handoff: cross-shard handoff entry ──────────────────────────────────────

function cmdHandoff(args: string[]): number {
  // ^ledger handoff <from> <to> [task_id] [note]
  // Creates a handoff-type ledger entry with a cross-shard reference
  const from = args[0];
  const to = args[1];
  const taskId = args[2] || "";
  const note = args.slice(3).join(" ") || "";

  if (!from || !to) {
    stderr("Usage: airun ledger handoff <@from> <@to> [task_id] [note]");
    stderr("  Creates a handoff ledger entry with cross-agent reference.");
    stderr("  Example: airun ledger handoff @copilot @ralph session-abc 'Continue audit work'");
    return 1;
  }

  const tag = `handoff:${from}→${to}${note ? ` ${note}` : ""}`;
  const command = `handoff:${from}→${to}:task:${taskId || "(none)"}`;

  return cmdAdd(["handoff", tag, taskId, command, "0"]);
}

// ─── sync: commit and push shard to upstream ─────────────────────────────────

function cmdSync(_args: string[]): number {
  if (!existsSync(join(SHARD_DIR, ".git"))) {
    stderr("[ledger] Shard not initialized. Run: ^ledger init");
    return 1;
  }

  // Check for changes
  const status = run("git status --porcelain", SHARD_DIR);
  if (!status) {
    stderr("[ledger] Shard is clean — nothing to sync.");
    return 0;
  }

  try {
    runOrFail("git add ledger.jsonl", SHARD_DIR);
    const count = readEntries(SHARD_LEDGER).length;
    runOrFail(`git commit -m "ledger: sync ${count} entries"`, SHARD_DIR);
    runOrFail("git push origin main", SHARD_DIR);
    stderr(`[ledger] ✓ Synced ${count} entries to upstream.`);
    return 0;
  } catch (e: any) {
    stderr(`[ledger] Sync failed: ${e.message}`);
    return 1;
  }
}

// ─── status: shard health check ──────────────────────────────────────────────

function cmdStatus(_args: string[]): number {
  const file = existsSync(SHARD_LEDGER) ? SHARD_LEDGER : OLD_SHARD;
  const source = existsSync(SHARD_LEDGER) ? "upstream (submodule)" : "legacy (flat file)";

  if (!existsSync(file)) {
    stderr("[ledger] No shard found. Run: ^ledger init");
    return 1;
  }

  const entries = readEntries(file);
  const hasGit = existsSync(join(SHARD_DIR, ".git"));
  const remote = hasGit ? run("git remote get-url origin", SHARD_DIR) : "(not a git repo)";
  const dirty = hasGit ? run("git status --porcelain", SHARD_DIR) : "";

  console.log(`  Shard:    ${source}`);
  console.log(`  Path:     ${file}`);
  console.log(`  Entries:  ${entries.length}`);
  console.log(`  Remote:   ${remote}`);
  console.log(`  Dirty:    ${dirty ? "yes" : "no"}`);

  if (entries.length > 0) {
    const first = entries[0];
    const last = entries[entries.length - 1];
    console.log(`  First:    #${first.seq} ${first.timestamp.slice(0, 19)}`);
    console.log(`  Last:     ${last.id || ""} #${last.seq} ${last.timestamp.slice(0, 19)}`);
  }

  // Verify chain
  let chainOk = true;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].prev_upstream && entries[i - 1].upstream_hash) {
      if (entries[i].prev_upstream !== entries[i - 1].upstream_hash) {
        chainOk = false;
        break;
      }
    }
  }
  console.log(`  Chain:    ${chainOk ? "✓ valid" : "✗ BROKEN"}`);

  return 0;
}

// ─── CLI dispatch ────────────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "init":
    process.exit(cmdInit(args));
    break;
  case "list":
  case "ls":
    process.exit(cmdList(args));
    break;
  case "show":
    process.exit(cmdShow(args));
    break;
  case "add":
    process.exit(cmdAdd(args));
    break;
  case "handoff":
    process.exit(cmdHandoff(args));
    break;
  case "sync":
  case "push":
    process.exit(cmdSync(args));
    break;
  case "status":
    process.exit(cmdStatus(args));
    break;
  case "--help":
  case "help":
    console.error(`Usage: airun ledger <command> [args...]

Commands:
  init [--remote <url>]   Initialize upstream shard (submodule)
  list [--last N] [--all] Show recent shard entries
  show <id|seq>           Show a specific entry
  add <type> <tag> ...    Append entry (delegates to ailedger.ts)
  handoff <@from> <@to> [task_id] [note]
                          Record cross-agent handoff in ledger
  sync                    Commit + push shard to upstream
  status                  Shard health check

Environment:
  AI_SHARD                Git remote URL for the shared ledger
  AGENCE_SHARD_LEDGER     Override shard file path`);
    process.exit(0);
    break;
  default:
    console.error(`Unknown command: ${cmd || "(none)"}. Try: airun ledger help`);
    process.exit(1);
}
