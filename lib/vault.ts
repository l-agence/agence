#!/usr/bin/env bun
// lib/vault.ts — ^vault: Hermetic user-private knowledge vault
//
// Turns knowledge/private/ into a nested git repo backed by a user-owned
// private GitHub repo (github.com/<user>/agence-vault). Content is org-delineated
// and routing rules apply within the vault, but the vault itself is private to
// the user — never shared unless explicitly pushed/exported.
//
// Usage:
//   agence ^vault init [--user <github-user>]   Initialize vault + remote
//   agence ^vault sync                          Pull, commit local changes, push
//   agence ^vault status                        Show vault state + remote
//   agence ^vault push                          Commit + push only
//   agence ^vault pull                          Pull from remote only
//   agence ^vault help                          This help
//
// The vault lives at knowledge/private/ (already gitignored by the parent repo).
// On init, this directory becomes a nested git repo with its own remote.

import { existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
const VAULT_DIR_RAW = process.env.AGENCE_VAULT_DIR || join(AGENCE_ROOT, "knowledge", "private");
const VAULT_DIR = resolve(VAULT_DIR_RAW); // normalize traversal
const VAULT_REMOTE_NAME = "origin";

// Validate vault dir is not a dangerous system path
const FORBIDDEN_VAULT_PATHS = ["/", "/etc", "/usr", "/bin", "/sbin", "/var", "/tmp", "/dev", "/proc", "/sys"];
if (FORBIDDEN_VAULT_PATHS.includes(VAULT_DIR)) {
  process.stderr.write(`[vault] FATAL: Refusing to use unsafe vault path: ${VAULT_DIR}\n`);
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Run a command using spawnSync array form (no shell injection). Returns stdout or "" on failure. */
function run(argv: string[], cwd?: string): string {
  try {
    const r = spawnSync(argv[0], argv.slice(1), {
      cwd: cwd || VAULT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    });
    return r.stdout?.trim() || "";
  } catch {
    return "";
  }
}

/** Run a command using spawnSync array form. Throws on non-zero exit. */
function runOrFail(argv: string[], cwd?: string): string {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: cwd || VAULT_DIR,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${argv.join(" ")}\n${r.stderr || ""}`);
  }
  return r.stdout?.trim() || "";
}

function stderr(msg: string): void {
  process.stderr.write(msg + "\n");
}

function isGitRepo(): boolean {
  return existsSync(join(VAULT_DIR, ".git"));
}

function resolveGitHubUser(): string | null {
  // Try env var first
  const envUser = process.env.AGENCE_VAULT_USER || process.env.GITHUB_USER;
  if (envUser) return envUser;

  // Try gh CLI (array form — no shell)
  try {
    const r = spawnSync("gh", ["api", "user", "--jq", ".login"], {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10_000,
    });
    const login = r.stdout?.trim() || "";
    if (login && login.length > 0 && !login.includes("error") && r.status === 0) return login;
  } catch { /* gh not authenticated or unavailable */ }

  return null;
}

function vaultRemoteUrl(user: string): string {
  return `https://github.com/${user}/agence-vault.git`;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdInit(args: string[]): number {
  // Parse --user flag
  let user = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user" && args[i + 1]) {
      user = args[++i];
    }
  }

  // Resolve user
  if (!user) {
    const resolved = resolveGitHubUser();
    if (!resolved) {
      stderr("[vault] Error: Cannot determine GitHub username.");
      stderr("  Pass --user <username>, set AGENCE_VAULT_USER, or authenticate with: gh auth login");
      return 1;
    }
    user = resolved;
  }

  // Validate username (GitHub: alphanumeric + hyphens, 1-39 chars)
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(user)) {
    stderr(`[vault] Error: Invalid GitHub username: ${user}`);
    return 1;
  }

  const remote = vaultRemoteUrl(user);
  stderr(`[vault] Initializing hermetic vault...`);
  stderr(`  User:   ${user}`);
  stderr(`  Path:   ${VAULT_DIR}`);
  stderr(`  Remote: ${remote}`);

  // Ensure vault directory exists
  mkdirSync(VAULT_DIR, { recursive: true });

  // Idempotency: already a git repo?
  if (isGitRepo()) {
    const existingRemote = run(["git", "remote", "get-url", VAULT_REMOTE_NAME]);
    if (existingRemote) {
      stderr(`[vault] Vault already initialized.`);
      stderr(`  Remote: ${existingRemote}`);
      return 0;
    }
    // Git repo but no remote — add it
    try {
      runOrFail(["git", "remote", "add", VAULT_REMOTE_NAME, remote]);
      stderr(`[vault] Added remote: ${remote}`);
    } catch {
      stderr(`[vault] Warning: Could not add remote.`);
    }
    return 0;
  }

  // Create remote repo via gh CLI if it doesn't exist
  const ghRepo = `${user}/agence-vault`;
  const check = run(["gh", "repo", "view", ghRepo, "--json", "name"]);
  if (!check.includes(`"name"`)) {
    stderr(`  Creating remote repo: ${ghRepo} (private)`);
    try {
      runOrFail(["gh", "repo", "create", ghRepo, "--private", "--description", "Agence hermetic knowledge vault (personal)"]);
      stderr(`  ✓ Created ${ghRepo}`);
    } catch (e: any) {
      stderr(`[vault] Warning: Could not create remote repo: ${e.message || e}`);
      stderr(`  You may need to create it manually: gh repo create ${ghRepo} --private`);
    }
  } else {
    stderr(`  Remote repo ${ghRepo} already exists`);
  }

  // Initialize nested git repo
  runOrFail(["git", "init"], VAULT_DIR);
  runOrFail(["git", "checkout", "-b", "main"], VAULT_DIR);

  // Create a vault-level .gitignore for sensitive temp files
  const gitignorePath = join(VAULT_DIR, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `# Vault-level ignores
*.tmp
*.swp
.DS_Store
`);
  }

  // Initial commit (may already have content from prior usage)
  runOrFail(["git", "add", "-A"], VAULT_DIR);
  const status = run(["git", "status", "--porcelain"], VAULT_DIR);
  if (status) {
    runOrFail(["git", "commit", "-m", "genesis: initialize agence-vault"], VAULT_DIR);
  } else {
    runOrFail(["git", "commit", "--allow-empty", "-m", "genesis: initialize agence-vault"], VAULT_DIR);
  }

  // Add remote + push
  runOrFail(["git", "remote", "add", VAULT_REMOTE_NAME, remote], VAULT_DIR);
  try {
    runOrFail(["git", "push", "-u", VAULT_REMOTE_NAME, "main"], VAULT_DIR);
    stderr(`[vault] ✓ Vault initialized and pushed to ${remote}`);
  } catch {
    stderr(`[vault] ✓ Vault initialized locally.`);
    stderr(`  Push failed — retry with: agence ^vault push`);
  }

  // Emit eval-safe exports
  console.log(`export AGENCE_VAULT_DIR='${VAULT_DIR.replace(/'/g, "'\\''")}'`);
  console.log(`export AGENCE_VAULT_USER='${user.replace(/'/g, "'\\''")}'`);
  return 0;
}

