# Support — Agence Guard GitHub Action

## Getting help

- **Bug reports & feature requests:** [GitHub Issues](https://github.com/l-agence/agence/issues)
- **Discussions:** [GitHub Discussions](https://github.com/l-agence/agence/discussions)
- **Security vulnerabilities:** See [SECURITY.md](https://github.com/l-agence/agence/blob/main/SECURITY.md) — please report via private disclosure

## Documentation

- [README](https://github.com/l-agence/agence/blob/main/README.md) — full framework overview
- [MCP.md](https://github.com/l-agence/agence/blob/main/MCP.md) — MCP server integration
- [codex/AIPOLICY.yaml](https://github.com/l-agence/agence/blob/main/codex/AIPOLICY.yaml) — default policy reference
- [docs/marketplace/description.md](https://github.com/l-agence/agence/blob/main/docs/marketplace/description.md) — action inputs/outputs reference

## Common issues

**`jq: command not found`**  
The action requires `jq`, which is pre-installed on all GitHub-hosted runners (`ubuntu-latest`, `macos-latest`). If you use a self-hosted runner, install `jq` in your runner environment.

**`Policy file not found`**  
If you supply a `policy:` input, ensure the path is relative to `GITHUB_WORKSPACE` (your repo root) and the file exists at that path.

**`bun install failed`**  
The action uses `bun install --frozen-lockfile` against its own `bun.lock`. This should not fail under normal circumstances. If it does, open an issue with the full Actions log.
