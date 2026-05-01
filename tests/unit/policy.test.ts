import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { parseYaml, resolveCascade, mergeCascade, type CascadeLayer } from "../../lib/policy.ts";

const AGENCE_ROOT = join(import.meta.dir, "../..");

// ─── YAML Parser Tests ───────────────────────────────────────────────────────

describe("policy.ts: YAML parser", () => {
  test("parses simple scalar", () => {
    const y = parseYaml("version: 1\npolicy: TEST");
    expect(y.version).toBe("1");
    expect(y.policy).toBe("TEST");
  });

  test("parses string list", () => {
    const y = parseYaml('items:\n  - "foo"\n  - "bar"\n  - baz');
    expect(y.items).toEqual(["foo", "bar", "baz"]);
  });

  test("parses nested objects", () => {
    const y = parseYaml("parent:\n  child:\n    - a\n    - b");
    expect((y.parent as any).child).toEqual(["a", "b"]);
  });

  test("ignores comments", () => {
    const y = parseYaml("# comment\nkey: value\n# another comment");
    expect(y.key).toBe("value");
  });

  test("handles the actual AIPOLICY.yaml without crashing", () => {
    const layers = resolveCascade();
    expect(layers.length).toBeGreaterThanOrEqual(1);
    expect(layers[0].parsed.version).toBe(1);
  });
});

// ─── Cascade Resolution Tests ────────────────────────────────────────────────

describe("policy.ts: cascade resolution", () => {
  test("base layer is always loaded", () => {
    const layers = resolveCascade();
    expect(layers[0].path).toContain("codex/AIPOLICY.yaml");
    expect(layers[0].isLocal).toBe(false);
  });

  test("base layer contains whitelist and blacklist", () => {
    const layers = resolveCascade();
    const p = layers[0].parsed;
    expect(Object.keys(p.whitelist).length).toBeGreaterThan(0);
    expect(Object.keys(p.blacklist).length).toBeGreaterThan(0);
  });

  test("base layer has global blocks", () => {
    const layers = resolveCascade();
    expect(layers[0].parsed.globalBlocks.length).toBeGreaterThan(5);
  });
});

// ─── Merge Semantics Tests ───────────────────────────────────────────────────

describe("policy.ts: merge cascade — tighten-only semantics", () => {
  test("blacklist T3 overrides whitelist T0 for same command", () => {
    const layers = resolveCascade();
    const merged = mergeCascade(layers);
    // "rm" is in blacklist as destructive (T3) — should NOT be T0 even if whitelisted
    const rmRule = merged.rules.find(r => r.pattern === "rm");
    expect(rmRule).toBeDefined();
    expect(rmRule!.tier).toBe("T3");
  });

  test("git destructive commands are T3", () => {
    const layers = resolveCascade();
    const merged = mergeCascade(layers);
    const resetRule = merged.rules.find(r => r.pattern === "git reset --hard");
    expect(resetRule).toBeDefined();
    expect(resetRule!.tier).toBe("T3");
  });

  test("git write commands are T2", () => {
    const layers = resolveCascade();
    const merged = mergeCascade(layers);
    const pushRule = merged.rules.find(r => r.pattern === "git push");
    expect(pushRule).toBeDefined();
    expect(pushRule!.tier).toBe("T2");
  });

  test("additional layer can tighten (add denials)", () => {
    // Simulate org layer that blocks a normally-T0 command
    const baseLayers = resolveCascade();
    const orgLayer: CascadeLayer = {
      path: "/fake/org/policy.yaml",
      isLocal: false,
      parsed: {
        version: 1,
        globalBlocks: [],
        whitelist: {},
        blacklist: { "custom.destructive_commands": ["cat"] },
      },
    };
    const merged = mergeCascade([...baseLayers, orgLayer]);
    const catRule = merged.rules.find(r => r.pattern === "cat" && r.source.includes("blacklist"));
    expect(catRule).toBeDefined();
    expect(catRule!.tier).toBe("T3");
  });

  test("non-local layer cannot add overrides (de-escalation)", () => {
    const baseLayers = resolveCascade();
    const orgLayer: CascadeLayer = {
      path: "/fake/org/policy.yaml",
      isLocal: false,
      parsed: {
        version: 1,
        globalBlocks: [],
        whitelist: {},
        blacklist: {},
        overrides: [{ command: "rm", from: "T3", to: "T0", reason: "attacker trick" }],
      },
    };
    const merged = mergeCascade([...baseLayers, orgLayer]);
    // Override should NOT be applied (non-local)
    expect(merged.overrides.length).toBe(0);
  });

  test("local layer CAN add overrides", () => {
    const baseLayers = resolveCascade();
    const localLayer: CascadeLayer = {
      path: "~/.config/agence/policy.yaml",
      isLocal: true,
      parsed: {
        version: 1,
        globalBlocks: [],
        whitelist: {},
        blacklist: {},
        overrides: [{ command: "kubectl delete", from: "T3", to: "T1", reason: "devops workflow" }],
      },
    };
    const merged = mergeCascade([...baseLayers, localLayer]);
    expect(merged.overrides.length).toBe(1);
    expect(merged.overrides[0].command).toBe("kubectl delete");
  });
});

