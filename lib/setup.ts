#!/usr/bin/env bun
// lib/setup.ts — ^setup: Interactive onboarding wizard
//
// Usage:
//   agence ^setup                 Run full interactive setup wizard
//   agence ^setup org             Set/change org namespace only
//   agence ^setup keys            Configure API keys only
//   agence ^setup recon           Launch initial recon scans only
//   agence ^setup vault            Configure hermetic vault only
//   agence ^setup status          Show current configuration
//   agence ^setup help            This help
//
// The wizard walks through:
//   1. Org namespace (domain-style: acme.io, l-agence.org)
//   2. Repository platform recon (GitHub, GitLab, Bitbucket)
//   3. Wiki/docs platform recon (Confluence, wiki URL)
//   4. LLM API keys (Anthropic, OpenAI, etc.)
//   5. Artifact registry (JFrog, npm, etc.)
//   6. Project keys (JIRA, Linear, etc.)
//   7. Hermetic vault (user-private knowledge repo)

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import * as readline from "readline";

// ─── Environment ─────────────────────────────────────────────────────────────

const ROOT = process.env.AGENCE_ROOT || process.env.AI_ROOT || join(import.meta.dir, "..");
const RC_PATH = join(ROOT, ".agencerc");
const BUN = process.execPath || "bun";

// ─── Readline helper ─────────────────────────────────────────────────────────

function createRL(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stderr });
}

function ask(rl: readline.Interface, prompt: string, defaultVal = ""): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : "";
  return new Promise((resolve) => {
    rl.question(`  ${prompt}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function askYN(rl: readline.Interface, prompt: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`  ${prompt} [${hint}]: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

function askChoice(rl: readline.Interface, prompt: string, choices: string[], defaultIdx = 0): Promise<string> {
  return new Promise((resolve) => {
    console.error(`  ${prompt}`);
    choices.forEach((c, i) => {
      const marker = i === defaultIdx ? " *" : "  ";
      console.error(`  ${marker} ${i + 1}) ${c}`);
    });
    rl.question(`  Choice [${defaultIdx + 1}]: `, (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < choices.length) resolve(choices[idx]);
      else resolve(choices[defaultIdx]);
    });
  });
}

// ─── .agencerc helpers ───────────────────────────────────────────────────────

function readRC(): string {
  if (existsSync(RC_PATH)) return readFileSync(RC_PATH, "utf-8");
  return "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeShellValue(s: string): string {
  // Escape all shell metacharacters for double-quoted context
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/\n/g, "\\n");
}

function setRCVar(key: string, value: string): void {
  // SEC: validate key is a safe env var name
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || key.length > 256) {
    console.error(`  ✗ Invalid env var name: ${key}`);
    return;
  }
  let rc = readRC();
  const safeValue = escapeShellValue(value);
  const exportLine = `export ${key}="${safeValue}"`;
  const escapedKey = escapeRegex(key);
  const commentedPattern = new RegExp(`^#\\s*export ${escapedKey}=`, "m");
  const activePattern = new RegExp(`^export ${escapedKey}=.*$`, "m");

  if (activePattern.test(rc)) {
    // Replace existing active line
    rc = rc.replace(activePattern, exportLine);
  } else if (commentedPattern.test(rc)) {
    // Uncomment and set
    rc = rc.replace(commentedPattern, `export ${escapedKey}=`);
    rc = rc.replace(new RegExp(`^export ${escapedKey}=.*$`, "m"), exportLine);
  } else {
    // Append
    rc = rc.trimEnd() + "\n" + exportLine + "\n";
  }
  writeFileSync(RC_PATH, rc);
}

function getRCVar(key: string): string | undefined {
  const rc = readRC();
  const match = rc.match(new RegExp(`^export ${key}="([^"]*)"`, "m"));
  return match?.[1] || process.env[key];
}

// ─── Step 1: Org namespace ───────────────────────────────────────────────────

