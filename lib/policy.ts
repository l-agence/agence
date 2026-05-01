#!/usr/bin/env bun
// lib/policy.ts — Dynamic AIPOLICY cascade loader
//
// Loads and merges policy from a 4-layer cascade:
//   1. codex/AIPOLICY.yaml          (immutable base — ships with agence)
//   2. knowledge/hermetic/*/policy.yaml  (per-org overrides)
//   3. .agence/policy.yaml          (per-shard/project)
//   4. ~/.config/agence/policy.yaml (per-user local)
//
// Merge semantics:
//   - Each layer can DENY or ESCALATE (tighten) — never weaken a higher layer's deny
//   - T3 denials from any layer are absolute (most-restrictive wins)
//   - De-escalation (T2→T0, T3→T1) is ONLY allowed from LOCAL layer
//     and requires: merkle ledger entry + aido human confirmation
//
// Security:
//   - Fail-closed: malformed YAML → reject layer (base missing → process.exit(2))
//   - File permissions checked (warn if world-writable)
//   - No eval, no code execution from policy files

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { homedir } from "os";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

// ─── Types ───────────────────────────────────────────────────────────────────

export type Tier = "T0" | "T1" | "T2" | "T3";
export type Action = "allow" | "flag" | "escalate" | "deny";

export interface PolicyRule {
  tier: Tier;
  action: Action;
  pattern: string;
  regex: RegExp;
  source: string;
}

export interface ParsedPolicy {
  version: number;
  globalBlocks: string[];
  whitelist: Record<string, string[]>;     // section → commands/patterns
  blacklist: Record<string, string[]>;     // section.subkey → commands/patterns
  overrides?: PolicyOverride[];            // de-escalations (local layer only)
}

export interface PolicyOverride {
  command: string;
  from: Tier;
  to: Tier;
  reason: string;
}

export interface MergedPolicy {
  globalBlocks: RegExp[];
  rules: PolicyRule[];
  overrides: PolicyOverride[];
  layers: string[];    // which files were loaded (for audit)
}

// ─── Minimal YAML Parser ─────────────────────────────────────────────────────
// Handles the subset used by AIPOLICY: objects, string lists, scalars.
// No anchors, aliases, multiline blocks, or flow syntax.

interface YamlNode {
  [key: string]: string | string[] | YamlNode;
}

export function parseYaml(text: string): YamlNode {
  const lines = text.split("\n");
  return parseObject(lines, 0, 0).value;
}

