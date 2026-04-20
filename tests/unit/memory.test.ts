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
    runMemory(tmp, ["retain", "eidetic", "jwt,auth", "JWT knowledge"]);
    runMemory(tmp, ["retain", "kinesthetic", "jwt,fix", "JWT fix pattern"]);
    runMemory(tmp, ["retain", "episodic", "jwt,sprint", "JWT sprint work"]);
    runMemory(tmp, ["retain", "kinesthetic", "antipattern,jwt", "--negative Bad approach"]);
    runMemory(tmp, ["retain", "masonic", "jwt,private", "Private JWT note"]);
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