async function setupOrg(rl: readline.Interface): Promise<string> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 1/6: Org Namespace             ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");
  console.error("  The org namespace scopes your knowledge base.");
  console.error("  Use a domain-style name (e.g. acme.io, l-agence.org).");
  console.error("");

  const currentOrg = getRCVar("AGENCE_ORG") || "l-agence.org";
  const org = await ask(rl, "Org namespace", currentOrg);

  // Validate: must look like a domain or simple name (min 1 char)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,63}$/.test(org)) {
    console.error("  ✗ Invalid org name — use alphanumeric + dots/hyphens");
    return currentOrg;
  }

  // Persist
  setRCVar("AGENCE_ORG", org);
  process.env.AGENCE_ORG = org;

  // Create knowledge dir + @ symlink
  const knowledgeDir = join(ROOT, "knowledge", org);
  if (!existsSync(knowledgeDir)) {
    mkdirSync(knowledgeDir, { recursive: true });
    console.error(`  + Created knowledge/${org}/`);
  }

  const atLink = join(ROOT, "knowledge", "@");
  const linkResult = spawnSync("ln", ["-sfn", org, atLink], { cwd: join(ROOT, "knowledge") });
  if (linkResult.status === 0) {
    console.error(`  ✓ knowledge/@ → ${org}`);
  }

  console.error(`  ✓ AGENCE_ORG=${org}`);
  return org;
}

// ─── Step 2: Repository platform recon ───────────────────────────────────────

async function setupRepoRecon(rl: readline.Interface): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 2/6: Repository Platform       ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");

  const platform = await askChoice(rl, "Select your code platform:", [
    "GitHub",
    "GitLab",
    "Bitbucket",
    "Skip",
  ], 0);

  if (platform === "Skip") {
    console.error("  — Skipped repository recon");
    return;
  }

  if (platform === "GitHub") {
    const orgOrUser = await ask(rl, "GitHub org or username");
    if (!orgOrUser) return;

    // SEC: validate input (alphanumeric + hyphens only)
    if (!/^[a-zA-Z0-9\-]+$/.test(orgOrUser)) {
      console.error("  ✗ Invalid GitHub org/user name");
      return;
    }

    const doRecon = await askYN(rl, `Launch ^recon for github:${orgOrUser}?`);
    if (doRecon) {
      console.error(`  → Running: ^recon github:${orgOrUser}`);
      const result = spawnSync(BUN, ["run", join(ROOT, "lib", "recon.ts"), `github:${orgOrUser}`], {
        cwd: ROOT,
        env: { ...process.env, AGENCE_ROOT: ROOT },
        stdio: "inherit",
      });
      if (result.status === 0) console.error(`  ✓ Recon complete for github:${orgOrUser}`);
      else console.error(`  ⚠ Recon exited with code ${result.status}`);
    }
  } else if (platform === "GitLab" || platform === "Bitbucket") {
    const url = await ask(rl, `${platform} base URL (e.g. https://gitlab.example.com)`);
    if (!url) return;

    // Basic URL validation
    if (!/^https?:\/\/.+/.test(url)) {
      console.error("  ✗ Invalid URL — must start with https://");
      return;
    }

    setRCVar(`AGENCE_${platform.toUpperCase()}_URL`, url);
    console.error(`  ✓ ${platform} URL saved to .agencerc`);

    const doRecon = await askYN(rl, `Launch ^recon for ${url}?`);
    if (doRecon) {
      console.error(`  → Running: ^recon ${url}`);
      const result = spawnSync(BUN, ["run", join(ROOT, "lib", "recon.ts"), url], {
        cwd: ROOT,
        env: { ...process.env, AGENCE_ROOT: ROOT },
        stdio: "inherit",
      });
      if (result.status === 0) console.error(`  ✓ Recon complete`);
      else console.error(`  ⚠ Recon exited with code ${result.status}`);
    }
  }
}

// ─── Step 3: Wiki/docs platform ──────────────────────────────────────────────

