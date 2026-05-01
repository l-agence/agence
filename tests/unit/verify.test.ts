import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { readQueue, addItem, ingestFindings, ackItem, rejectItem, queueStats, compactQueue } from "../../lib/verify.ts";

const TMP = join(import.meta.dir, ".tmp-verify-test");
const BUN = process.execPath;

function ensureClean(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });
}

beforeEach(() => {
  ensureClean();
  process.env.AGENCE_VERIFY_DIR = TMP;
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  delete process.env.AGENCE_VERIFY_DIR;
});

// ─── readQueue ───────────────────────────────────────────────────────────────

describe("readQueue", () => {
  test("returns empty array when no queue file", () => {
    expect(readQueue()).toEqual([]);
  });

  test("returns empty array for empty file", () => {
    const { writeFileSync } = require("fs");
    writeFileSync(join(TMP, "queue.jsonl"), "");
    expect(readQueue()).toEqual([]);
  });
});

// ─── addItem ─────────────────────────────────────────────────────────────────

describe("addItem", () => {
  test("creates entry with correct schema", () => {
    const item = addItem({
      severity: "high",
      component: "auth",
      finding: "Missing rate limit",
      fix: "Add middleware",
      verify: "curl test",
    });
    expect(item.id).toHaveLength(8); // 4 bytes hex
    expect(item.status).toBe("pending");
    expect(item.severity).toBe("high");
    expect(item.component).toBe("auth");
    expect(item.finding).toBe("Missing rate limit");
    expect(item.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("persists to JSONL file", () => {
    addItem({ severity: "low", component: "ui", finding: "Typo", fix: "", verify: "" });
    addItem({ severity: "medium", component: "api", finding: "N+1 query", fix: "", verify: "" });
    const items = readQueue();
    expect(items).toHaveLength(2);
    expect(items[0].finding).toBe("Typo");
    expect(items[1].finding).toBe("N+1 query");
  });

  test("includes optional source field", () => {
    const item = addItem({ severity: "medium", component: "x", finding: "f", fix: "", verify: "", source: "integrate" });
    expect(item.source).toBe("integrate");
  });
});

// ─── ingestFindings ──────────────────────────────────────────────────────────

describe("ingestFindings", () => {
  test("queues only MANUAL_VERIFY items", () => {
    const json = JSON.stringify([
      { severity: "high", component: "auth", finding: "Issue 1", fix: "Fix 1", verify: "V1", status: "MANUAL_VERIFY" },
      { severity: "low", component: "ui", finding: "Issue 2", fix: "Fix 2", verify: "V2", status: "FIXED" },
      { severity: "medium", component: "api", finding: "Issue 3", fix: "Fix 3", verify: "V3", status: "MANUAL_VERIFY" },
    ]);
    const { added, skipped } = ingestFindings(json);
    expect(added).toBe(2);
    expect(skipped).toBe(1);
    expect(readQueue()).toHaveLength(2);
  });

  test("queues items without explicit status", () => {
    const json = JSON.stringify([
      { severity: "high", component: "core", finding: "No status field" },
    ]);
    const { added, skipped } = ingestFindings(json);
    expect(added).toBe(1);
    expect(skipped).toBe(0);
  });

  test("tags items with source", () => {
    const json = JSON.stringify([{ finding: "thing", status: "MANUAL_VERIFY" }]);
    ingestFindings(json, "integrate-v2");
    const items = readQueue();
    expect(items[0].source).toBe("integrate-v2");
  });

  test("handles malformed JSON gracefully", () => {
    const { added, skipped } = ingestFindings("not json at all {{{");
    expect(added).toBe(0);
    expect(skipped).toBe(0);
  });

  test("extracts JSON array from surrounding text", () => {
    const json = `Here are the findings:\n[{"finding":"embedded","status":"MANUAL_VERIFY"}]\nEnd.`;
    const { added } = ingestFindings(json);
    expect(added).toBe(1);
  });

  test("handles single object (non-array)", () => {
    const json = JSON.stringify({ finding: "solo item", status: "MANUAL_VERIFY", severity: "critical" });
    const { added } = ingestFindings(json);
    expect(added).toBe(1);
    expect(readQueue()[0].severity).toBe("critical");
  });
});

// ─── ackItem / rejectItem ────────────────────────────────────────────────────

describe("ackItem", () => {
  test("transitions pending → acked", () => {
    const item = addItem({ severity: "high", component: "a", finding: "f", fix: "", verify: "" });
    expect(ackItem(item.id)).toBe(true);
    const q = readQueue();
    expect(q[0].status).toBe("acked");
    expect(q[0].acked_at).toBeDefined();
  });

  test("returns false for non-existent ID", () => {
    expect(ackItem("deadbeef")).toBe(false);
  });

  test("returns false for already-acked item", () => {
    const item = addItem({ severity: "low", component: "b", finding: "g", fix: "", verify: "" });
    ackItem(item.id);
    expect(ackItem(item.id)).toBe(false);
  });
});

describe("rejectItem", () => {
  test("transitions pending → rejected", () => {
    const item = addItem({ severity: "medium", component: "c", finding: "h", fix: "", verify: "" });
    expect(rejectItem(item.id)).toBe(true);
    const q = readQueue();
    expect(q[0].status).toBe("rejected");
    expect(q[0].acked_at).toBeDefined();
  });

  test("returns false for already-rejected item", () => {
    const item = addItem({ severity: "low", component: "d", finding: "i", fix: "", verify: "" });
    rejectItem(item.id);
    expect(rejectItem(item.id)).toBe(false);
  });
});

// ─── compactQueue ────────────────────────────────────────────────────────────

describe("compactQueue", () => {
  test("removes resolved items, keeps pending", () => {
    const a = addItem({ severity: "high", component: "x", finding: "1", fix: "", verify: "" });
    const b = addItem({ severity: "low", component: "y", finding: "2", fix: "", verify: "" });
    addItem({ severity: "medium", component: "z", finding: "3", fix: "", verify: "" });
    ackItem(a.id);
    rejectItem(b.id);
    const removed = compactQueue();
    expect(removed).toBe(2);
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].finding).toBe("3");
  });

  test("returns 0 when nothing to compact", () => {
    addItem({ severity: "low", component: "a", finding: "pending", fix: "", verify: "" });
    expect(compactQueue()).toBe(0);
  });
});

// ─── queueStats ──────────────────────────────────────────────────────────────

describe("queueStats", () => {
  test("returns correct counts", () => {
    const a = addItem({ severity: "high", component: "a", finding: "1", fix: "", verify: "" });
    const b = addItem({ severity: "low", component: "b", finding: "2", fix: "", verify: "" });
    addItem({ severity: "medium", component: "c", finding: "3", fix: "", verify: "" });
    ackItem(a.id);
    rejectItem(b.id);
    const stats = queueStats();
    expect(stats).toEqual({ pending: 1, acked: 1, rejected: 1, total: 3 });
  });

  test("returns zeros for empty queue", () => {
    expect(queueStats()).toEqual({ pending: 0, acked: 0, rejected: 0, total: 0 });
  });
});

// ─── CLI dispatch ────────────────────────────────────────────────────────────

describe("CLI", () => {
  const run = (...args: string[]) =>
    spawnSync(BUN, ["run", "lib/verify.ts", ...args], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_VERIFY_DIR: TMP },
    });

  test("help prints usage", () => {
    const r = run("help");
    expect(r.stdout.toString()).toContain("MANUAL_VERIFY queue");
    expect(r.status).toBe(0);
  });

  test("status shows zeros for empty queue", () => {
    const r = run("status");
    expect(r.stdout.toString()).toContain("pending:  0");
    expect(r.status).toBe(0);
  });

  test("list on empty queue", () => {
    const r = run("list");
    expect(r.stdout.toString()).toContain("Queue empty");
    expect(r.status).toBe(0);
  });

  test("add creates an item", () => {
    const r = run("add", "--severity", "critical", "--component", "db", "SQL injection risk");
    expect(r.stdout.toString()).toContain("Added:");
    expect(r.stdout.toString()).toContain("critical/db");
    expect(r.status).toBe(0);
    // Confirm item is in queue
    const items = readQueue();
    expect(items).toHaveLength(1);
    expect(items[0].finding).toBe("SQL injection risk");
  });

  test("show displays item JSON", () => {
    const item = addItem({ severity: "high", component: "net", finding: "Open port", fix: "", verify: "" });
    const r = run("show", item.id);
    expect(r.stdout.toString()).toContain('"finding": "Open port"');
    expect(r.status).toBe(0);
  });

  test("show with prefix match", () => {
    const item = addItem({ severity: "low", component: "ui", finding: "Color contrast", fix: "", verify: "" });
    const r = run("show", item.id.slice(0, 4));
    expect(r.stdout.toString()).toContain("Color contrast");
    expect(r.status).toBe(0);
  });

  test("ack transitions item", () => {
    const item = addItem({ severity: "high", component: "x", finding: "f", fix: "", verify: "" });
    const r = run("ack", item.id);
    expect(r.stdout.toString()).toContain("Acknowledged");
    expect(r.status).toBe(0);
    expect(readQueue()[0].status).toBe("acked");
  });

  test("reject transitions item", () => {
    const item = addItem({ severity: "low", component: "y", finding: "g", fix: "", verify: "" });
    const r = run("reject", item.id);
    expect(r.stdout.toString()).toContain("Rejected");
    expect(r.status).toBe(0);
    expect(readQueue()[0].status).toBe("rejected");
  });

  test("compact removes resolved", () => {
    const item = addItem({ severity: "high", component: "z", finding: "h", fix: "", verify: "" });
    ackItem(item.id);
    const r = run("compact");
    expect(r.stdout.toString()).toContain("removed 1");
    expect(r.status).toBe(0);
    expect(readQueue()).toHaveLength(0);
  });

  test("ingest from inline JSON", () => {
    const json = JSON.stringify([{ finding: "inline test", status: "MANUAL_VERIFY" }]);
    const r = run("ingest", json);
    expect(r.stdout.toString()).toContain("1 items queued");
    expect(r.status).toBe(0);
  });

  test("unknown command prints error", () => {
    const r = run("bogus");
    expect(r.stderr.toString()).toContain("Unknown command: bogus");
    expect(r.status).toBe(2);
  });

  test("list --all shows resolved items", () => {
    const a = addItem({ severity: "high", component: "a", finding: "resolved one", fix: "", verify: "" });
    addItem({ severity: "low", component: "b", finding: "pending one", fix: "", verify: "" });
    ackItem(a.id);
    const r = run("list", "--all");
    expect(r.stdout.toString()).toContain("resolved one");
    expect(r.stdout.toString()).toContain("pending one");
  });
});

// ─── Skill delegation ────────────────────────────────────────────────────────

describe("skill delegation", () => {
  test("skill verify status routes correctly", () => {
    const r = spawnSync(BUN, ["run", "lib/skill.ts", "verify", "status"], {
      cwd: join(import.meta.dir, "../.."),
      env: { ...process.env, AGENCE_VERIFY_DIR: TMP },
    });
    expect(r.stdout.toString()).toContain("pending:");
    expect(r.status).toBe(0);
  });
});
