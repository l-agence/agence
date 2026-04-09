#!/usr/bin/env bun
// lib/router.ts — Agent routing + model resolution module (Bun)
//
// Extracted from lib/router.sh data logic + bin/agence resolve_provider().
// Handles: provider detection, mode×provider→model resolution, blast radius,
//          config loading, provider availability, model tier parsing.
//
// Usage (from bash — eval for shell env export):
//   eval $(bun run lib/router.ts resolve-provider)
//   eval $(bun run lib/router.ts resolve-model --provider anthropic --mode code)
//   eval $(bun run lib/router.ts resolve-model --provider anthropic --blast-radius critical)
//   bun run lib/router.ts list-providers         # JSON to stdout
//   bun run lib/router.ts parse-model-tier opus  # → claude-opus-4-5
//
// Exit codes: 0 = success, 1 = error (message on stderr)

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

type Provider =
  | "anthropic" | "openai" | "azure" | "gemini" | "mistral"
  | "groq" | "openrouter" | "grok" | "qwen" | "copilot"
  | "cline" | "ollama" | "pilot" | "none";

type RouterMode = "query" | "plan" | "code";

type BlastRadius = "small" | "medium" | "large" | "critical";

type CostTier = "T0" | "T1" | "T2" | "T3" | "T4";

interface ProviderStatus {
  name: string;
  available: boolean;
  keyVar: string;
  active: boolean;
}

