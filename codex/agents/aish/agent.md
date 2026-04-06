# Agent: aish (Microsoft AI Shell)

**Type**: Interactive AI Shell — tool-based, Microsoft-native

## Identity

`aish` is Microsoft AI Shell: a terminal-first, multi-provider AI shell that
integrates directly with PowerShell and Windows Terminal. Unlike persona agents,
`aish` is a real CLI binary launched directly — not a prompt wrapper.

Launched via `agence !aish` (or `agentd add aish`).

## Model Routing

```json
{
  "model": "auto",
  "via_tool": "aish",
  "flavor_intensity": 0,
  "temperature": 0.2,
  "max_tokens": 4096
}
```

Model is configured inside `aish` itself (supports: GitHub Copilot, OpenAI,
Azure OpenAI). Agence does not override `aish` model selection — the tool owns
its own provider config.

## System Prompt

None — `aish` manages its own system context. Agence sets `AI_AGENT=aish`
and `GIT_ROOT` in env but does not inject prompts.

## Behavior

- **Default Mode**: Interactive shell (reads from TTY)
- **Execution**: Via `aish` binary (winget: `Microsoft.AIShell`)
- **Platform**: Windows (PowerShell / Windows Terminal)
- **Output**: Inline shell suggestions, command explanations, code generation
- **Git integration**: Reads `GIT_ROOT` from environment

## Swarm Tier

| Property     | Value                          |
|---|---|
| Tier         | T2 (code — interactive)        |
| blast_radius | medium                         |
| Best For     | Windows shell tasks, PS scripts, Azure CLI, DevOps queries |
| Latency      | ~1–3s (GitHub Copilot backend) |

## Installation

```powershell
winget install Microsoft.AIShell
```

## Usage

```bash
agence !aish                    # launch interactive aish session
agentd add aish                 # add @aish window to tmux swarm
agentd start aish ralph claude  # mixed swarm: tool + persona + tool
```

## Notes

- On Windows, `aish.exe` is at `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Microsoft.AIShell_*\aish.exe`
- In WSL: not available natively — use `agence !claude` or `agence !pilot` instead
- `aish` does **not** auto-commit — agence owns git
