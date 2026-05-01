import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { addNote, readNotes, readAllNotes, clearNotes } from "../../lib/btw.ts";

const TMP = join(import.meta.dir, ".tmp-btw-test");
const BUN = process.execPath;

function ensureClean(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });
}

beforeEach(() => {
  ensureClean();
  process.env.AGENCE_BTW_DIR = TMP;
  delete process.env.AGENCE_TASK_ID;
  delete process.env.AI_SESSION;
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  delete process.env.AGENCE_BTW_DIR;
});

describe("addNote", () => {
  test("creates a note with timestamp", () => {
    const note = addNote("test note");
    expect(note.text).toBe("test note");
    expect(note.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(note.context_id).toBe("default");
  });

  test("uses task_id as context when set", () => {
    process.env.AGENCE_TASK_ID = "abc123ef";
    const note = addNote("task-scoped");
    expect(note.context_id).toBe("abc123ef");
  });

  test("sanitizes context_id for filesystem safety", () => {
    process.env.AGENCE_TASK_ID = "../../../etc/passwd";
    const note = addNote("evil");
    expect(note.context_id).not.toContain("/");
  });
});

describe("readNotes", () => {
  test("returns empty for fresh context", () => {
    expect(readNotes()).toEqual([]);
  });

  test("returns notes after adding", () => {
    addNote("first");
    addNote("second");
    const notes = readNotes();
    expect(notes).toHaveLength(2);
    expect(notes[0].text).toBe("first");
  });
});

describe("clearNotes", () => {
  test("removes all notes for context", () => {
    addNote("a");
    addNote("b");
    const cleared = clearNotes();
    expect(cleared).toBe(2);
    expect(readNotes()).toHaveLength(0);
  });
});

describe("readAllNotes", () => {
  test("aggregates across contexts", () => {
    process.env.AGENCE_TASK_ID = "task1111";
    addNote("from task1");
    process.env.AGENCE_TASK_ID = "task2222";
    addNote("from task2");
    const all = readAllNotes();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

describe("CLI", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/btw.ts", ...args], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_BTW_DIR: TMP },
    });

  test("help prints usage", () => {
    const r = run("help");
    expect(r.stdout.toString()).toContain("Steering comments");
    expect(r.status).toBe(0);
  });

  test("adding a note", () => {
    const r = run("prefer", "horde", "locking");
    expect(r.stdout.toString()).toContain("noted");
    expect(r.status).toBe(0);
  });

  test("show displays notes", () => {
    run("first note");
    const r = run("show");
    expect(r.stdout.toString()).toContain("first note");
    expect(r.status).toBe(0);
  });

  test("clear removes notes", () => {
    run("temp note");
    const r = run("clear");
    expect(r.stdout.toString()).toContain("Cleared");
    expect(r.status).toBe(0);
  });
});

describe("skill delegation", () => {
  test("skill btw help routes correctly", () => {
    const r = spawnSync(BUN, ["run", "lib/skill.ts", "btw", "help"], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_BTW_DIR: TMP },
    });
    expect(r.stdout.toString()).toContain("Steering comments");
    expect(r.status).toBe(0);
  });
});
