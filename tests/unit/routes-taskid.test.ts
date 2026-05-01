import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const BUN = process.execPath;
const ROOT = join(import.meta.dir, "../..");

describe("^routes (router.ts routes subcommand)", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/router.ts", ...args], { cwd: ROOT, env: process.env });

  test("routes shows current routing context", () => {
    const r = run("routes");
    expect(r.stdout.toString()).toContain("[routes] Current routing context:");
    expect(r.stdout.toString()).toContain("Provider:");
    expect(r.stdout.toString()).toContain("Model:");
    expect(r.stdout.toString()).toContain("Available providers");
    expect(r.status).toBe(0);
  });

  test("status is an alias for routes", () => {
    const r = run("status");
    expect(r.stdout.toString()).toContain("[routes] Current routing context:");
    expect(r.status).toBe(0);
  });

  test("skill routes delegation works", () => {
    const r = spawnSync(BUN, ["run", "lib/skill.ts", "routes"], { cwd: ROOT, env: process.env });
    expect(r.stdout.toString()).toContain("[routes]");
    expect(r.status).toBe(0);
  });
});

describe("AIDO_TASK_ID plumbing (aibash.ts)", () => {
  test("task_id is written to session meta when AGENCE_TASK_ID set", () => {
    const { mkdirSync, readFileSync, rmSync, existsSync } = require("fs");
    const tmp = join(import.meta.dir, ".tmp-taskid-test");
    if (existsSync(tmp)) rmSync(tmp, { recursive: true });
    mkdirSync(tmp, { recursive: true });

    const r = spawnSync(BUN, ["run", "lib/aibash.ts", "init", "--session", "test-task-plumb"], {
      cwd: ROOT,
      env: {
        ...process.env,
        AGENCE_TASK_ID: "deadbeef",
        AGENCE_TANGENT_ID: "tng-42",
        // Point session storage to tmp
        AI_ROOT: tmp,
      },
    });

    const stdout = r.stdout.toString();
    expect(stdout).toContain("AGENCE_TASK_ID='deadbeef'");
    expect(stdout).toContain("AGENCE_TANGENT_ID='tng-42'");

    // Also verify meta file
    const { readdirSync } = require("fs");
    const sessionDir = join(tmp, "nexus", ".aisessions");
    // Find the meta file
    const findMeta = (dir: string): string | null => {
      if (!existsSync(dir)) return null;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const found = findMeta(join(dir, entry.name));
          if (found) return found;
        } else if (entry.name.endsWith(".meta.json")) {
          return join(dir, entry.name);
        }
      }
      return null;
    };

    const metaFile = findMeta(sessionDir);
    expect(metaFile).not.toBe(null);
    const meta = JSON.parse(readFileSync(metaFile!, "utf-8"));
    expect(meta.task_id).toBe("deadbeef");
    expect(meta.tangent_id).toBe("tng-42");

    rmSync(tmp, { recursive: true });
  });

  test("task_id omitted from meta when env not set", () => {
    const { mkdirSync, readFileSync, rmSync, existsSync } = require("fs");
    const tmp = join(import.meta.dir, ".tmp-taskid-test2");
    if (existsSync(tmp)) rmSync(tmp, { recursive: true });
    mkdirSync(tmp, { recursive: true });

    const env = { ...process.env, AI_ROOT: tmp };
    delete env.AGENCE_TASK_ID;
    delete env.AGENCE_TANGENT_ID;

    const r = spawnSync(BUN, ["run", "lib/aibash.ts", "init", "--session", "test-no-task"], {
      cwd: ROOT,
      env,
    });

    const stdout = r.stdout.toString();
    expect(stdout).not.toContain("AGENCE_TASK_ID");

    rmSync(tmp, { recursive: true });
  });
});
