import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import {
  pathOverlaps, scopeOverlaps, findConflicts,
  claimTask, releaseTask, activeScopeMap,
  verifyDiffInScope,
  type ScopeConflict, type ClaimResult,
} from "../../lib/scope.ts";

const AGENCE_ROOT = join(import.meta.dir, "../..");
const TASKS_FILE = join(AGENCE_ROOT, "organic", "tasks.json");
const LOCK_FILE = join(AGENCE_ROOT, "organic", ".tasks.lock");

// Helper: run scope.ts CLI
function runScope(...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "scope.ts"), ...args], {
    cwd: AGENCE_ROOT, timeout: 15_000,
    env: { ...process.env, AGENCE_ROOT },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout?.toString() || "",
    stderr: r.stderr?.toString() || "",
  };
}

// Helper: save/restore tasks.json to avoid test pollution
let originalTasks: string;

beforeEach(() => {
  originalTasks = existsSync(TASKS_FILE) ? readFileSync(TASKS_FILE, "utf-8") : '{"tasks":[]}';
  // Clean stale lock
  if (existsSync(LOCK_FILE)) rmSync(LOCK_FILE);
});

afterEach(() => {
  // Restore original tasks
  writeFileSync(TASKS_FILE, originalTasks, "utf-8");
  if (existsSync(LOCK_FILE)) rmSync(LOCK_FILE);
});

// ─── Compilation ─────────────────────────────────────────────────────────────

describe("scope.ts — compilation", () => {
  test("compiles without errors", () => {
    const r = spawnSync("bun", ["build", join(AGENCE_ROOT, "lib", "scope.ts"), "--no-bundle"], {
      cwd: AGENCE_ROOT, timeout: 15_000,
    });
    expect(r.status).toBe(0);
  });
});

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

describe("scope.ts — CLI dispatch", () => {
  test("help exits 0 and shows commands", () => {
    const r = runScope("help");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("claim");
    expect(r.stderr).toContain("check");
    expect(r.stderr).toContain("release");
    expect(r.stderr).toContain("active");
    expect(r.stderr).toContain("verify");
  });

  test("no args exits 2 with usage", () => {
    const r = runScope();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage:");
  });

  test("unknown command exits 2", () => {
    const r = runScope("bogus");
    expect(r.status).toBe(2);
  });

  test("claim without args exits 2", () => {
    const r = runScope("claim");
    expect(r.status).toBe(2);
  });

  test("check without args exits 2", () => {
    const r = runScope("check");
    expect(r.status).toBe(2);
  });

  test("release without args exits 2", () => {
    const r = runScope("release");
    expect(r.status).toBe(2);
  });

  test("check nonexistent task exits 1", () => {
    const r = runScope("check", "NONEXISTENT-99999");
    expect(r.status).toBe(1);
  });
});

// ─── Path Overlap Detection ──────────────────────────────────────────────────

describe("scope.ts — pathOverlaps", () => {
  test("exact file match", () => {
    expect(pathOverlaps("lib/guard.ts", "lib/guard.ts")).toBe(true);
  });

  test("different files don't overlap", () => {
    expect(pathOverlaps("lib/guard.ts", "lib/matrix.ts")).toBe(false);
  });

  test("directory contains file", () => {
    expect(pathOverlaps("lib/", "lib/guard.ts")).toBe(true);
  });

  test("file in directory (reversed)", () => {
    expect(pathOverlaps("lib/guard.ts", "lib/")).toBe(true);
  });

  test("nested directories overlap", () => {
    expect(pathOverlaps("lib/", "lib/drivers/")).toBe(true);
  });

  test("sibling directories don't overlap", () => {
    expect(pathOverlaps("lib/", "tests/")).toBe(false);
  });

  test("partial name doesn't match (lib vs lib2)", () => {
    expect(pathOverlaps("lib/", "lib2/foo.ts")).toBe(false);
  });

  test("root prefix matches everything", () => {
    expect(pathOverlaps("lib/", "lib/deep/nested/file.ts")).toBe(true);
  });
});

// ─── Scope Overlap Detection ─────────────────────────────────────────────────