interface ResolvedRoute {
  provider: Provider;
  model: string;
  mode: RouterMode;
  blastRadius?: BlastRadius;
  costTier: CostTier;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIG_PATH = process.env.ROUTER_CONFIG_PATH
  || join(process.env.HOME || "", ".agence", "config.yaml");

// Provider detection order (matches lib/router.sh)
const PROVIDER_KEY_MAP: [Provider, string][] = [
  ["anthropic",  "ANTHROPIC_API_KEY"],
  ["openai",     "OPENAI_API_KEY"],
  ["azure",      "AZURE_OPENAI_API_KEY"],
  ["gemini",     "GEMINI_API_KEY"],
  ["mistral",    "MISTRAL_API_KEY"],
  ["groq",       "GROQ_API_KEY"],
  ["openrouter", "OPENROUTER_API_KEY"],
  ["grok",       "GROK_API_KEY"],
  ["qwen",       "DASHSCOPE_API_KEY"],
  ["copilot",    "GITHUB_TOKEN"],
  ["cline",      "CLINE_API_KEY"],
];

// ─── Mode × Provider → Model Table ──────────────────────────────────────────
// Mirror of _router_model_for_mode() in lib/router.sh

const MODEL_TABLE: Record<string, string> = {
  // QUERY — T0 free
  "query:anthropic":   "claude-haiku-3-5",
  "query:openai":      "gpt-4o-mini",
  "query:azure":       "gpt-4o-mini",
  "query:gemini":      "gemini-2.0-flash",
  "query:mistral":     "mistral-small-latest",
  "query:groq":        "llama-3.3-70b-versatile",
  "query:openrouter":  "kwaipilot/kat-coder-latest",
  "query:grok":        "grok-3-mini-fast",
  "query:qwen":        "qwen-turbo",
  "query:copilot":     "auto",
  "query:cline":       "kwaipilot/kat-coder-latest",
  "query:ollama":      "llama3.2",

  // PLAN — T1 cheap
  "plan:anthropic":    "claude-haiku-3-5",
  "plan:openai":       "gpt-4o-mini",
  "plan:azure":        "gpt-4o-mini",
  "plan:gemini":       "gemini-2.0-flash",
  "plan:mistral":      "mistral-small-latest",
  "plan:groq":         "llama-3.3-70b-versatile",
  "plan:openrouter":   "meta-llama/llama-3.3-70b-instruct",
  "plan:grok":         "grok-3-mini-fast",
  "plan:qwen":         "qwen-plus",
  "plan:copilot":      "auto",
  "plan:cline":        "kwaipilot/kat-coder-latest",
  "plan:ollama":       "llama3.2",

  // CODE — T2/T3 capable
  "code:anthropic":    "claude-sonnet-4-5",
  "code:openai":       "gpt-4o",
  "code:azure":        "gpt-4o",
  "code:gemini":       "gemini-1.5-pro",
  "code:mistral":      "codestral-latest",
  "code:groq":         "llama-3.3-70b-versatile",
  "code:openrouter":   "anthropic/claude-3.5-sonnet",
  "code:grok":         "grok-3-fast",
  "code:qwen":         "qwen-max",
  "code:copilot":      "gpt-4.1",
  "code:cline":        "claude-sonnet-4-5",
  "code:ollama":       "llama3.2",
};

// ─── Blast Radius → Model Override Table ─────────────────────────────────────
// When blast_radius is set, overrides the code mode model for the provider.
// Only applies to code mode. query/plan ignore blast_radius.

const BLAST_RADIUS_TABLE: Record<string, string> = {
  // small — T0/T1 (standalone script, low risk)
  "small:anthropic":   "claude-haiku-3-5",
  "small:openai":      "gpt-4o-mini",
  "small:azure":       "gpt-4o-mini",
  "small:gemini":      "gemini-2.0-flash",
  "small:mistral":     "mistral-small-latest",
  "small:groq":        "llama-3.3-70b-versatile",
  "small:openrouter":  "kwaipilot/kat-coder-latest",
  "small:grok":        "grok-3-mini-fast",
  "small:qwen":        "qwen-turbo",
  "small:copilot":     "auto",
  "small:cline":       "kwaipilot/kat-coder-latest",
  "small:ollama":      "llama3.2",

  // medium — T1/T2 (single component, moderate risk)
  "medium:anthropic":  "claude-haiku-3-5",
  "medium:openai":     "gpt-4o-mini",
  "medium:azure":      "gpt-4o-mini",
  "medium:gemini":     "gemini-2.0-flash",
  "medium:mistral":    "mistral-small-latest",
  "medium:groq":       "llama-3.3-70b-versatile",
  "medium:openrouter": "meta-llama/llama-3.3-70b-instruct",
  "medium:grok":       "grok-3-mini-fast",
  "medium:qwen":       "qwen-plus",
  "medium:copilot":    "auto",
  "medium:cline":      "kwaipilot/kat-coder-latest",
  "medium:ollama":     "llama3.2",

  // large — T2/T3 (shared library, high risk)
  "large:anthropic":   "claude-sonnet-4-5",
  "large:openai":      "gpt-4o",
  "large:azure":       "gpt-4o",
  "large:gemini":      "gemini-1.5-pro",
  "large:mistral":     "codestral-latest",
  "large:groq":        "llama-3.3-70b-versatile",
  "large:openrouter":  "anthropic/claude-3.5-sonnet",
  "large:grok":        "grok-3-fast",
  "large:qwen":        "qwen-max",
  "large:copilot":     "gpt-4.1",
  "large:cline":       "claude-sonnet-4-5",
  "large:ollama":      "llama3.2",

  // critical — T3/T4 (cross-repo, release, infrastructure)
  "critical:anthropic":  "claude-opus-4-5",
  "critical:openai":     "o1",
  "critical:azure":      "o1",
  "critical:gemini":     "gemini-1.5-pro",
  "critical:mistral":    "mistral-large-latest",
  "critical:groq":       "llama-3.3-70b-versatile",
  "critical:openrouter":  "anthropic/claude-3-opus",
  "critical:grok":       "grok-3",
  "critical:qwen":       "qwen-max",
  "critical:copilot":    "gpt-4.1",
  "critical:cline":      "claude-opus-4-5",
  "critical:ollama":     "llama3.2",
};

// Cost tier mapping
const MODE_COST_TIER: Record<RouterMode, CostTier> = {
  query: "T0",
  plan:  "T1",
  code:  "T2",
};

const BLAST_COST_TIER: Record<BlastRadius, CostTier> = {
  small:    "T0",
  medium:   "T1",
  large:    "T2",
  critical: "T3",
};

// Named model tiers (used by !agent.model suffix in bin/agence)
const NAMED_TIERS: Record<string, string> = {
  opus:   "claude-opus-4-5",
  sonnet: "claude-sonnet-4-5",
  haiku:  "claude-haiku-3-5",
};

// ─── Config Loading ──────────────────────────────────────────────────────────

function yamlGet(key: string, filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(new RegExp(`^${key}:\\s*(.+)`, "m"));
  if (!match) return null;
  return match[1].replace(/["']/g, "").trim();
}

// ─── Provider Resolution ─────────────────────────────────────────────────────

function resolveProvider(): Provider {
  // 1. Explicit agent routing param
  const agentParam = process.env.AGENCE_AGENT_PARAM;
  if (agentParam) return agentParam.replace(/^@/, "") as Provider;

  // 2. Explicit env override (AGENCE_LLM_PROVIDER or AGENCE_DEFAULT_PROVIDER)
  const explicit = process.env.AGENCE_LLM_PROVIDER || process.env.AGENCE_DEFAULT_PROVIDER;
  if (explicit) return explicit as Provider;

  // 3. Config file
  const fromConfig = yamlGet("provider", CONFIG_PATH);
  if (fromConfig) return fromConfig as Provider;

  // 4. Auto-detect by API key presence (matches lib/router.sh order)
  for (const [provider, keyVar] of PROVIDER_KEY_MAP) {
    if (process.env[keyVar]) return provider;
  }

  // 5. gh auth token fallback for copilot (can't exec from Bun reliably —
  //    caller should set GITHUB_TOKEN if gh auth is available)
  // This is handled by the bash wrapper before calling us.

  return "none";
}

// ─── Model Resolution ────────────────────────────────────────────────────────

function resolveModel(
  provider: Provider,
  mode: RouterMode,
  blastRadius?: BlastRadius,
): string {
  // 1. Explicit model override always wins
  const explicit = process.env.AGENCE_LLM_MODEL || process.env.AGENCE_MODEL;
  if (explicit) return explicit;

  // 2. Blast radius override (code mode only)
  if (blastRadius && mode === "code") {
    const brModel = BLAST_RADIUS_TABLE[`${blastRadius}:${provider}`];
    if (brModel) return brModel;
  }

  // 3. Mode × provider table
  const modeModel = MODEL_TABLE[`${mode}:${provider}`];
  if (modeModel) return modeModel;

  // 4. Fallback
  return "auto";
}

function resolveRoute(
  provider?: Provider,
  mode?: RouterMode,
  blastRadius?: BlastRadius,
): ResolvedRoute {
  const p = provider || resolveProvider();
  const m = mode || (process.env.AGENCE_ROUTER_MODE as RouterMode) || "query";
  const br = blastRadius || (process.env.AGENCE_BLAST_RADIUS as BlastRadius) || undefined;
  const model = resolveModel(p, m, br);
  const costTier = br ? BLAST_COST_TIER[br] : MODE_COST_TIER[m];

  return { provider: p, model, mode: m, blastRadius: br, costTier };
}

// ─── Model Tier Parsing ──────────────────────────────────────────────────────

function parseModelTier(tier: string): string {
  return NAMED_TIERS[tier] || tier;
}

// ─── Provider Availability ───────────────────────────────────────────────────

function listProviders(): ProviderStatus[] {
  const activeProvider = resolveProvider();
  const result: ProviderStatus[] = [];

  for (const [name, keyVar] of PROVIDER_KEY_MAP) {
    result.push({
      name,
      available: !!process.env[keyVar],
      keyVar,
      active: name === activeProvider,
    });
  }

  // Ollama — can't reliably check from Bun without async fetch;
  // mark based on OLLAMA_HOST being set
  result.push({
    name: "ollama",
    available: !!process.env.OLLAMA_HOST,
    keyVar: "OLLAMA_HOST",
    active: activeProvider === "ollama",
  });

  return result;
}

// ─── Shell Export Helpers ────────────────────────────────────────────────────
// Output eval-compatible shell export statements on stdout.
// Human-readable messages go to stderr.

function shellExport(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) {
    // Sanitize: only allow safe characters in values
    const safe = v.replace(/[^a-zA-Z0-9_./:@\-]/g, "");
    console.log(`export ${k}="${safe}"`);
  }
}

// ─── CLI Dispatch ────────────────────────────────────────────────────────────

const [subCmd, ...args] = process.argv.slice(2);

function parseFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

if (!subCmd) {
  console.error("Usage: bun run lib/router.ts <command> [options]");
  console.error("Commands:");
  console.error("  resolve-provider                  Detect + export AGENCE_LLM_PROVIDER");
  console.error("  resolve-model [--provider P] [--mode M] [--blast-radius B]");
  console.error("                                    Resolve + export AGENCE_LLM_MODEL");
  console.error("  resolve-route [--provider P] [--mode M] [--blast-radius B]");
  console.error("                                    Full route: provider + model + tier");
  console.error("  list-providers                    JSON array of provider availability");
  console.error("  parse-model-tier <tier>           Named tier → model name");
  process.exit(1);
}

let exitCode = 0;

switch (subCmd) {
  case "resolve-provider": {
    const provider = resolveProvider();
    if (provider === "none") {
      console.error("[router.ts] ERROR: No LLM provider available");
      exitCode = 1;
    } else {
      shellExport({ AGENCE_LLM_PROVIDER: provider });
    }
    break;
  }

  case "resolve-model": {
    const provider = (parseFlag("--provider") || resolveProvider()) as Provider;
    const mode = (parseFlag("--mode") || process.env.AGENCE_ROUTER_MODE || "query") as RouterMode;
    const blastRadius = parseFlag("--blast-radius") as BlastRadius | undefined;
    const model = resolveModel(provider, mode, blastRadius);
    shellExport({ AGENCE_LLM_MODEL: model });
    break;
  }

  case "resolve-route": {
    const provider = parseFlag("--provider") as Provider | undefined;
    const mode = parseFlag("--mode") as RouterMode | undefined;
    const blastRadius = parseFlag("--blast-radius") as BlastRadius | undefined;
    const route = resolveRoute(provider, mode, blastRadius);
    shellExport({
      AGENCE_LLM_PROVIDER: route.provider,
      AGENCE_LLM_MODEL: route.model,
      AGENCE_ROUTER_MODE: route.mode,
      ...(route.blastRadius ? { AGENCE_BLAST_RADIUS: route.blastRadius } : {}),
      AGENCE_COST_TIER: route.costTier,
    });
    console.error(`[router.ts] ${route.provider}/${route.model} (${route.mode}, ${route.costTier}${route.blastRadius ? `, blast=${route.blastRadius}` : ""})`);
    break;
  }

  case "list-providers": {
    const providers = listProviders();
    console.log(JSON.stringify(providers, null, 2));
    break;
  }

  case "parse-model-tier": {
    const tier = args[0];
    if (!tier) {
      console.error("Usage: bun run lib/router.ts parse-model-tier <tier>");
      exitCode = 1;
    } else {
      console.log(parseModelTier(tier));
    }
    break;
  }

  default:
    console.error(`Error: Unknown command: ${subCmd}`);
    exitCode = 1;
}

process.exit(exitCode);
