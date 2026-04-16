#!/usr/bin/env bash
# agence-start.sh: Combines multiple commands for session initialization

set -euxo pipefail

# Add bin directory and AI_BIN to PATH
export PATH="$(cd "$(dirname "$0")" && pwd):$AI_BIN:$PATH"

# Run agence commands in sequence
agence ^init
agence session init
agence ^sync
agence ^reload

echo "[agence-start] All commands executed successfully."