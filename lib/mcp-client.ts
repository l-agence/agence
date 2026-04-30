#!/usr/bin/env bun
// lib/mcp-client.ts — Agence MCP Client
//
// Connects to external MCP servers and invokes their tools.
// This makes agence a hyperagent — consuming capabilities from any MCP server
// while applying governance (guard gate) to every tool call.
//
// Config: codex/mcp.json (Claude Code compatible format)
//   {
//     "mcpServers": {
//       "server-name": {
//         "command": "npx",
//         "args": ["-y", "@some/mcp-server"],
//         "env": { "API_KEY": "..." }
//       }
//     }
//   }
//
// Usage:
//   airun mcp-client list                          — List configured servers + tools
//   airun mcp-client tools <server>                — List tools from a specific server
//   airun mcp-client call <server> <tool> [json]   — Call a tool on a server
//   airun mcp-client connect <server>              — Test connectivity to a server

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

// ─── Environment ─────────────────────────────────────────────────────────────

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const BUN = process.env.BUN_PATH || "bun";

// ─── Config Types ────────────────────────────────────────────────────────────

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// ─── Config Loading ──────────────────────────────────────────────────────────
// Load MCP server configs from codex/mcp.json.
// Format is compatible with Claude Code's MCP config.

const CONFIG_PATHS = [
  join(AGENCE_ROOT, "codex", "mcp.json"),
  join(AGENCE_ROOT, "mcp.json"),
];

function loadConfig(): McpConfig {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
          return parsed as McpConfig;
        }
        process.stderr.write(`[mcp-client] Config missing mcpServers key: ${configPath}\n`);
      } catch (err: any) {
        process.stderr.write(`[mcp-client] Failed to parse config: ${configPath}: ${err.message}\n`);
      }
    }
  }
  return { mcpServers: {} };
}

// ─── Guard Gate ──────────────────────────────────────────────────────────────
// Every MCP tool call passes through the guard before execution.
// This ensures external MCP tools cannot bypass agence governance.

function guardCheck(toolDescription: string): { approved: boolean; tier: string; reason: string } {
  try {
    const result = spawnSync(BUN, ["run", join(AGENCE_ROOT, "lib", "guard.ts"), "classify", `mcp-tool: ${toolDescription}`], {
      cwd: AGENCE_ROOT,
      env: { ...process.env, AGENCE_ROOT },
      timeout: 10_000,
      encoding: "utf-8",
    });
    if (result.stdout) {
      const decision = JSON.parse(result.stdout);
      return { approved: decision.action !== "deny", tier: decision.tier || "T2", reason: decision.reason || "" };
    }
  } catch {}
  // Fail-closed: if guard is unavailable, deny
  return { approved: false, tier: "T2", reason: "guard unavailable — fail-closed" };
}

// ─── Client Connection ───────────────────────────────────────────────────────
// Create and connect an MCP client to a configured server.

const CONNECTION_TIMEOUT = 30_000;

