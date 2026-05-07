# Privacy Policy — Agence Guard GitHub Action

**Effective date:** 2026-05-07

## What data is processed

The Agence Guard action processes only the `command` string you supply as input. This string is classified locally inside the GitHub Actions runner — it is **never transmitted to any external service or API**.

## What data is stored

The action writes no data outside the runner's ephemeral workspace. Specifically:

- No data is written to any external database, API, or server
- No telemetry, analytics, or usage data is collected
- The action does not write to any file outside `$GITHUB_OUTPUT` and the runner's temp directories
- The optional audit ledger (`nexus/.ailedger/`) is written only when Agence is installed in your own repository and you explicitly invoke the `check` (not `classify`) subcommand

## Third-party services

The action uses no third-party services. All classification logic runs locally via [Bun](https://bun.sh) within the GitHub Actions runner.

## Open source

All source code is available at [https://github.com/l-agence/agence](https://github.com/l-agence/agence) under the [MIT + Commons Clause license](https://github.com/l-agence/agence/blob/main/LICENSE.md).

## Contact

Questions or concerns: open an issue at [https://github.com/l-agence/agence/issues](https://github.com/l-agence/agence/issues).
