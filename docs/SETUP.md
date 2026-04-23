# Agence Development Environment Setup

## Prerequisites

### Minimum Viable Environment (Required)

Before working with Agence, ensure you have:

1. **Windows 10/11 with WSL2**
   - See: https://learn.microsoft.com/en-us/windows/wsl/install
   - Command: `wsl --install -d Ubuntu-22.04` (or LTS variant)
   - Verify: `wsl -l -v` should show Ubuntu with Version 2

2. **Visual Studio Code**
   - Download: https://code.visualstudio.com
   - Install WSL extension: `ms-vscode-remote.remote-wsl`

3. **Git** (inside WSL-Ubuntu)
   ```bash
   wsl sudo apt update && sudo apt install -y git
   ```

4. **Node.js + TypeScript** (inside WSL-Ubuntu)
   ```bash
   wsl curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   wsl sudo apt install -y nodejs
   ```

---

## Shell Configuration

### Why Shell Matters

All Agence operations assume **POSIX-compatible paths**:
- Agents run in Linux containers (`/workspace/...`)
- Local dev must match (`/home/user/...` via WSL)
- Path validation uses `realpath()` (POSIX-native)
- Symlinks are reliable (true POSIX, not emulation)

**Incompatible shells introduce path normalization bugs** that cascade into:
- Security layer bypasses (junctions as escape hatches)
- Symlink gotchas (MSYS2 emulation)
- Container dev ≠ local dev (environment mismatch)

### Default Shell: WSL-Ubuntu Bash (Required)

**Configure VSCode to use WSL-Ubuntu bash by default:**

1. Open VSCode settings (Ctrl+,)
2. Search: `terminal.integrated.defaultProfile`
3. Select platform: Windows
4. Set value: `WSL-Ubuntu`

**Or edit [`.vscode/settings.json`](.vscode/settings.json) directly:**

```json
{
  "terminal.integrated.defaultProfile.windows": "WSL-Ubuntu",
  "terminal.integrated.profiles.windows": {
    "WSL-Ubuntu": {
      "path": "C:\\Windows\\System32\\wsl.exe",
      "args": ["--distribution", "Ubuntu", "--cd", "~"],
      "icon": "terminal-ubuntu",
      "problemMatcher": []
    }
  },
  "terminal.integrated.fontFamily": "Cascadia Code",
  "terminal.integrated.fontSize": 12
}
```

**Verify:**
```bash
# Open new VSCode terminal (Ctrl+`)
echo $SHELL
# Output: /bin/bash

pwd
# Output: /home/username/... (not C:\Users\...)
```

### Optional: PowerShell in WSL-Ubuntu

If you prefer PowerShell but need POSIX paths:

```bash
wsl sudo apt install -y powershell
```

**Then use in VSCode:**
```bash
wsl pwsh
```

**Why this works:**
- PowerShell runs INSIDE WSL (POSIX path environment)
- Paths are `/home/user/...` (not `C:\...`)
- Scripts still match container environment
- You get PowerShell syntax + POSIX clarity

**NOT Recommended:**
- Git Bash on Windows host (`C:\Program Files\Git\bin\bash.exe`)
- PowerShell on Windows host (both create path translation issues)

---

## Agence-Specific Configuration

### Clone and Initialize

```bash
# Clone repo (in WSL-Ubuntu bash)
git clone https://github.com/l-agence/agence.git
cd agence

# Initialize Agence
bash bin/agence ^init
```

### Verify Installation

```bash
# Check version
bash bin/agence version

# Test commands
bash bin/agence ^plan list
bash bin/agence ^todo list
bash bin/agence help

# All should succeed with no path errors
```

### Git Configuration (Optional but Recommended)

```bash
# Set your identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Enable long filenames (Windows can have issues)
git config --global core.longpaths true

# Configure line endings (LF inside WSL)
git config --global core.safecrlf warn
```

---

## Troubleshooting

### Issue: VSCode Terminal Opens in PowerShell (Not WSL-Ubuntu)

**Solution:**
1. Verify [`.vscode/settings.json`](.vscode/settings.json) has `defaultProfile.windows: "WSL-Ubuntu"`
2. Restart VSCode entirely (`Ctrl+Shift+P` → "Developer: Reload Window")
3. Open new terminal (`Ctrl+\``)
4. Verify: `echo $SHELL` → `/bin/bash`

### Issue: `agence: command not found`

**Solution:**
```bash
# Ensure you're in WSL-Ubuntu bash
echo $SHELL  # Should be /bin/bash

# Ensure you're in agence directory
pwd         # Should end with /agence

# Try with explicit bash
bash bin/agence --help
```

### Issue: Path Errors Like `C:\Users\...` in Terminal

**Solution:**
- You're using PowerShell on Windows host (not WSL-Ubuntu bash)
- Change VSCode default: see **Shell Configuration** above
- If you need PowerShell: use `wsl pwsh` instead

### Issue: Symlinks Not Working

**Solution:**
```bash
# Inside WSL-Ubuntu, verify POSIX symlinks work
ln -s /tmp/test.txt /tmp/test-link
ls -l /tmp/test-link  # Should show: /tmp/test-link -> /tmp/test.txt

# If this fails, reinstall WSL2 or enable seLinux
```

### Issue: Git Operations Fail (CRLF/LF)

**Solution:**
```bash
# Inside WSL-Ubuntu, ensure LF line endings
git config --local core.autocrlf input

# If files already have CRLF, fix them
dos2unix bin/agence
```

---

## Architecture Rationale

### Local Dev = Container Dev

Agence agents run in **Linux containers** (v0.2.4+):

```
Container:           /workspace/...  (POSIX paths, Linux bash)
                     ↑
Local WSL-Ubuntu:    /home/user/...  (POSIX paths, Linux bash)
                     ↓
Git Bash local:      /c/Users/...    (MSYS2 emulation, fragile)
```

By using **WSL-Ubuntu locally**, you match the container environment exactly. This prevents:
- Path normalization surprises
- Symlink gotchas (MSYS2-specific)
- Security validation bypasses
- Container-local dev divergence

### Why POSIX is Non-Negotiable

Agence uses:
- **realpath()** for path validation (POSIX-native, trustworthy)
- **Job control** (POSIX signals, not Windows-specific)
- **Shell sessions** (POSIX job control, %jobs, fg/bg)
- **Git operations** (LF line endings, not CRLF translation)

All of these work reliably in WSL-Ubuntu bash. PowerShell on Windows host creates translation layers that break assumptions.

---

## References

- [Microsoft WSL2 Documentation](https://learn.microsoft.com/en-us/windows/wsl/)
- [Agence Architecture](../knowledge/l-agence.org/docs/ARCHITECTURE.md)
- [Agence LAWS.md](./LAWS.md) — Path validation constraints
- [Agence TAXONOMY.md](./TAXONOMY.md) — Scope model

---

*Setup verified: 2026-03-31*
