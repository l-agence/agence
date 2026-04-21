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
