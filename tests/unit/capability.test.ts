import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  CAPABILITIES,
  SECURITY_LEVELS,
  requiredCapabilities,
  checkCapability,
  checkDataAccess,
  agentClearance,
  pathSecurityLevel,
  loadAgentCapabilities,
  resetCapabilityCache,
} from "../../lib/capability.ts";

const AGENCE_ROOT = join(import.meta.dir, "../..");

// Helper: run capability CLI
function runCap(...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "capability.ts"), ...args], {
    cwd: AGENCE_ROOT, timeout: 15_000,
    env: { ...process.env, AGENCE_ROOT },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout?.toString() || "",
    stderr: r.stderr?.toString() || "",
  };
}

// Helper: run guard classify with AI_AGENT set
function runGuardClassify(agent: string, command: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "guard.ts"), "classify", command], {
    cwd: AGENCE_ROOT, timeout: 15_000,
    env: { ...process.env, AGENCE_ROOT, AI_AGENT: agent },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout?.toString() || "",
    stderr: r.stderr?.toString() || "",
  };
}

// ─── Capability Definitions ──────────────────────────────────────────────────

describe("Capability Definitions", () => {
  test("all 14 capabilities are defined", () => {
    expect(Object.keys(CAPABILITIES)).toHaveLength(14);
  });

  test("all security levels are ordered", () => {
    expect(SECURITY_LEVELS.L0_PUBLIC).toBeLessThan(SECURITY_LEVELS.L1_ORGANIC);
    expect(SECURITY_LEVELS.L1_ORGANIC).toBeLessThan(SECURITY_LEVELS.L2_SYNTHETIC);
    expect(SECURITY_LEVELS.L2_SYNTHETIC).toBeLessThan(SECURITY_LEVELS.L3_NEXUS);
    expect(SECURITY_LEVELS.L3_NEXUS).toBeLessThan(SECURITY_LEVELS.L4_HERMETIC);
  });
});

// ─── Required Capabilities ───────────────────────────────────────────────────

