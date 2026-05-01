import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync, execSync } from "child_process";

const VAULT_TS = join(import.meta.dir, "..", "..", "lib", "vault.ts");
const BUN = process.execPath || "bun";

function runVault(
  args: string[],
  env: Record<string, string> = {},
  cwd?: string
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(BUN, ["run", VAULT_TS, ...args], {
    cwd: cwd || join(import.meta.dir, "..", ".."),
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15_000,
  });
  return {
    stdout: result.stdout?.toString() || "",
    stderr: result.stderr?.toString() || "",
    status: result.status ?? 1,
  };
}

describe("^vault CLI routing", () => {
  test("help prints usage", () => {
    const r = runVault(["help"]);
    expect(r.stderr).toContain("vault — Hermetic user-private knowledge vault");
    expect(r.stderr).toContain("agence ^vault init");
    expect(r.stderr).toContain("agence ^vault sync");
    expect(r.stderr).toContain("agence ^vault status");
    expect(r.status).toBe(0);
  });

  test("no args prints help", () => {
    const r = runVault([]);
    expect(r.stderr).toContain("vault — Hermetic user-private knowledge vault");
    expect(r.status).toBe(0);
  });

  test("unknown subcommand exits 1", () => {
    const r = runVault(["bogus"]);
    expect(r.stderr).toContain("Unknown command: bogus");
    expect(r.status).toBe(1);
  });
});

describe("^vault init", () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });
    // Make tmpDir a git repo so commands work
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("fails without user when env vars empty and no --user", () => {
    const r = runVault(["init"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      AGENCE_VAULT_USER: "",
      GITHUB_USER: "",
      HOME: "/tmp/nonexistent-home-vault-test",  // gh won't find creds
      XDG_CONFIG_HOME: "/tmp/nonexistent-home-vault-test/.config",
    });
    // Should fail to resolve user (gh will fail without auth)
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Cannot determine GitHub username");
  });

  test("rejects invalid GitHub username", () => {
    const r = runVault(["init", "--user", "-bad-user!"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Invalid GitHub username");
    expect(r.status).toBe(1);
  });

  test("initializes nested git repo in vault dir (offline, no push)", () => {
    // Use a fake remote that won't connect
    const r = runVault(["init", "--user", "testuser"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      // Disable gh repo create by removing gh from PATH
      GH_TOKEN: "fake",
    });
    // Should attempt init regardless of push/remote failure
    expect(r.stderr).toContain("Initializing hermetic vault");
    expect(r.stderr).toContain("testuser");
    // Vault dir should now have .git
    expect(existsSync(join(vaultDir, ".git"))).toBe(true);
    // Should have a .gitignore
    expect(existsSync(join(vaultDir, ".gitignore"))).toBe(true);
    // Should have at least one commit
    const log = execSync("git log --oneline", { cwd: vaultDir, encoding: "utf-8" });
    expect(log).toContain("genesis");
  });

  test("idempotent — second init is a no-op", () => {
    // First init
    runVault(["init", "--user", "testuser"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GH_TOKEN: "fake",
    });
    // Second init
    const r = runVault(["init", "--user", "testuser"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GH_TOKEN: "fake",
    });
    expect(r.stderr).toContain("already initialized");
    expect(r.status).toBe(0);
  });

  test("emits export vars on success", () => {
    const r = runVault(["init", "--user", "testuser"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GH_TOKEN: "fake",
    });
    expect(r.stdout).toContain("export AGENCE_VAULT_DIR=");
    expect(r.stdout).toContain("export AGENCE_VAULT_USER='testuser'");
  });
});

describe("^vault status", () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("shows not initialized when no .git", () => {
    const r = runVault(["status"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Initialized: ✗");
    expect(r.status).toBe(0);
  });

  test("shows details when initialized", () => {
    // Init first
    runVault(["init", "--user", "testuser"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GH_TOKEN: "fake",
    });
    const r = runVault(["status"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Initialized: ✓");
    expect(r.stderr).toContain("Branch:");
    expect(r.stderr).toContain("Last commit:");
    expect(r.stderr).toContain("Files:");
    expect(r.status).toBe(0);
  });
});

describe("^vault sync/push/pull guards", () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("sync fails if not initialized", () => {
    const r = runVault(["sync"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Not initialized");
    expect(r.status).toBe(1);
  });

  test("push fails if not initialized", () => {
    const r = runVault(["push"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Not initialized");
    expect(r.status).toBe(1);
  });

  test("pull fails if not initialized", () => {
    const r = runVault(["pull"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Not initialized");
    expect(r.status).toBe(1);
  });
});

describe("^vault sync with initialized repo", () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });
    // Init vault
    runVault(["init", "--user", "testuser"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GH_TOKEN: "fake",
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("sync commits new local files", () => {
    // Remove remote so git pull doesn't hang on unreachable network
    execSync("git remote remove origin", { cwd: vaultDir, stdio: "pipe" });
    // Add a file
    writeFileSync(join(vaultDir, "test-note.md"), "# Test\n");
    const r = runVault(["sync"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GIT_TERMINAL_PROMPT: "0",
    });
    expect(r.stderr).toContain("Committed local changes");
    // Verify it's in git log
    const log = execSync("git log --oneline", { cwd: vaultDir, encoding: "utf-8" });
    expect(log).toContain("vault: sync");
  });

  test("sync is clean when no changes", () => {
    // Remove remote so git pull doesn't hang on unreachable network
    execSync("git remote remove origin", { cwd: vaultDir, stdio: "pipe" });
    const r = runVault(["sync"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GIT_TERMINAL_PROMPT: "0",
    });
    expect(r.stderr).toContain("no local changes");
  });
});

describe("vaultRemoteUrl", () => {
  test("constructs correct URL", () => {
    // We test via init output since it prints the remote
    const tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    const vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });

    const r = runVault(["init", "--user", "alice"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
      GH_TOKEN: "fake",
    });
    expect(r.stderr).toContain("https://github.com/alice/agence-vault.git");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("^vault security", () => {
  test("rejects forbidden system paths", () => {
    const r = runVault(["status"], {
      AGENCE_VAULT_DIR: "/etc",
    });
    expect(r.stderr).toContain("FATAL: Refusing to use unsafe vault path");
    expect(r.status).not.toBe(0);
  });

  test("rejects root path", () => {
    const r = runVault(["status"], {
      AGENCE_VAULT_DIR: "/",
    });
    expect(r.stderr).toContain("FATAL: Refusing to use unsafe vault path");
    expect(r.status).not.toBe(0);
  });

  test("username with shell metacharacters is rejected by regex", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    const vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });

    const r = runVault(["init", "--user", "user;rm -rf /"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Invalid GitHub username");
    expect(r.status).toBe(1);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("username with backtick injection is rejected", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vault-test-"));
    const vaultDir = join(tmpDir, "knowledge", "private");
    mkdirSync(vaultDir, { recursive: true });

    const r = runVault(["init", "--user", "`whoami`"], {
      AGENCE_ROOT: tmpDir,
      AGENCE_VAULT_DIR: vaultDir,
    });
    expect(r.stderr).toContain("Invalid GitHub username");
    expect(r.status).toBe(1);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
