#!/usr/bin/env bash
# lib/setup.sh — Environment setup, installation, reload, and repair primitives.
# Called as a chain from lib/init.sh:init_agence_environment().
# Sourced by bin/agence.
[[ -n "${_AGENCE_SETUP_LOADED:-}" ]] && return 0
_AGENCE_SETUP_LOADED=1

# ============================================================================
# INIT: Bootstrap the Agence environment (^init)
# ============================================================================
# Runs as a sequenced chain of smaller commands:
#   Step 1: verify root       → verify_agence_root
#   Step 2: create dirs       → create_required_dirs
#   Step 3: check .agencerc   → check_agencerc
#   Step 4: org + @ symlinks  → setup_org_symlinks  (prompts for org if missing)
#   Step 5: PATH + ^ alias    → setup_path_alias
#   Step 6: check deps        → check_dependencies
#   Step 7: shard/ledger repo → setup_upstream_repos
# ============================================================================

# ── Step 1: Verify agence root ────────────────────────────────────────────────
verify_agence_root() {
  if [[ -f "${AGENCE_ROOT}/bin/agence" ]]; then
    echo "  ✓ AGENCE_ROOT=${AGENCE_ROOT}"
    return 0
  else
    echo "  ✗ AGENCE_ROOT not set correctly (expected bin/agence inside it)" >&2
    return 1
  fi
}

# ── Step 2: Create required directories ──────────────────────────────────────
create_required_dirs() {
  local -a required_dirs=(
    "nexus"
    "nexus/.aisessions"
    "nexus/.airuns"
    "nexus/faults"
    "nexus/logs"
    "organic/tasks"
    "organic/workflows"
    "organic/jobs"
    "globalcache"
    "objectcode"
  )
  local created=0 warn=0
  for dir in "${required_dirs[@]}"; do
    if [[ -d "${AGENCE_ROOT}/$dir" ]]; then
      echo "  ✓ $dir/"
    else
      mkdir -p "${AGENCE_ROOT}/$dir" 2>/dev/null
      if [[ -d "${AGENCE_ROOT}/$dir" ]]; then
        echo "  + $dir/ (created)"
        ((created++))
      else
        echo "  ✗ $dir/ (failed to create)" >&2
        ((warn++))
      fi
    fi
  done
  return $warn
}

# ── Step 3: Check .agencerc ───────────────────────────────────────────────────
check_agencerc() {
  if [[ -n "${GIT_REPO:-}" && "${GIT_REPO}" != "$AGENCE_ROOT" ]]; then
    local rc_path="$GIT_REPO/.agencerc"
    if [[ -f "$rc_path" ]]; then
      echo "  ✓ $rc_path exists"
    else
      cat > "$rc_path" <<'AGENCERC'
# .agencerc — Agence environment configuration
# Source this from your .bashrc/.zshrc, or agence sources it automatically.

# Your org/team name (used to scope shared knowledge under synthetic/ and hermetic/).
# Set during ^init or override here:
# export AGENCE_ORG="your-org.example.com"

# Uncomment and set your preferred LLM provider:
# export AGENCE_LLM_PROVIDER="anthropic"
# export AGENCE_DEFAULT_AGENT="ralph"

# API keys (prefer env vars or a secrets manager over this file):
# export ANTHROPIC_API_KEY="sk-ant-..."
# export OPENAI_API_KEY="sk-..."
AGENCERC
      echo "  + Created $rc_path (edit to set API keys)"
    fi
  else
    if [[ -f "${AGENCE_ROOT}/.agencerc" ]]; then
      echo "  ✓ .agencerc exists (standalone mode)"
    else
      echo "  - .agencerc not found (standalone mode — optional)"
    fi
  fi
}