describe("requiredCapabilities", () => {
  test("terraform requires CAP_EXEC_INFRA", () => {
    expect(requiredCapabilities("terraform apply")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
    expect(requiredCapabilities("terraform plan")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
    expect(requiredCapabilities("terraform init")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
  });

  test("docker requires CAP_EXEC_INFRA", () => {
    expect(requiredCapabilities("docker build .")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
    expect(requiredCapabilities("docker run alpine")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
  });

  test("aws requires CAP_EXEC_INFRA", () => {
    expect(requiredCapabilities("aws s3 ls")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
    expect(requiredCapabilities("aws ec2 describe-instances")).toContain(CAPABILITIES.CAP_EXEC_INFRA);
  });

  test("git push requires CAP_MUTATE_GIT", () => {
    expect(requiredCapabilities("git push origin main")).toContain(CAPABILITIES.CAP_MUTATE_GIT);
    expect(requiredCapabilities("git commit -m 'test'")).toContain(CAPABILITIES.CAP_MUTATE_GIT);
    expect(requiredCapabilities("git rebase main")).toContain(CAPABILITIES.CAP_MUTATE_GIT);
  });

  test("git status requires nothing (read-only)", () => {
    expect(requiredCapabilities("git status")).toHaveLength(0);
    expect(requiredCapabilities("git log --oneline")).toHaveLength(0);
    expect(requiredCapabilities("git diff")).toHaveLength(0);
  });

  test("curl requires CAP_NET_EGRESS", () => {
    expect(requiredCapabilities("curl https://example.com")).toContain(CAPABILITIES.CAP_NET_EGRESS);
    expect(requiredCapabilities("wget https://example.com")).toContain(CAPABILITIES.CAP_NET_EGRESS);
  });

  test("npm publish requires CAP_PUBLISH", () => {
    expect(requiredCapabilities("npm publish --access public")).toContain(CAPABILITIES.CAP_PUBLISH);
  });

  test("npm install requires CAP_EXEC_BUILD", () => {
    expect(requiredCapabilities("npm install lodash")).toContain(CAPABILITIES.CAP_EXEC_BUILD);
    expect(requiredCapabilities("bun install")).toContain(CAPABILITIES.CAP_EXEC_BUILD);
    expect(requiredCapabilities("bun test")).toContain(CAPABILITIES.CAP_EXEC_BUILD);
  });

  test("airun hack requires CAP_RED_TEAM", () => {
    expect(requiredCapabilities("airun hack")).toContain(CAPABILITIES.CAP_RED_TEAM);
    expect(requiredCapabilities("airun break")).toContain(CAPABILITIES.CAP_RED_TEAM);
  });

  test("agent spawn requires CAP_SPAWN_AGENT", () => {
    expect(requiredCapabilities("agentd tangent create")).toContain(CAPABILITIES.CAP_SPAWN_AGENT);
    expect(requiredCapabilities("swarm launch ralph")).toContain(CAPABILITIES.CAP_SPAWN_AGENT);
  });

  test("signal IPC requires CAP_SIGNAL_HUMAN", () => {
    expect(requiredCapabilities("airun signal ask")).toContain(CAPABILITIES.CAP_SIGNAL_HUMAN);
    expect(requiredCapabilities("airun signal notify")).toContain(CAPABILITIES.CAP_SIGNAL_HUMAN);
  });

  test("ls/cat/grep/echo require nothing (read-only)", () => {
    expect(requiredCapabilities("ls -la")).toHaveLength(0);
    expect(requiredCapabilities("cat file.txt")).toHaveLength(0);
    expect(requiredCapabilities("grep pattern file")).toHaveLength(0);
    expect(requiredCapabilities("echo hello")).toHaveLength(0);
  });
});

// ─── Agent Capability Loading ────────────────────────────────────────────────

describe("loadAgentCapabilities", () => {
  test("loads all agents from registry.json", () => {
    resetCapabilityCache();
    const caps = loadAgentCapabilities();
    expect(caps.size).toBeGreaterThan(10);
    expect(caps.has("copilot")).toBe(true);
    expect(caps.has("aleph")).toBe(true);
    expect(caps.has("haiku")).toBe(true);
    expect(caps.has("linus")).toBe(true);
  });

  test("aleph has explicit capabilities (no INFRA)", () => {
    resetCapabilityCache();
    const caps = loadAgentCapabilities();
    const aleph = caps.get("aleph")!;
    expect(aleph.capabilities).toContain(CAPABILITIES.CAP_RED_TEAM);
    expect(aleph.capabilities).toContain(CAPABILITIES.CAP_NET_EGRESS);
    expect(aleph.capabilities).not.toContain(CAPABILITIES.CAP_EXEC_INFRA);
    expect(aleph.capabilities).not.toContain(CAPABILITIES.CAP_MUTATE_GIT);
  });

  test("haiku has minimal capabilities (T0)", () => {
    resetCapabilityCache();
    const caps = loadAgentCapabilities();
    const haiku = caps.get("haiku")!;
    expect(haiku.capabilities).toContain(CAPABILITIES.CAP_EXEC_SHELL);
    expect(haiku.capabilities).toContain(CAPABILITIES.CAP_EXEC_BUILD);
    expect(haiku.capabilities).not.toContain(CAPABILITIES.CAP_MUTATE_GIT);
    expect(haiku.capabilities).not.toContain(CAPABILITIES.CAP_NET_EGRESS);
    expect(haiku.capabilities).not.toContain(CAPABILITIES.CAP_RED_TEAM);
  });

  test("copilot has T2 capabilities", () => {
    resetCapabilityCache();
    const caps = loadAgentCapabilities();
    const copilot = caps.get("copilot")!;
    expect(copilot.capabilities).toContain(CAPABILITIES.CAP_EXEC_SHELL);
    expect(copilot.capabilities).toContain(CAPABILITIES.CAP_MUTATE_GIT);
    expect(copilot.capabilities).toContain(CAPABILITIES.CAP_NET_EGRESS);
    expect(copilot.capabilities).not.toContain(CAPABILITIES.CAP_EXEC_INFRA);
  });

  test("linus has explicit capabilities (HERMETIC read, no NET)", () => {
    resetCapabilityCache();
    const caps = loadAgentCapabilities();
    const linus = caps.get("linus")!;
    expect(linus.capabilities).toContain(CAPABILITIES.CAP_READ_HERMETIC);
    expect(linus.capabilities).toContain(CAPABILITIES.CAP_MUTATE_GIT);
    expect(linus.capabilities).not.toContain(CAPABILITIES.CAP_NET_EGRESS);
    expect(linus.capabilities).not.toContain(CAPABILITIES.CAP_RED_TEAM);
  });
});

// ─── Capability Check (checkCapability) ──────────────────────────────────────

describe("checkCapability", () => {
  test("copilot can git push", () => {
    resetCapabilityCache();
    const d = checkCapability("copilot", "git push origin main");
    expect(d.allowed).toBe(true);
    expect(d.missing).toHaveLength(0);
  });

  test("haiku cannot git push", () => {
    resetCapabilityCache();
    const d = checkCapability("haiku", "git push origin main");
    expect(d.allowed).toBe(false);
    expect(d.missing).toContain(CAPABILITIES.CAP_MUTATE_GIT);
  });

  test("aleph cannot terraform", () => {
    resetCapabilityCache();
    const d = checkCapability("aleph", "terraform apply");
    expect(d.allowed).toBe(false);
    expect(d.missing).toContain(CAPABILITIES.CAP_EXEC_INFRA);
  });

  test("aleph can hack", () => {
    resetCapabilityCache();
    const d = checkCapability("aleph", "airun hack");
    expect(d.allowed).toBe(true);
  });

  test("haiku cannot curl", () => {
    resetCapabilityCache();
    const d = checkCapability("haiku", "curl https://example.com");
    expect(d.allowed).toBe(false);
    expect(d.missing).toContain(CAPABILITIES.CAP_NET_EGRESS);
  });

  test("unknown agent denied (fail-closed)", () => {
    resetCapabilityCache();
    const d = checkCapability("nonexistent", "git status");
    // git status is read-only → no caps required → allowed even for unknown
    expect(d.allowed).toBe(true);
  });

  test("unknown agent denied for capability-requiring commands", () => {
    resetCapabilityCache();
    const d = checkCapability("nonexistent", "terraform apply");
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("Unknown agent");
  });

  test("read-only commands allowed for all agents", () => {
    resetCapabilityCache();
    for (const agent of ["haiku", "aleph", "copilot"]) {
      const d = checkCapability(agent, "git status");
      expect(d.allowed).toBe(true);
    }
  });
});

// ─── Data Access (Bell-LaPadula) ─────────────────────────────────────────────

describe("checkDataAccess (Bell-LaPadula)", () => {
  test("aleph can read nexus (L3)", () => {
    resetCapabilityCache();
    const r = checkDataAccess("aleph", SECURITY_LEVELS.L3_NEXUS);
    expect(r.allowed).toBe(true);
  });

  test("haiku cannot read nexus (L3, clearance L2)", () => {
    resetCapabilityCache();
    const r = checkDataAccess("haiku", SECURITY_LEVELS.L3_NEXUS);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Bell-LaPadula");
  });

  test("haiku can read organic (L1)", () => {
    resetCapabilityCache();
    const r = checkDataAccess("haiku", SECURITY_LEVELS.L1_ORGANIC);
    expect(r.allowed).toBe(true);
  });

  test("linus can read hermetic (L4)", () => {
    resetCapabilityCache();
    const r = checkDataAccess("linus", SECURITY_LEVELS.L4_HERMETIC);
    expect(r.allowed).toBe(true);
  });

  test("copilot cannot read hermetic (L4)", () => {
    resetCapabilityCache();
    const r = checkDataAccess("copilot", SECURITY_LEVELS.L4_HERMETIC);
    expect(r.allowed).toBe(false);
  });

  test("unknown agent denied all but public", () => {
    resetCapabilityCache();
    const r = checkDataAccess("nonexistent", SECURITY_LEVELS.L1_ORGANIC);
    expect(r.allowed).toBe(false);
  });
});

// ─── Path Security Labels ────────────────────────────────────────────────────

describe("pathSecurityLevel", () => {
  test("knowledge/private → L4 HERMETIC", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "knowledge/private/todos/INDEX.md")))
      .toBe(SECURITY_LEVELS.L4_HERMETIC);
  });

  test("knowledge/hermetic → L4 HERMETIC", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "knowledge/hermetic/acme.tld/notes.md")))
      .toBe(SECURITY_LEVELS.L4_HERMETIC);
  });

  test("nexus → L3 NEXUS", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "nexus/signals/ask-001.json")))
      .toBe(SECURITY_LEVELS.L3_NEXUS);
  });

  test(".ailedger → L3 NEXUS", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, ".ailedger/2026-05.jsonl")))
      .toBe(SECURITY_LEVELS.L3_NEXUS);
  });

  test("knowledge/ (non-private) → L2 SYNTHETIC", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "knowledge/l-agence.org/plans/INDEX.md")))
      .toBe(SECURITY_LEVELS.L2_SYNTHETIC);
  });

  test("codex/ → L2 SYNTHETIC", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "codex/AIPOLICY.yaml")))
      .toBe(SECURITY_LEVELS.L2_SYNTHETIC);
  });

  test("organic/ → L1 ORGANIC", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "organic/tasks.json")))
      .toBe(SECURITY_LEVELS.L1_ORGANIC);
  });

  test("README.md → L0 PUBLIC", () => {
    expect(pathSecurityLevel(join(AGENCE_ROOT, "README.md")))
      .toBe(SECURITY_LEVELS.L0_PUBLIC);
  });
});

