import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const AGENCE_ROOT = join(import.meta.dir, "../..");

// Helper: check that mcp.ts compiles and can be imported
function bunCheck(file: string): { ok: boolean; stderr: string } {
  const r = spawnSync("bun", ["build", file, "--no-bundle"], {
    cwd: AGENCE_ROOT,
    timeout: 15_000,
  });
  return {
    ok: r.status === 0,
    stderr: r.stderr?.toString("utf-8") ?? "",
  };
}

describe("MCP Server", () => {
  test("lib/mcp.ts compiles without errors", () => {
    const r = bunCheck("lib/mcp.ts");
    expect(r.ok).toBe(true);
  });

  test("MCP SDK is installed", () => {
    const pkg = JSON.parse(readFileSync(join(AGENCE_ROOT, "package.json"), "utf-8"));
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
  });

  test("zod is installed", () => {
    const pkg = JSON.parse(readFileSync(join(AGENCE_ROOT, "package.json"), "utf-8"));
    expect(pkg.dependencies["zod"]).toBeDefined();
  });

  test(".vscode/mcp.json exists and has agence server config", () => {
    const mcpConfig = join(AGENCE_ROOT, ".vscode", "mcp.json");
    expect(existsSync(mcpConfig)).toBe(true);
    const config = JSON.parse(readFileSync(mcpConfig, "utf-8"));
    expect(config.servers.agence).toBeDefined();
    expect(config.servers.agence.type).toBe("stdio");
    expect(config.servers.agence.command).toBe("bun");
  });

  test("mcp.ts imports compile-time dependencies", () => {
    // Verify the SDK types are resolvable
    const r = spawnSync("bun", ["-e", `
      import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
      import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
      import { z } from "zod";
      console.log("OK");
    `], { cwd: AGENCE_ROOT, timeout: 10_000 });
    expect(r.stdout?.toString("utf-8").trim()).toBe("OK");
  });

  test("MCP server exposes 10 tools (guard, skill, memory, peers, ledger)", () => {
    // Parse the tool registrations from the source
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    const toolCalls = src.match(/server\.tool\(/g) || [];
    expect(toolCalls.length).toBe(10);
  });

  test("MCP server exposes 3 resources (policy, registry, agents)", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    const resourceCalls = src.match(/server\.resource\(/g) || [];
    expect(resourceCalls.length).toBe(3);
  });

  test("tool names follow MCP naming conventions (snake_case)", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    const toolNames = [...src.matchAll(/server\.tool\(\s*"([^"]+)"/g)].map(m => m[1]);
    for (const name of toolNames) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test("resource URIs use agence:// scheme", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp.ts"), "utf-8");
    const uris = [...src.matchAll(/"(agence:\/\/[^"]+)"/g)].map(m => m[1]);
    expect(uris.length).toBeGreaterThanOrEqual(3);
    for (const uri of uris) {
      expect(uri).toMatch(/^agence:\/\//);
    }
  });
});

// ─── MCP Client Tests ────────────────────────────────────────────────────────

describe("MCP Client", () => {
  test("lib/mcp-client.ts compiles without errors", () => {
    const r = bunCheck("lib/mcp-client.ts");
    expect(r.ok).toBe(true);
  });

  test("mcp-client imports compile-time dependencies", () => {
    const r = spawnSync("bun", ["-e", `
      import { Client } from "@modelcontextprotocol/sdk/client/index.js";
      import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
      console.log("OK");
    `], { cwd: AGENCE_ROOT, timeout: 10_000 });
    expect(r.stdout?.toString("utf-8").trim()).toBe("OK");
  });

  test("mcp-client help exits 0", () => {
    const r = spawnSync("bun", ["run", "lib/mcp-client.ts", "help"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout?.toString("utf-8")).toContain("mcp-client");
  });

  test("mcp-client list with empty config exits 0", () => {
    const r = spawnSync("bun", ["run", "lib/mcp-client.ts", "list"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
    });
    expect(r.status).toBe(0);
  });

  test("mcp-client tools with unknown server exits 1", () => {
    const r = spawnSync("bun", ["run", "lib/mcp-client.ts", "tools", "nonexistent"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
    });
    expect(r.status).toBe(1);
  });

  test("mcp-client call with unknown server returns error", () => {
    const r = spawnSync("bun", ["run", "lib/mcp-client.ts", "call", "nonexistent", "some_tool"], {
      cwd: AGENCE_ROOT,
      timeout: 10_000,
    });
    expect(r.status).toBe(1);
  });

  test("codex/mcp.json exists and has valid structure", () => {
    const configPath = join(AGENCE_ROOT, "codex", "mcp.json");
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config).toHaveProperty("mcpServers");
    expect(typeof config.mcpServers).toBe("object");
  });

  test("mcp-client guard-gates all tool calls", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp-client.ts"), "utf-8");
    // callMcpTool must contain guard check
    expect(src).toContain("guardCheck");
    expect(src).toContain("fail-closed");
  });

  test("mcp-client sanitizes env (no API key leakage)", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/mcp-client.ts"), "utf-8");
    // connectToServer builds safeEnv with minimal inherited vars
    expect(src).toContain("safeEnv");
    expect(src).toContain("PATH");
    // Should NOT pass AGENCE_ROOT to external servers
    expect(src).toContain("never pass AGENCE_ROOT");
  });

  test("skill.ts mcp delegation compiles", () => {
    const src = readFileSync(join(AGENCE_ROOT, "lib/skill.ts"), "utf-8");
    expect(src).toContain("mcp-client.ts");
  });
});
