import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, utimesSync, rmSync } from "fs";
import { join } from "path";
import { circularEvict, circularEvictBySize, runGC, gcStatus } from "../../lib/session.ts";

const TMP = join(import.meta.dir, ".tmp-gc-test");

function ensureClean(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });
}

function touchFile(dir: string, name: string, content: string = "x", ageMs: number = 0): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, content);
  if (ageMs > 0) {
    const past = new Date(Date.now() - ageMs);
    utimesSync(p, past, past);
  }
  return p;
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) n += countFiles(join(dir, ent.name));
    else n++;
  }
  return n;
}

beforeEach(ensureClean);
afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true }); });

// ─── circularEvict ───────────────────────────────────────────────────────────

describe("circularEvict", () => {
  test("no-op when under cap", () => {
    touchFile(TMP, "a.txt", "hi");
    touchFile(TMP, "b.txt", "ho");
    const r = circularEvict(TMP, 5, false);
    expect(r.evicted).toBe(0);
    expect(r.before).toBe(2);
    expect(r.after).toBe(2);
    expect(countFiles(TMP)).toBe(2);
  });

  test("evicts oldest files to reach cap", () => {
    // Create 5 files with staggered ages
    for (let i = 0; i < 5; i++) {
      touchFile(TMP, `f${i}.txt`, `data-${i}`, (5 - i) * 10_000); // f0 oldest
    }
    const r = circularEvict(TMP, 3, false);
    expect(r.evicted).toBe(2);
    expect(r.after).toBe(3);
    expect(countFiles(TMP)).toBe(3);
    // Oldest two should be gone
    expect(existsSync(join(TMP, "f0.txt"))).toBe(false);
    expect(existsSync(join(TMP, "f1.txt"))).toBe(false);
    // Newest three remain
    expect(existsSync(join(TMP, "f2.txt"))).toBe(true);
    expect(existsSync(join(TMP, "f3.txt"))).toBe(true);
    expect(existsSync(join(TMP, "f4.txt"))).toBe(true);
  });

  test("dry-run does not delete", () => {
    for (let i = 0; i < 4; i++) {
      touchFile(TMP, `f${i}.txt`, "x", (4 - i) * 10_000);
    }
    const r = circularEvict(TMP, 2, true);
    expect(r.evicted).toBe(2);
    expect(r.freed_bytes).toBeGreaterThan(0);
    // All files still exist
    expect(countFiles(TMP)).toBe(4);
  });

  test("filter limits which files are considered", () => {
    touchFile(TMP, "keep.json", "data", 50_000);
    touchFile(TMP, "old.txt", "data", 40_000);
    touchFile(TMP, "new.txt", "data", 1_000);
    // Only consider .txt files — cap 1, so evict oldest .txt
    const r = circularEvict(TMP, 1, false, (f) => f.endsWith(".txt"));
    expect(r.evicted).toBe(1);
    expect(existsSync(join(TMP, "old.txt"))).toBe(false);
    expect(existsSync(join(TMP, "keep.json"))).toBe(true);
    expect(existsSync(join(TMP, "new.txt"))).toBe(true);
  });

  test("handles non-existent directory gracefully", () => {
    const r = circularEvict("/tmp/does-not-exist-gc-test-xyz", 10, false);
    expect(r.evicted).toBe(0);
    expect(r.before).toBe(0);
  });

  test("walks subdirectories", () => {
    const sub = join(TMP, "sub");
    touchFile(sub, "a.txt", "x", 50_000);
    touchFile(sub, "b.txt", "x", 40_000);
    touchFile(TMP, "c.txt", "x", 30_000);
    touchFile(TMP, "d.txt", "x", 20_000);
    touchFile(TMP, "e.txt", "x", 10_000);
    const r = circularEvict(TMP, 2, false);
    expect(r.evicted).toBe(3);
    expect(r.after).toBe(2);
  });
});