// ─── Agent Clearance ─────────────────────────────────────────────────────────

describe("agentClearance", () => {
  test("CAP_READ_HERMETIC → L4", () => {
    expect(agentClearance([CAPABILITIES.CAP_READ_HERMETIC])).toBe(SECURITY_LEVELS.L4_HERMETIC);
  });

  test("CAP_READ_NEXUS → L3", () => {
    expect(agentClearance([CAPABILITIES.CAP_READ_NEXUS])).toBe(SECURITY_LEVELS.L3_NEXUS);
  });

  test("no read caps → L2 (default)", () => {
    expect(agentClearance([CAPABILITIES.CAP_EXEC_SHELL])).toBe(SECURITY_LEVELS.L2_SYNTHETIC);
  });
});

// ─── CLI Integration ─────────────────────────────────────────────────────────

describe("capability CLI", () => {
  test("list shows all agents", () => {
    const r = runCap("list");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("copilot");
    expect(r.stdout).toContain("aleph");
    expect(r.stdout).toContain("haiku");
  });

  test("check aleph terraform → denied", () => {
    const r = runCap("check", "aleph", "terraform", "apply");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("DENIED");
    expect(r.stdout).toContain("CAP_EXEC_INFRA");
  });

  test("check copilot git push → allowed", () => {
    const r = runCap("check", "copilot", "git", "push");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ALLOWED");
  });

  test("required terraform → CAP_EXEC_INFRA", () => {
    const r = runCap("required", "terraform", "apply");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("CAP_EXEC_INFRA");
  });

  test("required git status → read-only", () => {
    const r = runCap("required", "git", "status");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("read-only");
  });

  test("labels knowledge/private → L4", () => {
    const r = runCap("labels", "knowledge/private/notes.md");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("L4_HERMETIC");
  });
});