# ── Step 4: Org + @ symlinks ──────────────────────────────────────────────────
# Prompts for org name if not already set, then creates/validates @ symlinks.
# Sets AGENCE_ORG and persists it to .agencerc.
setup_org_symlinks() {
  echo "  The '@' symlink inside synthetic/ and hermetic/ points to the"
  echo "  active org directory (e.g. hermetic/@ → hermetic/acme.tld)."
  echo "  This lets commands resolve paths without hardcoding org names."
  echo ""

  # Resolve current org: env var > existing @ symlink > prompt
  local current_org="${AGENCE_ORG:-}"

  # If not in env, check existing synthetic/@ symlink
  if [[ -z "$current_org" ]] && [[ -L "${AGENCE_ROOT}/synthetic/@" ]]; then
    current_org="$(readlink "${AGENCE_ROOT}/synthetic/@" 2>/dev/null || true)"
    current_org="${current_org##*/}"  # basename in case it's a full path
  fi

  # Default fallback
  local _default_org="${current_org:-l-agence.org}"

  # Prompt (skip if already set in env or non-interactive)
  if [[ -z "$current_org" ]]; then
    local _prompted_org=""
    if read -r -p "  Org/team name [${_default_org}]: " _prompted_org </dev/tty 2>/dev/null; then
      current_org="${_prompted_org:-$_default_org}"
    else
      current_org="$_default_org"
    fi
  fi

  export AGENCE_ORG="$current_org"

  # Persist to .agencerc if not already there
  local _rc="${AGENCE_ROOT}/.agencerc"
  if [[ -f "$_rc" ]] && ! grep -q "^export AGENCE_ORG=" "$_rc" 2>/dev/null; then
    echo "" >> "$_rc"
    echo "export AGENCE_ORG=\"${current_org}\"" >> "$_rc"
    echo "  ✓ AGENCE_ORG=${current_org} persisted to .agencerc"
  fi

  # Create/validate @ symlinks in synthetic/ and hermetic/
  local warn=0
  local -a scope_dirs=("synthetic" "hermetic")
  for scope in "${scope_dirs[@]}"; do
    local scope_path="${AGENCE_ROOT}/$scope"
    local at_link="${scope_path}/@"
    local org_dir="${scope_path}/${current_org}"

    # Ensure the org directory exists
    mkdir -p "$org_dir" 2>/dev/null

    if [[ -L "$at_link" ]]; then
      local target
      target="$(readlink "$at_link" 2>/dev/null || echo "?")"
      echo "  ✓ $scope/@ → $target"
    elif [[ -d "$scope_path" ]]; then
      # Create @ → <org> symlink
      if ln -sfn "$current_org" "$at_link" 2>/dev/null; then
        echo "  + $scope/@ → $current_org (created)"
      else
        echo "  ⚠ failed to create $scope/@ → $current_org" >&2
        ((warn++))
      fi
    else
      echo "  - $scope/ not found (will be created when needed)"
    fi
  done
  return $warn
}

# ── Step 5: PATH + ^ shortcut ─────────────────────────────────────────────────
setup_path_alias() {
  local warn=0
  case ":${PATH}:" in
    *":${AI_BIN}:"*) ;;
    *) export PATH="${AI_BIN}:${PATH}" ;;
  esac

  if command -v agence &>/dev/null; then
    echo "  ✓ agence is on PATH ($(command -v agence))"
  else
    echo "  ⚠ agence is not on PATH in your current shell."
    echo "    To activate, run:"
    echo "      source ${AGENCE_ROOT}/bin/.agencerc"
    ((warn++))
  fi

  local caret_link="${AI_BIN}/^"
  if [[ -L "$caret_link" ]]; then
    echo "  ✓ ^ → agence symlink exists"
  else
    ln -s "agence" "$caret_link" 2>/dev/null && {
      echo "  + ^ → agence symlink created"
    } || {
      echo "  ⚠ failed to create ^ → agence symlink in ${AI_BIN}" >&2
      ((warn++))
    }
  fi
  return $warn
}

# ── Step 6: Check dependencies ────────────────────────────────────────────────
check_dependencies() {
  local warn=0
  local deps=(git bash tmux jq)
  local optional_deps=("script:session-logging" "bun:typescript-modules")
  for dep in "${deps[@]}"; do
    if command -v "$dep" &>/dev/null; then
      echo "  ✓ $dep"
    else
      echo "  ✗ $dep — required (sudo apt install $dep)"
      ((warn++))
    fi
  done
  for entry in "${optional_deps[@]}"; do
    local dep="${entry%%:*}" label="${entry##*:}"
    if command -v "$dep" &>/dev/null; then
      echo "  ✓ $dep ($label)"
    else
      echo "  - $dep not found ($label — optional)"
    fi
  done
  return $warn
}

