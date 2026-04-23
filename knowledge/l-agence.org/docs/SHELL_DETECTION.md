# Agence Shell Environment Detection

Agence automatically detects which shell environment it's running in and adapts accordingly. No manual configuration needed for path handling.

## Supported Environments

- **Git-bash** (MinGW/MSYS2 on Windows)
- **Cygwin** (Cygwin bash on Windows)
- **PowerShell** (Windows native)
- **WSL** (Windows Subsystem for Linux)
- **Linux** (native Linux)
- **macOS** (native macOS)

## Detection Mechanism

`bin/agence` calls `detect_shell_environment()` early in execution:

```bash
detect_shell_environment() [shell environment detection]
  ↓
Sets AGENCE_SHELL_ENV          # Which shell/OS
Sets AGENCE_PATH_STYLE         # How to handle paths
Sets AGENCE_OS_WINDOWS/LINUX/MACOS
  ↓
All path operations use normalize_path() [adapts to detected environment]
```

## Environment Variables Set

### AGENCE_SHELL_ENV
**Values**: `git-bash` | `cygwin` | `wsl` | `linux` | `macos` | `powershell`

Identifies the current shell/environment.

### AGENCE_PATH_STYLE
**Values**: 
- `mingw` - MinGW/Git-bash style (`/c/users/steff/...`)
- `cygwin` - Cygwin style (`/cygdrive/c/users/steff/...`)
- `windows` - Windows native style (`C:\Users\Steff\...`)
- `posix` - Linux/macOS style (`/home/user/...`)

Controls how paths are normalized.

### AGENCE_OS_*
Binary flags:
- `AGENCE_OS_WINDOWS=1/0`
- `AGENCE_OS_LINUX=1/0`
- `AGENCE_OS_MACOS=1/0`

Useful for conditional logic.

## Detection Sequence

1. **Check OSTYPE** (bash environment variable)
   - `msys|mingw*` → git-bash
   - `cygwin*` → cygwin
   - `linux*` → check for WSL
   - `darwin*` → macOS

2. **Check MSYSTEM** (git-bash indicator)
   - If set → Force git-bash detection

3. **Check for PowerShell** (Windows shell)
   - If PSVersionTable or shell is powershell → PowerShell mode

4. **Check /proc/version** (WSL indicator)
   - If Linux with "microsoft" in version → WSL mode

## Path Normalization

The `normalize_path()` function converts paths based on detected environment:

```bash
# Git-bash (AGENCE_PATH_STYLE=mingw)
Input:  /cygdrive/c/users/steff/...
Output: /c/users/steff/...

# Cygwin (AGENCE_PATH_STYLE=cygwin)
Input:  /c/users/steff/...
Output: /cygdrive/c/users/steff/...

# PowerShell/Windows (AGENCE_PATH_STYLE=windows)
Input:  /c/users/steff/...
Output: C:\Users\Steff\...

# Linux/macOS/WSL (AGENCE_PATH_STYLE=posix)
Input:  (already correct)
Output: (passthrough)
```

## Debug Output

To see which environment was detected:

```bash
AGENCE_DEBUG=1 agence help
# Output:
# [DEBUG] Shell: cygwin, Path style: cygwin, OS: W=1 L=0
# [DEBUG] Standalone mode (GIT_REPO == AGENCE_REPO)
# [DEBUG] AGENCE_REPO=/cygdrive/c/Users/steff/git/.agence
# [DEBUG] GIT_REPO=/cygdrive/c/Users/steff/git/.agence
```

Flags:
- `W=1` = Windows
- `L=1` = Linux
- `M=1` = macOS

## Special Cases

### Standalone Mode
When `.agence` is not yet a git submodule (special case now):
```
GIT_REPO == AGENCE_REPO (both same directory)
Both must be in pwd for context validation to pass
```

When `.agence` is a proper submodule:
```
GIT_REPO = parent project repo
AGENCE_REPO = .agence submodule location
pwd can be in either
```

### PowerShell Support (Future)
When `bin/agence` is called from PowerShell, it detects and sets:
- `AGENCE_SHELL_ENV=powershell`
- `AGENCE_PATH_STYLE=windows`
- Paths converted to Windows style (`C:\...`)

Currently shell router only supports bash, but environment is prepared.

## Environment Variables for Testing

To manually override (for testing):

```bash
# Force git-bash behavior
export MSYSTEM=MINGW64
export AGENCE_SHELL_ENV=git-bash

# Force PowerShell behavior
export PSVersionTable=1

# Force WSL detection
OSTYPE=linux source /dev/stdin << 'EOF'
# simulates WSL
EOF
```

---

**Version**: 0.1.0  
**Last Updated**: 2026-03-04