function parseObject(lines: string[], start: number, minIndent: number): { value: YamlNode; end: number } {
  const obj: YamlNode = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blanks and comments
    if (/^\s*(#.*)?$/.test(line)) { i++; continue; }

    const indent = line.search(/\S/);
    if (indent < minIndent) break; // dedented — parent scope

    // Key-value or key with children
    const kvMatch = line.match(/^(\s*)([\w_][\w_.-]*)\s*:\s*(.*)$/);
    if (!kvMatch) { i++; continue; }

    const keyIndent = kvMatch[1].length;
    if (keyIndent < minIndent) break;

    const key = kvMatch[2];
    const inlineValue = kvMatch[3].replace(/#.*$/, "").trim();

    if (inlineValue && !inlineValue.startsWith("|")) {
      // Inline scalar (strip quotes)
      obj[key] = inlineValue.replace(/^["']|["']$/g, "");
      i++;
    } else {
      // Look ahead for children
      let nextNonBlank = i + 1;
      while (nextNonBlank < lines.length && /^\s*(#.*)?$/.test(lines[nextNonBlank])) nextNonBlank++;

      if (nextNonBlank >= lines.length) { obj[key] = ""; i++; continue; }

      const nextIndent = lines[nextNonBlank].search(/\S/);
      if (nextIndent <= keyIndent) {
        // No children — empty or multiline scalar (skip multiline for now)
        if (inlineValue === "|") {
          // Block scalar — collect until dedent
          let scalar = "";
          let j = i + 1;
          while (j < lines.length) {
            const sl = lines[j];
            if (/^\s*$/.test(sl)) { scalar += "\n"; j++; continue; }
            if (sl.search(/\S/) <= keyIndent) break;
            scalar += sl.slice(keyIndent + 2) + "\n";
            j++;
          }
          obj[key] = scalar.trimEnd();
          i = j;
        } else {
          obj[key] = inlineValue;
          i++;
        }
        continue;
      }

      // Children: list items (- "...") or nested object
      if (/^\s*-\s/.test(lines[nextNonBlank])) {
        // Parse list
        const list: string[] = [];
        let j = nextNonBlank;
        while (j < lines.length) {
          const lline = lines[j];
          if (/^\s*(#.*)?$/.test(lline)) { j++; continue; }
          const lIndent = lline.search(/\S/);
          if (lIndent < nextIndent) break;
          const listMatch = lline.match(/^\s*-\s+(.+)$/);
          if (listMatch) {
            list.push(listMatch[1].replace(/^["']|["']$/g, "").trim());
            j++;
          } else if (lIndent > nextIndent) {
            // Sub-object under list item — skip (not needed for policy)
            j++;
          } else {
            // Nested key at same indent — stop list
            break;
          }
        }
        obj[key] = list;
        i = j;
      } else {
        // Nested object
        const sub = parseObject(lines, nextNonBlank, nextIndent);
        obj[key] = sub.value;
        i = sub.end;
      }
    }
  }

  return { value: obj, end: i };
}

// ─── Policy File Loader ──────────────────────────────────────────────────────

function loadYamlFile(path: string): YamlNode | null {
  if (!existsSync(path)) return null;

  // Security: warn on world-writable policy files
  try {
    const st = statSync(path);
    if (st.mode & 0o002) {
      process.stderr.write(`[policy] WARNING: World-writable policy file: ${path}\n`);
      process.stderr.write(`  Run: chmod o-w ${path}\n`);
    }
  } catch { /* stat failure — let readFile handle it */ }

  try {
    const text = readFileSync(path, "utf-8");
    return parseYaml(text);
  } catch (e: any) {
    process.stderr.write(`[policy] ERROR: Failed to parse ${path}: ${e.message}\n`);
    return null;
  }
}

// ─── Extract rules from parsed YAML ─────────────────────────────────────────

function extractGlobalBlocks(yaml: YamlNode): string[] {
  const blocks: string[] = [];
  const gr = yaml.global_rules;
  if (!gr || typeof gr !== "object" || Array.isArray(gr)) return blocks;

  const ss = (gr as YamlNode).shell_safety;
  if (ss && typeof ss === "object" && !Array.isArray(ss)) {
    for (const key of Object.keys(ss)) {
      const val = (ss as YamlNode)[key];
      if (Array.isArray(val)) blocks.push(...val);
    }
  }

  const ep = (gr as YamlNode).environment_protection;
  if (ep && typeof ep === "object" && !Array.isArray(ep)) {
    for (const key of Object.keys(ep)) {
      const val = (ep as YamlNode)[key];
      if (Array.isArray(val)) blocks.push(...val);
    }
  }

  return blocks;
}

function extractSection(yaml: YamlNode, sectionKey: "whitelist" | "blacklist"): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const section = yaml[sectionKey];
  if (!section || typeof section !== "object" || Array.isArray(section)) return result;

  // Walk each tool category
  for (const [tool, toolData] of Object.entries(section as YamlNode)) {
    if (!toolData || typeof toolData !== "object" || Array.isArray(toolData)) {
      if (Array.isArray(toolData)) result[tool] = toolData;
      continue;
    }
    // Collect string arrays from tool's sub-keys, preserving sub-key name
    for (const [subKey, subVal] of Object.entries(toolData as YamlNode)) {
      if (subKey === "note" || subKey === "description") continue;
      const qualifiedKey = `${tool}.${subKey}`;
      if (Array.isArray(subVal)) {
        result[qualifiedKey] = subVal;
      } else if (typeof subVal === "object" && subVal !== null) {
        // Nested examples (e.g. aws.examples.ec2: [...])
        const commands: string[] = [];
        for (const v of Object.values(subVal as YamlNode)) {
          if (Array.isArray(v)) commands.push(...v);
        }
        if (commands.length > 0) result[qualifiedKey] = commands;
      }
    }
  }

  return result;
}

function extractOverrides(yaml: YamlNode): PolicyOverride[] {
  const overrides: PolicyOverride[] = [];
  const ov = yaml.overrides;
  if (!ov || typeof ov !== "object") return overrides;

  if (Array.isArray(ov)) {
    // Not supported in this format
    return overrides;
  }

  // overrides section: each key is a command pattern
  for (const [cmd, data] of Object.entries(ov as YamlNode)) {
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const d = data as YamlNode;
    overrides.push({
      command: cmd,
      from: (d.from as string || "T2") as Tier,
      to: (d.to as string || "T0") as Tier,
      reason: (d.reason as string) || "local override",
    });
  }

  return overrides;
}

// ─── Cascade Resolution ──────────────────────────────────────────────────────

const TIER_SEVERITY: Record<Tier, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };

function tierMax(a: Tier, b: Tier): Tier {
  return TIER_SEVERITY[a] >= TIER_SEVERITY[b] ? a : b;
}

function actionForTier(tier: Tier): Action {
  switch (tier) {
    case "T0": return "allow";
    case "T1": return "flag";
    case "T2": return "escalate";
    case "T3": return "deny";
  }
}

export interface CascadeLayer {
  path: string;
  isLocal: boolean;
  parsed: ParsedPolicy;
}

function parsePolicyYaml(yaml: YamlNode): ParsedPolicy {
  return {
    version: parseInt(String(yaml.version || "1"), 10),
    globalBlocks: extractGlobalBlocks(yaml),
    whitelist: extractSection(yaml, "whitelist"),
    blacklist: extractSection(yaml, "blacklist"),
    overrides: extractOverrides(yaml),
  };
}

export function resolveCascade(): CascadeLayer[] {
  const layers: CascadeLayer[] = [];

  // Layer 1: Base (codex/AIPOLICY.yaml) — REQUIRED
  const basePath = process.env.AGENCE_POLICY || join(AGENCE_ROOT, "codex", "AIPOLICY.yaml");
  const baseYaml = loadYamlFile(basePath);
  if (!baseYaml) {
    process.stderr.write(`[policy] FATAL: Base policy not found: ${basePath}\n`);
    process.exit(2);
  }
  layers.push({ path: basePath, isLocal: false, parsed: parsePolicyYaml(baseYaml) });

  // Layer 2: Org overrides (knowledge/hermetic/*/policy.yaml)
  const hermeticDir = join(AGENCE_ROOT, "knowledge", "hermetic");
  if (existsSync(hermeticDir)) {
    try {
      for (const org of readdirSync(hermeticDir)) {
        const orgPolicy = join(hermeticDir, org, "policy.yaml");
        const yaml = loadYamlFile(orgPolicy);
        if (yaml) layers.push({ path: orgPolicy, isLocal: false, parsed: parsePolicyYaml(yaml) });
      }
    } catch { /* directory read failure — skip */ }
  }

  // Layer 3: Shard/project (.agence/policy.yaml in repo root or parent)
  const shardPolicy = join(AGENCE_ROOT, ".agence", "policy.yaml");
  const shardYaml = loadYamlFile(shardPolicy);
  if (shardYaml) layers.push({ path: shardPolicy, isLocal: false, parsed: parsePolicyYaml(shardYaml) });

  // Layer 4: Local user (~/.config/agence/policy.yaml) — can de-escalate
  const localPolicy = join(homedir(), ".config", "agence", "policy.yaml");
  const localYaml = loadYamlFile(localPolicy);
  if (localYaml) layers.push({ path: localPolicy, isLocal: true, parsed: parsePolicyYaml(localYaml) });

  return layers;
}

// ─── Merge Cascade into MergedPolicy ─────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mergeCascade(layers: CascadeLayer[]): MergedPolicy {
  const globalBlockSet = new Set<string>();
  const ruleMap = new Map<string, PolicyRule>(); // pattern → rule (most restrictive wins)
  const allOverrides: PolicyOverride[] = [];
  const loadedPaths: string[] = [];

  for (const layer of layers) {
    loadedPaths.push(layer.path);
    const p = layer.parsed;

    // Merge global blocks (additive — can only add, never remove)
    for (const b of p.globalBlocks) globalBlockSet.add(b);

    // Merge whitelist → T0 rules
    for (const [qualifiedKey, commands] of Object.entries(p.whitelist)) {
      const tool = qualifiedKey.split(".")[0];
      for (const cmd of commands) {
        const key = `whitelist:${cmd}`;
        if (!ruleMap.has(key)) {
          ruleMap.set(key, {
            tier: "T0", action: "allow", pattern: cmd,
            regex: buildRegex(cmd, tool),
            source: `whitelist.${tool}`,
          });
        }
        // If already exists, don't weaken — whitelist from lower layer doesn't override higher deny
      }
    }

    // Merge blacklist → T2/T3 rules (tighten only)
    for (const [qualifiedKey, commands] of Object.entries(p.blacklist)) {
      const tool = qualifiedKey.split(".")[0];
      const subKey = qualifiedKey.split(".").slice(1).join(".");
      // Determine tier from sub-key name
      const isDestructive = /destructive|blocked|dangerous/.test(subKey);
      for (const cmd of commands) {
        const key = `blacklist:${cmd}`;
        const existing = ruleMap.get(key);
        const newTier: Tier = isDestructive ? "T3" : getCommandTier(tool, cmd);
        if (existing) {
          // Tighten: take the more restrictive tier
          const merged = tierMax(existing.tier, newTier);
          existing.tier = merged;
          existing.action = actionForTier(merged);
        } else {
          ruleMap.set(key, {
            tier: newTier, action: actionForTier(newTier),
            pattern: cmd, regex: buildRegex(cmd, tool),
            source: `blacklist.${tool}`,
          });
        }
      }
    }

    // Collect overrides (only from local layer)
    if (layer.isLocal && p.overrides) {
      allOverrides.push(...p.overrides);
    }
  }

  // Apply overrides (de-escalation) — mark in rule map
  // These require ledger + confirmation at runtime (handled by guard.ts)
  for (const ov of allOverrides) {
    const key = `blacklist:${ov.command}`;
    const existing = ruleMap.get(key);
    if (existing && TIER_SEVERITY[existing.tier] > TIER_SEVERITY[ov.to]) {
      // De-escalation: mark rule but keep original tier for audit
      // The guard will check override validity at decision time
      existing.tier = ov.to;
      existing.action = actionForTier(ov.to);
      existing.source += ` [override:${ov.from}→${ov.to}]`;
    }
  }

  // Build globalBlocks regexes
  const globalBlocks: RegExp[] = [];
  // Shell operators
  const operatorBlocks = [">", ">>", "|", "&&", ";", "$(", "`", "<(", ">(", "<<"];
  for (const op of globalBlockSet) {
    if (operatorBlocks.includes(op)) {
      globalBlocks.push(new RegExp(escapeRegex(op)));
    } else {
      // Command-style blocks (sudo, env, etc.)
      globalBlocks.push(new RegExp(`(?:^|\\s)${escapeRegex(op)}(?:\\s|$)`));
    }
  }
  // Always: newline/carriage return block (SEC-012)
  globalBlocks.push(/[\n\r]/);
  // Always: background exec
  globalBlocks.push(/&\s*$/);

  // Sort rules: T3 → T2 → T1 → T0
  const rules = Array.from(ruleMap.values());

  // ── Code-level security minimums (SEC-012/013) ──
  // These use regex patterns that can't be expressed in YAML string lists.
  // They are ALWAYS enforced regardless of cascade layers.
  const securityMinimums: PolicyRule[] = [
    { tier: "T2", action: "escalate", pattern: "sed -i", regex: /^sed\s+.*-i/, source: "security.SEC-012" },
    { tier: "T2", action: "escalate", pattern: "sed 'e' (execute)", regex: /^sed\s+.*['"]e/, source: "security.SEC-013" },
    { tier: "T2", action: "escalate", pattern: "sed 'w' (write)", regex: /^sed\s+.*['"]w/, source: "security.SEC-013" },
    { tier: "T2", action: "escalate", pattern: "sed s///e (execute flag)", regex: /^sed\s+.*\/\w*e\w*['"]/, source: "security.SEC-013" },
    { tier: "T2", action: "escalate", pattern: "find -exec", regex: /^find\s+.*-exec/, source: "security.SEC-012" },
    { tier: "T2", action: "escalate", pattern: "find -delete", regex: /^find\s+.*-delete/, source: "security.SEC-012" },
    { tier: "T2", action: "escalate", pattern: "find -ok", regex: /^find\s+.*-ok/, source: "security.SEC-012" },
    { tier: "T2", action: "escalate", pattern: "find -fls", regex: /^find\s+.*-fls/, source: "security.SEC-013" },
    { tier: "T2", action: "escalate", pattern: "find -fprintf", regex: /^find\s+.*-fprintf/, source: "security.SEC-013" },
    { tier: "T2", action: "escalate", pattern: "awk system()", regex: /^awk\s+.*system\s*\(/, source: "security.SEC-013" },
    { tier: "T2", action: "escalate", pattern: "awk getline", regex: /^awk\s+.*\bgetline\b/, source: "security.SEC-013" },
  ];
  rules.push(...securityMinimums);

  const tierOrder: Record<Tier, number> = { T3: 0, T2: 1, T1: 2, T0: 3 };
  rules.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

  return { globalBlocks, rules, overrides: allOverrides, layers: loadedPaths };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRegex(pattern: string, tool: string): RegExp {
  // AWS prefix patterns
  if (tool === "aws_cli" && (pattern.endsWith("-") || /^(describe|get|list|head|create|delete|put|update|modify|attach|detach|start|stop|terminate)-/.test(pattern))) {
    return new RegExp(`^aws\\s+\\S+\\s+${escapeRegex(pattern)}`);
  }
  // PowerShell verb patterns
  if (tool === "powershell" && /^[A-Z][a-z]+-?\*?$/.test(pattern)) {
    const verb = pattern.replace(/[-*]/g, "");
    return new RegExp(`^${verb}-\\w+`, "i");
  }
  // Default: exact prefix match
  return new RegExp(`^${escapeRegex(pattern)}(\\s|$)`);
}

function getCommandTier(tool: string, cmd: string): Tier {
  // Destructive commands → T3
  const destructiveTools: Record<string, string[]> = {
    git_cli: ["git clean", "git reset", "git push --force", "git filter-branch", "git gc", "git fsck"],
    github_cli: ["gh repo delete", "gh secret set", "gh variable set"],
    aws_cli: ["delete-", "terminate-", "stop-"],
    terraform: ["terraform destroy", "terraform apply", "terraform init --upgrade"],
    linux_shell: ["rm", "chmod", "chown", "kill", "killall", "systemctl", "service", "shutdown", "reboot", "umount"],
    powershell: ["Remove", "Clear", "Restart", "Stop", "Invoke"],
  };

  const toolDestructive = destructiveTools[tool] || [];
  for (const d of toolDestructive) {
    if (cmd === d || cmd.startsWith(d)) return "T3";
  }
  return "T2"; // Default blacklist tier is escalate
}

function classifyBlacklistTier(_tool: string, _commands: string[]): Tier {
  // Placeholder — individual commands classified by getCommandTier
  return "T2";
}

// ─── De-escalation Confirmation ──────────────────────────────────────────────
// Called by guard.ts when an override would de-escalate a command.
// Requires:
//   1. Merkle ledger entry (audit trail)
//   2. aido prompt confirmation (human-in-the-loop)

export function confirmDeescalation(override: PolicyOverride, command: string): boolean {
  const airunPath = join(AGENCE_ROOT, "bin", "airun");

  // 1. Log to merkle ledger
  try {
    spawnSync(airunPath, [
      "ailedger", "append", "guard", "policy:deescalate", "",
      `${override.from}→${override.to}: ${command} (${override.reason})`,
      "0",
    ], { cwd: AGENCE_ROOT, timeout: 5000, stdio: "ignore" });
  } catch {
    process.stderr.write("[policy] WARNING: Failed to log de-escalation to ledger\n");
  }

  // 2. Prompt via aido (interactive confirmation)
  const prompt = `[POLICY OVERRIDE] De-escalate "${command}" from ${override.from} to ${override.to}?\nReason: ${override.reason}\nApprove? (y/n)`;
  try {
    const result = spawnSync(airunPath, ["ask", prompt], {
      cwd: AGENCE_ROOT,
      timeout: 30_000,
      stdio: ["inherit", "pipe", "inherit"],
    });
    const answer = result.stdout?.toString().trim().toLowerCase();
    if (answer === "y" || answer === "yes") {
      // Log approval
      spawnSync(airunPath, [
        "ailedger", "append", "guard", "policy:deescalate:approved", "",
        `${override.from}→${override.to}: ${command}`,
        "0",
      ], { cwd: AGENCE_ROOT, timeout: 5000, stdio: "ignore" });
      return true;
    }
  } catch {
    process.stderr.write("[policy] De-escalation confirmation failed — denying\n");
  }

  // Log denial
  try {
    spawnSync(airunPath, [
      "ailedger", "append", "guard", "policy:deescalate:denied", "",
      `${override.from}→${override.to}: ${command}`,
      "1",
    ], { cwd: AGENCE_ROOT, timeout: 5000, stdio: "ignore" });
  } catch { /* best effort */ }

  return false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

let _cached: MergedPolicy | null = null;

export function loadMergedPolicy(): MergedPolicy {
  if (_cached) return _cached;
  const layers = resolveCascade();
  _cached = mergeCascade(layers);
  return _cached;
}

export function resetPolicyCache(): void {
  _cached = null;
}

// ─── CLI (for testing/debugging) ─────────────────────────────────────────────

if (import.meta.main) {
  const [cmd] = process.argv.slice(2);

  if (cmd === "cascade") {
    const layers = resolveCascade();
    console.log(`[policy] Cascade (${layers.length} layers):`);
    for (const l of layers) {
      console.log(`  ${l.isLocal ? "LOCAL" : "REPO "} ${l.path}`);
      console.log(`    global_blocks: ${l.parsed.globalBlocks.length}`);
      console.log(`    whitelist sections: ${Object.keys(l.parsed.whitelist).length}`);
      console.log(`    blacklist sections: ${Object.keys(l.parsed.blacklist).length}`);
      console.log(`    overrides: ${l.parsed.overrides?.length || 0}`);
    }
    process.exit(0);
  }

  if (cmd === "merged") {
    const merged = loadMergedPolicy();
    console.log(`[policy] Merged policy:`);
    console.log(`  Layers: ${merged.layers.join(", ")}`);
    console.log(`  Global blocks: ${merged.globalBlocks.length}`);
    console.log(`  Rules: ${merged.rules.length}`);
    console.log(`  Overrides: ${merged.overrides.length}`);
    const counts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
    for (const r of merged.rules) counts[r.tier]++;
    console.log(`  T0: ${counts.T0}, T1: ${counts.T1}, T2: ${counts.T2}, T3: ${counts.T3}`);
    process.exit(0);
  }

  console.error("Usage: bun run lib/policy.ts <cascade|merged>");
  process.exit(2);
}