# ── Step 7: Upstream shard & ledger repos ─────────────────────────────────────
setup_upstream_repos() {
  local warn=0
  local _current_remote=""
  _current_remote=$(git -C "${AGENCE_ROOT}" remote get-url origin 2>/dev/null || true)

  local _default_org=""
  if [[ "$_current_remote" =~ github\.com[:/]([^/]+)/ ]]; then
    _default_org="${BASH_REMATCH[1]}"
  fi
  local _default_shard="${_current_remote:-https://github.com/l-agence/agence.git}"
  local _default_ledger=""
  if [[ -n "$_default_org" ]]; then
    _default_ledger="https://github.com/${_default_org}/ailedger.git"
  else
    _default_ledger="https://github.com/l-agence/ailedger.git"
  fi

  echo "  Agence uses two upstream repos:"
  echo "    1. Shard repo  — the agence framework origin (this repo's remote)"
  echo "    2. Ledger repo — shared .ailedger for cross-shard audit trail"
  echo ""

  local _shard_repo=""
  if read -r -p "  Shard repo [${_default_shard}]: " _shard_repo </dev/tty 2>/dev/null; then
    _shard_repo="${_shard_repo:-$_default_shard}"
  else
    _shard_repo="$_default_shard"
  fi
  echo "  → shard: ${_shard_repo}"

  local _ledger_repo=""
  if read -r -p "  Ledger repo [${_default_ledger}]: " _ledger_repo </dev/tty 2>/dev/null; then
    _ledger_repo="${_ledger_repo:-$_default_ledger}"
  else
    _ledger_repo="$_default_ledger"
  fi
  echo "  → ledger: ${_ledger_repo}"
  echo ""

  export AI_SHARD="${_ledger_repo}"

  local _ailedger_ts="${AGENCE_ROOT}/lib/ailedger.ts"
  if command -v bun &>/dev/null && [[ -f "$_ailedger_ts" ]]; then
    echo "  Initializing .ailedger (two-tier Merkle ledger)..."
    bun run "$_ailedger_ts" init 2>&1
  else
    echo "  ⚠ bun not found — skipping .ailedger init"
    echo "    Run 'agence ^install' first, then 'agence ^init' again"
    ((warn++))
  fi
  return $warn
}

# ============================================================================
# INIT: Main entry point — chains steps in sequence
# ============================================================================
init_agence_environment() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Initializing Agence environment..." >&2

  echo ""
  echo "=============================================="
  echo "  AGENCE INIT (^init)"
  echo "=============================================="
  echo ""

  local warn=0

  echo "Step 1/7: Verifying agence root..."
  verify_agence_root || ((warn++))
  echo ""

  echo "Step 2/7: Creating directory structure..."
  create_required_dirs || ((warn++))
  echo ""

  echo "Step 3/7: Checking .agencerc..."
  check_agencerc
  echo ""

  echo "Step 4/7: Org context + @ symlink routing..."
  setup_org_symlinks || ((warn++))
  echo ""

  echo "Step 5/7: PATH + ^ shortcut..."
  setup_path_alias || ((warn++))
  echo ""

  echo "Step 6/7: Checking dependencies..."
  check_dependencies || ((warn++))
  echo ""

  echo "=============================================="
  if [[ $warn -eq 0 ]]; then
    echo "✓ Agence ready!"
  else
    echo "⚠ Agence ready with $warn warning(s) — see above"
  fi
  echo "  AGENCE_ROOT=${AGENCE_ROOT}"
  echo "  AGENCE_ORG=${AGENCE_ORG:-<not set>}"
  echo "  Run 'agence --help' to get started"
  echo "  Run 'agence ^install' to install AI tool dependencies"
  echo "=============================================="
  echo ""

  echo "Step 7/7: Upstream shard & ledger repos..."
  setup_upstream_repos || ((warn++))

  return 0
}

