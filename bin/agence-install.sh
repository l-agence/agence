#!/usr/bin/env bash

# agence-install.sh: Cross-platform package installer for Agence dependencies
# Restores and updates ^install logic from git history
# Installs required packages for Windows (winget), macOS (brew), Linux (apt/yum/dnf)
# Does not exit on failure for any package; prints summary at end


set -euo pipefail

WINDOWS_PKGS=(GitHub.cli jqlang.jq Oven-sh.Bun MSYS2.MSYS2 HashiCorp.Terraform JFrog.jfrog-cli tflint awscli azure-cli)
MAC_PKGS=(gh jq bun terraform jfrog-cli tflint awscli azure-cli)
LINUX_PKGS=(gh jq terraform jfrog-cli tflint awscli azure-cli)

prompt_install() {
  local pkg="$1"
  read -p "Install $pkg? [y/N]: " yn
  case $yn in
    [Yy]*) return 0 ;;
    *) return 1 ;;
  esac
}

install_windows_packages() {
  echo "Installing packages via winget..."
  local installed=0
  for pkg in "${WINDOWS_PKGS[@]}"; do
    if winget list --id "$pkg" &>/dev/null; then
      echo "✓ $pkg (already installed)"
    elif prompt_install "$pkg"; then
      if winget install -e --id "$pkg" --accept-package-agreements --accept-source-agreements &>/dev/null; then
        echo "✓ $pkg (installed)"
        ((installed++))
      else
        echo "✗ $pkg (failed to install)"
      fi
    else
      echo "Skipped $pkg"
    fi
  done
  echo "Installation summary: $installed/${#WINDOWS_PKGS[@]} installed"
}

install_macos_packages() {
  echo "Installing packages via Homebrew..."
  local installed=0
  if ! command -v brew &>/dev/null; then
    echo "[ERROR] Homebrew not found. Install from: https://brew.sh"
    return 1
  fi
  for pkg in "${MAC_PKGS[@]}"; do
    if brew list "$pkg" &>/dev/null; then
      echo "✓ $pkg (already installed)"
    elif prompt_install "$pkg"; then
      if brew install "$pkg" &>/dev/null; then
        echo "✓ $pkg (installed)"
        ((installed++))
      else
        echo "✗ $pkg (failed to install)"
      fi
    else
      echo "Skipped $pkg"
    fi
  done
  echo "Installation summary: $installed/${#MAC_PKGS[@]} installed"
}

install_linux_packages() {
  echo "Installing packages via system package manager..."
  local installed=0
  local pkg_manager=""
  if command -v apt &>/dev/null; then
    pkg_manager="apt"
  elif command -v dnf &>/dev/null; then
    pkg_manager="dnf"
  elif command -v yum &>/dev/null; then
    pkg_manager="yum"
  else
    echo "[ERROR] No supported package manager found (apt, dnf, yum)"
    return 1
  fi
  for pkg in "${LINUX_PKGS[@]}"; do
    if dpkg -l | grep -qw "$pkg" || rpm -q "$pkg" &>/dev/null; then
      echo "✓ $pkg (already installed)"
    elif prompt_install "$pkg"; then
      if sudo $pkg_manager install -y "$pkg" &>/dev/null; then
        echo "✓ $pkg (installed)"
        ((installed++))
      else
        echo "✗ $pkg (failed to install)"
      fi
    else
      echo "Skipped $pkg"
    fi
  done
  # bun — not in apt/dnf/yum; use official installer
  echo -n "[bun] "
  if command -v bun &>/dev/null; then
    echo "✓ already installed ($(bun --version 2>/dev/null))"
  elif prompt_install "bun (TypeScript runtime)"; then
    if curl -fsSL https://bun.sh/install | bash &>/dev/null 2>&1; then
      echo "✓ bun (installed)"
      ((installed++))
    else
      echo "✗ bun (failed — try: curl -fsSL https://bun.sh/install | bash)"
    fi
  else
    echo "Skipped"
  fi
  echo "Installation summary: $installed/$((${#LINUX_PKGS[@]} + 1)) installed"
}

main() {
  case "$(uname -s)" in
    Linux)
      install_linux_packages
      ;;
    Darwin)
      install_macos_packages
      ;;
    MINGW*|MSYS*|CYGWIN*)
      install_windows_packages
      ;;
    *)
      echo "[ERROR] Unsupported OS: $(uname -s)"
      ;;
  esac
}

main "$@"
