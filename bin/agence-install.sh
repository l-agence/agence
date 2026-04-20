#!/usr/bin/env bash

# agence-install.sh: Cross-platform package installer for Agence dependencies
# Installs minimum core packages on both Windows (winget) and WSL-bash (apt)
# When run from Git Bash / MSYS on Windows, installs BOTH winget + WSL packages
# When run from WSL/Linux, installs apt packages only

set -euo pipefail

# Source env.sh if available (sets AGENCE_ROOT, AI_BIN, etc.)
_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_env_sh="$(cd "$_script_dir/.." && pwd)/lib/env.sh"
if [[ -f "$_env_sh" ]]; then
  source "$_env_sh"
fi

# ============================================================================
# Package lists
# ============================================================================

# Windows (winget IDs) — core + existing packages
WINGET_CORE=(
  "jqlang.jq"
  "GitHub.cli"
  "GitHub.Copilot"
  "GnuWin32.Gawk"
  "Oven-sh.Bun"
  "MSYS2.MSYS2"
  "HashiCorp.Terraform"
  "JFrog.jfrog-cli"
  "tflint"
  "Amazon.AWSCLI"
  "Microsoft.AzureCLI"
)

# macOS (brew) — core + existing packages
BREW_CORE=(
  "gh"
  "jq"
  "gawk"
  "tmux"
  "npm"
  "bun"
  "macfuse"
  "terraform"
  "jfrog-cli"
  "tflint"
  "awscli"
  "azure-cli"
)

# WSL / Linux (apt package names) — core + existing packages
APT_CORE=(
  "jq"
  "gh"
  "gawk"
  "tmux"
  "npm"
  "curl"
  "unzip"
  "fuse3"
  "fuse-overlayfs"
  "wslu"
  "terraform"
  "jfrog-cli"
  "tflint"
  "awscli"
  "azure-cli.agence/lib"
)

# ============================================================================
# Helpers
# ============================================================================

info()  { echo "  $*"; }
ok()    { echo "  ✓ $*"; }
fail()  { echo "  ✗ $*" >&2; }
warn()  { echo "  ⚠ $*"; }

# ============================================================================
# Windows (winget) installer
# ============================================================================

install_winget_packages() {
  echo ""
  echo "── Windows packages (winget) ──────────────────"
  echo ""

  if ! command -v winget.exe &>/dev/null && ! command -v winget &>/dev/null; then
    fail "winget not found — skip Windows packages"
    return 1
  fi

  local winget_cmd="winget"
  command -v winget.exe &>/dev/null && winget_cmd="winget.exe"

  local installed=0 skipped=0 failed=0

  for pkg in "${WINGET_CORE[@]}"; do
    echo -n "  [$pkg] "
    if $winget_cmd list --id "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"; ((skipped++))
    elif $winget_cmd install -e --id "$pkg" --accept-package-agreements --accept-source-agreements &>/dev/null 2>&1; then
      echo "✓ installed"; ((installed++))
    else
      echo "✗ failed"; ((failed++))
    fi
  done

  # bun — use PowerShell installer on Windows
  echo -n "  [bun] "
  if command -v bun &>/dev/null || command -v bun.exe &>/dev/null; then
    echo "✓ already installed"
  elif powershell.exe -c 'irm bun.sh/install.ps1 | iex' &>/dev/null 2>&1; then
    echo "✓ installed (PowerShell)"
  elif $winget_cmd install -e --id Oven-sh.Bun --accept-package-agreements --accept-source-agreements &>/dev/null 2>&1; then
    echo "✓ installed (winget fallback)"
  else
    echo "✗ failed (try: powershell -c \"irm bun.sh/install.ps1 | iex\")"
  fi

  echo ""
  echo "  Summary: $installed installed, $skipped already present, $failed failed"
}

# ============================================================================
# WSL / Linux (apt) installer
# ============================================================================

install_apt_packages() {
  echo ""
  echo "── WSL/Linux packages (apt) ───────────────────"
  echo ""

  local sudo_cmd="sudo"
  # If already root, don't use sudo
  [[ "$(id -u)" == "0" ]] && sudo_cmd=""

  # apt update first
  info "Updating package lists..."
  if $sudo_cmd apt-get update -qq &>/dev/null 2>&1; then
    ok "apt-get update completed"
  else
    warn "apt-get update failed (continuing anyway)"
  fi
  echo ""

  local installed=0 skipped=0 failed=0

  for pkg in "${APT_CORE[@]}"; do
    echo -n "  [$pkg] "
    if command -v "$pkg" &>/dev/null || dpkg -l "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"; ((skipped++))
    elif $sudo_cmd apt-get install -y "$pkg" &>/dev/null 2>&1; then
      echo "✓ installed"; ((installed++))
    else
      echo "✗ failed (try: sudo apt-get install $pkg)"; ((failed++))
    fi
  done

  # tmux — check separately since it may not be in command -v path
  # (already in APT_CORE above)

  # bun — use curl installer on Linux/WSL
  echo -n "  [bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif curl -fsSL https://bun.sh/install | bash &>/dev/null 2>&1; then
    echo "✓ installed"; ((installed++))
  else
    echo "✗ failed (try: curl -fsSL https://bun.sh/install | bash)"; ((failed++))
  fi

  echo ""
  echo "  Summary: $installed installed, $skipped already present, $failed failed"
}

# ============================================================================
# macOS (brew) installer
# ============================================================================

install_macos_packages() {
  echo ""
  echo "── macOS packages (Homebrew) ──────────────────"
  echo ""

  if ! command -v brew &>/dev/null; then
    fail "Homebrew not found — install from: https://brew.sh"
    return 1
  fi

  local installed=0 skipped=0 failed=0

  for pkg in "${BREW_CORE[@]}"; do
    echo -n "  [$pkg] "
    if brew list "$pkg" &>/dev/null 2>&1; then
      echo "✓ already installed"; ((skipped++))
    elif brew install "$pkg" &>/dev/null 2>&1; then
      echo "✓ installed"; ((installed++))
    else
      echo "✗ failed"; ((failed++))
    fi
  done

  echo ""
  echo "  Summary: $installed installed, $skipped already present, $failed failed"
}

# ============================================================================
# Platform detection and main
# ============================================================================

detect_platform() {
  if [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"
  elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin"* ]]; then
    echo "windows"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "linux"
  else
    echo "unknown"
  fi
}

main() {
  local platform
  platform="$(detect_platform)"

  echo "=============================================="
  echo "  AGENCE INSTALL"
  echo "=============================================="
  echo "  Platform: $platform"
  echo "  AGENCE_ROOT: ${AGENCE_ROOT:-<not set>}"
  echo "=============================================="

  case "$platform" in
    wsl)
      # WSL: install BOTH Windows (winget) and Linux (apt) packages
      install_winget_packages
      install_apt_packages
      ;;
    windows)
      # Git Bash / MSYS / Cygwin: install Windows packages
      # Also try to install WSL packages if wsl.exe is available
      install_winget_packages
      if command -v wsl.exe &>/dev/null; then
        echo ""
        echo "── Also installing in WSL ────────────────────"
        wsl.exe bash -c "$(cat "$_script_dir/agence-install.sh")" 2>/dev/null || \
          warn "WSL package install skipped (WSL not available or failed)"
      fi
      ;;
    linux)
      install_apt_packages
      ;;
    macos)
      install_macos_packages
      ;;
    *)
      fail "Unsupported platform: $platform ($OSTYPE)"
      exit 1
      ;;
  esac

  echo ""
  echo "=============================================="
  echo "  Done. Run 'agence ^init' to verify setup."
  echo "=============================================="
}

main "$@"