# ============================================================================
# RELOAD: Re-read codex context files
# ============================================================================
reload_agence_context() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Reloading Agence context..." >&2

  local AGENCE_GITHUB="$AGENCE_ROOT/.github"
  local context_files=(
    "$AGENCE_GITHUB/CLAUDE.md:Claude Integration"
    "${GIT_REPO:-$AGENCE_ROOT}/.github/copilot-instructions.md:Copilot Instructions"
    "$AGENCE_ROOT/codex/PRINCIPLES.md:Principles (Maxims)"
    "$AGENCE_ROOT/codex/LAWS.md:Laws (Hard Constraints)"
    "$AGENCE_ROOT/codex/RULES.md:Rules (Best Practices)"
    "$AGENCE_BIN/COMMANDS.md:Commands Reference"
    "$AGENCE_ROOT/nexus/faults/INDEX.md:Faults Index"
    "$AGENCE_ROOT/shared/lessons/INDEX.md:Lessons Learned"
  )

  echo "[RELOAD] Agence Context Loading"
  echo "=========================================="
  echo ""

  local loaded_count=0
  local failed_files=""

  for file_info in "${context_files[@]}"; do
    local file="${file_info%%:*}"
    local label="${file_info##*:}"

    if [[ -f "$file" ]]; then
      local size; size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "?")
      local lines; lines=$(wc -l < "$file" 2>/dev/null || echo "?")
      printf "✓ %-35s | %6s bytes | %4s lines\n" "$label" "$size" "$lines"
      ((loaded_count++))
    else
      printf "✗ %-35s | [NOT FOUND]\n" "$label"
      failed_files="$failed_files\n  - $file"
    fi
  done

  echo ""
  echo "=========================================="
  echo ""
  echo "Context Summary:"
  echo "  Total files loaded: $loaded_count / ${#context_files[@]}"

  if [[ -n "$failed_files" ]]; then
    echo ""
    echo "⚠ Missing files:$failed_files"
  fi

  local principles_count; principles_count=$(grep -c "^## Maxim" "$AGENCE_ROOT/codex/PRINCIPLES.md" 2>/dev/null || echo 0)
  local laws_count; laws_count=$(grep -c "^## Law" "$AGENCE_ROOT/codex/LAWS.md" 2>/dev/null || echo 0)
  local rules_count; rules_count=$(grep -c "^## Rule" "$AGENCE_ROOT/codex/RULES.md" 2>/dev/null || echo 0)

  echo ""
  echo "Active Knowledge:"
  echo "  Principles/Maxims: $principles_count"
  echo "  Laws (Constraints): $laws_count"
  echo "  Rules (Practices): $rules_count"
  echo ""
  echo "Status: ✓ Agence context fully loaded and acknowledged"
  echo ""
  return 0
}

# ============================================================================
# INSTALL: Package manager integration (^install)
# ============================================================================
install_agence_packages() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Installing Agence packages..." >&2

  echo ""
  echo "=============================================="
  echo "  AGENCE PACKAGE INSTALLATION (^install)"
  echo "=============================================="
  echo ""

  local os_type="unknown"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* ]]; then
    os_type="windows"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    os_type="macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    os_type="linux"
  fi

  echo "Detected OS: $os_type"
  echo ""

  case "$os_type" in
    windows) install_windows_packages ;;
    macos)   install_macos_packages ;;
    linux)   install_linux_packages ;;
    *)
      echo "[ERROR] Unsupported OS: $OSTYPE" >&2
      return 1
      ;;
  esac
  return $?
}

