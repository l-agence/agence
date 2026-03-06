#!/usr/bin/env bash

################################################################################
# gitignore-merge.sh: Intelligently merge .gitignore patterns
#
# Merges patterns from source .gitignore into target, avoiding duplicates
# and preserving user-added lines.
#
# Usage: gitignore-merge.sh <source_file> <target_file>
# Example: gitignore-merge.sh .github/.gitignore .gitignore
#
# Author: Stephane Korning 2026
# License: MIT License with Commons Clause
################################################################################

set -euo pipefail

# ============================================================================
# FUNCTIONS
# ============================================================================

merge_gitignore() {
    local source_file="$1"
    local target_file="$2"
    
    # Validate source exists
    if [[ ! -f "$source_file" ]]; then
        echo "[GITIGNORE] ✗ Source not found: $source_file" >&2
        return 1
    fi
    
    # Create target if it doesn't exist
    if [[ ! -f "$target_file" ]]; then
        echo "[GITIGNORE] ✓ Creating target: $target_file" >&2
        touch "$target_file"
    fi
    
    # Extract patterns from source (skip comments and empty lines)
    local -a source_patterns
    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^#.* ]] && continue
        source_patterns+=("$line")
    done < "$source_file"
    
    # For each source pattern, check if it's already in target
    local merged_count=0
    for pattern in "${source_patterns[@]}"; do
        # Check if pattern (or similar) already exists in target
        if ! grep -qF "$pattern" "$target_file" 2>/dev/null; then
            # Not found, append it
            echo "$pattern" >> "$target_file"
            merged_count=$((merged_count + 1))
            echo "[GITIGNORE] + Added: $pattern" >&2
        else
            echo "[GITIGNORE] ✓ Already present: $pattern" >&2
        fi
    done
    
    echo "[GITIGNORE] ✓ Merged $merged_count new patterns into $target_file" >&2
    return 0
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    local source="${1:-}"
    local target="${2:-.gitignore}"
    
    if [[ -z "$source" ]]; then
        cat >&2 <<'EOF'
gitignore-merge: Intelligently merge .gitignore patterns

Usage: gitignore-merge.sh <source_file> [target_file]

Examples:
  gitignore-merge.sh .github/.gitignore .gitignore
  gitignore-merge.sh template.gitignore .gitignore

This script:
  1. Reads patterns from source_file
  2. Appends any patterns NOT already in target_file
  3. Avoids duplicates (grep -F)
  4. Preserves user-added lines in target

EOF
        return 1
    fi
    
    merge_gitignore "$source" "$target"
}

main "$@"
