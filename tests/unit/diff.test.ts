import { describe, test, expect } from "bun:test";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { unifiedDiff, colorize } from "../../lib/diff.ts";

const BUN = process.execPath;
const TMP = join(import.meta.dir, ".tmp-diff-test");

function ensureTmp(): void {
  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
}
function cleanup(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
}

// ─── unifiedDiff ─────────────────────────────────────────────────────────────

describe("unifiedDiff", () => {
  test("returns empty for identical arrays", () => {
    const lines = ["a", "b", "c"];
    expect(unifiedDiff(lines, lines)).toEqual([]);
  });

  test("detects additions", () => {
    const a = ["line1", "line2"];
    const b = ["line1", "line2", "line3"];
    const diff = unifiedDiff(a, b, "old", "new");
    expect(diff[0]).toBe("--- old");
    expect(diff[1]).toBe("+++ new");
    expect(diff.some(l => l === "+line3")).toBe(true);
  });

  test("detects deletions", () => {
    const a = ["line1", "line2", "line3"];
    const b = ["line1", "line3"];
    const diff = unifiedDiff(a, b);
    expect(diff.some(l => l === "-line2")).toBe(true);
  });

  test("detects modifications", () => {
    const a = ["hello", "world"];
    const b = ["hello", "earth"];
    const diff = unifiedDiff(a, b);
    expect(diff.some(l => l === "-world")).toBe(true);
    expect(diff.some(l => l === "+earth")).toBe(true);
  });

  test("includes context lines", () => {
    const a = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const b = ["1", "2", "3", "CHANGED", "5", "6", "7", "8"];
    const diff = unifiedDiff(a, b);
    // Should have context around the change
    expect(diff.some(l => l === " 3")).toBe(true);
    expect(diff.some(l => l === " 5")).toBe(true);
  });
});

// ─── colorize ────────────────────────────────────────────────────────────────

describe("colorize", () => {
  test("passes through plain lines unchanged (non-TTY)", () => {
    const lines = [" context", "-removed", "+added", "@@ hunk @@"];
    // In test context (non-TTY), colorize should not add ANSI
    const result = colorize(lines);
    expect(result).toContain("context");
    expect(result).toContain("-removed");
    expect(result).toContain("+added");
  });
});

// ─── CLI ─────────────────────────────────────────────────────────────────────

describe("CLI", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/diff.ts", ...args], {
      cwd: join(import.meta.dir, "../.."),
      env: process.env,
    });

  test("help prints usage", () => {
    const r = run("help");
    expect(r.stdout.toString()).toContain("Colored unified diff");
    expect(r.status).toBe(0);
  });

  test("identical files exit 0", () => {
    ensureTmp();
    const f = join(TMP, "same.txt");
    writeFileSync(f, "identical\ncontent\n");
    const r = run(f, f);
    expect(r.stdout.toString()).toContain("identical");
    expect(r.status).toBe(0);
    cleanup();
  });

  test("different files exit 1 with diff output", () => {
    ensureTmp();
    const fa = join(TMP, "a.txt");
    const fb = join(TMP, "b.txt");
    writeFileSync(fa, "line1\nline2\n");
    writeFileSync(fb, "line1\nchanged\n");
    const r = run(fa, fb);
    expect(r.stdout.toString()).toContain("-line2");
    expect(r.stdout.toString()).toContain("+changed");
    expect(r.status).toBe(1);
    cleanup();
  });

  test("missing file prints error", () => {
    const r = run("/tmp/nonexistent-agence-test-file", "/tmp/also-missing");
    expect(r.stderr.toString()).toContain("File not found");
    expect(r.status).toBe(1);
  });

  test("no args prints usage error", () => {
    const r = run();
    expect(r.stderr.toString()).toContain("Usage:");
    expect(r.status).toBe(2);
  });
});

// ─── Skill delegation ────────────────────────────────────────────────────────

describe("skill delegation", () => {
  test("skill diff help routes correctly", () => {
    const r = spawnSync(BUN, ["run", "lib/skill.ts", "diff", "help"], {
      cwd: join(import.meta.dir, "../.."),
      env: process.env,
    });
    expect(r.stdout.toString()).toContain("Colored unified diff");
    expect(r.status).toBe(0);
  });
});