// ─── circularEvictBySize ─────────────────────────────────────────────────────

describe("circularEvictBySize", () => {
  test("no-op when under size cap", () => {
    touchFile(TMP, "small.txt", "abc");
    const r = circularEvictBySize(TMP, 1024 * 1024, false); // 1MB cap
    expect(r.evicted).toBe(0);
  });

  test("evicts oldest until under byte cap", () => {
    const big = "x".repeat(1000);
    for (let i = 0; i < 10; i++) {
      touchFile(TMP, `f${i}.txt`, big, (10 - i) * 10_000);
    }
    // Total = 10 * 1000 = 10000. Cap at 5000 → need to evict ~5 files
    const r = circularEvictBySize(TMP, 5000, false);
    expect(r.evicted).toBe(5);
    expect(r.freed_bytes).toBe(5000);
    expect(countFiles(TMP)).toBe(5);
  });

  test("dry-run reports but keeps files", () => {
    const big = "x".repeat(500);
    for (let i = 0; i < 6; i++) {
      touchFile(TMP, `f${i}.txt`, big, (6 - i) * 10_000);
    }
    const r = circularEvictBySize(TMP, 1500, true);
    expect(r.evicted).toBe(3);
    expect(countFiles(TMP)).toBe(6); // nothing deleted
  });
});

// ─── runGC (integration with env-driven caps) ────────────────────────────────

describe("runGC", () => {
  test("respects caps and returns structured report", () => {
    // We can't easily mock the real nexus dirs, but runGC should always return
    // a well-formed report even in dry-run mode
    const report = runGC(true);
    expect(report).toHaveProperty("sessions");
    expect(report).toHaveProperty("signals");
    expect(report).toHaveProperty("logs");
    expect(report).toHaveProperty("cost");
    expect(report).toHaveProperty("total_size");
    expect(report).toHaveProperty("total_freed_bytes");
    expect(report).toHaveProperty("total_evicted");
    expect(typeof report.total_freed_bytes).toBe("number");
    expect(typeof report.total_evicted).toBe("number");
  });

  test("report fields have correct structure", () => {
    const report = runGC(true);
    for (const key of ["sessions", "signals", "logs", "cost", "total_size"] as const) {
      const r = report[key];
      expect(r).toHaveProperty("dir");
      expect(r).toHaveProperty("before");
      expect(r).toHaveProperty("after");
      expect(r).toHaveProperty("evicted");
      expect(r).toHaveProperty("freed_bytes");
      expect(r.before).toBeGreaterThanOrEqual(r.after);
      expect(r.evicted).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── gcStatus ────────────────────────────────────────────────────────────────

describe("gcStatus", () => {
  test("returns buffer fill info", () => {
    const s = gcStatus();
    expect(s).toHaveProperty("sessions");
    expect(s).toHaveProperty("signals");
    expect(s).toHaveProperty("logs");
    expect(s).toHaveProperty("cost");
    expect(s).toHaveProperty("total_mb");
    expect(s.sessions.cap).toBe(200);
    expect(s.signals.cap).toBe(500);
    expect(s.logs.cap).toBe(100);
    expect(s.cost.cap).toBe(90);
    expect(s.total_mb.cap).toBe(100);
    expect(typeof s.sessions.count).toBe("number");
    expect(typeof s.total_mb.size).toBe("number");
  });
});

// ─── CLI dispatch (spawn-based) ──────────────────────────────────────────────

describe("CLI dispatch", () => {
  test("gc --dry-run exits 0 and outputs JSON", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/session.ts", "gc", "--dry-run"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    if (stdout.trim()) {
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty("total_evicted");
    }
  });

  test("gc-status exits 0 with buffer info", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/session.ts", "gc-status"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    expect(stdout).toContain("[gc] Buffer usage:");
    expect(stdout).toContain("sessions:");
    expect(stdout).toContain("signals:");
  });
});
