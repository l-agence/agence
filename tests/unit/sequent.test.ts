import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const AGENCE_ROOT = join(import.meta.dir, "../..");

// Helper: run sequent.ts with args
function runSequent(...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "sequent.ts"), ...args], {
    cwd: AGENCE_ROOT,
    timeout: 15_000,
    env: { ...process.env, AGENCE_ROOT },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
  };
}

// Helper: check that sequent.ts compiles
function bunCheck(): { ok: boolean; stderr: string } {
  const r = spawnSync("bun", ["build", join(AGENCE_ROOT, "lib", "sequent.ts"), "--no-bundle"], {
    cwd: AGENCE_ROOT,
    timeout: 15_000,
  });
  return {
    ok: r.status === 0,
    stderr: r.stderr?.toString() ?? "",
  };
}

describe("sequent.ts — compilation", () => {
  test("compiles without errors", () => {
    const { ok, stderr } = bunCheck();
    expect(ok).toBe(true);
    if (!ok) console.error(stderr);
  });
});

describe("sequent.ts — CLI dispatch", () => {
  test("help exits 0 and shows usage", () => {
    const r = runSequent("help");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("Usage: airun sequent");
    expect(r.stderr).toContain("create");
    expect(r.stderr).toContain("score");
    expect(r.stderr).toContain("pick");
  });

  test("no args exits 2 with usage hint", () => {
    const r = runSequent();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage:");
  });

  test("unknown command exits 2", () => {
    const r = runSequent("bogus");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Unknown command");
  });

  test("create with invalid n exits 2", () => {
    const r = runSequent("create", "0");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("2-8");
  });

  test("create with n > 8 exits 2", () => {
    const r = runSequent("create", "9");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("2-8");
  });

  test("list exits 0 (even with no sequents)", () => {
    const r = runSequent("list");
    expect(r.status).toBe(0);
  });

  test("score with nonexistent id exits 1", () => {
    const r = runSequent("score", "nonexistent_id_12345");
    expect(r.status).toBe(1);
  });

  test("pick with nonexistent id exits 1", () => {
    const r = runSequent("pick", "nonexistent_id_12345", "tangent-1");
    expect(r.status).toBe(1);
  });

  test("destroy with nonexistent id exits 1", () => {
    const r = runSequent("destroy", "nonexistent_id_12345");
    expect(r.status).toBe(1);
  });

  test("status with nonexistent id exits 1", () => {
    const r = runSequent("status", "nonexistent_id_12345");
    expect(r.status).toBe(1);
  });
});

describe("SEC-017: sequent.ts path traversal hardening", () => {
  test("status rejects path traversal in ID", () => {
    const r = runSequent("status", "../../../etc/passwd");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("score rejects path traversal in ID", () => {
    const r = runSequent("score", "../../tmp/evil");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("pick rejects traversal in sequent ID", () => {
    const r = runSequent("pick", "../evil", "a1b2c3d4-0");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("pick rejects traversal in tangent ID", () => {
    const r = runSequent("pick", "a1b2c3d4", "../../etc/shadow");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid tangent ID");
  });

  test("destroy rejects path traversal", () => {
    const r = runSequent("destroy", "/tmp/evil");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("rejects null bytes in ID (runtime blocks spawn)", () => {
    // Node/Bun reject null bytes in spawnSync args before they reach our code.
    // This confirms the runtime-level protection is active.
    expect(() => runSequent("status", "abcd1234\x00evil")).toThrow(/null bytes/i);
  });

  test("accepts valid hex8 ID format", () => {
    // Valid format but nonexistent — should get "Not found", not "Invalid"
    const r = runSequent("status", "deadbeef");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Not found");
    expect(r.stderr).not.toContain("Invalid");
  });
});

describe("SEC-017: agentd tangent ID validation", () => {
  test("tangent create rejects path traversal", () => {
    const r = spawnSync(join(AGENCE_ROOT, "bin", "agentd"), ["tangent", "create", "../../../tmp/evil", "copilot"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
      env: { ...process.env, AGENCE_ROOT, PATH: process.env.PATH },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr?.toString()).toContain("Invalid tangent ID");
  });

  test("tangent destroy rejects path traversal", () => {
    const r = spawnSync(join(AGENCE_ROOT, "bin", "agentd"), ["tangent", "destroy", "../../etc/passwd"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
      env: { ...process.env, AGENCE_ROOT, PATH: process.env.PATH },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr?.toString()).toContain("Invalid tangent ID");
  });

  test("tangent create accepts valid hex8-N format", () => {
    // Valid format — will fail at tmux/session check, not at validation
    const r = spawnSync(join(AGENCE_ROOT, "bin", "agentd"), ["tangent", "create", "a1b2c3d4-0", "copilot"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
      env: { ...process.env, AGENCE_ROOT, PATH: process.env.PATH },
    });
    // Should NOT fail with "Invalid tangent ID" — will fail later (no tmux session)
    expect(r.stderr?.toString() ?? "").not.toContain("Invalid tangent ID");
  });
});

describe("sequent.ts — skill.ts delegation", () => {
  test("airun skill sequent help works", () => {
    const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "skill.ts"), "sequent", "help"], {
      cwd: AGENCE_ROOT,
      timeout: 15_000,
      env: { ...process.env, AGENCE_ROOT },
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(r.status).toBe(0);
    // With stdio: "inherit" in skill.ts delegation, output passes through
    // The help text goes to stderr from the child process
    const combined = (r.stdout?.toString() ?? "") + (r.stderr?.toString() ?? "");
    expect(combined).toContain("airun sequent");
  });
});

describe("SEC-016: sequent ID path traversal prevention", () => {
  test("status rejects path traversal in sequent ID", () => {
    const r = runSequent("status", "../../etc/passwd");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("score rejects path traversal in sequent ID", () => {
    const r = runSequent("score", "../../../tmp/evil");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("pick rejects path traversal in sequent ID", () => {
    const r = runSequent("pick", "../../evil", "abc12345-0");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("pick rejects path traversal in tangent ID", () => {
    const r = runSequent("pick", "abcd1234", "../../etc/shadow");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid tangent ID");
  });

  test("destroy rejects path traversal in sequent ID", () => {
    const r = runSequent("destroy", "..%2f..%2fetc");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("valid hex8 sequent ID format accepted (but not found)", () => {
    const r = runSequent("status", "deadbeef");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Not found");
    expect(r.stderr).not.toContain("Invalid");
  });

  test("sequent ID with uppercase rejected", () => {
    const r = runSequent("status", "DEADBEEF");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });

  test("sequent ID with slashes rejected", () => {
    const r = runSequent("status", "ab/cd/ef");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Invalid sequent ID");
  });
});
