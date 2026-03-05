#!/bin/bash
# ============================================================================
# test-symlinks.sh - Test symlink creation outside VSCode terminal
# ============================================================================
# Run from bash: bash tests/unit/test-symlinks.sh
# This tests whether symlinks can be created when running bash directly

echo "=============================================="
echo "  AGENCE SYMLINK TEST"
echo "=============================================="
echo ""

# Detect AGENCE_ROOT from script location
# Script is in tests/unit/, so go up 3 levels to reach .agence/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TESTS_DIR="$(dirname "$SCRIPT_DIR")"
AGENCE_ROOT="$(dirname "$TESTS_DIR")"

# Load the agence profile
echo "[TEST] Loading .agencerc profile..."
source "$AGENCE_ROOT/.agencerc" 2>&1 | head -5

echo ""
echo "[INFO] Shell detected: $CURRENT_SHELL"
echo "[INFO] AGENCE_ROOT: $AGENCE_ROOT"
echo "[INFO] REPO_ROOT: $REPO_ROOT"
echo ""

# Test 1: Check if symlinks are tracked in git
echo "=============================================="
echo "TEST 1: Symlinks tracked in git"
echo "=============================================="
cd "$AGENCE_ROOT"
git ls-files -s 2>/dev/null | grep "^120000" | while read mode hash stage path; do
    target=$(git show "$mode:$path" 2>/dev/null)
    echo "  ✓ $path -> $target"
done
echo ""

# Test 2: Try mklink function (from shell-specific profile)
echo "=============================================="
echo "TEST 2: Test mklink function"
echo "=============================================="

if declare -f mklink > /dev/null; then
    echo "[OK] mklink function is available"
    
    # Try creating a test symlink in /tmp
    echo ""
    echo "Attempting test symlink creation..."
    cd /tmp
    TEST_TARGET="$AGENCE_ROOT/codex/.gitkeep"
    mklink test-agence-link.txt "$TEST_TARGET"
    
    if [[ -L test-agence-link.txt ]]; then
        echo "✓ SUCCESS: Created symlink in /tmp"
        ls -la test-agence-link.txt
        rm test-agence-link.txt
    else
        echo "✗ FAILED: Could not create symlink"
        if [[ -f test-agence-link.txt ]]; then
            echo "  (File created but not as symlink)"
            rm test-agence-link.txt
        fi
    fi
else
    echo "[WARN] mklink function not available in this shell"
fi
echo ""

# Test 3: Try git checkout on symlinks
echo "=============================================="
echo "TEST 3: Try restoring symlinks via git"
echo "=============================================="
cd "$AGENCE_ROOT"
echo "Attempting: git checkout a34da47 -- .github/copilot-instructions.md"
git checkout a34da47 -- .github/copilot-instructions.md 2>&1

if [[ -L .github/copilot-instructions.md ]]; then
    echo "✓ SUCCESS: Symlink restored by git"
    ls -la .github/copilot-instructions.md
else
    echo "✗ FAILED: Git could not restore as symlink"
    if [[ -f .github/copilot-instructions.md ]]; then
        echo "  (File created but not as symlink)"
        echo "  File type:"
        file .github/copilot-instructions.md
    else
        echo "  (File does not exist)"
    fi
fi

echo ""
echo "=============================================="
echo "  TEST COMPLETE"
echo "=============================================="