// ─── Guard Integration ───────────────────────────────────────────────────────

describe("guard + capability integration", () => {
  test("haiku terraform plan → T0 allowed (whitelist bypasses capability check)", () => {
    const r = runGuardClassify("haiku", "terraform plan");
    expect(r.status).toBe(0);
    const output = JSON.parse(r.stdout);
    // terraform plan is T0 whitelist — T0 commands bypass capability checks
    expect(output.tier).toBe("T0");
    expect(output.action).toBe("allow");
  });

  test("haiku terraform apply → denied by capability (T2 command, no CAP_EXEC_INFRA)", () => {
    // terraform apply is blacklist T2 — capability check fires on T1+
    resetCapabilityCache();
    const d = checkCapability("haiku", "terraform apply");
    expect(d.allowed).toBe(false);
    expect(d.missing).toContain(CAPABILITIES.CAP_EXEC_INFRA);
  });

  test("copilot git status → allowed (T0 + has caps)", () => {
    const r = runGuardClassify("copilot", "git status");
    expect(r.status).toBe(0);
    const output = JSON.parse(r.stdout);
    expect(output.tier).toBe("T0");
    expect(output.action).toBe("allow");
  });

  test("aleph airun hack → allowed (has CAP_RED_TEAM)", () => {
    // Note: airun hack may not be in whitelist, so may be T2/unknown
    // but capability check only fires on approved commands
    resetCapabilityCache();
    const d = checkCapability("aleph", "airun hack");
    expect(d.allowed).toBe(true);
    expect(d.required).toContain(CAPABILITIES.CAP_RED_TEAM);
  });
});
