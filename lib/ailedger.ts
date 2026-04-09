#!/usr/bin/env bun
// lib/ailedger.ts — Two-tier Merkle-chained decision ledger (Bun)
//
// Two-tier architecture:
//   LOCAL  (nexus/.ailedger/)  — full-fidelity, per-user, nested git repo, gitignored
//   SHARD  (.ailedger)         — filtered, dual-hash, committed to parent repo
//
// The local tier records everything. The shard tier receives only entries that
// pass the security filter. Each shard entry carries:
//   - upstream_hash: SHA-256 of the shard entry (Merkle chain for the public ledger)
//   - local_hash:    SHA-256 of the original local entry (provenance link)
//   - redacted:      true if content was stripped by the filter
//
// Usage (from bash via eval):
//   airun ailedger append <type> <tag> [task_id] [command] [exit_code]
//   airun ailedger verify [--local|--shard]
//   airun ailedger init          # init nested git repo
//   airun ailedger status        # entry counts, chain status
//   airun ailedger filter-test "some string"  # test filter
//
// Exit codes: 0 = success, 1 = error

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Paths ───────────────────────────────────────────────────────────────────

const LOCAL_DIR  = process.env.AGENCE_LEDGER_DIR || join(AGENCE_ROOT, "nexus", ".ailedger");
const SHARD_FILE = process.env.AGENCE_SHARD_LEDGER || join(AGENCE_ROOT, ".ailedger");

function localFile(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return join(LOCAL_DIR, `${yyyy}-${mm}.jsonl`);
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ─── Security Filter ─────────────────────────────────────────────────────────
// Two-pass: filter transforms, validator rejects if anything slipped through.
// This is the basic regex filter. The gatekeeper (v0.4.0) will replace this
// with AIPOLICY.yaml sec-label classification.

const SENSITIVE_PATTERNS = [
  // API keys and tokens
  /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|BEARER|CREDENTIAL|AUTH)[=: ]+\S+/gi,
  // Common key prefixes
  /sk-[a-zA-Z0-9_-]{20,}/g,              // Anthropic, OpenAI
  /ghp_[a-zA-Z0-9]{36}/g,                // GitHub PAT
  /gho_[a-zA-Z0-9]{36}/g,                // GitHub OAuth
  /ghs_[a-zA-Z0-9]{36}/g,                // GitHub App
  /github_pat_[a-zA-Z0-9_]{50,}/g,       // GitHub fine-grained PAT
  /xoxb-[a-zA-Z0-9-]+/g,                 // Slack bot token
  /AIza[a-zA-Z0-9_-]{35}/g,              // Google API key
  /AKIA[A-Z0-9]{16}/g,                   // AWS access key
  // Connection strings
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s"]+/gi,
  // Private key blocks
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  // Email-like patterns in command fields (PII)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

// Patterns that should NEVER appear in shard output (validator — second pass)
const REJECT_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/i,
  /sk-[a-zA-Z0-9_-]{40,}/i,
  /ghp_[a-zA-Z0-9]{30,}/i,
  /AKIA[A-Z0-9]{16}/,
  /-----BEGIN.*PRIVATE KEY/i,
];

interface FilterResult {
  filtered: string;
  redacted: boolean;
  rejected: boolean;
  reason?: string;
}

function filterEntry(raw: string): FilterResult {
  let filtered = raw;
  let redacted = false;

  // Pass 1: Transform — replace sensitive patterns with [REDACTED]
  for (const pattern of SENSITIVE_PATTERNS) {
    const before = filtered;
    filtered = filtered.replace(pattern, "[REDACTED]");
    if (filtered !== before) redacted = true;
  }

  // Pass 2: Validate — reject if anything slipped through
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(filtered)) {
      return {
        filtered: "",
        redacted: true,
        rejected: true,
        reason: `Reject pattern matched after filter: ${pattern.source}`,
      };
    }
  }

  return { filtered, redacted, rejected: false };
}

// ─── Entry Types ─────────────────────────────────────────────────────────────

interface LocalEntry {
  id: string;             // 8-char hex — content-addressable short ID
  seq: number;
  timestamp: string;
  session_id: string;
  decision_type: string;
  agent: string;
  rationale_tag: string;
  task_id: string;
  command: string;
  exit_code: number;
  commit?: string;        // git HEAD at entry time (if available)
  prev_hash: string;
}

interface ShardEntry extends LocalEntry {
  local_hash: string;      // SHA-256 of the full local entry (provenance)
  upstream_hash: string;    // SHA-256 of this shard entry (Merkle chain link)
  prev_upstream: string;    // Previous shard entry's upstream_hash
  redacted: boolean;
}

// ─── Chain Helpers ───────────────────────────────────────────────────────────

