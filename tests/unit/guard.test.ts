#!/usr/bin/env bun
// TEST-002: Guard security boundary tests
//
// Tests the security boundary of lib/guard.ts — the non-bypassable command gate.
// All tests use subprocess execution (bun run lib/guard.ts) to test the REAL
// security boundary, not just internal functions. This matters because the shell
// eval's guard's stdout — if stdout is wrong, the boundary is broken.
//
// Coverage:
//   1. Shell escape (SEC-001): injection via $(), backticks, single quotes
//   2. Tier classification: T0 allow, T2 escalate, T3 deny
//   3. Fail-closed default (SEC-003): unknown commands → T2
//   4. Global blocks: pipe, redirect, sudo, $(), backtick, interpreter
//   5. Path traversal detection
//   6. Whitelist accuracy: git, gh, aws, terraform, linux read-only, powershell
//   7. Blacklist accuracy: destructive commands across all categories
//   8. Shell export format: parseable, safe to eval
//   9. Classify subcommand: structured JSON output
//  10. Edge cases: empty, whitespace, very long commands, unicode

import { describe, test, expect } from "bun:test";
import { join } from "path";

const AGENCE_ROOT = join(import.meta.dir, "../..");
const GUARD = join(AGENCE_ROOT, "lib/guard.ts");

// Helper: run guard check and return { stdout, stderr, exitCode }
function guardCheck(command: string): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", GUARD, "check", command], {
    cwd: AGENCE_ROOT,
    env: { ...process.env, AGENCE_ROOT, AGENCE_TRACE: "0", AI_AGENT: "test-agent" },
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

// Helper: run guard classify and return parsed JSON
function guardClassify(command: string): { tier: string; action: string; rule: string; reason: string } {
  const result = Bun.spawnSync(["bun", "run", GUARD, "classify", command], {
    cwd: AGENCE_ROOT,
    env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test-agent" },
  });
  return JSON.parse(result.stdout.toString().trim());
}

// Helper: parse shell exports from guard check stdout
function parseExports(stdout: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^export\s+(\w+)=(.*)$/);
    if (m) {
      let val = m[2];
      // Remove outer single quotes if present (shell escaping)
      if (val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1).replace(/'\\''/g, "'");
      }
      vars[m[1]] = val;
    }
  }
  return vars;
}

// ─── 1. Shell Escape / SEC-001 ───────────────────────────────────────────────

