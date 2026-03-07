# Git-Bash Symlink Solutions

## Problem Summary
Windows git-bash cannot create NTFS symlinks due to `SeCreateSymbolicLinkPrivilege` permission requirement and UAC elevation. Even when set to admin, UAC still blocks it in git-bash (until Windows 10 1703+ with Developer Mode enabled).

## Official Solutions (from Git for Windows)

### Solution 1: Enable Developer Mode (Windows 10 1703+)
**Status:** ✅ Recommended for Windows 10+ users  
**Requirements:** Windows 10 version 1703 (Creators Update) or later  
**Steps:**
1. Open Settings > Update & Security > For developers
2. Toggle "Developer Mode" to ON
3. This disables the UAC restriction specifically for symlinks
4. No admin elevation needed after

### Solution 2: Grant SeCreateSymbolicLinkPrivilege via Local Policy
**Status:** ✅ Works but requires policy changes  
**Requirements:** Windows Pro/Enterprise (not Home Edition)  
**Tools:**
- `gpedit.msc` (Local Group Policy Editor)
- `secpol.msc` (Local Security Policy)
- `Polsedit` (freeware, works on Home Edition)

**Steps:**
1. Open gpedit.msc or secpol.msc
2. Navigate to: Local Policies > User Rights Assignment
3. Find "Create symbolic links" policy
4. Add your user account to the list
5. Restart or re-login for changes to take effect

### Solution 3: Use Directory Junctions Instead of Symlinks
**Status:** ✅ Works for non-admins by default  
**Requirements:** None (built into Windows)  
**Command:**
```bash
mklink /j link_name target_directory  # /j = junction (not symlink)
```
**Trade-off:** Junctions only work for directories, not files

### Solution 4: Use mklink Command Directly in Git Bash
**Status:** ✅ Works if SeCreateSymbolicLinkPrivilege is granted  
**Command:**
```bash
mklink target_path link_path              # File symlink
mklink /d target_path link_path           # Directory symlink
```
**Note:** Still requires UAC elevation unless Developer Mode is enabled

### Solution 5: Uninstall Git with "Enable symbolic links" Option
**Status:** ⚠️ Workaround only  
**Details:** If git-bash was installed WITH "Enable symbolic links" option checked, reinstalling WITH IT UNCHECKED may help git not attempt symlink creation

### Solution 6: Use winln (Git SDK only)
**Status:** ❌ Not widely accessible  
**Requirements:** Git for Windows SDK installed  
**Command:**
```bash
pacman -Su winln
winln -s target link
```

### Solution 7: Post-Checkout Hook (Agence Migration)
**Status:** ✅ Our current approach  
**Concept:** Let git fail silently, then use PowerShell post-checkout hook to create symlinks
**Limitations:** PowerShell may also need UAC or Developer Mode

## Root Cause Analysis

| Factor | Impact |
|--------|--------|
| **NTFS Requirement** | ✅ OK - User is on Windows 10+ with NTFS |
| **SeCreateSymbolicLinkPrivilege** | ❌ Default = Admins only |
| **UAC Elevation** | ❌ Blocks even admins (unless Dev Mode) |
| **Developer Mode** | ❌ Likely NOT enabled on user's system |
| **Git Bash Detection** | ✅ MSYS git-bash doesn't auto-enable symlinks |

## Recommended Path Forward for Agence

**Most pragmatic solution: Combination approach**

1. **Users on Windows 10 1703+:** Enable Developer Mode (simplest fix)
2. **Users on older Windows:** Use directory junctions for Agence directories
3. **Fallback:** Post-checkout hooks + PowerShell auto-repair
4. **Documentation:** Clear setup instructions noting the Developer Mode requirement

## Implementation Strategy

Replace the three problematic symlinks with:
- `.agence/bin/agence` → Regular tracked file (not symlink)
- `.agence/.github/copilot-instructions.md` → Regular tracked file
- Dynamically recreate them via `^init` command using appropriate shell

This avoids the git-bash symlink issue entirely by not tracking them as symlinks in git.
