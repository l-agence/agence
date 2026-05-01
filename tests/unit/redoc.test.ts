import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { saveCurrentDocs, publishDocs, writeManifest, runRedoc } from "../../lib/redoc.ts";

const TMP = join(import.meta.dir, ".tmp-redoc-test");
const SRC = join(TMP, "source");
const DST = join(TMP, "published");
const SAVES = join(TMP, "deprecated");

function ensureClean(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(SRC, { recursive: true });
  mkdirSync(DST, { recursive: true });
  mkdirSync(SAVES, { recursive: true });
}

function writeMd(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content);
}

beforeEach(() => {
  ensureClean();
  process.env.AGENCE_DOC_SOURCE = SRC;
  process.env.AGENCE_DOC_ROOT = DST;
  process.env.AGENCE_DOC_SAVES = SAVES;
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  delete process.env.AGENCE_DOC_SOURCE;
  delete process.env.AGENCE_DOC_ROOT;
  delete process.env.AGENCE_DOC_SAVES;
});

// ─── saveCurrentDocs ─────────────────────────────────────────────────────────

describe("saveCurrentDocs", () => {
  test("no-op when DOC_ROOT is empty", () => {
    const r = saveCurrentDocs("1.0.0", false);
    expect(r.saved).toBe(0);
    expect(r.saveDir).toBe("");
  });

  test("saves existing docs to versioned subdirectory", () => {
    writeMd(DST, "README.md", "# Hello");
    writeMd(DST, "GUIDE.md", "# Guide");
    const r = saveCurrentDocs("1.0.0", false);
    expect(r.saved).toBe(2);
    expect(r.saveDir).toContain("v1.0.0_");
    expect(existsSync(join(r.saveDir, "README.md"))).toBe(true);
    expect(existsSync(join(r.saveDir, "GUIDE.md"))).toBe(true);
    expect(existsSync(join(r.saveDir, ".receipt.json"))).toBe(true);
  });

  test("dry-run does not create save directory", () => {
    writeMd(DST, "OLD.md", "old content");
    const r = saveCurrentDocs("2.0.0", true);
    expect(r.saved).toBe(1);
    // No directory created
    const entries = readdirSync(SAVES);
    expect(entries.length).toBe(0);
  });
});

// ─── publishDocs ─────────────────────────────────────────────────────────────

describe("publishDocs", () => {
  test("copies source docs to published dir", () => {
    writeMd(SRC, "ARCH.md", "# Architecture");
    writeMd(SRC, "SETUP.md", "# Setup");
    const r = publishDocs(false);
    expect(r.updated).toBe(2);
    expect(existsSync(join(DST, "ARCH.md"))).toBe(true);
    expect(readFileSync(join(DST, "ARCH.md"), "utf-8")).toBe("# Architecture");
  });

  test("dry-run does not copy files", () => {
    writeMd(SRC, "NEW.md", "new");
    const r = publishDocs(true);
    expect(r.updated).toBe(1);
    expect(existsSync(join(DST, "NEW.md"))).toBe(false);
  });

  test("overwrites existing files in DOC_ROOT", () => {
    writeMd(DST, "DOC.md", "old version");
    writeMd(SRC, "DOC.md", "new version");
    publishDocs(false);
    expect(readFileSync(join(DST, "DOC.md"), "utf-8")).toBe("new version");
  });

  test("returns empty when source has no .md files", () => {
    writeFileSync(join(SRC, "data.json"), "{}");
    const r = publishDocs(false);
    expect(r.updated).toBe(0);
    expect(r.files).toEqual([]);
  });
});

// ─── writeManifest ───────────────────────────────────────────────────────────

describe("writeManifest", () => {
  test("writes MANIFEST.json with correct fields", () => {
    const m = writeManifest("2.1.0", ["A.md", "B.md"], false);
    expect(m.version).toBe("2.1.0");
    expect(m.files).toEqual(["A.md", "B.md"]);
    const onDisk = JSON.parse(readFileSync(join(DST, "MANIFEST.json"), "utf-8"));
    expect(onDisk.version).toBe("2.1.0");
    expect(onDisk.files).toEqual(["A.md", "B.md"]);
  });

  test("dry-run does not write file", () => {
    writeManifest("3.0.0", ["X.md"], true);
    expect(existsSync(join(DST, "MANIFEST.json"))).toBe(false);
  });
});

// ─── runRedoc (full cycle) ───────────────────────────────────────────────────

describe("runRedoc", () => {
  test("first publish: no save, publishes all, creates manifest", () => {
    writeMd(SRC, "README.md", "# Agence");
    writeMd(SRC, "GUIDE.md", "# Guide");
    const r = runRedoc(false);
    expect(r.saved).toBe(0);
    expect(r.updated).toBe(2);
    expect(r.version).toBe("1.0.0");
    expect(existsSync(join(DST, "README.md"))).toBe(true);
    expect(existsSync(join(DST, "MANIFEST.json"))).toBe(true);
  });

  test("second publish: saves previous, bumps version", () => {
    // First publish
    writeMd(SRC, "DOC.md", "v1");
    runRedoc(false);

    // Modify source
    writeMd(SRC, "DOC.md", "v2");
    const r = runRedoc(false);
    expect(r.saved).toBe(1); // saved DOC.md from first publish
    expect(r.version).toBe("1.0.1");
    expect(readFileSync(join(DST, "DOC.md"), "utf-8")).toBe("v2");
    // Archived version exists
    const saves = readdirSync(SAVES).filter(d => d.startsWith("v"));
    expect(saves.length).toBe(1);
  });

  test("dry-run does not modify filesystem", () => {
    writeMd(SRC, "X.md", "content");
    writeMd(DST, "OLD.md", "old");
    writeFileSync(join(DST, "MANIFEST.json"), JSON.stringify({ version: "5.0.0" }));
    const r = runRedoc(true);
    expect(r.version).toBe("5.0.1");
    // OLD.md still there, X.md not copied
    expect(existsSync(join(DST, "OLD.md"))).toBe(true);
    expect(existsSync(join(DST, "X.md"))).toBe(false);
  });
});

// ─── CLI dispatch ────────────────────────────────────────────────────────────

describe("CLI dispatch", () => {
  test("help exits 0", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/redoc.ts", "help"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("airun redoc");
  });

  test("status exits 0", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/redoc.ts", "status"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("[redoc] Status:");
  });

  test("diff exits 0", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/redoc.ts", "diff"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(0);
  });

  test("unknown command exits 2", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/redoc.ts", "bogus"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(2);
  });

  test("skill delegation works (airun skill redoc status)", () => {
    const result = Bun.spawnSync(["bun", "run", "lib/skill.ts", "redoc", "status"], {
      cwd: join(import.meta.dir, "../.."),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("[redoc] Status:");
  });
});
