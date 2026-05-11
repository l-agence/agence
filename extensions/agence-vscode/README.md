# Agence — VS Code Extension

**AI governance panel for VS Code** — guard decisions, one-click escalations, signal notifications, ledger viewer.

## Features

- **Signal Panel**: See pending agent escalation requests (^ask). One-click approve/deny.
- **Guard History**: View recent command classifications (T0–T3) from the shard ledger.
- **Health Panel**: Quick system health check (config, policy, ledger, signals).
- **Status Bar**: Live governance state indicator.
- **Notifications**: Popup when an agent needs human approval (blocking signals).

## Web-Native

Runs in both desktop VS Code and web-based editors:
- ✅ github.dev
- ✅ Gitpod
- ✅ vscode.dev
- ✅ VS Code Desktop

No Node.js-only dependencies in the core. Desktop gets bonus features (terminal ledger watch, agentd control).

## Activation

Activates when workspace contains:
- `.agencerc`
- `codex/AIPOLICY.yaml`
- `AGENTS.md`

## Commands

| Command | Description |
|---------|-------------|
| `Agence: Approve Escalation` | Approve a pending T2 signal |
| `Agence: Deny Escalation` | Deny a pending signal |
| `Agence: Run Health Check` | Check all governance components |
| `Agence: Tail Ledger` | Open shard ledger (jump to end) |
| `Agence: Refresh Signals` | Reload pending signals |

## Development

```bash
cd extensions/agence-vscode
npm install
npm run compile
```

Press F5 in VS Code to launch Extension Development Host.
