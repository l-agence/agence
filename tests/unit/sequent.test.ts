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