describe("scope.ts — scopeOverlaps", () => {
  test("disjoint scopes return empty", () => {
    expect(scopeOverlaps(["lib/"], ["tests/"])).toEqual([]);
  });

  test("overlapping dirs detected", () => {
    const result = scopeOverlaps(["lib/"], ["lib/guard.ts"]);
    expect(result.length).toBe(1);
    expect(result[0]).toContain("∩");
  });

  test("multiple overlaps found", () => {
    const result = scopeOverlaps(["lib/", "tests/"], ["lib/guard.ts", "tests/unit/"]);
    expect(result.length).toBe(2);
  });

  test("no overlap for completely separate scopes", () => {
    const result = scopeOverlaps(["codex/", "organic/"], ["lib/", "tests/"]);
    expect(result.length).toBe(0);
  });
});

// ─── Conflict Detection ──────────────────────────────────────────────────────

describe("scope.ts — findConflicts", () => {
  const tasks = [
    { id: "A", repo: "x", title: "A", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/guard.ts", "lib/policy.ts"] },
    { id: "B", repo: "x", title: "B", state: "%", priority: 1, stars: 0, heat: 0, agent: "@ralph", created: "", updated: "", scope: ["tests/", "codex/"] },
    { id: "C", repo: "x", title: "C", state: "-", priority: 1, stars: 0, heat: 0, agent: "@sonya", created: "", updated: "", scope: ["lib/"] },
    { id: "D", repo: "x", title: "D", state: "%", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "", scope: ["lib/matrix.ts"] },
  ];

  test("detects collision with active task's scope", () => {
    const conflicts = findConflicts("NEW", ["lib/guard.ts"], tasks);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].task_id).toBe("A");
  });

  test("ignores completed tasks", () => {
    // Task C has lib/ but is completed (state="-")
    const conflicts = findConflicts("NEW", ["lib/foo.ts"], tasks);
    expect(conflicts.length).toBe(0);
  });

  test("ignores tasks without agent", () => {
    // Task D has lib/matrix.ts but no agent
    const conflicts = findConflicts("NEW", ["lib/matrix.ts"], tasks);
    expect(conflicts.length).toBe(0);
  });

  test("global scope conflicts with all active tasks", () => {
    const conflicts = findConflicts("NEW", ["*"], tasks);
    expect(conflicts.length).toBe(2); // A and B (active + have agent)
  });

  test("no conflict with disjoint scope", () => {
    const conflicts = findConflicts("NEW", ["organic/tasks.json"], tasks);
    expect(conflicts.length).toBe(0);
  });

  test("doesn't conflict with self", () => {
    const conflicts = findConflicts("A", ["lib/guard.ts"], tasks);
    expect(conflicts.length).toBe(0); // Self excluded
  });
});

// ─── Atomic Claim (Integration) ──────────────────────────────────────────────

describe("scope.ts — claimTask", () => {
  // Set up a test task with scope
  function setupTestTasks(tasks: any[]): void {
    writeFileSync(TASKS_FILE, JSON.stringify({ tasks }, null, 2) + "\n");
  }

  test("claims unowned task successfully", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Test", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "", scope: ["lib/"] },
    ]);
    const result = claimTask("T1", "copilot");
    expect(result.success).toBe(true);
    expect(result.agent).toBe("@copilot");
  });

  test("prevents double-claim by different agent", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Test", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
    ]);
    const result = claimTask("T1", "ralph");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("already claimed");
  });

  test("allows re-claim by same agent", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Test", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
    ]);
    const result = claimTask("T1", "copilot");
    expect(result.success).toBe(true);
  });

  test("blocks claim on scope collision", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Active", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/guard.ts"] },
      { id: "T2", repo: "x", title: "Incoming", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "", scope: ["lib/"] },
    ]);
    const result = claimTask("T2", "ralph");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("scope collision");
    expect(result.conflicts!.length).toBe(1);
    expect(result.conflicts![0].task_id).toBe("T1");
  });

  test("force overrides scope collision", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Active", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
      { id: "T2", repo: "x", title: "Forced", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "", scope: ["lib/matrix.ts"] },
    ]);
    const result = claimTask("T2", "ralph", true);
    expect(result.success).toBe(true);
  });

  test("allows claim when scopes don't overlap", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Active", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
      { id: "T2", repo: "x", title: "Disjoint", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "", scope: ["tests/", "codex/"] },
    ]);
    const result = claimTask("T2", "ralph");
    expect(result.success).toBe(true);
  });

  test("task without scope can be claimed freely", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Active", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
      { id: "T2", repo: "x", title: "NoScope", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "" },
    ]);
    const result = claimTask("T2", "ralph");
    expect(result.success).toBe(true);
  });

  test("nonexistent task returns failure", () => {
    setupTestTasks([]);
    const result = claimTask("NOPE", "copilot");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("not found");
  });
});

