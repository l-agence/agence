# ============================================================================
# profile.ps1 - Agence PowerShell Profile
# ============================================================================
# This file should be sourced at PowerShell startup.
# It detects the Agence root and repo root dynamically.
#
# To install:
# 1. Open PowerShell (any version, including 7+)
# 2. Find your profile path: $PROFILE
# 3. If it doesn't exist: New-Item -Path $PROFILE -Type File -Force
# 4. Add this line: . ~/.agence/bin/profile.ps1

# ============================================================================
# STEP 1: Compute AGENCE_ROOT Dynamically
# ============================================================================
# This script is at: $AGENCE_ROOT/bin/profile.ps1
# So the parent is: $AGENCE_ROOT

function Compute-AgenceRoot {
    $scriptPath = $PSScriptRoot
    
    # Go up two levels: profile.ps1 -> bin/ -> .agence root
    $agenceRoot = Split-Path -Parent $scriptPath
    
    return $agenceRoot
}

$env:AGENCE_ROOT = Compute-AgenceRoot

# ============================================================================
# STEP 1B: Set AI_BIN (for cross-shell consistency)
# ============================================================================

$env:AI_BIN = "$env:AI_ROOT\bin"
$env:AGENCE_BIN = $env:AI_BIN  # Legacy alias

# Add AI_BIN to PATH if not already present
if ($env:PATH -notlike "*$env:AI_BIN*") {
    $env:PATH = "$env:AI_BIN;$env:PATH"
}

# ============================================================================
# STEP 2: Compute REPO_ROOT Dynamically
# ============================================================================

function Compute-RepoRoot {
    # Method 1: Parent of AI_ROOT (standard structure)
    $gitRoot = Split-Path -Parent $env:AI_ROOT
    
    # Method 2: Verify via git if available
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $gitRoot = & git -C $env:AI_ROOT rev-parse --show-superproject-working-tree 2>$null
        if (-not $gitRoot) {
            $gitRoot = Split-Path -Parent $env:AI_ROOT
        }
    }
    
    return $gitRoot
}

$env:GIT_ROOT = Compute-RepoRoot
$env:REPO_ROOT = $env:GIT_ROOT  # Legacy alias
$env:GIT_REPO = $env:GIT_ROOT

# ============================================================================
# STEP 3: GitHub CLI Detection
# ============================================================================

if (Get-Command gh -ErrorAction SilentlyContinue) {
    try {
        $authStatus = & gh auth status 2>$null
        if ($authStatus -match "Logged in to") {
            $env:GITHUB_USER = ($authStatus -split '\s+')[3]
            $env:GH_AVAILABLE = $true
        } else {
            $env:GH_AVAILABLE = $false
        }
    } catch {
        $env:GH_AVAILABLE = $false
    }
} else {
    $env:GH_AVAILABLE = $false
}

# ============================================================================
# STEP 4: Symlink Creation Function
# ============================================================================
# PowerShell: Use native New-Item with SymbolicLink ItemType
# This creates proper Windows NTFS symlinks (mode 120000 in git)

function New-Symlink {
    param(
        [Parameter(Mandatory=$true)]
        [string]$LinkPath,
        
        [Parameter(Mandatory=$true)]
        [string]$TargetPath,
        
        [switch]$Directory
    )
    
    $itemType = if ($Directory) { "SymbolicLink" } else { "SymbolicLink" }
    
    try {
        # Resolve to absolute paths
        $linkPath = (Get-Item -Path $LinkPath -ErrorAction Stop).FullName
    } catch {
        $linkPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($LinkPath)
    }
    
    try {
        $targetPath = (Get-Item -Path $TargetPath -ErrorAction Stop).FullName
    } catch {
        $targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TargetPath)
    }
    
    # Remove existing link if present
    if (Test-Path $LinkPath) {
        Remove-Item -Path $LinkPath -Force -ErrorAction SilentlyContinue
    }
    
    # Create symlink
    New-Item -ItemType SymbolicLink -Path $LinkPath -Target $TargetPath -Force | Out-Null
    
    if ($?) {
        Write-Host "[LINK] Created: $LinkPath -> $TargetPath" -ForegroundColor Green
        return $true
    } else {
        Write-Host "[ERROR] Failed to create symlink: $LinkPath -> $TargetPath" -ForegroundColor Red
        return $false
    }
}

# ============================================================================
# STEP 5: Common Aliases & Functions
# ============================================================================

# Quick Agence command
function agence {
    & bash $env:AGENCE_ROOT/bin/agence @args
}

function ag {
    agence @args
}

# Display environment
function Get-AgenceStatus {
    Write-Host "`n=== Agence Environment ===" -ForegroundColor Cyan
    Write-Host "AGENCE_ROOT: $env:AGENCE_ROOT"
    Write-Host "REPO_ROOT:   $env:REPO_ROOT"
    Write-Host "GH Available: $env:GH_AVAILABLE"
    if ($env:GITHUB_USER) {
        Write-Host "GitHub User: $env:GITHUB_USER"
    }
    Write-Host "`n"
}

# ============================================================================
# STEP 6: Debug Output
# ============================================================================

if ($env:AGENCE_DEBUG -eq "1") {
    Write-Host "[AGENCE] PowerShell profile loaded successfully" -ForegroundColor Green
    Get-AgenceStatus
}

# ============================================================================
# STEP 7: Export Variables for Subprocesses
# ============================================================================

[Environment]::SetEnvironmentVariable("AGENCE_ROOT", $env:AGENCE_ROOT, "Process")
[Environment]::SetEnvironmentVariable("REPO_ROOT", $env:REPO_ROOT, "Process")
[Environment]::SetEnvironmentVariable("GIT_REPO", $env:GIT_REPO, "Process")