install_windows_packages() {
  echo "Installing AI tools via winget..."
  echo ""
  echo "  Core (required):"
  local -a winget_required=("GitHub.cli" "jqlang.jq" "GnuWin32.Gawk" "Anthropic.ClaudeCode" "GitHub.Copilot" "Microsoft.AIShell")
  for pkg in "${winget_required[@]}"; do
    echo -n "  [$pkg] "
    if winget list --id "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"
    elif winget install -e --id "$pkg" --accept-package-agreements --accept-source-agreements &>/dev/null 2>&1; then
      echo "✓ installed"
    else
      echo "✗ failed (try manually: winget install $pkg)"
    fi
  done
  echo ""
  echo "  Core (script installer):"
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif powershell -c 'irm bun.sh/install.ps1 | iex' &>/dev/null 2>&1; then
    echo "✓ installed (via PowerShell)"
  elif winget install -e --id Oven-sh.Bun --accept-package-agreements --accept-source-agreements &>/dev/null 2>&1; then
    echo "✓ installed (via winget fallback)"
  else
    echo "✗ failed (try: powershell -c \"irm bun.sh/install.ps1 | iex\")"
  fi
  echo ""
  echo "  Optional (Python):"
  if command -v pip &>/dev/null || command -v pip3 &>/dev/null; then
    local pip_cmd="pip"; command -v pip3 &>/dev/null && pip_cmd="pip3"
    echo -n "  [aider] "
    if command -v aider &>/dev/null; then echo "✓ already installed"
    elif $pip_cmd install aider-chat &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: pip install aider-chat)"; fi
  else
    echo "  - pip not found — install Python to get aider"
  fi
}

install_macos_packages() {
  echo "Installing AI tools via Homebrew..."
  echo ""
  if ! command -v brew &>/dev/null; then
    echo "  ✗ Homebrew not found. Install from: https://brew.sh" >&2
    return 1
  fi
  local -a brew_pkgs=("gh" "jq" "tmux" "socat")
  echo "  Core (required):"
  for pkg in "${brew_pkgs[@]}"; do
    echo -n "  [$pkg] "
    if brew list "$pkg" &>/dev/null 2>&1; then echo "✓ already installed"
    elif brew install "$pkg" &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed"; fi
  done
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif brew tap oven-sh/bun &>/dev/null 2>&1 && brew install bun &>/dev/null 2>&1; then
    echo "✓ installed"
  elif curl -fsSL https://bun.sh/install | bash &>/dev/null 2>&1; then
    echo "✓ installed (via bun.sh)"
  else
    echo "✗ failed (try: curl -fsSL https://bun.sh/install | bash)"
  fi
  echo ""
  echo "  Optional (npm):"
  if command -v npm &>/dev/null; then
    echo -n "  [claude] "
    if command -v claude &>/dev/null; then echo "✓ already installed"
    elif npm install -g @anthropic-ai/claude-code &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: npm install -g @anthropic-ai/claude-code)"; fi
  else
    echo "  - npm not found — install Node.js to get claude CLI"
  fi
  echo ""
  echo "  Optional (pip):"
  if command -v pip3 &>/dev/null; then
    echo -n "  [aider] "
    if command -v aider &>/dev/null; then echo "✓ already installed"
    elif pip3 install aider-chat &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: pip3 install aider-chat)"; fi
  fi
  echo ""
  echo "  GitHub Copilot CLI: https://github.com/github/copilot-cli"
  echo "    curl -fsSL https://gh.io/copilot-install | bash"
}

