import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { readTasks, addTask, activeTask, nextTask, switchTask, doneTask, dropTask, lastTask, compactTasks, queueStats } from "../../lib/queue.ts";

const TMP = join(import.meta.dir, ".tmp-queue-test");
const BUN = process.execPath;

function ensureClean(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });
}

beforeEach(() => {
  ensureClean();
  process.env.AGENCE_QUEUE_DIR = TMP;
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  delete process.env.AGENCE_QUEUE_DIR;
});

// ─── readTasks ───────────────────────────────────────────────────────────────

describe("readTasks", () => {
  test("returns empty array when no queue file", () => {
    expect(readTasks()).toEqual([]);
  });
});

// ─── addTask ─────────────────────────────────────────────────────────────────

describe("addTask", () => {
  test("creates task with correct schema", () => {
    const t = addTask("Implement feature X");
    expect(t.id).toHaveLength(8);
    expect(t.title).toBe("Implement feature X");
    expect(t.status).toBe("pending");
    expect(t.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("accepts optional agent and tags", () => {
    const t = addTask("Test task", { agent: "ralph", tags: ["urgent", "bugfix"] });
    expect(t.agent).toBe("ralph");
    expect(t.tags).toEqual(["urgent", "bugfix"]);
  });

  test("persists to JSONL file", () => {
    addTask("One");
    addTask("Two");
    expect(readTasks()).toHaveLength(2);
  });
});

// ─── switchTask / activeTask ─────────────────────────────────────────────────

describe("switchTask", () => {
  test("activates a pending task", () => {
    const t = addTask("Task A");
    const activated = switchTask(t.id);
    expect(activated!.status).toBe("active");
    expect(activeTask()!.id).toBe(t.id);
  });

  test("deactivates previous active task", () => {
    const a = addTask("A");
    const b = addTask("B");
    switchTask(a.id);
    switchTask(b.id);
    const tasks = readTasks();
    expect(tasks.find(t => t.id === a.id)!.status).toBe("pending");
    expect(tasks.find(t => t.id === b.id)!.status).toBe("active");
  });

  test("returns null for non-existent id", () => {
    expect(switchTask("deadbeef")).toBe(null);
  });

  test("supports prefix match", () => {
    const t = addTask("Prefix task");
    const activated = switchTask(t.id.slice(0, 4));
    expect(activated!.id).toBe(t.id);
  });
});

// ─── nextTask ────────────────────────────────────────────────────────────────

describe("nextTask", () => {
  test("returns first pending task", () => {
    addTask("First");
    addTask("Second");
    expect(nextTask()!.title).toBe("First");
  });

  test("returns null when all active/done", () => {
    const t = addTask("Only");
    switchTask(t.id);
    expect(nextTask()).toBe(null);
  });
});

// ─── doneTask ────────────────────────────────────────────────────────────────

describe("doneTask", () => {
  test("marks task as done", () => {
    const t = addTask("Finish me");
    expect(doneTask(t.id)).toBe(true);
    expect(readTasks()[0].status).toBe("done");
    expect(readTasks()[0].done_at).toBeDefined();
  });

  test("returns false for already-done task", () => {
    const t = addTask("X");
    doneTask(t.id);
    expect(doneTask(t.id)).toBe(false);
  });
});

// ─── dropTask ────────────────────────────────────────────────────────────────

describe("dropTask", () => {
  test("marks task as dropped", () => {
    const t = addTask("Drop me");
    expect(dropTask(t.id)).toBe(true);
    expect(readTasks()[0].status).toBe("dropped");
  });

  test("returns false for non-existent id", () => {
    expect(dropTask("nope")).toBe(false);
  });
});

// ─── lastTask ────────────────────────────────────────────────────────────────

describe("lastTask", () => {
  test("returns a completed task", () => {
    const a = addTask("A");
    const b = addTask("B");
    doneTask(a.id);
    doneTask(b.id);
    const last = lastTask();
    expect(last).not.toBe(null);
    expect(last!.status).toBe("done");
  });

  test("returns null when no resolved tasks", () => {
    addTask("pending");
    expect(lastTask()).toBe(null);
  });
});

// ─── compactTasks ────────────────────────────────────────────────────────────

describe("compactTasks", () => {
  test("removes done/dropped, keeps pending/active", () => {
    const a = addTask("Done one");
    const b = addTask("Pending one");
    const c = addTask("Dropped one");
    doneTask(a.id);
    dropTask(c.id);
    const removed = compactTasks();
    expect(removed).toBe(2);
    expect(readTasks()).toHaveLength(1);
    expect(readTasks()[0].title).toBe("Pending one");
  });
});

// ─── queueStats ──────────────────────────────────────────────────────────────

describe("queueStats", () => {
  test("returns correct counts", () => {
    const a = addTask("A");
    const b = addTask("B");
    const c = addTask("C");
    switchTask(a.id);
    doneTask(b.id);
    expect(queueStats()).toEqual({ pending: 1, active: 1, done: 1, dropped: 0, total: 3 });
  });
});

// ─── CLI dispatch ────────────────────────────────────────────────────────────

describe("CLI", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/queue.ts", ...args], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_QUEUE_DIR: TMP },
    });

  test("help prints usage", () => {
    const r = run("help");
    expect(r.stdout.toString()).toContain("Work queue for task lifecycle");
    expect(r.status).toBe(0);
  });

  test("show on empty queue", () => {
    const r = run("show");
    expect(r.stdout.toString()).toContain("Empty");
    expect(r.status).toBe(0);
  });

  test("add creates task", () => {
    const r = run("add", "--agent", "ralph", "Write tests");
    expect(r.stdout.toString()).toContain("Write tests");
    expect(r.status).toBe(0);
    expect(readTasks()).toHaveLength(1);
  });

  test("next activates first pending", () => {
    addTask("First task");
    const r = run("next");
    expect(r.stdout.toString()).toContain("Active:");
    expect(r.status).toBe(0);
  });

  test("done completes active task", () => {
    const t = addTask("Complete me");
    switchTask(t.id);
    const r = run("done");
    expect(r.stdout.toString()).toContain("Done:");
    expect(r.status).toBe(0);
  });

  test("rm drops task", () => {
    const t = addTask("Drop target");
    const r = run("rm", t.id);
    expect(r.stdout.toString()).toContain("Dropped");
    expect(r.status).toBe(0);
  });

  test("switch changes active task", () => {
    const t = addTask("Switch target");
    const r = run("switch", t.id);
    expect(r.stdout.toString()).toContain("Switched to:");
    expect(r.status).toBe(0);
  });

  test("status shows queue state", () => {
    const r = run("status");
    expect(r.stdout.toString()).toContain("pending:");
    expect(r.status).toBe(0);
  });

  test("unknown command prints error", () => {
    const r = run("bogus");
    expect(r.stderr.toString()).toContain("Unknown command: bogus");
    expect(r.status).toBe(2);
  });

  test("compact removes resolved", () => {
    const t = addTask("To compact");
    doneTask(t.id);
    const r = run("compact");
    expect(r.stdout.toString()).toContain("removed 1");
    expect(r.status).toBe(0);
  });
});

