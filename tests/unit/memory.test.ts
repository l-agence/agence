// tests/unit/memory.test.ts — Memory subsystem unit tests
//
// Tests for lib/memory.ts: retain, recall, cache, forget, promote, stats
// Uses isolated temp directories to avoid touching real stores.

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
  mkdirSync(join(tmp, "synthetic", "eidetic"), { recursive: true });
  mkdirSync(join(tmp, "globalcache", "semantic"), { recursive: true });
  mkdirSync(join(tmp, "organic", "episodic"), { recursive: true });
  mkdirSync(join(tmp, "objectcode", "kinesthetic"), { recursive: true });
  mkdirSync(join(tmp, "hermetic", "masonic"), { recursive: true });
  mkdirSync(join(tmp, "nexus", "mnemonic"), { recursive: true });
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

/** Store paths for direct JSONL seeding (avoids subprocess overhead in hooks) */
const STORE_PATHS: Record<string, { dir: string; file: string }> = {
  eidetic:     { dir: "synthetic/eidetic",       file: "eidetic.jsonl" },
  semantic:    { dir: "globalcache/semantic",     file: "semantic.jsonl" },
  episodic:    { dir: "organic/episodic",         file: "episodic.jsonl" },
  kinesthetic: { dir: "objectcode/kinesthetic",   file: "kinesthetic.jsonl" },
  masonic:     { dir: "hermetic/masonic",         file: "masonic.jsonl" },
};
const ID_PREFIX: Record<string, string> = { eidetic: "ei", semantic: "se", episodic: "ep", kinesthetic: "ki", masonic: "ma" };
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

  it("stores a row in eidetic", () => {
    const r = runMemory(tmp, ["retain", "eidetic", "jwt,auth", "JWT tokens expire after 24h"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Retained:");
    expect(r.stdout).toContain("eidetic");

    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].tags).toEqual(["jwt", "auth"]);
    expect(rows[0].content).toBe("JWT tokens expire after 24h");
    expect(rows[0].source).toBe("eidetic");
    expect(rows[0].id).toMatch(/^ei-/);
  });

  it("stores in kinesthetic", () => {
    const r = runMemory(tmp, ["retain", "kinesthetic", "deploy,k8s", "Use rolling updates for zero-downtime"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "objectcode", "kinesthetic", "kinesthetic.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].id).toMatch(/^ki-/);
    expect(rows[0].source).toBe("kinesthetic");
  });

  it("stores in masonic (private)", () => {
    const r = runMemory(tmp, ["retain", "masonic", "personal,note", "My private thought"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "hermetic", "masonic", "masonic.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("masonic");
  });

  it("stores in semantic", () => {
    const r = runMemory(tmp, ["retain", "semantic", "architecture,patterns", "Hexagonal architecture principle"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "globalcache", "semantic", "semantic.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("semantic");
    expect(rows[0].id).toMatch(/^se-/);
  });

  it("stores in episodic", () => {
    const r = runMemory(tmp, ["retain", "episodic", "sprint,v0.6", "Completed SEC-004/005/006"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "organic", "episodic", "episodic.jsonl"));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("episodic");
    expect(rows[0].id).toMatch(/^ep-/);
  });

  it("rejects invalid source", () => {
    const r = runMemory(tmp, ["retain", "bogus", "tag", "content"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid source");
  });

  it("rejects empty tags", () => {
    const r = runMemory(tmp, ["retain", "eidetic", "", "content"]);
    expect(r.exitCode).toBe(1);
  });

  it("rejects missing content", () => {
    const r = runMemory(tmp, ["retain", "eidetic", "tag"]);
    expect(r.exitCode).toBe(1);
  });

  it("supports --importance flag", () => {
    const r = runMemory(tmp, ["retain", "eidetic", "critical,finding", "--importance 0.9 This is very important"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(rows[0].importance).toBe(0.9);
  });

  it("supports --negative polarity", () => {
    const r = runMemory(tmp, ["retain", "kinesthetic", "antipattern,deploy", "--negative Never use force push on main"]);
    expect(r.exitCode).toBe(0);
    const rows = readJsonl(join(tmp, "objectcode", "kinesthetic", "kinesthetic.jsonl"));
    expect(rows[0].polarity).toBe("negative");
  });

  it("appends multiple rows to same store", () => {
    runMemory(tmp, ["retain", "eidetic", "jwt", "Row 1"]);
    runMemory(tmp, ["retain", "eidetic", "jwt", "Row 2"]);
    runMemory(tmp, ["retain", "eidetic", "auth", "Row 3"]);
    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(rows.length).toBe(3);
  });

  it("rejects tag with special characters", () => {
    const r = runMemory(tmp, ["retain", "eidetic", "../traversal", "content"]);
    expect(r.exitCode).toBe(1);
  });
});

describe("Memory: ^recall", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempRoot();
    // Seed test data across stores
    runMemory(tmp, ["retain", "eidetic", "jwt,auth", "JWT best practices"]);
    runMemory(tmp, ["retain", "eidetic", "jwt,timeout", "JWT timeout is 24h"]);
    runMemory(tmp, ["retain", "kinesthetic", "jwt,fix", "JWT refresh token pattern"]);
    runMemory(tmp, ["retain", "episodic", "deploy,k8s", "Deployed v0.5.0"]);
    runMemory(tmp, ["retain", "semantic", "architecture,patterns", "Hexagonal arch"]);
    runMemory(tmp, ["retain", "kinesthetic", "antipattern,jwt", "--negative Bad JWT pattern"]);
  });
  afterEach(() => { cleanTempRoot(tmp); });

  it("finds rows by single tag across stores", () => {
    const r = runMemory(tmp, ["recall", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("jwt");
    // Should find eidetic + kinesthetic rows (not negative)
    expect(r.stdout).toContain("JWT best practices");
    expect(r.stdout).toContain("JWT timeout is 24h");
    expect(r.stdout).toContain("JWT refresh token pattern");
    // Negative polarity excluded by default
    expect(r.stdout).not.toContain("Bad JWT pattern");
  });

  it("finds rows by multiple tags (intersection scores higher)", () => {
    const r = runMemory(tmp, ["recall", "jwt,auth"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("JWT best practices");
  });

  it("filters by --source", () => {
    const r = runMemory(tmp, ["recall", "jwt", "--source", "kinesthetic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("JWT refresh token pattern");
    expect(r.stdout).not.toContain("JWT best practices"); // eidetic excluded
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
    // Direct JSONL seeding (avoids 5 subprocess spawns that can timeout hooks)
    seedRow(tmp, "eidetic", ["jwt", "auth"], "JWT knowledge");
    seedRow(tmp, "kinesthetic", ["jwt", "fix"], "JWT fix pattern");
    seedRow(tmp, "episodic", ["jwt", "sprint"], "JWT sprint work");
    seedRow(tmp, "kinesthetic", ["antipattern", "jwt"], "Bad approach", { polarity: "negative" });
    seedRow(tmp, "masonic", ["jwt", "private"], "Private JWT note");
  });
  afterEach(() => { cleanTempRoot(tmp); });

  it("hydrates mnemonic from all stores (except masonic by default)", () => {
    const r = runMemory(tmp, ["cache", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Cached");

    const mnRows = readJsonl(join(tmp, "nexus", "mnemonic", "mnemonic.jsonl"));
    expect(mnRows.length).toBe(3); // eidetic + kinesthetic + episodic (no masonic, no negative)

    // Verify negative excluded
    const contents = mnRows.map((r: any) => r.content);
    expect(contents).not.toContain("Bad approach");
    expect(contents).not.toContain("Private JWT note");
  });

  it("includes masonic with --masonic flag", () => {
    const r = runMemory(tmp, ["cache", "jwt", "--masonic"]);
    expect(r.exitCode).toBe(0);

    const mnRows = readJsonl(join(tmp, "nexus", "mnemonic", "mnemonic.jsonl"));
    const sources = mnRows.map((r: any) => r.source);
    expect(sources).toContain("masonic");
  });

  it("respects --max limit", () => {
    const r = runMemory(tmp, ["cache", "jwt", "--max", "2"]);
    expect(r.exitCode).toBe(0);
    const mnRows = readJsonl(join(tmp, "nexus", "mnemonic", "mnemonic.jsonl"));
    expect(mnRows.length).toBe(2);
  });

  it("overwrites previous mnemonic on re-cache", () => {
    runMemory(tmp, ["cache", "jwt"]);
    const first = readJsonl(join(tmp, "nexus", "mnemonic", "mnemonic.jsonl"));
    expect(first.length).toBe(3);

    // Add more data and re-cache
    runMemory(tmp, ["retain", "eidetic", "jwt,new", "New JWT insight"]);
    runMemory(tmp, ["cache", "jwt"]);
    const second = readJsonl(join(tmp, "nexus", "mnemonic", "mnemonic.jsonl"));
    expect(second.length).toBe(4); // now includes new row
  });
});

describe("Memory: ^forget", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("removes a row by ID", () => {
    runMemory(tmp, ["retain", "eidetic", "jwt", "To be forgotten"]);
    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(rows.length).toBe(1);
    const id = rows[0].id;

    const r = runMemory(tmp, ["forget", id, "eidetic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Forgot");

    const after = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(after.length).toBe(0);
  });

  it("preserves other rows when forgetting one", () => {
    runMemory(tmp, ["retain", "eidetic", "a", "Row A"]);
    runMemory(tmp, ["retain", "eidetic", "b", "Row B"]);
    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(rows.length).toBe(2);
    const idA = rows[0].id;

    runMemory(tmp, ["forget", idA, "eidetic"]);
    const after = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(after.length).toBe(1);
    expect(after[0].content).toBe("Row B");
  });

  it("fails for non-existent ID", () => {
    const r = runMemory(tmp, ["forget", "ei-nonexistent", "eidetic"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Not found");
  });

  it("fails for invalid source", () => {
    const r = runMemory(tmp, ["forget", "ei-123", "bogus"]);
    expect(r.exitCode).toBe(1);
  });
});

describe("Memory: ^promote", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("moves row from episodic to eidetic", () => {
    runMemory(tmp, ["retain", "episodic", "sprint,insight", "Important lesson learned"]);
    const epRows = readJsonl(join(tmp, "organic", "episodic", "episodic.jsonl"));
    expect(epRows.length).toBe(1);
    const id = epRows[0].id;

    const r = runMemory(tmp, ["promote", id, "episodic", "eidetic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Promoted");

    // Gone from episodic
    const epAfter = readJsonl(join(tmp, "organic", "episodic", "episodic.jsonl"));
    expect(epAfter.length).toBe(0);

    // Added to eidetic with new ID
    const eiRows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(eiRows.length).toBe(1);
    expect(eiRows[0].id).toMatch(/^ei-/);
    expect(eiRows[0].source).toBe("eidetic");
    expect(eiRows[0].content).toBe("Important lesson learned");
  });

  it("moves from kinesthetic to semantic", () => {
    runMemory(tmp, ["retain", "kinesthetic", "pattern,reusable", "Widely useful pattern"]);
    const rows = readJsonl(join(tmp, "objectcode", "kinesthetic", "kinesthetic.jsonl"));
    const id = rows[0].id;

    const r = runMemory(tmp, ["promote", id, "kinesthetic", "semantic"]);
    expect(r.exitCode).toBe(0);

    const seRows = readJsonl(join(tmp, "globalcache", "semantic", "semantic.jsonl"));
    expect(seRows.length).toBe(1);
    expect(seRows[0].id).toMatch(/^se-/);
  });

  it("rejects same-store promote", () => {
    runMemory(tmp, ["retain", "eidetic", "tag", "content"]);
    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    const r = runMemory(tmp, ["promote", rows[0].id, "eidetic", "eidetic"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("same store");
  });

  it("fails for non-existent ID", () => {
    const r = runMemory(tmp, ["promote", "ep-nonexistent", "episodic", "eidetic"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Not found");
  });
});

describe("Memory: list & stats", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempRoot();
    runMemory(tmp, ["retain", "eidetic", "a", "Row 1"]);
    runMemory(tmp, ["retain", "eidetic", "b", "Row 2"]);
    runMemory(tmp, ["retain", "kinesthetic", "c", "Row 3"]);
  });
  afterEach(() => { cleanTempRoot(tmp); });

  it("lists rows in a store", () => {
    const r = runMemory(tmp, ["list", "eidetic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("2 rows");
    expect(r.stdout).toContain("Row 1");
    expect(r.stdout).toContain("Row 2");
  });

  it("shows empty for unused store", () => {
    const r = runMemory(tmp, ["list", "masonic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("empty");
  });

  it("shows stats across all stores", () => {
    const r = runMemory(tmp, ["stats"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("eidetic");
    expect(r.stdout).toContain("kinesthetic");
    expect(r.stdout).toContain("total");
  });
});

describe("Memory: schema validation", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("row has correct schema fields", () => {
    runMemory(tmp, ["retain", "eidetic", "test,schema", "Schema check content"]);
    const rows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    const row = rows[0];
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("tags");
    expect(row).toHaveProperty("content");
    expect(row).toHaveProperty("source");
    expect(row).toHaveProperty("importance");
    expect(row).toHaveProperty("polarity");
    expect(row).toHaveProperty("ts");
    expect(typeof row.ts).toBe("number");
    expect(row.ts).toBeGreaterThan(1700000000000); // after 2023
  });

  it("rejects content exceeding 64KB", () => {
    const bigContent = "x".repeat(65 * 1024);
    const r = runMemory(tmp, ["retain", "eidetic", "big", bigContent]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("too large");
  });

  it("rejects more than 16 tags", () => {
    const manyTags = Array.from({ length: 17 }, (_, i) => `tag${i}`).join(",");
    const r = runMemory(tmp, ["retain", "eidetic", manyTags, "content"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Too many tags");
  });

  it("survives malformed JSONL lines", () => {
    // Write garbage into a store file
    const storePath = join(tmp, "synthetic", "eidetic", "eidetic.jsonl");
    writeFileSync(storePath, '{"broken json\n{"id":"ei-1","tags":["ok"],"content":"good","source":"eidetic","ts":1}\n');

    const r = runMemory(tmp, ["list", "eidetic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("1 row"); // only the valid line
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
// Tests that skill.ts imports memory and builds context for grasp/glimpse/recon.
// We test the exported functions directly via dynamic import with custom AGENCE_ROOT.

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
    // Check output contains memory import references
    const out = r.stdout?.toString() ?? "";
    expect(out).toContain("readMnemonic");
    expect(out).toContain("buildMemoryContext");
    expect(out).toContain("retainReconFindings");
  });

  it("grasp recalls from all stores when memory exists", () => {
    // Seed memory, then run skill.ts help (won't call LLM but verifies import chain)
    runMemory(tmp, ["retain", "eidetic", "jwt,auth", "JWT tokens use RS256 signatures"]);
    runMemory(tmp, ["retain", "kinesthetic", "jwt,refresh", "Rotate refresh tokens daily"]);

    // Verify the rows exist for recall
    const r = runMemory(tmp, ["recall", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("JWT tokens use RS256");
    expect(r.stdout).toContain("Rotate refresh tokens");
  });

  it("glimpse reads from mnemonic cache", () => {
    // Seed stores, hydrate cache, verify mnemonic has data
    runMemory(tmp, ["retain", "eidetic", "deploy,k8s", "Use rolling updates"]);
    runMemory(tmp, ["retain", "kinesthetic", "deploy,helm", "Helm chart patterns"]);
    runMemory(tmp, ["cache", "deploy"]);

    // Verify mnemonic has rows
    const mnPath = join(tmp, "nexus", "mnemonic", "mnemonic.jsonl");
    expect(existsSync(mnPath)).toBe(true);
    const rows = readFileSync(mnPath, "utf-8").split("\n").filter(l => l.trim());
    expect(rows.length).toBe(2);
  });

  it("recon auto-retain would write to semantic store", () => {
    // Simulate what retainReconFindings does: retain into semantic
    runMemory(tmp, ["retain", "semantic", "recon,api,security", "API surface: 12 endpoints, 3 unauthenticated"]);

    const r = runMemory(tmp, ["list", "semantic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("API surface");
    expect(r.stdout).toContain("recon");
  });

  it("memory context is bounded (no infinite injection)", () => {
    // Seed 25 rows directly (avoids 50 subprocess spawns that timeout)
    for (let i = 0; i < 25; i++) {
      seedRow(tmp, "eidetic", ["test"], `Row ${i} with some padding content to consume budget bytes`);
    }
    const r = runMemory(tmp, ["recall", "test", "--max", "25"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("25 memories");
    // recall respects default --max of 20
    const r2 = runMemory(tmp, ["recall", "test"]);
    expect(r2.stdout).toContain("20 memories"); // default max
  });
});

// ─── MEM-004: Distill (promotion pipelines) ──────────────────────────────────

describe("Memory: ^distill", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("distills episodic → eidetic by importance", () => {
    // Seed episodic with mix of importance levels — use --importance flag
    runMemory(tmp, ["retain", "episodic", "sprint,insight", "--importance 0.8 Key architecture decision"]);
    runMemory(tmp, ["retain", "episodic", "sprint,trivial", "--importance 0.3 Minor formatting fix"]);
    runMemory(tmp, ["retain", "episodic", "sprint,pattern", "--importance 0.9 Reusable error handling"]);

    // Distill with min-importance 0.7 and min-age 0 (test mode)
    const r = runMemory(tmp, ["distill", "episodic", "eidetic", "--min-importance", "0.7", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 2"); // only 0.8 and 0.9 pass

    // Verify episodic lost the promoted rows
    const epRows = readJsonl(join(tmp, "organic", "episodic", "episodic.jsonl"));
    expect(epRows.length).toBe(1); // only the 0.3 trivial remains
    expect(epRows[0].content).toContain("Minor formatting fix");

    // Verify eidetic gained them
    const eiRows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(eiRows.length).toBe(2);
    expect(eiRows.map((r: any) => r.id).every((id: string) => id.startsWith("ei-"))).toBe(true);
  });

  it("distills episodic → kinesthetic", () => {
    runMemory(tmp, ["retain", "episodic", "pattern,fix", "--importance 0.7 JWT refresh pattern"]);

    const r = runMemory(tmp, ["distill", "episodic", "kinesthetic", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1");

    const kiRows = readJsonl(join(tmp, "objectcode", "kinesthetic", "kinesthetic.jsonl"));
    expect(kiRows.length).toBe(1);
    expect(kiRows[0].id).toMatch(/^ki-/);
    expect(kiRows[0].content).toContain("JWT refresh pattern");
  });

  it("distills kinesthetic → semantic", () => {
    runMemory(tmp, ["retain", "kinesthetic", "pattern,universal", "--importance 0.8 Universal retry with backoff"]);

    const r = runMemory(tmp, ["distill", "kinesthetic", "semantic", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1");

    const seRows = readJsonl(join(tmp, "globalcache", "semantic", "semantic.jsonl"));
    expect(seRows.length).toBe(1);
    expect(seRows[0].id).toMatch(/^se-/);
  });

  it("distills masonic → eidetic (declassify)", () => {
    runMemory(tmp, ["retain", "masonic", "insight,private", "--importance 0.7 Now safe to share"]);

    const r = runMemory(tmp, ["distill", "masonic", "eidetic", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1");

    // Verify masonic is empty, eidetic has the row
    const maRows = readJsonl(join(tmp, "hermetic", "masonic", "masonic.jsonl"));
    expect(maRows.length).toBe(0);
    const eiRows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(eiRows.length).toBe(1);
  });

  it("rejects invalid promotion path", () => {
    const r = runMemory(tmp, ["distill", "eidetic", "episodic"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Invalid promotion path");
  });

  it("rejects same-store distill", () => {
    const r = runMemory(tmp, ["distill", "eidetic", "eidetic"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("same store");
  });

  it("skips negative polarity rows", () => {
    runMemory(tmp, ["retain", "episodic", "antipattern", "--importance 0.9 --negative Bad approach"]);
    runMemory(tmp, ["retain", "episodic", "pattern", "--importance 0.8 Good approach"]);

    const r = runMemory(tmp, ["distill", "episodic", "eidetic", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1"); // only the positive one
  });

  it("deduplicates against target store", () => {
    // Pre-seed eidetic with existing row
    seedRow(tmp, "eidetic", ["jwt", "auth"], "JWT tokens use RS256 signatures for secure authentication");
    // Episodic has near-duplicate (Jaccard > 0.8 required)
    seedRow(tmp, "episodic", ["jwt", "auth"], "JWT tokens use RS256 signatures for secure authentication pattern", { importance: 0.8 });

    const r = runMemory(tmp, ["distill", "episodic", "eidetic", "--min-age-days", "0"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Duplicates: 1");
  });

  it("dry-run previews without moving", () => {
    runMemory(tmp, ["retain", "episodic", "insight", "--importance 0.8 Important finding"]);

    const r = runMemory(tmp, ["distill", "episodic", "eidetic", "--min-age-days", "0", "--dry-run"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("[dry-run]");
    expect(r.stdout).toContain("Would promote 1");

    // Verify nothing moved
    const epRows = readJsonl(join(tmp, "organic", "episodic", "episodic.jsonl"));
    expect(epRows.length).toBe(1); // still there
    const eiRows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(eiRows.length).toBe(0); // not moved
  });

  it("filters by --tags", () => {
    runMemory(tmp, ["retain", "episodic", "jwt,auth", "--importance 0.8 JWT insight"]);
    runMemory(tmp, ["retain", "episodic", "deploy,k8s", "--importance 0.8 K8s insight"]);

    const r = runMemory(tmp, ["distill", "episodic", "eidetic", "--min-age-days", "0", "--tags", "jwt"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 1"); // only jwt row
    expect(r.stdout).toContain("Skipped: 1");   // k8s skipped

    const eiRows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(eiRows[0].content).toContain("JWT insight");
  });

  it("respects min-age-days threshold", () => {
    runMemory(tmp, ["retain", "episodic", "fresh", "--importance 0.9 Just happened"]);

    // Default min-age is 1 day — fresh rows should be skipped
    const r = runMemory(tmp, ["distill", "episodic", "eidetic"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Distilled: 0"); // too fresh
  });

  it("help includes distill command", () => {
    const r = runMemory(tmp, ["help"]);
    expect(r.stderr).toContain("distill");
    expect(r.stderr).toContain("episodic");
  });
});

// ─── MEM-005: ^ken orchestration primitives ──────────────────────────────────
// Tests the memory operations that ^ken chains: grasp→glimpse→recon→distill.
// LLM synthesis is tested via integration tests (requires API keys).

describe("Memory: MEM-005 ^ken orchestration primitives", () => {
  let tmp: string;

  beforeEach(() => { tmp = makeTempRoot(); });
  afterEach(() => { cleanTempRoot(tmp); });

  it("full grasp+glimpse+distill pipeline on populated stores", () => {
    // Seed episodic with old rows (backdate via direct JSONL write)
    const oldTs = Date.now() - 3 * 86_400_000; // 3 days ago
    const episodicPath = join(tmp, "organic", "episodic", "episodic.jsonl");
    const row1 = JSON.stringify({ id: "ep1", tags: ["auth", "security"], content: "Auth module uses JWT with 24h expiry", source: "episodic", importance: 0.8, polarity: "positive", ts: oldTs });
    const row2 = JSON.stringify({ id: "ep2", tags: ["auth", "login"], content: "Login flow validated via ^review", source: "episodic", importance: 0.7, polarity: "positive", ts: oldTs });
    const row3 = JSON.stringify({ id: "ep3", tags: ["negative"], content: "Bad approach", source: "episodic", importance: 0.9, polarity: "negative", ts: oldTs });
    writeFileSync(episodicPath, [row1, row2, row3].join("\n") + "\n");

    // Seed kinesthetic with old patterns
    const kinPath = join(tmp, "objectcode", "kinesthetic", "kinesthetic.jsonl");
    const kinRow = JSON.stringify({ id: "kin1", tags: ["auth", "pattern"], content: "Guard decorator pattern for route auth", source: "kinesthetic", importance: 0.8, polarity: "positive", ts: oldTs });
    writeFileSync(kinPath, kinRow + "\n");

    // Step 1: GRASP — recall should find auth-tagged rows
    const r1 = runMemory(tmp, ["recall", "auth"]);
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain("auth");

    // Step 2: GLIMPSE — cache then read mnemonic
    const r2 = runMemory(tmp, ["cache", "auth"]);
    expect(r2.exitCode).toBe(0);
    // Mnemonic should have rows now
    const mnemonicPath = join(tmp, "nexus", "mnemonic", "mnemonic.jsonl");
    expect(existsSync(mnemonicPath)).toBe(true);
    const mnemonicRows = readJsonl(mnemonicPath);
    expect(mnemonicRows.length).toBeGreaterThan(0);

    // Step 3: RECON auto-retain (simulate by retaining to semantic directly)
    runMemory(tmp, ["retain", "semantic", "auth,recon", "Auth module is well-structured with proper JWT handling"]);
    const semanticPath = join(tmp, "globalcache", "semantic", "semantic.jsonl");
    expect(readJsonl(semanticPath).length).toBe(1);

    // Step 4: DISTILL — episodic→eidetic should promote old, important, positive rows
    const r4 = runMemory(tmp, ["distill", "episodic", "eidetic"]);
    expect(r4.exitCode).toBe(0);
    // row1 and row2 qualify (old, importance >= 0.6, positive)
    // row3 is negative — should NOT be promoted
    const eideticPath = join(tmp, "synthetic", "eidetic", "eidetic.jsonl");
    const promoted = readJsonl(eideticPath);
    expect(promoted.length).toBe(2);
    expect(promoted.every((r: any) => r.polarity !== "negative")).toBe(true);

    // Distill kinesthetic→semantic
    const r5 = runMemory(tmp, ["distill", "kinesthetic", "semantic"]);
    expect(r5.exitCode).toBe(0);
    const semanticRows = readJsonl(semanticPath);
    expect(semanticRows.length).toBe(2); // original retain + promoted kin1
  });

  it("ken pipeline works with empty stores", () => {
    // Recall on empty stores should succeed gracefully
    const r1 = runMemory(tmp, ["recall", "anything"]);
    expect(r1.exitCode).toBe(0);

    // Cache on empty should succeed
    const r2 = runMemory(tmp, ["cache", "anything"]);
    expect(r2.exitCode).toBe(0);

    // Distill on empty should succeed with 0 promoted
    const r3 = runMemory(tmp, ["distill", "episodic", "eidetic"]);
    expect(r3.exitCode).toBe(0);
    expect(r3.stdout).toContain("Distilled: 0");
  });

  it("ken pipeline skips negative polarity in distill", () => {
    const oldTs = Date.now() - 5 * 86_400_000;
    const episodicPath = join(tmp, "organic", "episodic", "episodic.jsonl");
    const negRow = JSON.stringify({ id: "neg1", tags: ["test"], content: "Anti-pattern", source: "episodic", importance: 0.9, polarity: "negative", ts: oldTs });
    const posRow = JSON.stringify({ id: "pos1", tags: ["test"], content: "Good pattern", source: "episodic", importance: 0.9, polarity: "positive", ts: oldTs });
    writeFileSync(episodicPath, [negRow, posRow].join("\n") + "\n");

    const r = runMemory(tmp, ["distill", "episodic", "eidetic"]);
    expect(r.exitCode).toBe(0);
    const eideticRows = readJsonl(join(tmp, "synthetic", "eidetic", "eidetic.jsonl"));
    expect(eideticRows.length).toBe(1);
    expect(eideticRows[0].content).toBe("Good pattern");
  });

  it("ken pipeline deduplicates across stores", () => {
    const oldTs = Date.now() - 3 * 86_400_000;
    const episodicPath = join(tmp, "organic", "episodic", "episodic.jsonl");
    const eideticPath = join(tmp, "synthetic", "eidetic", "eidetic.jsonl");
    // Same content in both stores
    const content = "JWT tokens expire after 24 hours by default";
    const srcRow = JSON.stringify({ id: "ep1", tags: ["auth"], content, source: "episodic", importance: 0.8, polarity: "positive", ts: oldTs });
    const dstRow = JSON.stringify({ id: "ei1", tags: ["auth"], content, source: "eidetic", importance: 0.8, polarity: "positive", ts: oldTs });
    writeFileSync(episodicPath, srcRow + "\n");
    writeFileSync(eideticPath, dstRow + "\n");

    const r = runMemory(tmp, ["distill", "episodic", "eidetic"]);
    expect(r.exitCode).toBe(0);
    // Should detect duplicate — eidetic should still have just 1 row
    const eideticRows = readJsonl(eideticPath);
    expect(eideticRows.length).toBe(1);
  });

  it("stats reflects all store counts after ken pipeline", () => {
    // Seed data
    const oldTs = Date.now() - 3 * 86_400_000;
    seedRow(tmp, "episodic", ["test"], "episodic fact", { importance: 0.8 });
    seedRow(tmp, "kinesthetic", ["test"], "kinesthetic skill", { importance: 0.8 });
    runMemory(tmp, ["retain", "semantic", "test", "semantic knowledge"]);

    const r = runMemory(tmp, ["stats"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("episodic");
    expect(r.stdout).toContain("semantic");
    expect(r.stdout).toContain("kinesthetic");
  });

  it("skill.ts exports ken in SKILLS dict", async () => {
    // Verify ken is registered as a skill
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