function getLastLine(file: string): string | null {
  if (!existsSync(file)) return null;
  const content = readFileSync(file, "utf-8").trimEnd();
  if (!content) return null;
  const lines = content.split("\n");
  return lines[lines.length - 1];
}

function countLines(file: string): number {
  if (!existsSync(file)) return 0;
  const content = readFileSync(file, "utf-8").trimEnd();
  if (!content) return 0;
  return content.split("\n").length;
}

function getLastHash(file: string, hashField: string): string {
  const last = getLastLine(file);
  if (!last) return "genesis";
  try {
    const obj = JSON.parse(last);
    return obj[hashField] || sha256(last);
  } catch {
    return sha256(last);
  }
}

// ─── Append ──────────────────────────────────────────────────────────────────

function append(
  decisionType: string,
  rationaleTag: string,
  taskId: string,
  command: string,
  exitCode: number,
): { localEntry: string; shardEntry: string | null; redacted: boolean; rejected: boolean } {
  mkdirSync(LOCAL_DIR, { recursive: true });

  const lf = localFile();
  const seq = countLines(lf) + 1;
  const prevHash = seq === 1 ? "genesis" : sha256(getLastLine(lf)!);
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const sessionId = process.env.AI_SESSION_ID || process.env._AILEDGER_SESSION_ID || `ts-${process.pid}`;
  const agent = process.env.AI_AGENT || "unknown";

  // Generate deterministic 8-char hex ID from entry content
  const idSeed = `${ts}|${sessionId}|${seq}|${agent}|${decisionType}`;
  const entryId = sha256(idSeed).slice(0, 8);

  // Capture git HEAD if available (best-effort, no error on failure)
  let commitId: string | undefined;
  try {
    commitId = execSync("git rev-parse --short HEAD", { cwd: AGENCE_ROOT, timeout: 2000 })
      .toString().trim() || undefined;
  } catch { /* not in a git repo or git unavailable */ }

  // ── Local entry (full fidelity) ──
  const local: LocalEntry = {
    id: entryId,
    seq,
    timestamp: ts,
    session_id: sessionId,
    decision_type: decisionType,
    agent,
    rationale_tag: rationaleTag,
    task_id: taskId,
    command,
    exit_code: exitCode,
    ...(commitId ? { commit: commitId } : {}),
    prev_hash: prevHash,
  };

  const localLine = JSON.stringify(local);
  appendFileSync(lf, localLine + "\n");
  const localHash = sha256(localLine);

  // ── Shard entry (filtered) ──
  const filterResult = filterEntry(localLine);

  if (filterResult.rejected) {
    // Entry blocked — log locally that it was withheld
    console.error(`[ailedger] Entry withheld from shard: ${filterResult.reason}`);
    return { localEntry: localLine, shardEntry: null, redacted: true, rejected: true };
  }

  // Parse filtered line back, add shard fields
  const shardSeq = countLines(SHARD_FILE) + 1;
  const prevUpstream = getLastHash(SHARD_FILE, "upstream_hash");

  let shardBase: LocalEntry;
  if (filterResult.redacted) {
    shardBase = JSON.parse(filterResult.filtered);
  } else {
    shardBase = { ...local };
  }

  const shard: ShardEntry = {
    ...shardBase,
    seq: shardSeq,
    local_hash: localHash,
    upstream_hash: "",  // placeholder — computed after serialization
    prev_upstream: prevUpstream,
    redacted: filterResult.redacted,
  };

  // Compute upstream_hash over the entry (excluding upstream_hash itself)
  const shardForHash = JSON.stringify(shard);
  shard.upstream_hash = sha256(shardForHash);

  const shardLine = JSON.stringify(shard);
  mkdirSync(dirname(SHARD_FILE), { recursive: true });
  appendFileSync(SHARD_FILE, shardLine + "\n");

  return { localEntry: localLine, shardEntry: shardLine, redacted: filterResult.redacted, rejected: false };
}

// ─── Verify ──────────────────────────────────────────────────────────────────

function verifyChain(
  file: string,
  prevField: string,
  mode: "line-hash" | "field-hash",
  hashField?: string,
): { valid: boolean; entries: number; breakAt?: number } {
  if (!existsSync(file)) {
    return { valid: true, entries: 0 };
  }

  const lines = readFileSync(file, "utf-8").trimEnd().split("\n").filter(Boolean);
  let prevHash = "genesis";

  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      const claimed = obj[prevField];
      if (claimed !== prevHash) {
        return { valid: false, entries: lines.length, breakAt: i + 1 };
      }
      // For local chain: next prev = sha256 of raw line
      // For shard chain: next prev = the upstream_hash field value
      if (mode === "line-hash") {
        prevHash = sha256(lines[i]);
      } else {
        prevHash = obj[hashField!] || sha256(lines[i]);
      }
    } catch {
      return { valid: false, entries: lines.length, breakAt: i + 1 };
    }
  }

  return { valid: true, entries: lines.length };
}