async function setupWikiRecon(rl: readline.Interface): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 3/6: Wiki / Documentation      ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");

  const platform = await askChoice(rl, "Select your docs platform:", [
    "Confluence",
    "Wiki URL",
    "Skip",
  ], 2);

  if (platform === "Skip") {
    console.error("  — Skipped wiki/docs recon");
    return;
  }

  if (platform === "Confluence") {
    const url = await ask(rl, "Confluence base URL (e.g. https://acme.atlassian.net/wiki)");
    if (!url || !/^https?:\/\/.+/.test(url)) {
      console.error("  ✗ Invalid URL");
      return;
    }
    setRCVar("AGENCE_CONFLUENCE_URL", url);
    console.error(`  ✓ Confluence URL saved to .agencerc`);

    const doRecon = await askYN(rl, `Launch ^recon for ${url}?`);
    if (doRecon) {
      console.error(`  → Running: ^recon ${url}`);
      spawnSync(BUN, ["run", join(ROOT, "lib", "recon.ts"), url], {
        cwd: ROOT,
        env: { ...process.env, AGENCE_ROOT: ROOT },
        stdio: "inherit",
      });
    }
  } else if (platform === "Wiki URL") {
    const url = await ask(rl, "Wiki/docs URL");
    if (!url || !/^https?:\/\/.+/.test(url)) {
      console.error("  ✗ Invalid URL");
      return;
    }
    setRCVar("AGENCE_WIKI_URL", url);

    const doRecon = await askYN(rl, `Launch ^recon for ${url}?`);
    if (doRecon) {
      console.error(`  → Running: ^recon ${url}`);
      spawnSync(BUN, ["run", join(ROOT, "lib", "recon.ts"), url], {
        cwd: ROOT,
        env: { ...process.env, AGENCE_ROOT: ROOT },
        stdio: "inherit",
      });
    }
  }
}

// ─── Step 4: LLM API keys ───────────────────────────────────────────────────

interface KeyConfig {
  envVar: string;
  label: string;
  prefix: string;
}

const LLM_KEYS: KeyConfig[] = [
  { envVar: "ANTHROPIC_API_KEY", label: "Anthropic (Claude)", prefix: "sk-ant-" },
  { envVar: "OPENAI_API_KEY", label: "OpenAI (GPT)", prefix: "sk-" },
  { envVar: "AZURE_OPENAI_API_KEY", label: "Azure OpenAI", prefix: "" },
  { envVar: "GEMINI_API_KEY", label: "Google Gemini", prefix: "" },
  { envVar: "MISTRAL_API_KEY", label: "Mistral", prefix: "" },
  { envVar: "GROQ_API_KEY", label: "Groq", prefix: "" },
  { envVar: "OPENROUTER_API_KEY", label: "OpenRouter", prefix: "sk-or-" },
];

async function setupKeys(rl: readline.Interface): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 4/6: LLM API Keys              ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");
  console.error("  Keys are saved to .agencerc (gitignored).");
  console.error("  Leave blank to skip. Existing values shown as ****.");
  console.error("");

  for (const key of LLM_KEYS) {
    const existing = getRCVar(key.envVar);
    const hint = existing ? " (****)" : "";
    const val = await ask(rl, `${key.label}${hint}`);

    if (val) {
      // SEC: basic prefix validation if known
      if (key.prefix && !val.startsWith(key.prefix)) {
        console.error(`  ⚠ Expected prefix "${key.prefix}" — saving anyway`);
      }
      setRCVar(key.envVar, val);
      console.error(`  ✓ ${key.envVar} saved`);
    } else if (existing) {
      console.error(`  — ${key.envVar} unchanged`);
    }
  }
}

// ─── Step 5: Artifact registry ───────────────────────────────────────────────

async function setupRegistry(rl: readline.Interface): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 5/6: Artifact Registry          ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");

  const platform = await askChoice(rl, "Select your artifact registry:", [
    "JFrog Artifactory",
    "npm registry",
    "Skip",
  ], 2);

  if (platform === "Skip") {
    console.error("  — Skipped registry setup");
    return;
  }

  if (platform === "JFrog Artifactory") {
    const url = await ask(rl, "JFrog URL (e.g. https://acme.jfrog.io)");
    if (url && /^https?:\/\/.+/.test(url)) {
      setRCVar("JFROG_URL", url);
      console.error(`  ✓ JFROG_URL saved`);
    }

    const token = await ask(rl, "JFrog API token (or leave blank)");
    if (token) {
      setRCVar("JFROG_API_TOKEN", token);
      console.error(`  ✓ JFROG_API_TOKEN saved`);
    }
  } else if (platform === "npm registry") {
    const url = await ask(rl, "npm registry URL", "https://registry.npmjs.org");
    if (url) {
      setRCVar("NPM_REGISTRY_URL", url);
      console.error(`  ✓ NPM_REGISTRY_URL saved`);
    }
  }
}

// ─── Step 6: Project tracking ────────────────────────────────────────────────