// ─── Skill delegation ────────────────────────────────────────────────────────

describe("skill delegation", () => {
  test("skill queue status routes correctly", () => {
    const r = spawnSync(BUN, ["run", "lib/skill.ts", "queue", "status"], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_QUEUE_DIR: TMP },
    });
    expect(r.stdout.toString()).toContain("pending:");
    expect(r.status).toBe(0);
  });
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

describe("dashboard", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/queue.ts", ...args], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_QUEUE_DIR: TMP },
    });

  test("renders empty dashboard", () => {
    const r = run("dashboard");
    expect(r.stdout.toString()).toContain("QUEUE DASHBOARD");
    expect(r.stdout.toString()).toContain("ACTIVE TASK");
    expect(r.stdout.toString()).toContain("PENDING (0)");
    expect(r.stdout.toString()).toContain("RECENTLY DONE (0 total)");
    expect(r.status).toBe(0);
  });

  test("shows active task details", () => {
    const t = addTask("Dashboard test task", { agent: "ralph", tags: ["demo"] });
    switchTask(t.id);
    const r = run("dashboard");
    const out = r.stdout.toString();
    expect(out).toContain("Dashboard test task");
    expect(out).toContain("@ralph");
    expect(out).toContain("demo");
    expect(out).toContain("Running:");
    expect(r.status).toBe(0);
  });

  test("shows pending and done sections", () => {
    const a = addTask("Pending item");
    const b = addTask("Done item");
    doneTask(b.id);
    const r = run("dashboard");
    const out = r.stdout.toString();
    expect(out).toContain("PENDING (1)");
    expect(out).toContain("Pending item");
    expect(out).toContain("RECENTLY DONE (1 total)");
    expect(out).toContain("Done item");
    expect(r.status).toBe(0);
  });

  test("dash alias works", () => {
    const r = run("dash");
    expect(r.stdout.toString()).toContain("QUEUE DASHBOARD");
    expect(r.status).toBe(0);
  });
});

