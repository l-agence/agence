// tests/unit/memory.test.ts — Memory subsystem unit tests
//
// Tests for lib/memory.ts: retain, recall, cache, forget, promote, stats
// Uses isolated temp directories to avoid touching real stores.
//
// New model (v0.7.0): 2 persistent stores (shared, private) + 1 working cache.
//   shared  → knowledge/@/memory/shared.jsonl    (git-committed)
//   private → knowledge/private/memory/private.jsonl (local-only)
//   working → nexus/memory/working.jsonl          (ephemeral cache)

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const AGENCE_ROOT = join(import.meta.dir, "..", "..");
const MEMORY_TS = join(AGENCE_ROOT, "lib", "memory.ts");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create an isolated AGENCE_ROOT with all store directories */
function makeTempRoot(): string {
  const tmp = join(import.meta.dir, `_mem_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  // knowledge/@/ needs to be a real dir (tests don't use symlink)
  mkdirSync(join(tmp, "knowledge", "@", "memory"), { recursive: true });
  mkdirSync(join(tmp, "knowledge", "private", "memory"), { recursive: true });
  mkdirSync(join(tmp, "nexus", "memory"), { recursive: true });
  return tmp;
}

function cleanTempRoot(tmp: string): void {
  if (tmp.includes("_mem_test_")) {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Run lib/memory.ts with a custom AGENCE_ROOT */
function runMemory(tmp: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const r = spawnSync("bun", ["run", MEMORY_TS, ...args], {
    cwd: tmp,
    env: { ...process.env, AGENCE_ROOT: tmp },
    timeout: 10_000,
  });
  return {
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
    exitCode: r.status ?? 1,
  };
}

/** Read a JSONL store file and parse rows */
function readJsonl(path: string): any[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

/** Store paths for direct JSONL seeding */
const STORE_PATHS: Record<string, { dir: string; file: string }> = {
  shared:  { dir: "knowledge/@/memory",       file: "shared.jsonl" },
  private: { dir: "knowledge/private/memory",  file: "private.jsonl" },
};
const ID_PREFIX: Record<string, string> = { shared: "sh", private: "pr" };
let seedCounter = 0;

/** Seed a row directly into JSONL (no subprocess, fast for hooks) */
function seedRow(tmp: string, source: string, tags: string[], content: string, opts?: { importance?: number; polarity?: string }) {
  const cfg = STORE_PATHS[source];
  const filePath = join(tmp, cfg.dir, cfg.file);
  const row = {
    id: `${ID_PREFIX[source]}-seed${++seedCounter}`,
    tags,
    content,
    source,
    importance: opts?.importance ?? 0.5,
    polarity: opts?.polarity ?? "positive",
    ts: Date.now(),
  };
  const { appendFileSync } = require("fs");
  appendFileSync(filePath, JSON.stringify(row) + "\n", "utf-8");
  return row;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Memory: ^retain", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("stores a row in shared", () => {
    const r = runMemory(tmp, ["retain", "shared", "jwt,auth", "JWT tokens expire after 24h"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Retained:");
    expect(r.stdout).toContain("shared");

    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].tags).toEqual(["jwt", "auth"]);
    expect(rows[0].content).toBe("JWT tokens expire after 24h");
    expect(rows[0].source).toBe("shared");
    expect(rows[0].id).toMatch(/^sh-/);
  });

  it("stores in private", () => {
    const r = runMemory(tmp, ["retain", "private", "personal,note", "My private thought"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "knowledge", "private", "memory", "private.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("private");
    expect(rows[0].id).toMatch(/^pr-/);
  });

  it("rejects invalid source", () => {
    const r = runMemory(tmp, ["retain", "bogus", "tag", "content"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid source");
  });

  it("rejects empty tags", () => {
    const r = runMemory(tmp, ["retain", "shared", "", "content"]);
    expect(r.exitCode).toBe(1);
  });

  it("rejects missing content", () => {
    const r = runMemory(tmp, ["retain", "shared", "tag"]);
    expect(r.exitCode).toBe(1);
  });

  it("supports --importance flag", () => {
    const r = runMemory(tmp, ["retain", "shared", "critical,finding", "--importance 0.9 This is very important"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(rows[0].importance).toBe(0.9);
  });

  it("supports --negative polarity", () => {
    const r = runMemory(tmp, ["retain", "shared", "antipattern,deploy", "--negative Never use force push on main"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(rows[0].polarity).toBe("negative");
  });

  it("appends multiple rows to same store", () => {
    runMemory(tmp, ["retain", "shared", "jwt", "Row 1"]);
    runMemory(tmp, ["retain", "shared", "jwt", "Row 2"]);
    runMemory(tmp, ["retain", "shared", "auth", "Row 3"]);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(rows.length).toBe(3);
  });

  it("rejects tag with special characters", () => {
    const r = runMemory(tmp, ["retain", "shared", "../traversal", "content"]);
    expect(r.exitCode).toBe(1);
  });
});

describe("Memory: ^recall", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempRoot();
    runMemory(tmp, ["retain", "shared", "jwt,auth", "JWT best practices"]);
    runMemory(tmp, ["retain", "shared", "jwt,timeout", "JWT timeout is 24h"]);
    runMemory(tmp, ["retain", "private", "jwt,fix", "JWT refresh token pattern"]);
    runMemory(tmp, ["retain", "shared", "deploy,k8s", "Deployed v0.5.0"]);
    runMemory(tmp, ["retain", "shared", "antipattern,jwt", "--negative Bad JWT pattern"]);
  });
  afterEach(() => { cleanTempRoot(tmp); });

  it("finds rows by single tag across stores", () => {
    const r = runMemory(tmp, ["recall", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("jwt");
    expect(r.stdout).toContain("JWT best practices");
    expect(r.stdout).toContain("JWT timeout is 24h");
    expect(r.stdout).toContain("JWT refresh token pattern");
    expect(r.stdout).not.toContain("Bad JWT pattern");
  });

  it("finds rows by multiple tags (intersection scores higher)", () => {
    const r = runMemory(tmp, ["recall", "jwt,auth"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("JWT best practices");
  });

  it("filters by --source", () => {
    const r = runMemory(tmp, ["recall", "jwt", "--source", "private"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("JWT refresh token pattern");
    expect(r.stdout).not.toContain("JWT best practices");
  });

  it("respects --max limit", () => {
    const r = runMemory(tmp, ["recall", "jwt", "--max", "1"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("1 memory");
  });

  it("includes negative with --negative flag", () => {
    const r = runMemory(tmp, ["recall", "jwt", "--negative"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Bad JWT pattern");
  });

  it("returns empty for non-matching tags", () => {
    const r = runMemory(tmp, ["recall", "nonexistent"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("No matching");
  });
});

describe("Memory: ^cache", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempRoot();
    seedRow(tmp, "shared", ["jwt", "auth"], "JWT knowledge");
    seedRow(tmp, "shared", ["jwt", "fix"], "JWT fix pattern");
    seedRow(tmp, "shared", ["antipattern", "jwt"], "Bad approach", { polarity: "negative" });
    seedRow(tmp, "private", ["jwt", "private"], "Private JWT note");
  });
  afterEach(() => { cleanTempRoot(tmp); });

  it("hydrates working from all stores (except private by default)", () => {
    const r = runMemory(tmp, ["cache", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Cached");

    const wkRows = readJsonl(join(tmp, "nexus", "memory", "working.jsonl"));
    expect(wkRows.length).toBe(2);

    const contents = wkRows.map((r: any) => r.content);
    expect(contents).not.toContain("Bad approach");
    expect(contents).not.toContain("Private JWT note");
  });

  it("includes private with --private flag", () => {
    const r = runMemory(tmp, ["cache", "jwt", "--private"]);
    expect(r.exitCode).toBe(0);

    const wkRows = readJsonl(join(tmp, "nexus", "memory", "working.jsonl"));
    const sources = wkRows.map((r: any) => r.source);
    expect(sources).toContain("private");
  });

  it("respects --max limit", () => {
    const r = runMemory(tmp, ["cache", "jwt", "--max", "1"]);
    expect(r.exitCode).toBe(0);
    const wkRows = readJsonl(join(tmp, "nexus", "memory", "working.jsonl"));
    expect(wkRows.length).toBe(1);
  });

  it("overwrites previous working on re-cache", () => {
    runMemory(tmp, ["cache", "jwt"]);
    const first = readJsonl(join(tmp, "nexus", "memory", "working.jsonl"));
    expect(first.length).toBe(2);

    runMemory(tmp, ["retain", "shared", "jwt,new", "New JWT insight"]);
    runMemory(tmp, ["cache", "jwt"]);
    const second = readJsonl(join(tmp, "nexus", "memory", "working.jsonl"));
    expect(second.length).toBe(3);
  });
});

describe("Memory: ^forget", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("removes a row by ID", () => {
    runMemory(tmp, ["retain", "shared", "jwt", "To be forgotten"]);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(rows.length).toBe(1);
    const id = rows[0].id;

    const r = runMemory(tmp, ["forget", id, "shared"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Forgot");

    const after = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(after.length).toBe(0);
  });

  it("preserves other rows when forgetting one", () => {
    runMemory(tmp, ["retain", "shared", "a", "Row A"]);
    runMemory(tmp, ["retain", "shared", "b", "Row B"]);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(rows.length).toBe(2);
    const idA = rows[0].id;

    runMemory(tmp, ["forget", idA, "shared"]);
    const after = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(after.length).toBe(1);
    expect(after[0].content).toBe("Row B");
  });

  it("fails for non-existent ID", () => {
    const r = runMemory(tmp, ["forget", "sh-nonexistent", "shared"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Not found");
  });

  it("fails for invalid source", () => {
    const r = runMemory(tmp, ["forget", "sh-123", "bogus"]);
    expect(r.exitCode).toBe(1);
  });
});

describe("Memory: ^promote", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("moves row from private to shared", () => {
    runMemory(tmp, ["retain", "private", "insight,security", "Important private finding"]);
    const prRows = readJsonl(join(tmp, "knowledge", "private", "memory", "private.jsonl"));
    expect(prRows.length).toBe(1);
    const id = prRows[0].id;

    const r = runMemory(tmp, ["promote", id, "private", "shared"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Promoted");

    const prAfter = readJsonl(join(tmp, "knowledge", "private", "memory", "private.jsonl"));
    expect(prAfter.length).toBe(0);

    const shRows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(shRows.length).toBe(1);
    expect(shRows[0].id).toMatch(/^sh-/);
    expect(shRows[0].source).toBe("shared");
    expect(shRows[0].content).toBe("Important private finding");
  });

  it("rejects same-store promote", () => {
    runMemory(tmp, ["retain", "shared", "tag", "content"]);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    const r = runMemory(tmp, ["promote", rows[0].id, "shared", "shared"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("same store");
  });

  it("fails for non-existent ID", () => {
    const r = runMemory(tmp, ["promote", "pr-nonexistent", "private", "shared"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Not found");
  });
});

describe("Memory: list & stats", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempRoot();
    runMemory(tmp, ["retain", "shared", "a", "Row 1"]);
    runMemory(tmp, ["retain", "shared", "b", "Row 2"]);
    runMemory(tmp, ["retain", "private", "c", "Row 3"]);
  });
  afterEach(() => { cleanTempRoot(tmp); });

  it("lists rows in a store", () => {
    const r = runMemory(tmp, ["list", "shared"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("2 rows");
    expect(r.stdout).toContain("Row 1");
    expect(r.stdout).toContain("Row 2");
  });

  it("shows empty for unused store", () => {
    const fresh = makeTempRoot();
    const r = runMemory(fresh, ["list", "private"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("empty");
    cleanTempRoot(fresh);
  });

  it("shows stats across all stores", () => {
    const r = runMemory(tmp, ["stats"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("shared");
    expect(r.stdout).toContain("private");
    expect(r.stdout).toContain("total");
  });
});

describe("Memory: schema validation", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("row has correct schema fields", () => {
    runMemory(tmp, ["retain", "shared", "test,schema", "Schema check content"]);
    const rows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    const row = rows[0];
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("tags");
    expect(row).toHaveProperty("content");
    expect(row).toHaveProperty("source");
    expect(row).toHaveProperty("importance");
    expect(row).toHaveProperty("polarity");
    expect(row).toHaveProperty("ts");
    expect(typeof row.ts).toBe("number");
    expect(row.ts).toBeGreaterThan(1700000000000);
  });

  it("rejects content exceeding 64KB", () => {
    const bigContent = "x".repeat(65 * 1024);
    const r = runMemory(tmp, ["retain", "shared", "big", bigContent]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("too large");
  });

  it("rejects more than 16 tags", () => {
    const manyTags = Array.from({ length: 17 }, (_, i) => `tag${i}`).join(",");
    const r = runMemory(tmp, ["retain", "shared", manyTags, "content"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Too many tags");
  });

  it("survives malformed JSONL lines", () => {
    const storePath = join(tmp, "knowledge", "@", "memory", "shared.jsonl");
    writeFileSync(storePath, '{"broken json\n{"id":"sh-1","tags":["ok"],"content":"good","source":"shared","ts":1}\n');

    const r = runMemory(tmp, ["list", "shared"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("1 row");
  });
});

describe("Memory: help", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("shows help text", () => {
    const r = runMemory(tmp, ["help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain("retain");
    expect(r.stderr).toContain("recall");
    expect(r.stderr).toContain("cache");
    expect(r.stderr).toContain("forget");
    expect(r.stderr).toContain("promote");
  });

  it("shows help on no args", () => {
    const r = runMemory(tmp, []);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Usage:");
  });
});

// ─── MEM-003: Memory-aware skill context ─────────────────────────────────────

describe("Memory: MEM-003 skill context integration", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("skill.ts compiles with memory imports", () => {
    const SKILL_TS = join(AGENCE_ROOT, "lib", "skill.ts");
    const r = spawnSync("bun", ["build", SKILL_TS, "--no-bundle"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
    });
    expect(r.status).toBe(0);
    const out = r.stdout?.toString() ?? "";
    expect(out).toContain("readWorking");
    expect(out).toContain("buildMemoryContext");
    expect(out).toContain("retainReconFindings");
  });

  it("grasp recalls from all stores when memory exists", () => {
    runMemory(tmp, ["retain", "shared", "jwt,auth", "JWT tokens use RS256 signatures"]);
    runMemory(tmp, ["retain", "private", "jwt,refresh", "Rotate refresh tokens daily"]);

    const r = runMemory(tmp, ["recall", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("JWT tokens use RS256");
    expect(r.stdout).toContain("Rotate refresh tokens");
  });

  it("glimpse reads from working cache", () => {
    seedRow(tmp, "shared", ["deploy", "k8s"], "Use rolling updates");
    seedRow(tmp, "shared", ["deploy", "helm"], "Helm chart patterns");
    runMemory(tmp, ["cache", "deploy"]);

    const wkPath = join(tmp, "nexus", "memory", "working.jsonl");
    expect(existsSync(wkPath)).toBe(true);
    const rows = readFileSync(wkPath, "utf-8").split("\n").filter(l => l.trim());
    expect(rows.length).toBe(2);
  });

  it("recon auto-retain writes to shared store", () => {
    runMemory(tmp, ["retain", "shared", "recon,api,security", "API surface: 12 endpoints, 3 unauthenticated"]);

    const r = runMemory(tmp, ["list", "shared"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("API surface");
    expect(r.stdout).toContain("recon");
  });

  it("memory context is bounded (no infinite injection)", () => {
    for (let i = 0; i < 25; i++) {
      seedRow(tmp, "shared", ["test"], `Row ${i} with some padding content to consume budget bytes`);
    }
    const r = runMemory(tmp, ["recall", "test", "--max", "25"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("25 memories");
    const r2 = runMemory(tmp, ["recall", "test"]);
    expect(r2.stdout).toContain("20 memories");
  });
});

// ─── MEM-004: Distill (promotion pipelines) ──────────────────────────────────

describe("Memory: ^distill", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("distills private → shared by importance", () => {
    runMemory(tmp, ["retain", "private", "insight,security", "--importance 0.8 Key architecture decision"]);
    runMemory(tmp, ["retain", "private", "trivial,note", "--importance 0.3 Minor formatting fix"]);
    runMemory(tmp, ["retain", "private", "pattern,reusable", "--importance 0.9 Reusable error handling"]);

    const r = runMemory(tmp, ["distill", "private", "shared", "--min-importance", "0.7", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 2");

    const prRows = readJsonl(join(tmp, "knowledge", "private", "memory", "private.jsonl"));
    expect(prRows.length).toBe(1);
    expect(prRows[0].content).toContain("Minor formatting fix");

    const shRows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(shRows.length).toBe(2);
    expect(shRows.map((r: any) => r.id).every((id: string) => id.startsWith("sh-"))).toBe(true);
  });

  it("rejects invalid promotion path (shared→private)", () => {
    const r = runMemory(tmp, ["distill", "shared", "private"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid promotion path");
  });

  it("rejects same-store distill", () => {
    const r = runMemory(tmp, ["distill", "shared", "shared"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("same store");
  });

  it("skips negative polarity rows", () => {
    runMemory(tmp, ["retain", "private", "antipattern", "--importance 0.9 --negative Bad approach"]);
    runMemory(tmp, ["retain", "private", "pattern", "--importance 0.8 Good approach"]);

    const r = runMemory(tmp, ["distill", "private", "shared", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1");
  });

  it("deduplicates against target store", () => {
    seedRow(tmp, "shared", ["jwt", "auth"], "JWT tokens use RS256 signatures for secure authentication");
    seedRow(tmp, "private", ["jwt", "auth"], "JWT tokens use RS256 signatures for secure authentication pattern", { importance: 0.8 });

    const r = runMemory(tmp, ["distill", "private", "shared", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Duplicates: 1");
  });

  it("dry-run previews without moving", () => {
    runMemory(tmp, ["retain", "private", "insight", "--importance 0.8 Important finding"]);

    const r = runMemory(tmp, ["distill", "private", "shared", "--min-age-days", "0", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[dry-run]");
    expect(r.stdout).toContain("Would promote 1");

    const prRows = readJsonl(join(tmp, "knowledge", "private", "memory", "private.jsonl"));
    expect(prRows.length).toBe(1);
    const shRows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(shRows.length).toBe(0);
  });

  it("filters by --tags", () => {
    runMemory(tmp, ["retain", "private", "jwt,auth", "--importance 0.8 JWT insight"]);
    runMemory(tmp, ["retain", "private", "deploy,k8s", "--importance 0.8 K8s insight"]);

    const r = runMemory(tmp, ["distill", "private", "shared", "--min-age-days", "0", "--tags", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1");
    expect(r.stdout).toContain("Skipped: 1");

    const shRows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(shRows[0].content).toContain("JWT insight");
  });

  it("respects min-age-days threshold", () => {
    runMemory(tmp, ["retain", "private", "fresh", "--importance 0.9 Just happened"]);

    const r = runMemory(tmp, ["distill", "private", "shared"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 0");
  });

  it("help includes distill command", () => {
    const r = runMemory(tmp, ["help"]);
    expect(r.stderr).toContain("distill");
    expect(r.stderr).toContain("private");
  });
});

// ─── MEM-005: ^ken orchestration primitives ──────────────────────────────────

describe("Memory: MEM-005 ^ken orchestration primitives", () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("full grasp+glimpse+distill pipeline on populated stores", () => {
    const oldTs = Date.now() - 3 * 86_400_000;
    const privatePath = join(tmp, "knowledge", "private", "memory", "private.jsonl");
    const row1 = JSON.stringify({ id: "pr1", tags: ["auth", "security"], content: "Auth module uses JWT with 24h expiry", source: "private", importance: 0.8, polarity: "positive", ts: oldTs });
    const row2 = JSON.stringify({ id: "pr2", tags: ["auth", "login"], content: "Login flow validated via ^review", source: "private", importance: 0.7, polarity: "positive", ts: oldTs });
    const row3 = JSON.stringify({ id: "pr3", tags: ["negative"], content: "Bad approach", source: "private", importance: 0.9, polarity: "negative", ts: oldTs });
    writeFileSync(privatePath, [row1, row2, row3].join("\n") + "\n");

    const r1 = runMemory(tmp, ["recall", "auth"]);
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("auth");

    const r2 = runMemory(tmp, ["cache", "auth", "--private"]);
    expect(r2.exitCode).toBe(0);
    const workingPath = join(tmp, "nexus", "memory", "working.jsonl");
    expect(existsSync(workingPath)).toBe(true);
    const workingRows = readJsonl(workingPath);
    expect(workingRows.length).toBeGreaterThan(0);

    runMemory(tmp, ["retain", "shared", "auth,recon", "Auth module is well-structured with proper JWT handling"]);
    const sharedPath = join(tmp, "knowledge", "@", "memory", "shared.jsonl");
    expect(readJsonl(sharedPath).length).toBe(1);

    const r4 = runMemory(tmp, ["distill", "private", "shared"]);
    expect(r4.exitCode).toBe(0);
    const promoted = readJsonl(sharedPath);
    expect(promoted.length).toBe(3); // 1 retain + 2 promoted
    expect(promoted.every((r: any) => r.polarity !== "negative")).toBe(true);
  });

  it("ken pipeline works with empty stores", () => {
    const r1 = runMemory(tmp, ["recall", "anything"]);
    expect(r1.exitCode).toBe(0);

    const r2 = runMemory(tmp, ["cache", "anything"]);
    expect(r2.exitCode).toBe(0);

    const r3 = runMemory(tmp, ["distill", "private", "shared"]);
    expect(r3.exitCode).toBe(0);
    expect(r3.stdout).toContain("Distilled: 0");
  });

  it("ken pipeline skips negative polarity in distill", () => {
    const oldTs = Date.now() - 5 * 86_400_000;
    const privatePath = join(tmp, "knowledge", "private", "memory", "private.jsonl");
    const negRow = JSON.stringify({ id: "neg1", tags: ["test"], content: "Anti-pattern", source: "private", importance: 0.9, polarity: "negative", ts: oldTs });
    const posRow = JSON.stringify({ id: "pos1", tags: ["test"], content: "Good pattern", source: "private", importance: 0.9, polarity: "positive", ts: oldTs });
    writeFileSync(privatePath, [negRow, posRow].join("\n") + "\n");

    const r = runMemory(tmp, ["distill", "private", "shared"]);
    expect(r.exitCode).toBe(0);
    const sharedRows = readJsonl(join(tmp, "knowledge", "@", "memory", "shared.jsonl"));
    expect(sharedRows.length).toBe(1);
    expect(sharedRows[0].content).toBe("Good pattern");
  });

  it("ken pipeline deduplicates across stores", () => {
    const oldTs = Date.now() - 3 * 86_400_000;
    const privatePath = join(tmp, "knowledge", "private", "memory", "private.jsonl");
    const sharedPath = join(tmp, "knowledge", "@", "memory", "shared.jsonl");
    const content = "JWT tokens expire after 24 hours by default";
    const srcRow = JSON.stringify({ id: "pr1", tags: ["auth"], content, source: "private", importance: 0.8, polarity: "positive", ts: oldTs });
    const dstRow = JSON.stringify({ id: "sh1", tags: ["auth"], content, source: "shared", importance: 0.8, polarity: "positive", ts: oldTs });
    writeFileSync(privatePath, srcRow + "\n");
    writeFileSync(sharedPath, dstRow + "\n");

    const r = runMemory(tmp, ["distill", "private", "shared"]);
    expect(r.exitCode).toBe(0);
    const sharedRows = readJsonl(sharedPath);
    expect(sharedRows.length).toBe(1);
  });

  it("stats reflects all store counts after ken pipeline", () => {
    seedRow(tmp, "shared", ["test"], "shared fact");
    seedRow(tmp, "private", ["test"], "private note");

    const r = runMemory(tmp, ["stats"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("shared");
    expect(r.stdout).toContain("private");
  });

  it("skill.ts exports ken in SKILLS dict", async () => {
    const skillTs = readFileSync(join(AGENCE_ROOT, "lib", "skill.ts"), "utf-8");
    expect(skillTs).toContain('"ken"');
    expect(skillTs).toContain("Knowledge Extraction cycle");
    expect(skillTs).toContain("runKen");
  });

  it("lib/init.sh recognizes ^ken in skill names", () => {
    const initSh = readFileSync(join(AGENCE_ROOT, "lib", "init.sh"), "utf-8");
    expect(initSh).toContain("|ken\"");
  });
});
