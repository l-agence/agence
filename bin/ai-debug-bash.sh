

#!/usr/bin/env bash
# ai-debug-bash.sh: Debug wrapper for bash launch and session capture
# Usage: ./ai-debug-bash.sh [profile]

set -euxo pipefail

PROFILE="${1:-$HOME/.bashrc}"
SESSION_DIR="$(cd "$(dirname "$0")/../nexus/.aisessions" && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
SESSION_LOG="$SESSION_DIR/debug_bash_${STAMP}.log"
touch "$SESSION_LOG"
chmod 600 "$SESSION_LOG"

{
	echo "[DEBUG] Launching: env /bin/bash +x --rcfile $PROFILE -c 'uptime' 2>&1"
	echo "[DEBUG] Current directory: $PWD"
	echo "[DEBUG] Environment variables:"
	env | sort
	echo "[DEBUG] --- Bash output follows ---"
	env /bin/bash -x --rcfile "$PROFILE" -c 'uptime' 2>&1
	echo "[DEBUG] --- End Bash output ---"
	echo "[DEBUG] Done. Output captured in $SESSION_LOG"
} | tee "$SESSION_LOG"