// ─── Security Minimum Enforcement ────────────────────────────────────────────

describe("policy.ts: SEC-012/013 security minimums", () => {
  test("sed -i is always T2 regardless of layers", () => {
    const merged = mergeCascade(resolveCascade());
    const sedRule = merged.rules.find(r => r.pattern === "sed -i" && r.source.includes("SEC-012"));
    expect(sedRule).toBeDefined();
    expect(sedRule!.tier).toBe("T2");
  });

  test("awk system() is always T2", () => {
    const merged = mergeCascade(resolveCascade());
    const awkRule = merged.rules.find(r => r.pattern === "awk system()" && r.source.includes("SEC-013"));
    expect(awkRule).toBeDefined();
    expect(awkRule!.tier).toBe("T2");
  });

  test("find -exec is always T2", () => {
    const merged = mergeCascade(resolveCascade());
    const findRule = merged.rules.find(r => r.pattern === "find -exec" && r.source.includes("SEC-012"));
    expect(findRule).toBeDefined();
  });
});

// ─── CLI Tests ───────────────────────────────────────────────────────────────

describe("policy.ts: CLI", () => {
  test("cascade subcommand exits 0", () => {
    const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "policy.ts"), "cascade"], {
      cwd: AGENCE_ROOT, timeout: 10_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toContain("Cascade");
  });

  test("merged subcommand exits 0", () => {
    const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "policy.ts"), "merged"], {
      cwd: AGENCE_ROOT, timeout: 10_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toContain("Merged policy");
  });

  test("unknown subcommand exits 2", () => {
    const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "policy.ts"), "bogus"], {
      cwd: AGENCE_ROOT, timeout: 10_000,
    });
    expect(r.status).toBe(2);
  });
});

// ─── Integration: guard uses dynamic policy ──────────────────────────────────

describe("policy.ts: guard integration", () => {
  function guardClassify(cmd: string): any {
    const r = spawnSync("bun", ["run", join(AGENCE_ROOT, "lib", "guard.ts"), "classify", cmd], {
      cwd: AGENCE_ROOT, timeout: 10_000,
    });
    return JSON.parse(r.stdout.toString());
  }

  test("guard loads policy from YAML (git status → T0)", () => {
    const c = guardClassify("git status");
    expect(c.tier).toBe("T0");
    expect(c.action).toBe("allow");
  });

  test("guard enforces blacklist from YAML (rm -rf → T3)", () => {
    const c = guardClassify("rm -rf /tmp/x");
    expect(c.tier).toBe("T3");
    expect(c.action).toBe("deny");
  });

  test("guard enforces global blocks from YAML (pipe)", () => {
    const c = guardClassify("cat file | grep x");
    expect(c.tier).toBe("T3");
  });
});
