# Faults Dashboard

> **Source**: `nexus/faults/INDEX.md` + individual fault records

---

## Incident History

| Fault ID | Date | Category | Severity | Status | Description |
|----------|------|----------|----------|--------|-------------|
| 2026-03-06-git-clean | 2026-03-06 | development-error | high | resolved | `git clean -fdx` deleted critical files (lib/format.sh, CLAUDE.md, .aisecrets/) |
| f9e7c3d2 | 2026-03-05 | catastrophic | critical | open | Path validation escape — agent claimed symlink success from truncated output |

## Summary

| Metric | Value |
|--------|-------|
| Total faults | 2 |
| Critical | 1 |
| High | 1 |
| Resolved | 1 |
| Open | 1 |

## By Category

| Category | Count | Worst Severity |
|----------|-------|----------------|
| development-error | 1 | high |
| catastrophic | 1 | critical |

---

## Fault Detail

### f9e7c3d2 — Path Validation Escape (CRITICAL, OPEN)

**Root cause**: Agent misread truncated VSCode output (16KB limit) and fabricated symlink creation success. No filesystem verification performed.

**Violated**: LAW 2 (Honesty) — "Never claim success without PROOF"

**Prevention**: Always verify filesystem state with `ls`/`test -e` after mutations. Never trust truncated output.

### 2026-03-06-git-clean — File Deletion (HIGH, RESOLVED)

**Root cause**: `git clean -fdx` executed without dry-run (`-n` flag). Deleted unstaged development files.

**Prevention**: Always `git clean -fdn` (dry run) first. Stage important files immediately after creation.

---

## Report a Fault

```bash
airun fault add "Description of what went wrong"
# or manually: create .md file in nexus/faults/
```

**Fault severity levels**: `critical` | `high` | `medium` | `low`

---

*Source: [nexus/faults/INDEX.md](../../../nexus/faults/INDEX.md) | See also: [lessons/](../../lessons/)*