// ─── Release ─────────────────────────────────────────────────────────────────

describe("scope.ts — releaseTask", () => {
  function setupTestTasks(tasks: any[]): void {
    writeFileSync(TASKS_FILE, JSON.stringify({ tasks }, null, 2) + "\n");
  }

  test("releases claimed task", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Active", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
    ]);
    const ok = releaseTask("T1");
    expect(ok).toBe(true);

    // Verify it's now unassigned
    const data = JSON.parse(readFileSync(TASKS_FILE, "utf-8"));
    expect(data.tasks[0].agent).toBeNull();
    expect(data.tasks[0].state).toBe("+");
  });

  test("returns false for nonexistent task", () => {
    setupTestTasks([]);
    const ok = releaseTask("NOPE");
    expect(ok).toBe(false);
  });
});

// ─── Active Scope Map ────────────────────────────────────────────────────────

describe("scope.ts — activeScopeMap", () => {
  function setupTestTasks(tasks: any[]): void {
    writeFileSync(TASKS_FILE, JSON.stringify({ tasks }, null, 2) + "\n");
  }

  test("returns only active tasks with scope and agent", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Active", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "", scope: ["lib/"] },
      { id: "T2", repo: "x", title: "Done", state: "-", priority: 1, stars: 0, heat: 0, agent: "@ralph", created: "", updated: "", scope: ["tests/"] },
      { id: "T3", repo: "x", title: "NoScope", state: "%", priority: 1, stars: 0, heat: 0, agent: "@sonya", created: "", updated: "" },
    ]);
    const map = activeScopeMap();
    expect(map.size).toBe(1);
    expect(map.has("T1")).toBe(true);
    expect(map.get("T1")!.scope).toEqual(["lib/"]);
  });
});

// ─── Horde Lock (Concurrency) ────────────────────────────────────────────────

describe("scope.ts — horde lock", () => {
  function setupTestTasks(tasks: any[]): void {
    writeFileSync(TASKS_FILE, JSON.stringify({ tasks }, null, 2) + "\n");
  }

  test("stale lock is cleaned up", () => {
    // Create a lock with a dead PID
    writeFileSync(LOCK_FILE, "999999999\n");
    setupTestTasks([
      { id: "T1", repo: "x", title: "Test", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "" },
    ]);
    // Should succeed because PID 999999999 is dead
    const result = claimTask("T1", "copilot");
    expect(result.success).toBe(true);
  });

  test("concurrent claims result in only one winner", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "Race", state: "+", priority: 1, stars: 0, heat: 0, agent: null, created: "", updated: "", scope: ["lib/"] },
    ]);

    // Simulate: two processes try to claim the same task
    const r1 = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "scope.ts"), "claim", "T1", "copilot"], {
      cwd: AGENCE_ROOT, timeout: 10_000,
      env: { ...process.env, AGENCE_ROOT },
    });
    const r2 = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "scope.ts"), "claim", "T1", "ralph"], {
      cwd: AGENCE_ROOT, timeout: 10_000,
      env: { ...process.env, AGENCE_ROOT },
    });

    // One should succeed, one should fail (already claimed)
    const results = [r1.status, r2.status].sort();
    expect(results).toEqual([0, 1]);
  });
});

// ─── Diff Verification ───────────────────────────────────────────────────────

describe("scope.ts — verifyDiffInScope", () => {
  function setupTestTasks(tasks: any[]): void {
    writeFileSync(TASKS_FILE, JSON.stringify({ tasks }, null, 2) + "\n");
  }

  test("no task returns failure", () => {
    const result = verifyDiffInScope("");
    expect(result.in_scope).toBe(false);
  });

  test("unknown task returns failure", () => {
    setupTestTasks([]);
    const result = verifyDiffInScope("NOPE");
    expect(result.in_scope).toBe(false);
  });

  test("task without scope passes (unrestricted)", () => {
    setupTestTasks([
      { id: "T1", repo: "x", title: "NoScope", state: "%", priority: 1, stars: 0, heat: 0, agent: "@copilot", created: "", updated: "" },
    ]);
    const result = verifyDiffInScope("T1");
    expect(result.in_scope).toBe(true);
    expect(result.declared_scope).toEqual([]);
  });
});
