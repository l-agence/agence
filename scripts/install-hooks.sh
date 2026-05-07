#!/usr/bin/env bash
set -euo pipefail

# Install a pre-push hook that enforces Agence guard checks.
#
# Usage:
#   bash scripts/install-hooks.sh [repo_path]
#   curl -fsSL <url>/scripts/install-hooks.sh | bash

REPO_ROOT="${1:-$(pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
GIT_DIR="$REPO_ROOT/.git"
HOOKS_DIR="$GIT_DIR/hooks"
HOOK_FILE="$HOOKS_DIR/pre-push"
BACKUP_FILE="$HOOKS_DIR/pre-push.agence.bak"

if [[ ! -d "$GIT_DIR" ]]; then
  echo "ERROR: $REPO_ROOT is not a git repository (.git missing)." >&2
  exit 1
fi

mkdir -p "$HOOKS_DIR"

if [[ -f "$HOOK_FILE" ]]; then
  cp "$HOOK_FILE" "$BACKUP_FILE"
  echo "Backed up existing pre-push hook to: $BACKUP_FILE"
fi

cat > "$HOOK_FILE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
remote_name="${1:-origin}"
remote_url="${2:-}"
cmd="git push ${remote_name}"
if [[ -n "$remote_url" ]]; then
  cmd+=" ${remote_url}"
fi

if command -v airun >/dev/null 2>&1; then
  checker=(airun guard check "$cmd")
elif [[ -x "$repo_root/.agence/bin/airun" ]]; then
  checker=("$repo_root/.agence/bin/airun" guard check "$cmd")
else
  echo "ERROR: airun not found (PATH or .agence/bin/airun)." >&2
  exit 1
fi

if ! out="$("${checker[@]}" 2>&1)"; then
  echo "$out" >&2
  echo "Push blocked by Agence guard." >&2
  exit 1
fi

if [[ "$out" == export* ]]; then
  eval "$out"
fi

if [[ "${_GUARD_APPROVED:-0}" != "1" ]]; then
  echo "Push blocked by Agence guard (${_GUARD_TIER:-unknown}: ${_GUARD_REASON:-no reason})." >&2
  exit 1
fi
EOF

chmod +x "$HOOK_FILE"
echo "Installed Agence pre-push hook at: $HOOK_FILE"
