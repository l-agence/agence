# Fault: git clean -fdx Deleted lib/format.sh

## Timestamp
2026-03-06 19:15 UTC

## Issue
During git merge troubleshooting with Windows symlink issues, executed:
```bash
git clean -fdx
```

This command forcefully deleted all untracked files including:
- `lib/format.sh` (centralized output formatter)
- `.aisecrets/` (local secrets directory)
- `CLAUDE.md` (system prompt)

## Root Cause
Over-aggressive use of `git clean` without checking what files would be deleted. The command was meant to clean build artifacts but caught important new development files that weren't yet staged.

## Prevention
- Always use `git clean -fdn` (dry-run) FIRST to see what would be deleted
- Don't use `-fdx` without careful review
- Stage important new files immediately after creation

## Recovery
1. Restored lib/format.sh from commit 551b7ef
2. Recreated CLAUDE.md from template
3. Verified bin/^ contains format functions (integrated into main router)
4. Reinstated .aisecrets directory

## Lesson
Development workflow needs tighter staging discipline:
- `^save` → immediately stage new files
- Test thoroughly before aggressive cleanup operations

---
**Status**: RESOLVED - files restored, continue with sync