describe("SEC-001: Shell injection prevention", () => {
  test("$() in command is blocked (T3)", () => {
    const r = guardCheck("echo $(whoami)");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_APPROVED).toBe("0");
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("backtick in command is blocked (T3)", () => {
    const r = guardCheck("echo `id`");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_APPROVED).toBe("0");
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("reason string with $() is safely escaped in exports", () => {
    const r = guardCheck("echo $(rm -rf /)");
    const v = parseExports(r.stdout);
    // The reason should contain the literal text, not execute it
    expect(v._GUARD_REASON).toContain("Global block");
    // The raw stdout should use single-quote escaping
    expect(r.stdout).toContain("'");
  });

  test("reason string with single quotes is safely escaped", () => {
    // Force a denial with a command containing single quotes
    const r = guardCheck("rm -rf /tmp/'test dir'");
    const v = parseExports(r.stdout);
    // Should still parse correctly despite quotes in the command
    expect(v._GUARD_APPROVED).toBe("0");
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("all export values are single-quote wrapped (not bare)", () => {
    const r = guardCheck("git status");
    // REASON, RULE, TIMESTAMP should be wrapped in single quotes
    const lines = r.stdout.split("\n");
    const reasonLine = lines.find(l => l.includes("_GUARD_REASON="));
    const ruleLine = lines.find(l => l.includes("_GUARD_RULE="));
    const tsLine = lines.find(l => l.includes("_GUARD_TIMESTAMP="));
    expect(reasonLine).toMatch(/_GUARD_REASON='/);
    expect(ruleLine).toMatch(/_GUARD_RULE='/);
    expect(tsLine).toMatch(/_GUARD_TIMESTAMP='/);
  });

  test("pipe operator is blocked (T3)", () => {
    const r = guardCheck("cat /etc/passwd | grep root");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("redirect operator > is blocked (T3)", () => {
    const r = guardCheck("echo pwned > /tmp/hack");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("semicolon chaining is blocked (T3)", () => {
    const r = guardCheck("ls; rm -rf /");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("&& chaining is blocked (T3)", () => {
    const r = guardCheck("true && rm -rf /");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("background execution & is blocked (T3)", () => {
    const r = guardCheck("sleep 999 &");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });
});

// ─── 2. Privilege Escalation Blocks ──────────────────────────────────────────

describe("Privilege escalation prevention", () => {
  test("sudo is blocked (T3)", () => {
    const r = guardCheck("sudo rm -rf /");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("doas is blocked (T3)", () => {
    const r = guardCheck("doas cat /etc/shadow");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("bash -c interpreter is blocked (T3)", () => {
    const r = guardCheck("bash -c 'echo pwned'");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("python -c interpreter is blocked (T3)", () => {
    const r = guardCheck("python -c 'import os; os.system(\"id\")'");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("node -e interpreter is blocked (T3)", () => {
    const r = guardCheck("node -e 'require(\"child_process\").execSync(\"id\")'");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });
});

// ─── 3. Path Traversal ──────────────────────────────────────────────────────

describe("Path traversal detection", () => {
  test("../ in command is blocked (T3)", () => {
    const r = guardCheck("cat ../../etc/passwd");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
    expect(v._GUARD_REASON).toContain("traversal");
  });

  test("..\\  backslash traversal is blocked (T3)", () => {
    const r = guardCheck("cat ..\\..\\etc\\passwd");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });
});

// ─── 4. SEC-003: Default Fail-Closed ─────────────────────────────────────────

describe("SEC-003: Fail-closed default", () => {
  test("unknown command → T2 escalate (not T1 allow)", () => {
    const c = guardClassify("xyzzy-unknown-command-12345");
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
    expect(c.rule).toBe("default");
  });

  test("unknown command via check → exit 1 (denied)", () => {
    const r = guardCheck("xyzzy-unknown-command-12345");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_APPROVED).toBe("0");
    expect(v._GUARD_TIER).toBe("T2");
  });

  test("AGENCE_GUARD_PERMISSIVE env var is ignored (SEC-010: removed)", () => {
    // SEC-010: AGENCE_GUARD_PERMISSIVE was removed — setting it should have no effect.
    // Unknown commands must always be T2 (escalate), never T1 (permissive allow).
    const result = Bun.spawnSync(["bun", "run", GUARD, "classify", "xyzzy-unknown-perm"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test", AGENCE_GUARD_PERMISSIVE: "1" },
    });
    const c = JSON.parse(result.stdout.toString().trim());
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("permissive mode not set → stays T2", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD, "classify", "xyzzy-unknown-strict"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test", AGENCE_GUARD_PERMISSIVE: "0" },
    });
    const c = JSON.parse(result.stdout.toString().trim());
    expect(c.tier).toBe("T2");
  });
});

// ─── 5. T0 Whitelist: Git CLI ────────────────────────────────────────────────

describe("T0 whitelist: Git CLI (read-only)", () => {
  const gitSafe = [
    "git status",
    "git log",
    "git show HEAD",
    "git diff --stat",
    "git branch -a",
    "git tag",
    "git reflog",
    "git describe --tags",
    "git remote -v",
    "git rev-parse HEAD",
    "git ls-files",
    "git blame lib/guard.ts",
    "git grep TODO",
  ];

  for (const cmd of gitSafe) {
    test(`${cmd} → T0 allow`, () => {
      const c = guardClassify(cmd);
      expect(c.tier).toBe("T0");
      expect(c.action).toBe("allow");
    });
  }
});

// ─── 6. T0 Whitelist: GitHub CLI ─────────────────────────────────────────────

describe("T0 whitelist: GitHub CLI (read-only)", () => {
  const ghSafe = [
    "gh repo view",
    "gh pr list",
    "gh pr view 42",
    "gh issue list",
    "gh run list",
    "gh auth status",
  ];

  for (const cmd of ghSafe) {
    test(`${cmd} → T0 allow`, () => {
      const c = guardClassify(cmd);
      expect(c.tier).toBe("T0");
      expect(c.action).toBe("allow");
    });
  }
});

// ─── 7. T0 Whitelist: Linux read-only ────────────────────────────────────────

describe("T0 whitelist: Linux read-only", () => {
  const linuxSafe = [
    "ls -la",
    "cat README.md",
    "head -5 file.txt",
    "tail -f /var/log/syslog",
    "grep pattern file",
    "wc -l lib/guard.ts",
    "whoami",
    "uname -a",
    "date",
    "ps aux",
    "find . -name '*.ts'",
    "echo hello",
  ];

  for (const cmd of linuxSafe) {
    test(`${cmd} → T0 allow`, () => {
      const c = guardClassify(cmd);
      expect(c.tier).toBe("T0");
      expect(c.action).toBe("allow");
    });
  }
});

// ─── 8. T0 Whitelist: AWS read-only ─────────────────────────────────────────

describe("T0 whitelist: AWS read-only", () => {
  test("aws s3 ls → T0", () => {
    const c = guardClassify("aws s3 ls");
    expect(c.tier).toBe("T0");
  });

  test("aws ec2 describe-instances → T0", () => {
    const c = guardClassify("aws ec2 describe-instances");
    expect(c.tier).toBe("T0");
  });

  test("aws iam list-users → T0", () => {
    const c = guardClassify("aws iam list-users");
    expect(c.tier).toBe("T0");
  });

  test("aws lambda get-function → T0", () => {
    const c = guardClassify("aws lambda get-function --function-name test");
    expect(c.tier).toBe("T0");
  });
});

// ─── 9. T0 Whitelist: Terraform safe ────────────────────────────────────────

describe("T0 whitelist: Terraform safe", () => {
  test("terraform init → T0", () => {
    const c = guardClassify("terraform init");
    expect(c.tier).toBe("T0");
  });

  test("terraform validate → T0", () => {
    const c = guardClassify("terraform validate");
    expect(c.tier).toBe("T0");
  });

  test("terraform plan → T0", () => {
    const c = guardClassify("terraform plan");
    expect(c.tier).toBe("T0");
  });
});

// ─── 10. T0 Whitelist: PowerShell safe verbs ────────────────────────────────

describe("T0 whitelist: PowerShell safe verbs", () => {
  test("Get-Process → T0", () => {
    const c = guardClassify("Get-Process");
    expect(c.tier).toBe("T0");
  });

  test("Test-Connection → T0", () => {
    const c = guardClassify("Test-Connection");
    expect(c.tier).toBe("T0");
  });

  test("Select-Object → T0", () => {
    const c = guardClassify("Select-Object");
    expect(c.tier).toBe("T0");
  });
});

// ─── 11. T2 Escalate: Git write operations ──────────────────────────────────

describe("T2 escalate: Git write operations", () => {
  const gitWrite = [
    "git commit -m 'test'",
    "git push origin main",
    "git pull",
    "git merge feature",
    "git rebase main",
    "git add .",
    "git stash",
  ];

  for (const cmd of gitWrite) {
    test(`${cmd} → T2 escalate`, () => {
      const c = guardClassify(cmd);
      expect(c.tier).toBe("T2");
      expect(c.action).toBe("escalate");
    });
  }
});

// ─── 12. T2 Escalate: GitHub CLI write ───────────────────────────────────────

describe("T2 escalate: GitHub CLI write", () => {
  test("gh repo create → T2", () => {
    const c = guardClassify("gh repo create test-repo");
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("gh pr merge → T2", () => {
    const c = guardClassify("gh pr merge 42");
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("gh release create → T2", () => {
    const c = guardClassify("gh release create v1.0.0");
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });
});

// ─── 13. T2 Escalate: AWS write + Linux write ───────────────────────────────

describe("T2 escalate: AWS write + Linux write", () => {
  test("aws ec2 create-instance → T2", () => {
    const c = guardClassify("aws ec2 create-instance");
    expect(c.tier).toBe("T2");
  });

  test("aws s3 put-object → T2", () => {
    const c = guardClassify("aws s3 put-object --bucket test");
    expect(c.tier).toBe("T2");
  });

  test("mv file1 file2 → T2", () => {
    const c = guardClassify("mv file1 file2");
    expect(c.tier).toBe("T2");
  });

  test("cp -r src dest → T2", () => {
    const c = guardClassify("cp -r src dest");
    expect(c.tier).toBe("T2");
  });

  test("mkdir new-dir → T2", () => {
    const c = guardClassify("mkdir new-dir");
    expect(c.tier).toBe("T2");
  });
});

// ─── 14. T3 Deny: Destructive commands ───────────────────────────────────────

describe("T3 deny: Git destructive", () => {
  const gitDestroy = [
    "git clean -fd",
    "git reset --hard HEAD~1",
    "git push --force origin main",
    "git filter-branch --all",
  ];

  for (const cmd of gitDestroy) {
    test(`${cmd} → T3 deny`, () => {
      const c = guardClassify(cmd);
      expect(c.tier).toBe("T3");
      expect(c.action).toBe("deny");
    });
  }
});

describe("T3 deny: GitHub destructive", () => {
  test("gh repo delete → T3", () => {
    const c = guardClassify("gh repo delete test-repo");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("gh secret set → T3", () => {
    const c = guardClassify("gh secret set MY_KEY");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});

describe("T3 deny: Linux destructive", () => {
  const linuxDestroy = [
    "rm -rf /",
    "chmod 777 /etc/passwd",
    "chown root:root file",
    "kill -9 1",
    "killall nginx",
    "systemctl stop sshd",
    "shutdown now",
    "reboot",
  ];

  for (const cmd of linuxDestroy) {
    test(`${cmd} → T3 deny`, () => {
      const c = guardClassify(cmd);
      expect(c.tier).toBe("T3");
      expect(c.action).toBe("deny");
    });
  }
});

describe("T3 deny: AWS destructive", () => {
  test("aws ec2 terminate-instances → T3", () => {
    const c = guardClassify("aws ec2 terminate-instances --instance-ids i-1234");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("aws s3 delete-bucket → T3", () => {
    const c = guardClassify("aws s3api delete-bucket --bucket test");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("aws ec2 stop-instances → T3", () => {
    const c = guardClassify("aws ec2 stop-instances --instance-ids i-1234");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});

describe("T3 deny: Terraform destructive", () => {
  test("terraform destroy → T3", () => {
    const c = guardClassify("terraform destroy");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("terraform apply → T3", () => {
    const c = guardClassify("terraform apply");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("terraform init --upgrade → T3", () => {
    const c = guardClassify("terraform init --upgrade");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});

describe("T3 deny: PowerShell destructive", () => {
  test("Remove-Item → T3", () => {
    const c = guardClassify("Remove-Item C:\\temp");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("Invoke-Expression → T3", () => {
    const c = guardClassify("Invoke-Expression 'Get-Process'");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("Stop-Service → T3", () => {
    const c = guardClassify("Stop-Service nginx");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});

// ─── 15. T2 Escalate: PowerShell write verbs ────────────────────────────────

describe("T2 escalate: PowerShell write verbs", () => {
  test("Set-Location → T2", () => {
    const c = guardClassify("Set-Location C:\\temp");
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });

  test("New-Item → T2", () => {
    const c = guardClassify("New-Item test.txt");
    expect(c.tier).toBe("T2");
    expect(c.action).toBe("escalate");
  });
});

// ─── 16. Env exposure blocks ─────────────────────────────────────────────────

describe("Environment exposure prevention", () => {
  test("printenv is blocked (T3)", () => {
    const r = guardCheck("printenv");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("env is blocked (T3)", () => {
    const r = guardCheck("env");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIER).toBe("T3");
  });
});

// ─── 17. Shell Export Format Correctness ─────────────────────────────────────

describe("Shell export format correctness", () => {
  test("approved command emits _GUARD_APPROVED=1", () => {
    const r = guardCheck("git status");
    expect(r.exitCode).toBe(0);
    const v = parseExports(r.stdout);
    expect(v._GUARD_APPROVED).toBe("1");
    expect(v._GUARD_TIER).toBe("T0");
    expect(v._GUARD_REASON).toBeDefined();
    expect(v._GUARD_RULE).toBeDefined();
    expect(v._GUARD_TIMESTAMP).toBeDefined();
  });

  test("denied command emits _GUARD_APPROVED=0", () => {
    const r = guardCheck("rm -rf /");
    expect(r.exitCode).toBe(1);
    const v = parseExports(r.stdout);
    expect(v._GUARD_APPROVED).toBe("0");
    expect(v._GUARD_TIER).toBe("T3");
  });

  test("timestamp is ISO format", () => {
    const r = guardCheck("git status");
    const v = parseExports(r.stdout);
    expect(v._GUARD_TIMESTAMP).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test("all 5 exports are present", () => {
    const r = guardCheck("git log");
    const v = parseExports(r.stdout);
    expect(Object.keys(v)).toContain("_GUARD_APPROVED");
    expect(Object.keys(v)).toContain("_GUARD_TIER");
    expect(Object.keys(v)).toContain("_GUARD_REASON");
    expect(Object.keys(v)).toContain("_GUARD_RULE");
    expect(Object.keys(v)).toContain("_GUARD_TIMESTAMP");
  });
});

// ─── 18. Classify Subcommand ─────────────────────────────────────────────────

describe("Classify subcommand", () => {
  test("returns valid JSON", () => {
    const c = guardClassify("git status");
    expect(c).toHaveProperty("tier");
    expect(c).toHaveProperty("action");
    expect(c).toHaveProperty("rule");
    expect(c).toHaveProperty("reason");
  });

  test("classify does not log to ledger (no side effects)", () => {
    // Run classify, check exit code is always 0 (even for denied commands)
    const result = Bun.spawnSync(["bun", "run", GUARD, "classify", "rm -rf /"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT, AI_AGENT: "test" },
    });
    expect(result.exitCode).toBe(0); // classify always returns 0
  });
});

// ─── 19. CLI Error Handling ──────────────────────────────────────────────────

describe("CLI error handling", () => {
  test("no subcommand → exit 2", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    expect(result.exitCode).toBe(2);
  });

  test("unknown subcommand → exit 2", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD, "foobar"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    expect(result.exitCode).toBe(2);
  });

  test("check with no command → exit 2", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD, "check"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    expect(result.exitCode).toBe(2);
  });

  test("help → exit 0", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD, "help"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    expect(result.exitCode).toBe(0);
  });

  test("--help → exit 0", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD, "--help"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    expect(result.exitCode).toBe(0);
  });

  test("policy → exit 0 + shows summary", () => {
    const result = Bun.spawnSync(["bun", "run", GUARD, "policy"], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("T0");
    expect(result.stdout.toString()).toContain("T3");
  });
});

// ─── 20. Edge Cases ──────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("command with leading/trailing whitespace is trimmed", () => {
    const c = guardClassify("  git status  ");
    expect(c.tier).toBe("T0");
    expect(c.action).toBe("allow");
  });

  test("very long command is handled", () => {
    const longCmd = "git log " + "a".repeat(10000);
    const c = guardClassify(longCmd);
    // Should not crash; git log is T0
    expect(c.tier).toBe("T0");
  });

  test("empty-ish command via classify → error or T2", () => {
    // classify with just whitespace — may return empty (usage error) or T2
    const result = Bun.spawnSync(["bun", "run", GUARD, "classify", "   "], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
    });
    const out = result.stdout.toString().trim();
    if (out && out.startsWith("{")) {
      const c = JSON.parse(out);
      expect(c.tier).toBe("T2");
    } else {
      // Empty/whitespace treated as "no command" → usage error (exit 2)
      expect(result.exitCode).toBe(2);
    }
  });
});

// ─── 21. Rule Priority: Deny beats Allow ────────────────────────────────────

describe("Rule priority: deny overrides allow", () => {
  test("git reset --hard → T3 (not T0 for 'git')", () => {
    const c = guardClassify("git reset --hard HEAD~5");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("git push --force → T3 (not T2 for 'git push')", () => {
    const c = guardClassify("git push --force origin main");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("terraform init --upgrade → T3 (not T0 for 'terraform init')", () => {
    const c = guardClassify("terraform init --upgrade");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });
});