// ─── GitHub Issues bridge ────────────────────────────────────────────────────

describe("GitHub issue bridge", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/queue.ts", ...args], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_QUEUE_DIR: TMP },
    });

  test("link associates issue with task", () => {
    const t = addTask("Linkable task");
    const r = run("link", t.id, "l-agence/agence#42");
    expect(r.stdout.toString()).toContain("Linked:");
    expect(r.stdout.toString()).toContain("l-agence/agence#42");
    expect(r.status).toBe(0);

    // Verify persisted
    const tasks = readTasks();
    expect(tasks[0].github_issue).toBe("l-agence/agence#42");
  });

  test("unlink removes issue association", () => {
    const t = addTask("Unlinkable task");
    // Manually set github_issue
    const tasks = readTasks();
    tasks[0].github_issue = "l-agence/agence#99";
    writeFileSync(join(TMP, "tasks.jsonl"), tasks.map(t => JSON.stringify(t)).join("\n") + "\n");

    const r = run("unlink", t.id);
    expect(r.stdout.toString()).toContain("Unlinked:");
    expect(r.status).toBe(0);
    expect(readTasks()[0].github_issue).toBeUndefined();
  });

  test("unlink fails for task without issue", () => {
    const t = addTask("No issue task");
    const r = run("unlink", t.id);
    expect(r.stderr.toString()).toContain("has no issue link");
    expect(r.status).toBe(1);
  });

  test("link fails for non-existent task", () => {
    const r = run("link", "deadbeef", "#42");
    expect(r.stderr.toString()).toContain("Task not found");
    expect(r.status).toBe(1);
  });

  test("link validates issue reference format", () => {
    const t = addTask("Bad ref task");
    const r = run("link", t.id, "not-an-issue-ref!!!");
    expect(r.stderr.toString()).toContain("Invalid issue reference");
    expect(r.status).toBe(1);
  });

  test("import without argument shows usage", () => {
    const r = run("import");
    expect(r.stderr.toString()).toContain("Usage:");
    expect(r.status).toBe(2);
  });

  test("dashboard shows github_issue on linked task", () => {
    const t = addTask("Linked dashboard task");
    switchTask(t.id);
    // Set issue link
    const tasks = readTasks();
    tasks[0].github_issue = "l-agence/agence#7";
    writeFileSync(join(TMP, "tasks.jsonl"), tasks.map(t => JSON.stringify(t)).join("\n") + "\n");

    const r = run("dashboard");
    expect(r.stdout.toString()).toContain("l-agence/agence#7");
    expect(r.status).toBe(0);
  });
});
