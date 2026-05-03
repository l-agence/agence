# Agence MCP Server

Agence exposes a **Model Context Protocol (MCP)** server over stdio transport. Any MCP-compatible client — Claude Desktop, VS Code Copilot, Cursor, Windsurf, or custom hosts — can use Agence's governance, memory, and orchestration tools directly.

## Quick Start

### 1. Install

```bash
git clone https://github.com/l-agence/agence.git .agence
cd .agence && bun install
```

### 2. Configure your MCP client

Add to your MCP configuration (e.g. `claude_desktop_config.json`, `.vscode/mcp.json`, `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agence": {
      "command": "bun",
      "args": ["run", "/path/to/.agence/lib/mcp.ts"],
      "env": {
        "AGENCE_ROOT": "/path/to/.agence"
      }
    }
  }
}
```

### 3. Verify

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | bun run lib/mcp.ts
```

You should see a valid JSON-RPC response with `serverInfo.name: "agence"`.

---

## Tools (10)

| Tool | Description |
|------|-------------|
| `guard_check` | Check a command against AIPOLICY.yaml — returns tier, approved/denied, reason |
| `guard_classify` | Classify a command's tier (T0-T4) without logging to ledger |
| `skill_run` | Execute an agence skill (^fix, ^review, ^hack, ^design, etc.) |
| `skill_list` | List all available skills with descriptions |
| `memory_retain` | Store knowledge in COGNOS 5-tier memory |
| `memory_recall` | Query memories by tags (ranked by importance × recency) |
| `memory_stats` | Memory statistics across all COGNOS tiers |
| `peers_run` | Multi-LLM consensus (3 independent models, weighted aggregation) |
| `ledger_status` | Audit ledger health — entry count, chain validity |
| `ledger_verify` | Verify Merkle chain integrity of audit ledger |

## Resources (3)

| Resource | URI | Description |
|----------|-----|-------------|
| Policy | `agence://policy` | Current AIPOLICY.yaml (command gating rules) |
| Registry | `agence://registry` | Agent registry (all 18 registered agents) |
| Agents | `agence://agents` | Agent persona listing with detail URIs |

---

## Command Gating via MCP

The primary use case: **every command your AI agent wants to run passes through `guard_check` first**.

```
Client → guard_check("rm -rf /tmp/data")
Server → { tier: "T3", action: "deny", reason: "Blocked: destructive rm" }
```

```
Client → guard_check("git status")
Server → { tier: "T0", action: "allow", reason: "Allowed by whitelist.git_cli" }
```

Unknown commands default to **T2** (human approval required). Fail-closed.

---

## Multi-LLM Consensus via MCP

Route any question to 3 independent LLMs for weighted consensus:

```
Client → peers_run({ skill: "review", query: "Is this auth implementation secure?" })
Server → { finding: "...", confidence: 87, agreement: "majority", peers: [...] }
```

Available skills: `solve`, `review`, `analyze`, `plan`  
Flavors: `code` (Claude + GPT-4o + Gemini), `light` (Haiku + GPT-4o-mini + Flash), `heavy` (Opus + GPT-4 + Pro)

---

## Security

- All tool inputs validated via Zod schemas
- `guard_check` runs subprocess with `spawnSync` array form (no shell injection)
- Ledger entries are Merkle-chained (SHA-256) — tamper detection built in
- No secrets exposed via MCP resources
- AGENCE_ROOT validated at startup

---

## Requirements

| Dependency | Version |
|-----------|---------|
| Bun | ≥ 1.3 |
| @modelcontextprotocol/sdk | ^1.29.0 |
| zod | ^4.3.6 |

---

## Protocol

- Transport: **stdio** (JSON-RPC over stdin/stdout)
- Protocol version: `2024-11-05`
- Server info: `{ name: "agence", version: "1.0.0" }`

---

## Links

- [GitHub](https://github.com/l-agence/agence)
- [Release Notes](https://github.com/l-agence/agence/releases/tag/v1.0.0)
- [Architecture](knowledge/l-agence.org/docs/ARCHITECTURE.md)
- [Security](SECURITY.md)