function verifyLocal(): { valid: boolean; entries: number; breakAt?: number } {
  const lf = localFile();
  return verifyChain(lf, "prev_hash", "line-hash");
}

function verifyShard(): { valid: boolean; entries: number; breakAt?: number } {
  return verifyChain(SHARD_FILE, "prev_upstream", "field-hash", "upstream_hash");
}

// ─── Init Nested Repo ────────────────────────────────────────────────────────

function initNestedRepo(): boolean {
  mkdirSync(LOCAL_DIR, { recursive: true });

  const gitDir = join(LOCAL_DIR, ".git");
  if (existsSync(gitDir)) {
    console.error(`[ailedger] Nested repo already exists: ${LOCAL_DIR}`);
    return true;
  }

  try {
    execSync("git init", { cwd: LOCAL_DIR, stdio: "pipe" });
    // Create .gitignore inside the nested repo
    writeFileSync(join(LOCAL_DIR, ".gitignore"), "# This repo is local-only\n");
    // Initial commit
    execSync("git add .gitignore && git commit -m 'init: local ailedger repo'", {
      cwd: LOCAL_DIR,
      stdio: "pipe",
    });
    console.error(`[ailedger] Initialized nested repo: ${LOCAL_DIR}`);
    return true;
  } catch (e) {
    console.error(`[ailedger] Failed to init nested repo: ${e}`);
    return false;
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

function status(): void {
  const localCount = countLines(localFile());
  const shardCount = countLines(SHARD_FILE);
  const localVerify = verifyLocal();
  const shardVerify = verifyShard();
  const hasNestedGit = existsSync(join(LOCAL_DIR, ".git"));

  const out = {
    local: {
      file: localFile(),
      entries: localCount,
      chain_valid: localVerify.valid,
      nested_git: hasNestedGit,
    },
    shard: {
      file: SHARD_FILE,
      entries: shardCount,
      chain_valid: shardVerify.valid,
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [subCmd, ...args] = process.argv.slice(2);

if (!subCmd) {
  console.error("Usage: airun ailedger <command> [args]");
  console.error("Commands:");
  console.error("  append <type> <tag> [task_id] [command] [exit_code]");
  console.error("  verify [--local|--shard]");
  console.error("  init                    Initialize nested git repo");
  console.error("  status                  Entry counts and chain health");
  console.error("  filter-test <string>    Test security filter on a string");
  process.exit(1);
}

let exitCode = 0;

switch (subCmd) {
  case "append": {
    const [type, tag, taskId, cmd, ec] = args;
    if (!type) {
      console.error("Usage: airun ailedger append <type> <tag> [task_id] [command] [exit_code]");
      exitCode = 1;
      break;
    }
    const result = append(type, tag || "", taskId || "", cmd || "", parseInt(ec || "-1", 10));
    // Output for bash integration (eval-safe)
    if (result.rejected) {
      console.log(`_AILEDGER_RESULT="rejected"`);
    } else if (result.redacted) {
      console.log(`_AILEDGER_RESULT="redacted"`);
    } else {
      console.log(`_AILEDGER_RESULT="ok"`);
    }
    break;
  }

  case "verify": {
    const target = args[0] || "--both";
    if (target === "--local" || target === "--both") {
      const r = verifyLocal();
      if (r.valid) {
        console.error(`[ailedger] LOCAL  VERIFIED: ${r.entries} entries, chain intact`);
      } else {
        console.error(`[ailedger] LOCAL  BROKEN at line ${r.breakAt} of ${r.entries}`);
        exitCode = 1;
      }
    }
    if (target === "--shard" || target === "--both") {
      const r = verifyShard();
      if (r.valid) {
        console.error(`[ailedger] SHARD  VERIFIED: ${r.entries} entries, chain intact`);
      } else {
        console.error(`[ailedger] SHARD  BROKEN at line ${r.breakAt} of ${r.entries}`);
        exitCode = 1;
      }
    }
    break;
  }

  case "init": {
    const ok = initNestedRepo();
    if (!ok) exitCode = 1;
    break;
  }

  case "status": {
    status();
    break;
  }

  case "filter-test": {
    const input = args.join(" ");
    if (!input) {
      console.error("Usage: airun ailedger filter-test <string>");
      exitCode = 1;
      break;
    }
    const r = filterEntry(input);
    console.log(JSON.stringify({
      input,
      filtered: r.filtered,
      redacted: r.redacted,
      rejected: r.rejected,
      reason: r.reason || null,
    }, null, 2));
    break;
  }

  default:
    console.error(`Error: Unknown command: ${subCmd}`);
    exitCode = 1;
}

process.exit(exitCode);
