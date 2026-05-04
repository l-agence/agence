#!/usr/bin/env bun
// lib/config.ts — Declarative repo.yaml loader
//
// Replaces executable .agencerc with safe YAML parsing.
// No shell execution, no eval, no command substitution.

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RepoConfig {
  repo: {
    name: string;
    org: string;
    domain?: string;
  };
  env?: Record<string, string>;
  agents?: {
    default?: string;
    allowed?: string[];
  };
  security?: {
    unknown_command_tier?: "T2" | "T3";
    policy?: string;
    max_index_file_bytes?: number;
    recon_url_allowlist?: string[];
  };
  shard?: string;
  knowledge?: {
    org?: string;
    skip_dirs?: string[];
    skip_extensions?: string[];
  };
  llm?: {
    provider?: string;
    model?: string;
  };
}

// ─── YAML Parser (minimal, no deps — handles flat/nested maps + arrays) ─────
// We avoid pulling in a YAML library to keep deps at 3.
// This handles the subset of YAML used in repo.yaml.

function parseSimpleYaml(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = text.split("\n");

  // Stack tracks indent level → object reference
  const stack: Array<{ indent: number; obj: Record<string, any> }> = [
    { indent: -2, obj: result },
  ];
  // Track last scalar key assignment for array continuation
  let lastScalarKey = "";
  let lastScalarParent: Record<string, any> = result;
  let lastScalarIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and blank lines
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    const arrMatch = line.match(/^(\s*)-\s+(.*)/);
    if (arrMatch) {
      const indent = arrMatch[1].length;
      const value = arrMatch[2].trim();
      // Array items: find the key they belong to.
      // They belong to the last key that was set at a shallower indent level
      // and whose value was empty (indicating "value follows as array").
      if (lastScalarKey && lastScalarParent && indent > lastScalarIndent) {
        if (!Array.isArray(lastScalarParent[lastScalarKey])) {
          lastScalarParent[lastScalarKey] = [];
        }
        (lastScalarParent[lastScalarKey] as any[]).push(parseValue(value));
      }
      continue;
    }

    const match = line.match(/^(\s*)([\w_.-]+):\s*(.*)/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2];
    const rawValue = match[3].replace(/\s+#.*$/, "").trim();

    // Pop stack back to parent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (rawValue === "") {
      // This key introduces a nested object OR an array (determined by next lines)
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
      // Mark for potential array conversion
      lastScalarKey = key;
      lastScalarParent = parent;
      lastScalarIndent = indent;
    } else {
      parent[key] = parseValue(rawValue);
      lastScalarKey = key;
      lastScalarParent = parent;
      lastScalarIndent = indent;
    }
  }

  // Clean up empty objects that should have been arrays but got no items
  // (commented-out sections leave empty {})
  return result;
}