async function connectToServer(name: string, config: McpServerConfig): Promise<Client> {
  // Sanitize env: never pass AGENCE_ROOT or API keys from agence's own env
  const safeEnv: Record<string, string> = {};
  // Start with a minimal inherited env
  for (const key of ["PATH", "HOME", "USER", "LANG", "TERM", "SHELL"]) {
    if (process.env[key]) safeEnv[key] = process.env[key]!;
  }
  // Overlay server-specific env (user-configured)
  if (config.env) {
    Object.assign(safeEnv, config.env);
  }

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: safeEnv,
    cwd: config.cwd,
    stderr: "pipe",
  });

  const client = new Client(
    { name: "agence", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  return client;
}

// ─── Tool Discovery ──────────────────────────────────────────────────────────

interface DiscoveredTool {
  server: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

async function discoverTools(serverName: string, config: McpServerConfig): Promise<DiscoveredTool[]> {
  let client: Client | undefined;
  try {
    client = await connectToServer(serverName, config);
    const result = await client.listTools();
    return result.tools.map(t => ({
      server: serverName,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
  }
}

// ─── Tool Invocation ─────────────────────────────────────────────────────────
// Call a tool on an MCP server. Guard-gated.

export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: string; isError: boolean }> {
  const config = loadConfig();
  const serverConfig = config.mcpServers[serverName];
  if (!serverConfig) {
    return { content: `Unknown MCP server: ${serverName}`, isError: true };
  }
  if (serverConfig.disabled) {
    return { content: `MCP server '${serverName}' is disabled`, isError: true };
  }

  // Guard gate: describe the tool call for classification
  const guard = guardCheck(`${serverName}/${toolName} ${JSON.stringify(args)}`);
  if (!guard.approved) {
    return {
      content: `Guard denied MCP tool call: ${serverName}/${toolName} (${guard.tier}: ${guard.reason})`,
      isError: true,
    };
  }

  let client: Client | undefined;
  try {
    client = await connectToServer(serverName, serverConfig);

    // SEC-015: Timeout for tool call — prevent hostile server from hanging forever
    const CALL_TIMEOUT = 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT);

    let result: any;
    try {
      result = await client.callTool({ name: toolName, arguments: args });
    } finally {
      clearTimeout(timer);
    }

    // SEC-015: Response size limit — prevent hostile server OOM (1MB max)
    const MAX_RESPONSE_SIZE = 1024 * 1024;
    const texts: string[] = [];
    let totalSize = 0;
    if (Array.isArray(result.content)) {
      for (const item of result.content) {
        if (typeof item === "object" && item !== null && "text" in item) {
          const text = String((item as any).text);
          totalSize += text.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            texts.push(text.slice(0, MAX_RESPONSE_SIZE - (totalSize - text.length)));
            texts.push("\n[truncated: response exceeded 1MB limit]");
            break;
          }
          texts.push(text);
        }
      }
    }

    return {
      content: texts.join("\n") || JSON.stringify(result).slice(0, MAX_RESPONSE_SIZE),
      isError: !!result.isError,
    };
  } catch (err: any) {
    const msg = err.name === "AbortError"
      ? "MCP call timed out (30s limit)"
      : `MCP call failed: ${err.message}`;
    return { content: msg, isError: true };
  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function cmdList(): Promise<number> {
  const config = loadConfig();
  const servers = Object.keys(config.mcpServers);
  if (servers.length === 0) {
    console.log("[mcp-client] No MCP servers configured.");
    console.log("  Add servers to codex/mcp.json:");
    console.log('  { "mcpServers": { "name": { "command": "...", "args": [...] } } }');
    return 0;
  }

  console.log(`[mcp-client] ${servers.length} configured server(s):\n`);
  for (const name of servers) {
    const srv = config.mcpServers[name];
    const status = srv.disabled ? " (disabled)" : "";
    console.log(`  ${name}${status}`);
    console.log(`    command: ${srv.command} ${(srv.args || []).join(" ")}`);
    if (!srv.disabled) {
      try {
        const tools = await discoverTools(name, srv);
        console.log(`    tools (${tools.length}):`);
        for (const t of tools) {
          console.log(`      - ${t.name}${t.description ? `: ${t.description}` : ""}`);
        }
      } catch (err: any) {
        console.log(`    tools: (connection failed: ${err.message})`);
      }
    }
    console.log();
  }
  return 0;
}

async function cmdTools(serverName: string): Promise<number> {
  const config = loadConfig();
  const srv = config.mcpServers[serverName];
  if (!srv) {
    console.error(`[mcp-client] Unknown server: ${serverName}`);
    console.error(`  Available: ${Object.keys(config.mcpServers).join(", ") || "(none)"}`);
    return 1;
  }

  try {
    const tools = await discoverTools(serverName, srv);
    console.log(`[mcp-client] ${serverName}: ${tools.length} tool(s)\n`);
    for (const t of tools) {
      console.log(`  ${t.name}`);
      if (t.description) console.log(`    ${t.description}`);
      if (t.inputSchema?.properties) {
        const props = t.inputSchema.properties as Record<string, any>;
        const required = (t.inputSchema.required || []) as string[];
        for (const [k, v] of Object.entries(props)) {
          const req = required.includes(k) ? " (required)" : "";
          console.log(`    --${k}: ${v.type || "any"}${req}${v.description ? ` — ${v.description}` : ""}`);
        }
      }
      console.log();
    }
    return 0;
  } catch (err: any) {
    console.error(`[mcp-client] Failed to connect to ${serverName}: ${err.message}`);
    return 1;
  }
}

async function cmdCall(serverName: string, toolName: string, argsJson?: string): Promise<number> {
  let args: Record<string, unknown> = {};
  if (argsJson) {
    try {
      args = JSON.parse(argsJson);
    } catch {
      console.error(`[mcp-client] Invalid JSON arguments: ${argsJson}`);
      return 1;
    }
  }

  const result = await callMcpTool(serverName, toolName, args);
  if (result.isError) {
    console.error(result.content);
    return 1;
  }
  console.log(result.content);
  return 0;
}

async function cmdConnect(serverName: string): Promise<number> {
  const config = loadConfig();
  const srv = config.mcpServers[serverName];
  if (!srv) {
    console.error(`[mcp-client] Unknown server: ${serverName}`);
    return 1;
  }

  try {
    const client = await connectToServer(serverName, srv);
    const tools = await client.listTools();
    console.log(`[mcp-client] Connected to ${serverName} — ${tools.tools.length} tool(s) available`);
    await client.close();
    return 0;
  } catch (err: any) {
    console.error(`[mcp-client] Failed to connect to ${serverName}: ${err.message}`);
    return 1;
  }
}

function showHelp(): void {
  console.log(`agence mcp-client — Connect to external MCP servers

USAGE:
  airun mcp-client list                          List configured servers + their tools
  airun mcp-client tools <server>                List tools from a specific server
  airun mcp-client call <server> <tool> [json]   Call a tool (JSON args optional)
  airun mcp-client connect <server>              Test connectivity

CONFIG:
  codex/mcp.json — Claude Code compatible MCP server config

EXAMPLE:
  airun mcp-client call filesystem read_file '{"path":"/tmp/test.txt"}'
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case "list":
    process.exit(await cmdList());
  case "tools":
    if (!args[1]) { console.error("Usage: airun mcp-client tools <server>"); process.exit(1); }
    process.exit(await cmdTools(args[1]));
  case "call":
    if (!args[1] || !args[2]) { console.error("Usage: airun mcp-client call <server> <tool> [json]"); process.exit(1); }
    process.exit(await cmdCall(args[1], args[2], args[3]));
  case "connect":
    if (!args[1]) { console.error("Usage: airun mcp-client connect <server>"); process.exit(1); }
    process.exit(await cmdConnect(args[1]));
  case "help":
  case "--help":
  case "-h":
    showHelp();
    process.exit(0);
  default:
    showHelp();
    process.exit(cmd ? 1 : 0);
}