function cmdSync(): number {
  if (!isGitRepo()) {
    stderr("[vault] Not initialized. Run: agence ^vault init");
    return 1;
  }

  stderr("[vault] Syncing...");

  // Pull first (rebase to keep linear history)
  const hasRemote = run(["git", "remote", "get-url", VAULT_REMOTE_NAME]);
  if (hasRemote) {
    try {
      runOrFail(["git", "pull", "--rebase", VAULT_REMOTE_NAME, "main"], VAULT_DIR);
      stderr("  ✓ Pulled");
    } catch {
      stderr("  ⚠ Pull failed (no remote content yet, or conflict)");
    }
  }

  // Stage + commit local changes
  runOrFail(["git", "add", "-A"], VAULT_DIR);
  const status = run(["git", "status", "--porcelain"], VAULT_DIR);
  if (status) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    runOrFail(["git", "commit", "-m", `vault: sync ${ts}`], VAULT_DIR);
    stderr("  ✓ Committed local changes");
  } else {
    stderr("  (no local changes)");
  }

  // Push
  if (hasRemote) {
    try {
      runOrFail(["git", "push", VAULT_REMOTE_NAME, "main"], VAULT_DIR);
      stderr("  ✓ Pushed");
    } catch {
      stderr("  ⚠ Push failed — retry later or check auth");
    }
  }

  return 0;
}