install_linux_packages() {
  echo "Installing AI tools (Linux/WSL)..."
  echo ""
  echo "  Updating package lists..."
  if sudo apt-get update -qq &>/dev/null 2>&1; then
    echo "  ✓ apt-get update completed"
  else
    echo "  ⚠ apt-get update failed (continuing anyway)" >&2
  fi
  echo ""
  local -a apt_pkgs=("git" "jq" "gawk" "tmux" "socat" "util-linux" "gh" "npm" "curl" "unzip" "wslu")
  local pkg_ok=0 pkg_fail=0
  echo "  System (apt):"
  for pkg in "${apt_pkgs[@]}"; do
    echo -n "  [$pkg] "
    if command -v "$pkg" &>/dev/null || dpkg -l "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"; ((pkg_ok++))
    elif sudo apt-get install -y "$pkg" &>/dev/null 2>&1; then
      echo "✓ installed"; ((pkg_ok++))
    else
      echo "✗ failed (try: sudo apt-get install $pkg)"; ((pkg_fail++))
    fi
  done
  echo ""
  echo "  Core (script installer):"
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif command -v npm &>/dev/null && npm install -g bun &>/dev/null 2>&1; then
    echo "✓ installed (via npm)"
  elif command -v snap &>/dev/null && sudo snap install bun-js &>/dev/null 2>&1; then
    echo "✓ installed (via snap)"
  elif curl -fsSL https://bun.sh/install | bash &>/dev/null 2>&1; then
    echo "✓ installed (via bun.sh)"
  else
    echo "✗ failed (try: npm install -g bun)"
  fi
  echo ""
  echo "  Optional (npm — Claude Code CLI):"
  if command -v npm &>/dev/null; then
    echo -n "  [claude] "
    if command -v claude &>/dev/null; then echo "✓ already installed"
    elif sudo npm install -g @anthropic-ai/claude-code &>/dev/null 2>&1; then echo "✓ installed"
    else echo "✗ failed (try: sudo npm install -g @anthropic-ai/claude-code)"; fi
  else
    echo "  - npm not found (install node: sudo apt-get install nodejs)"
  fi
  echo ""
  echo "  Optional (GitHub Copilot CLI):"
  if command -v copilot &>/dev/null; then
    echo "  [copilot] ✓ already installed ($(command -v copilot))"
  else
    echo "  [copilot] not installed"
    echo "    Install: curl -fsSL https://gh.io/copilot-install | bash"
  fi
  echo ""
  echo "  Optional (aider):"
  if command -v aider &>/dev/null; then
    echo "  [aider] ✓ already installed"
  else
    echo "  [aider] not installed"
    echo "    Install: pip install aider-chat"
  fi
}

# ============================================================================
# REPAIR: Recreate broken git-tracked symlinks
# ============================================================================
repair_agence_symlinks() {
  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Checking for broken symlinks..." >&2

  local symlinks
  symlinks=$(git -C "$AGENCE_ROOT" ls-files -s 2>/dev/null | grep "^120000" | awk '{print $NF}')

  if [[ -z "$symlinks" ]]; then
    [[ "$DEBUG" == "1" ]] && echo "[DEBUG] No symlinks tracked in git" >&2
    return 0
  fi

  local count=0
  while IFS= read -r filepath; do
    [[ -z "$filepath" ]] && continue
    if [[ -L "$AGENCE_ROOT/$filepath" ]]; then
      continue
    fi
    if [[ ! -e "$AGENCE_ROOT/$filepath" ]]; then
      local target
      target=$(git -C "$AGENCE_ROOT" ls-files -s 2>/dev/null | grep "^120000.*$filepath" | awk '{for(i=1;i<=NF;i++) printf "%s ", $i}' | sed 's/.*\s//')
      if [[ -n "$target" ]]; then
        mkdir -p "$(dirname "$AGENCE_ROOT/$filepath")" 2>/dev/null
        ln -sf "$target" "$AGENCE_ROOT/$filepath" 2>/dev/null
        if [[ $? -eq 0 ]]; then
          echo "[REPAIR] Created symlink: $filepath -> $target"
          ((count++))
        fi
      fi
    fi
  done <<< "$symlinks"

  [[ $count -gt 0 ]] && echo "" && echo "✓ Repaired $count broken symlink(s)"
  return 0
}

create_windows_symlink() {
  local source="$1"
  local target="$2"
  local link_type="file"
  [[ -d "$source" ]] && link_type="dir"

  [[ "$DEBUG" == "1" ]] && echo "[DEBUG] Creating symlink: $target → $source ($link_type)" >&2

  if [[ "${AGENCE_OS_WINDOWS:-0}" == "1" ]]; then
    if [[ "$link_type" == "dir" ]]; then
      cmd /c mklink /D "$(cygpath -w "$target")" "$(cygpath -w "$source")" 2>/dev/null
    else
      cmd /c mklink /H "$(cygpath -w "$target")" "$(cygpath -w "$source")" 2>/dev/null || \
      cmd /c mklink "$(cygpath -w "$target")" "$(cygpath -w "$source")" 2>/dev/null
    fi
    if [[ $? -eq 0 ]]; then
      return 0
    fi
    powershell -Command "New-Item -ItemType SymbolicLink -Path '$(cygpath -w "$target")' -Target '$(cygpath -w "$source")' -Force" 2>/dev/null
    return $?
  else
    ln -s "$source" "$target" 2>/dev/null
    return $?
  fi
}