async function setupProjectKeys(rl: readline.Interface): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 6/6: Project Tracking           ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");

  const platform = await askChoice(rl, "Select your project tracker:", [
    "JIRA",
    "Linear",
    "GitHub Issues",
    "Skip",
  ], 3);

  if (platform === "Skip") {
    console.error("  — Skipped project tracking setup");
    return;
  }

  if (platform === "JIRA") {
    const url = await ask(rl, "JIRA URL (e.g. https://acme.atlassian.net)");
    if (url && /^https?:\/\/.+/.test(url)) {
      setRCVar("JIRA_URL", url);
      console.error(`  ✓ JIRA_URL saved`);
    }

    const projectKey = await ask(rl, "JIRA project key (e.g. PROJ)");
    if (projectKey) {
      // SEC: validate project key format (uppercase alnum)
      if (!/^[A-Z][A-Z0-9_]{1,15}$/.test(projectKey)) {
        console.error(`  ⚠ Unusual project key format — saving anyway`);
      }
      setRCVar("JIRA_PROJECT_KEY", projectKey);
      console.error(`  ✓ JIRA_PROJECT_KEY=${projectKey}`);
    }

    const token = await ask(rl, "JIRA API token (or leave blank)");
    if (token) {
      setRCVar("JIRA_API_TOKEN", token);
      console.error(`  ✓ JIRA_API_TOKEN saved`);
    }
  } else if (platform === "Linear") {
    const token = await ask(rl, "Linear API key");
    if (token) {
      setRCVar("LINEAR_API_KEY", token);
      console.error(`  ✓ LINEAR_API_KEY saved`);
    }
  } else if (platform === "GitHub Issues") {
    console.error("  ✓ GitHub Issues — uses gh CLI (no extra config needed)");
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

function showStatus(): void {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  ^setup status                       ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");

  const vars: [string, string][] = [
    ["AGENCE_ORG", "Org namespace"],
    ["ANTHROPIC_API_KEY", "Anthropic key"],
    ["OPENAI_API_KEY", "OpenAI key"],
    ["AZURE_OPENAI_API_KEY", "Azure OpenAI key"],
    ["GEMINI_API_KEY", "Gemini key"],
    ["MISTRAL_API_KEY", "Mistral key"],
    ["GROQ_API_KEY", "Groq key"],
    ["OPENROUTER_API_KEY", "OpenRouter key"],
    ["JFROG_URL", "JFrog URL"],
    ["JFROG_API_TOKEN", "JFrog token"],
    ["JIRA_URL", "JIRA URL"],
    ["JIRA_PROJECT_KEY", "JIRA project"],
    ["JIRA_API_TOKEN", "JIRA token"],
    ["LINEAR_API_KEY", "Linear key"],
    ["AGENCE_CONFLUENCE_URL", "Confluence URL"],
    ["AGENCE_WIKI_URL", "Wiki URL"],
    ["AGENCE_GITLAB_URL", "GitLab URL"],
    ["AGENCE_BITBUCKET_URL", "Bitbucket URL"],
    ["NPM_REGISTRY_URL", "npm registry"],
    ["AGENCE_VAULT_USER", "Vault user"],
  ];

  for (const [key, label] of vars) {
    const val = getRCVar(key);
    if (val) {
      // Mask secrets, show values for URLs/names
      const isSecret = key.includes("KEY") || key.includes("TOKEN");
      const display = isSecret ? `${val.slice(0, 6)}****` : val;
      console.error(`  ✓ ${label.padEnd(20)} ${display}`);
    } else {
      console.error(`  · ${label.padEnd(20)} (not set)`);
    }
  }
  console.error("");
}

// ─── Step 7: Hermetic vault ──────────────────────────────────────────────────

async function setupVault(rl: readline.Interface): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════╗");
  console.error("  ║  Step 7/7: Hermetic Vault            ║");
  console.error("  ╚══════════════════════════════════════╝");
  console.error("");
  console.error("  The hermetic vault backs knowledge/private/ with a user-owned");
  console.error("  private GitHub repo (github.com/<you>/agence-vault).");
  console.error("  Content remains private — shared only via explicit ^vault commands.");
  console.error("");

  const wantVault = await askYN(rl, "Set up hermetic vault?", true);
  if (!wantVault) {
    console.error("  ⏭  Skipped vault setup.");
    return;
  }

  // Resolve GitHub user
  let user = getRCVar("AGENCE_VAULT_USER") || "";
  if (!user) {
    try {
      user = spawnSync("gh", ["api", "user", "--jq", ".login"], {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
      }).stdout?.trim() || "";
    } catch { /* gh unavailable */ }
  }

  user = await ask(rl, "GitHub username for vault", user);
  if (!user) {
    console.error("  ✗ No username — skipping vault.");
    return;
  }

  // Validate
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(user)) {
    console.error("  ✗ Invalid GitHub username.");
    return;
  }

  setRCVar("AGENCE_VAULT_USER", user);
  process.env.AGENCE_VAULT_USER = user;

  // Run vault init
  console.error(`  Initializing vault for ${user}...`);
  const result = spawnSync(BUN, ["run", join(ROOT, "lib", "vault.ts"), "init", "--user", user], {
    cwd: ROOT,
    env: { ...process.env, AGENCE_ROOT: ROOT, AGENCE_VAULT_USER: user },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  });

  const out = result.stderr?.toString() || "";
  if (out) console.error(out);
  if (result.status === 0) {
    console.error(`  ✓ Vault ready: github.com/${user}/agence-vault`);
  } else {
    console.error("  ⚠ Vault init had issues — run 'agence ^vault init' to retry.");
  }
}