function parseValue(raw: string): string | number | boolean {
  // Remove inline comments
  const stripped = raw.replace(/\s+#.*$/, "").trim();

  // Remove quotes
  if ((stripped.startsWith('"') && stripped.endsWith('"')) ||
      (stripped.startsWith("'") && stripped.endsWith("'"))) {
    return stripped.slice(1, -1);
  }

  // Booleans
  if (stripped === "true" || stripped === "yes") return true;
  if (stripped === "false" || stripped === "no") return false;

  // Numbers
  if (/^-?\d+$/.test(stripped)) return parseInt(stripped, 10);
  if (/^-?\d+\.\d+$/.test(stripped)) return parseFloat(stripped);

  return stripped;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const SAFE_STRING = /^[a-zA-Z0-9._\-/@: ]+$/;
const SAFE_PATH = /^[a-zA-Z0-9._\-/]+$/;

/** Env var keys that must never be settable from repo.yaml (privilege escalation vectors). */
const DENIED_ENV_KEYS = new Set([
  "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
  "PATH", "HOME", "USER", "SHELL", "TERM",
  "AGENCE_POLICY", "AGENCE_GUARD_PERMISSIVE", "AGENCE_ROOT", "AI_ROOT", "AI_BIN",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN",
  "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AZURE_OPENAI_API_KEY",
  "NODE_OPTIONS", "BUN_CONFIG_REGISTRY", "NPM_CONFIG_REGISTRY",
]);

function validateConfig(config: Record<string, any>): string[] {
  const errors: string[] = [];

  // Validate repo section
  if (config.repo) {
    if (config.repo.name && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.repo.name)) {
      errors.push(`repo.name must be alphanumeric (no slashes/spaces): ${config.repo.name}`);
    }
    if (config.repo.org && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.repo.org)) {
      errors.push(`repo.org must be alphanumeric (no slashes/spaces): ${config.repo.org}`);
    }
  }

  // Validate env values — no command substitution, no shell metacharacters
  if (config.env && typeof config.env === "object") {
    for (const [k, v] of Object.entries(config.env)) {
      if (DENIED_ENV_KEYS.has(k)) {
        errors.push(`env.${k} is a denied key (security-critical variable cannot be set via repo.yaml)`);
        continue;
      }
      if (typeof v === "string") {
        if (/[$`\\|;&><\n\r]/.test(v)) {
          errors.push(`env.${k} contains shell metacharacters (not allowed in repo.yaml): ${v}`);
        }
      }
    }
  }

  // Validate security section
  if (config.security) {
    if (config.security.unknown_command_tier &&
        !["T2", "T3"].includes(config.security.unknown_command_tier)) {
      errors.push(`security.unknown_command_tier must be T2 or T3`);
    }
    if (config.security.policy && !SAFE_PATH.test(config.security.policy)) {
      errors.push(`security.policy path contains unsafe characters`);
    }
    if (config.security.recon_url_allowlist) {
      for (const pattern of config.security.recon_url_allowlist) {
        if (typeof pattern !== "string" || /[;&|`$\n\r]/.test(pattern)) {
          errors.push(`security.recon_url_allowlist contains unsafe pattern: ${pattern}`);
        }
      }
    }
  }

  return errors;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

let _cachedConfig: RepoConfig | null = null;
let _cachedPath: string | null = null;

/**
 * Resolve and load repo.yaml from the agence root.
 * Returns null if no repo.yaml exists (falls back to defaults).
 * Throws on validation errors (malformed config = fail-closed).
 */
export function resolveRepoConfig(agenceRoot?: string): RepoConfig | null {
  const root = agenceRoot
    || process.env.AGENCE_ROOT
    || process.env.AI_ROOT
    || join(import.meta.dir, "..");

  const configPath = join(root, "repo.yaml");

  // Cache hit
  if (_cachedConfig && _cachedPath === configPath) {
    return _cachedConfig;
  }

  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseSimpleYaml(raw);

  // Validate
  const errors = validateConfig(parsed);
  if (errors.length > 0) {
    throw new Error(
      `[config] repo.yaml validation failed:\n${errors.map(e => `  - ${e}`).join("\n")}`
    );
  }

  _cachedConfig = parsed as unknown as RepoConfig;
  _cachedPath = configPath;
  return _cachedConfig;
}

/**
 * Get a flat env map from repo.yaml for subprocess spawning.
 * All values are strings, validated against shell metacharacters.
 */
export function getRepoEnv(agenceRoot?: string): Record<string, string> {
  const config = resolveRepoConfig(agenceRoot);
  if (!config?.env) return {};

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.env)) {
    env[k] = String(v);
  }
  return env;
}

// ─── CLI (standalone execution) ──────────────────────────────────────────────

if (import.meta.main) {
  try {
    const config = resolveRepoConfig();
    if (!config) {
      console.log("[config] No repo.yaml found — using defaults");
      process.exit(0);
    }
    console.log(JSON.stringify(config, null, 2));
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
