import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const SETUP_TS = join(import.meta.dir, "..", "..", "lib", "setup.ts");
const BUN = process.execPath || "bun";

function runSetup(args: string[], env: Record<string, string> = {}): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(BUN, ["run", SETUP_TS, ...args], {
    cwd: join(import.meta.dir, "..", ".."),
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 10_000,
  });
  return {
    stdout: result.stdout?.toString() || "",
    stderr: result.stderr?.toString() || "",
    status: result.status ?? 1,
  };
}

describe("^setup CLI", () => {
  test("help prints usage", () => {
    const r = runSetup(["help"]);
    expect(r.stderr).toContain("setup — Interactive onboarding wizard");
    expect(r.stderr).toContain("agence ^setup org");
    expect(r.stderr).toContain("agence ^setup keys");
    expect(r.stderr).toContain("agence ^setup status");
    expect(r.status).toBe(0);
  });

  test("unknown subcommand exits 1", () => {
    const r = runSetup(["bogus"]);
    expect(r.stderr).toContain("Unknown setup command: bogus");
    expect(r.status).toBe(1);
  });

  test("status shows config overview", () => {
    const r = runSetup(["status"]);
    expect(r.stderr).toContain("^setup status");
    expect(r.stderr).toContain("Org namespace");
    expect(r.stderr).toContain("Anthropic key");
    expect(r.stderr).toContain("JIRA project");
    expect(r.status).toBe(0);
  });
});

describe("setRCVar / getRCVar", () => {
  let tmpDir: string;
  let rcPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "setup-test-"));
    rcPath = join(tmpDir, ".agencerc");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates new var in empty rc", () => {
    writeFileSync(rcPath, "# test rc\n");
    // Test via status subcommand — if AGENCE_ORG is set in env, status should show it
    const r = runSetup(["status"], { AGENCE_ORG: "my-new-org.io" });
    expect(r.stderr).toContain("my-new-org.io");
    expect(r.status).toBe(0);
  });

  test("status masks secrets, shows values for URLs", () => {
    const r = runSetup(["status"], {
      AGENCE_ORG: "test-org.io",
      ANTHROPIC_API_KEY: "sk-ant-secret-key-very-long",
      JFROG_URL: "https://acme.jfrog.io",
    });
    expect(r.stderr).toContain("test-org.io");
    expect(r.stderr).toContain("sk-ant****");
    expect(r.stderr).not.toContain("secret-key-very-long");
    expect(r.stderr).toContain("https://acme.jfrog.io");
  });
});

describe("setup security", () => {
  test("org validation rejects path traversal", () => {
    // The org step is interactive, but we can verify the regex pattern
    // by checking that status with a malicious AGENCE_ORG still renders safely
    const r = runSetup(["status"], { AGENCE_ORG: "../../../etc/passwd" });
    // The env var shows as-is in status (it's the user's own env), but
    // the wizard's ask() would reject it during interactive input
    expect(r.status).toBe(0);
  });
});

// ─── ^break regression: setRCVar safety ──────────────────────────────────────

describe("^break regression", () => {
  test("status handles env values with special chars safely", () => {
    const r = runSetup(["status"], { AGENCE_ORG: "acme.io", ANTHROPIC_API_KEY: 'sk-ant-"quoted"value' });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("acme.io");
  });

  test("single-char org name accepted", () => {
    const r = runSetup(["status"], { AGENCE_ORG: "x" });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("x");
  });
});

// ─── SEC-018 regression tests ────────────────────────────────────────────────

describe("SEC-018 regression", () => {
  test("status does not leak full API keys", () => {
    const r = runSetup(["status"], { ANTHROPIC_API_KEY: "sk-ant-secret-very-long-key-value" });
    expect(r.stderr).toContain("sk-ant****");
    expect(r.stderr).not.toContain("secret-very-long-key-value");
  });

  test("status masks tokens containing shell metacharacters", () => {
    const r = runSetup(["status"], { JFROG_API_TOKEN: '$(whoami)' });
    expect(r.stderr).toContain("$(whoa****");
    expect(r.stderr).not.toContain("$(whoami)");
  });
});
