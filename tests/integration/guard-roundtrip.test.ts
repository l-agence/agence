// ═══════════════════════════════════════════════════════════════════════════════
// Integration tests: guard→shell eval round-trip + socket→guard flow
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, test, expect } from "bun:test";
import { join } from "path";

const AGENCE_ROOT = join(import.meta.dir, "../..");
const GUARD = join(AGENCE_ROOT, "lib/guard.ts");
const AGENTD = join(AGENCE_ROOT, "bin/agentd");

// ─── Guard → Shell Eval Round-Trip ───────────────────────────────────────────
//
// Validates that guard.ts "check" output can be eval'd by real bash and
// produces correct variable bindings. This is the critical TCB boundary:
// if guard output can't be safely eval'd, the whole policy enforcement breaks.

describe("Integration: guard→shell eval round-trip", () => {

  test("T0 allow: guard exports eval to correct bash variables", () => {
    // Run guard.ts check → pipe stdout to bash eval → echo variables
    const result = Bun.spawnSync(["bash", "-c", `
      eval "$(bun run "${GUARD}" check "git status" 2>/dev/null)"
      echo "APPROVED=$_GUARD_APPROVED"
      echo "TIER=$_GUARD_TIER"
    `], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      timeout: 15_000,
    });
    const out = result.stdout.toString().trim();
    expect(out).toContain("APPROVED=1");
    expect(out).toContain("TIER=T0");
    expect(result.exitCode).toBe(0);
  });

  test("T2 deny: guard exports eval to denied variables", () => {
    const result = Bun.spawnSync(["bash", "-c", `
      eval "$(bun run "${GUARD}" check "xyzzy-never-allowed" 2>/dev/null)"
      echo "APPROVED=$_GUARD_APPROVED"
      echo "TIER=$_GUARD_TIER"
    `], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      timeout: 15_000,
    });
    const out = result.stdout.toString().trim();
    expect(out).toContain("APPROVED=0");
    expect(out).toContain("TIER=T2");
  });

  test("T3 deny: dangerous command blocked end-to-end", () => {
    const result = Bun.spawnSync(["bash", "-c", `
      eval "$(bun run "${GUARD}" check "rm -rf /" 2>/dev/null)"
      echo "APPROVED=$_GUARD_APPROVED"
      echo "TIER=$_GUARD_TIER"
    `], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      timeout: 15_000,
    });
    const out = result.stdout.toString().trim();
    expect(out).toContain("APPROVED=0");
    // T2 or T3 — both are denied
    expect(out).toMatch(/TIER=T[23]/);
  });

  test("guard exports survive eval with special characters in reason", () => {
    // A command with quotes/spaces — the reason string must survive bash eval
    const result = Bun.spawnSync(["bash", "-c", `
      eval "$(bun run "${GUARD}" check "git log --oneline -5" 2>/dev/null)"
      echo "APPROVED=$_GUARD_APPROVED"
      echo "REASON=$_GUARD_REASON"
    `], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      timeout: 15_000,
    });
    const out = result.stdout.toString().trim();
    expect(out).toContain("APPROVED=1");
    // Reason must be non-empty and contain the rule match
    expect(out).toMatch(/REASON=.+/);
  });

  test("classify JSON→bash jq round-trip", () => {
    // Guard classify JSON output can be parsed by jq in bash
    const result = Bun.spawnSync(["bash", "-c", `
      json="$(bun run "${GUARD}" classify "git status" 2>/dev/null)"
      echo "TIER=$(echo "$json" | jq -r .tier)"
      echo "ACTION=$(echo "$json" | jq -r .action)"
    `], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      timeout: 15_000,
    });
    const out = result.stdout.toString().trim();
    expect(out).toContain("TIER=T0");
    expect(out).toContain("ACTION=allow");
  });
});

// ─── Socket → Guard Flow ─────────────────────────────────────────────────────
//
// Tests that agentd's _socket_handler correctly gates commands through guard.ts
// before routing to tmux/docker. We invoke _socket_handler directly with piped
// stdin (no socat needed) and verify:
//   - Denied commands: exit 1, stderr contains guard denial
//   - Approved commands: pass the guard gate (will fail at tmux routing, which
//     proves the guard allowed it through)

describe("Integration: socket→guard flow", () => {

  test("denied command: _socket_handler rejects via guard", () => {
    const result = Bun.spawnSync(["bash", AGENTD, "_socket_handler", "test-tangent"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      stdin: Buffer.from("xyzzy-evil-command\n"),
      timeout: 15_000,
    });
    expect(result.exitCode).toBe(1);
    const stderr = result.stderr.toString();
    expect(stderr).toContain("Guard denied");
  });

  test("empty command: _socket_handler exits cleanly", () => {
    const result = Bun.spawnSync(["bash", AGENTD, "_socket_handler", "test-tangent"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      stdin: Buffer.from("\n"),
      timeout: 15_000,
    });
    // Empty command → exit 0 (no-op)
    expect(result.exitCode).toBe(0);
  });

  test("no tangent ID: _socket_handler exits with error", () => {
    const result = Bun.spawnSync(["bash", AGENTD, "_socket_handler"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
      stdin: Buffer.from("git status\n"),
      timeout: 15_000,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("No tangent ID");
  });

  test("allowed command: passes guard gate (fails at routing, not guard)", () => {
    // "git status" is T0 — guard should approve, then fail at tmux/docker routing
    // The key assertion: stderr should NOT contain "Guard denied"
    const result = Bun.spawnSync(["bash", AGENTD, "_socket_handler", "test-tangent"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
      stdin: Buffer.from("git status\n"),
      timeout: 15_000,
    });
    const stderr = result.stderr.toString();
    // Should NOT be denied by guard
    expect(stderr).not.toContain("Guard denied");
    expect(stderr).not.toContain("Guard unavailable");
    // Will fail at tmux/docker routing (expected — no tmux session running)
    // but that proves the guard gate was passed
  });
});