function cmdPush(): number {
  if (!isGitRepo()) {
    stderr("[vault] Not initialized. Run: agence ^vault init");
    return 1;
  }

  // Stage + commit
  runOrFail(["git", "add", "-A"], VAULT_DIR);
  const status = run(["git", "status", "--porcelain"], VAULT_DIR);
  if (status) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    runOrFail(["git", "commit", "-m", `vault: push ${ts}`], VAULT_DIR);
    stderr("[vault] Committed local changes");
  }

  // Push
  try {
    runOrFail(["git", "push", VAULT_REMOTE_NAME, "main"], VAULT_DIR);
    stderr("[vault] ✓ Pushed to remote");
    return 0;
  } catch {
    stderr("[vault] Push failed — check remote and auth");
    return 1;
  }
}

function cmdPull(): number {
  if (!isGitRepo()) {
    stderr("[vault] Not initialized. Run: agence ^vault init");
    return 1;
  }

  try {
    runOrFail(["git", "pull", "--rebase", VAULT_REMOTE_NAME, "main"], VAULT_DIR);
    stderr("[vault] ✓ Pulled from remote");
    return 0;
  } catch {
    stderr("[vault] Pull failed — check remote and auth");
    return 1;
  }
}

function cmdStatus(): number {
  stderr("");
  stderr("  ╔══════════════════════════════════════╗");
  stderr("  ║  ^vault status                       ║");
  stderr("  ╚══════════════════════════════════════╝");
  stderr("");

  stderr(`  Path:        ${VAULT_DIR}`);
  stderr(`  Initialized: ${isGitRepo() ? "✓" : "✗ (run ^vault init)"}`);

  if (!isGitRepo()) {
    stderr("");
    return 0;
  }

  const remote = run(["git", "remote", "get-url", VAULT_REMOTE_NAME]);
  stderr(`  Remote:      ${remote || "(none)"}`);

  const branch = run(["git", "branch", "--show-current"]);
  stderr(`  Branch:      ${branch || "?"}`);

  const log = run(["git", "log", "--oneline", "-1"]);
  stderr(`  Last commit: ${log || "(empty)"}`);

  // Count tracked files
  const tracked = run(["git", "ls-files"]);
  const fileCount = tracked ? tracked.split("\n").length : 0;
  stderr(`  Files:       ${fileCount}`);

  // Working tree status
  const dirty = run(["git", "status", "--porcelain"]);
  if (dirty) {
    const lines = dirty.split("\n").length;
    stderr(`  Uncommitted: ${lines} file(s)`);
  } else {
    stderr(`  Uncommitted: (clean)`);
  }

  // List org dirs
  const entries = readdirSync(VAULT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith("."))
    .map(d => d.name);
  if (entries.length > 0) {
    stderr(`  Org dirs:    ${entries.join(", ")}`);
  }

  stderr("");
  return 0;
}

function printHelp(): void {
  stderr(`vault — Hermetic user-private knowledge vault

Usage:
  agence ^vault init [--user <gh-user>]   Initialize vault + create remote
  agence ^vault sync                      Pull → commit → push
  agence ^vault push                      Commit + push
  agence ^vault pull                      Pull from remote
  agence ^vault status                    Show vault state
  agence ^vault help                      This help

The vault lives at knowledge/private/ and is backed by a private
GitHub repo under your personal account (github.com/<user>/agence-vault).
Content is org-delineated — routing rules still apply within.`);
}

// ─── CLI routing ─────────────────────────────────────────────────────────────

function main(): number {
  const args = process.argv.slice(2);
  const cmd = args[0] || "";

  switch (cmd) {
    case "init":
      return cmdInit(args.slice(1));
    case "sync":
      return cmdSync();
    case "push":
      return cmdPush();
    case "pull":
      return cmdPull();
    case "status":
      return cmdStatus();
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case "":
      printHelp();
      return 0;
    default:
      stderr(`[vault] Unknown command: ${cmd}`);
      stderr(`Run 'agence ^vault help' for usage.`);
      return 1;
  }
}

// Exports for testing
export {
  cmdInit,
  cmdSync,
  cmdPush,
  cmdPull,
  cmdStatus,
  resolveGitHubUser,
  vaultRemoteUrl,
  isGitRepo,
  VAULT_DIR,
  AGENCE_ROOT,
};

process.exit(main());
