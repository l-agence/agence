import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const TMP = join(import.meta.dir, ".tmp-session-end-test");
const BUN = process.execPath;
const ROOT = join(import.meta.dir, "../..");

function ensureClean(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(join(TMP, "nexus", ".aisessions", "01"), { recursive: true });
}

beforeEach(() => {
  ensureClean();
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
});

function writeMeta(sid: string, meta: Record<string, unknown>): string {
  const p = join(TMP, "nexus", ".aisessions", "01", `${sid}.meta.json`);
  writeFileSync(p, JSON.stringify(meta) + "\n");
  return p;
}

function runSession(...args: string[]) {
  return spawnSync(BUN, ["run", "lib/session.ts", ...args], {
    cwd: ROOT,
    env: { ...process.env, AI_ROOT: TMP, AGENCE_ROOT: TMP },
  });
}

describe("session end (CLI)", () => {
  test("updates meta with exit code and status", () => {
    const metaPath = writeMeta("test-end", {
      session_id: "test-end", agent: "copilot", role: "agentic",
      shell: "bash", git_root: TMP,
      timestamp: "2026-05-01T10:00:00Z", status: "active",
      exit_code: null, verification_status: "unverified", task_id: "deadbeef",
    });

    const r = runSession("end", "test-end", "0");
    expect(r.stdout.toString()).toContain("Ended:");
    expect(r.status).toBe(0);

    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    expect(meta.exit_code).toBe(0);
    expect(meta.status).toBe("ended");
    expect(meta.verification_status).toBe("passed");
  });

  test("marks failed for non-zero exit", () => {
    const metaPath = writeMeta("test-fail", {
      session_id: "test-fail", agent: "ralph", role: "agentic",
      shell: "bash", git_root: TMP,
      timestamp: "2026-05-01T10:00:00Z", status: "active",
      exit_code: null, verification_status: "unverified",
    });

    runSession("end", "test-fail", "1");
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    expect(meta.exit_code).toBe(1);
    expect(meta.verification_status).toBe("failed");
  });

  test("writes .airuns index when task_id present", () => {
    writeMeta("test-airuns", {
      session_id: "test-airuns", agent: "copilot", role: "agentic",
      shell: "bash", git_root: TMP,
      timestamp: "2026-05-01T12:00:00Z", status: "active",
      exit_code: null, verification_status: "unverified", task_id: "abcd1234",
    });

    runSession("end", "test-airuns", "0");

    const indexFile = join(TMP, ".airuns", "abcd1234.jsonl");
    expect(existsSync(indexFile)).toBe(true);
    const records = readFileSync(indexFile, "utf-8").split("\n").filter(Boolean);
    expect(records).toHaveLength(1);
    const record = JSON.parse(records[0]);
    expect(record.session_id).toBe("test-airuns");
    expect(record.exit_code).toBe(0);
  });

  test("returns error for non-existent session", () => {
    const r = runSession("end", "nonexistent", "0");
    expect(r.status).not.toBe(0);
  });
});

describe("session airuns (CLI)", () => {
  test("rejects invalid task_id format", () => {
    const r = runSession("airuns", "../etc/passwd");
    expect(r.stderr.toString()).toContain("hex");
    expect(r.status).not.toBe(0);
  });

  test("reports no sessions for empty index", () => {
    const r = runSession("airuns", "aaaa1111");
    expect(r.stdout.toString()).toContain("No sessions recorded");
    expect(r.status).toBe(0);
  });
});