// ─── Full wizard ─────────────────────────────────────────────────────────────

async function runWizard(): Promise<void> {
  console.error("");
  console.error("  ╔══════════════════════════════════════════════════╗");
  console.error("  ║         AGENCE SETUP WIZARD (^setup)            ║");
  console.error("  ╚══════════════════════════════════════════════════╝");
  console.error("");

  const rl = createRL();
  try {
    await setupOrg(rl);
    await setupRepoRecon(rl);
    await setupWikiRecon(rl);
    await setupKeys(rl);
    await setupRegistry(rl);
    await setupProjectKeys(rl);
    await setupVault(rl);

    console.error("");
    console.error("  ══════════════════════════════════════");
    console.error("  ✓ Setup complete!");
    console.error(`  Config saved to: ${RC_PATH}`);
    console.error("  Run '^setup status' to review.");
    console.error("  ══════════════════════════════════════");
    console.error("");
  } finally {
    rl.close();
  }
}

// ─── CLI routing ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] || "";

  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      console.error(`setup — Interactive onboarding wizard

Usage:
  agence ^setup                 Run full setup wizard
  agence ^setup org             Set/change org namespace
  agence ^setup keys            Configure LLM API keys
  agence ^setup recon           Launch repository/wiki recon
  agence ^setup registry        Configure artifact registry
  agence ^setup project         Configure project tracking
  agence ^setup status          Show current configuration
  agence ^setup vault           Configure hermetic vault
  agence ^setup help            This help`);
      break;

    case "status":
      showStatus();
      break;

    case "org": {
      const rl = createRL();
      try { await setupOrg(rl); } finally { rl.close(); }
      break;
    }

    case "keys": {
      const rl = createRL();
      try { await setupKeys(rl); } finally { rl.close(); }
      break;
    }

    case "recon": {
      const rl = createRL();
      try {
        await setupRepoRecon(rl);
        await setupWikiRecon(rl);
      } finally { rl.close(); }
      break;
    }

    case "registry": {
      const rl = createRL();
      try { await setupRegistry(rl); } finally { rl.close(); }
      break;
    }

    case "project": {
      const rl = createRL();
      try { await setupProjectKeys(rl); } finally { rl.close(); }
      break;
    }

    case "vault": {
      const rl = createRL();
      try { await setupVault(rl); } finally { rl.close(); }
      break;
    }

    case "":
      await runWizard();
      break;

    default:
      console.error(`Unknown setup command: ${cmd}`);
      console.error(`Run 'agence ^setup help' for usage.`);
      process.exit(1);
  }
}

// Exports for testing
export {
  setupOrg,
  setupKeys,
  setupRepoRecon,
  setupWikiRecon,
  setupRegistry,
  setupProjectKeys,
  setupVault,
  showStatus,
  setRCVar,
  getRCVar,
  readRC,
  ROOT,
  RC_PATH,
};

await main();
