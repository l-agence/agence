#!/usr/bin/env pwsh
# aishell: Agentic (robot) PowerShell shell for autonomous/background agent work
# Purpose: Secure, session-logged, agent-only shell for PowerShell
# Usage: ./bin/aishell [--test]

param(
    [Parameter(Mandatory=$false)]
    [string]$TestFlag = $null
)


# --- SECURITY HARDENING ---
# SEC-010: Restrict PATH to minimal safe binaries — removed '.' (planted binary attack vector)
if ($env:AI_BIN) {
	$env:PATH = "/usr/bin:/bin:$($env:AI_BIN)"
} else {
	$env:PATH = "/usr/bin:/bin"
}
# Unset risky env vars
$env:HISTFILE = $null
$env:HISTSIZE = $null
$env:HISTCONTROL = $null
$env:HISTIGNORE = $null
$env:PROMPT_COMMAND = $null
$env:BASH_ENV = $null
$env:ENV = $null
$env:CDPATH = $null
# SEC-010: Unset security-critical env vars (guard bypass + API key exfiltration)
$env:AGENCE_GUARD_PERMISSIVE = $null
$env:ANTHROPIC_API_KEY = $null
$env:OPENAI_API_KEY = $null
$env:GEMINI_API_KEY = $null
$env:GOOGLE_API_KEY = $null
$env:AZURE_OPENAI_API_KEY = $null
$env:DEEPSEEK_API_KEY = $null
$env:AWS_SECRET_ACCESS_KEY = $null
$env:AWS_SESSION_TOKEN = $null
$env:AGENCE_POLICY = $null
# Block signals (PowerShell: trap EXIT, etc.)
trap { return 0 } EXIT
# Source aipolicy if present
if (Test-Path "$PSScriptRoot/../bin/aipolicy") {
	. "$PSScriptRoot/../bin/aipolicy"
}

# ENVIRONMENT SETUP
$GIT_ROOT = $env:GIT_ROOT
if (-not $GIT_ROOT) {
	$GIT_ROOT = (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
$AI_ROLE    = $env:AI_ROLE    | ForEach-Object { $_ } | Where-Object { $_ } | ForEach-Object { $_ } | Select-Object -First 1
if (-not $AI_ROLE) { $AI_ROLE = "agentic" }
$AI_SESSION = $env:AI_SESSION | ForEach-Object { $_ } | Where-Object { $_ } | ForEach-Object { $_ } | Select-Object -First 1
if (-not $AI_SESSION) { $AI_SESSION = "unknown" }
$AI_AGENT   = $env:AI_AGENT   | ForEach-Object { $_ } | Where-Object { $_ } | ForEach-Object { $_ } | Select-Object -First 1
if (-not $AI_AGENT) { $AI_AGENT = "robot" }
$SESSION_DIR = Join-Path $GIT_ROOT 'nexus/.aisessions'
$SESSION_LOG = Join-Path $SESSION_DIR ("${AI_SESSION}_${AI_ROLE}.typescript")
$SESSION_META = Join-Path $SESSION_DIR ("${AI_SESSION}_${AI_ROLE}.meta.json")
if (-not (Test-Path $SESSION_DIR)) { New-Item -ItemType Directory -Path $SESSION_DIR | Out-Null }

# SESSION LOGGING INITIALIZATION
if (-not (Test-Path $SESSION_META)) {
	$meta = @{
		session_id = $AI_SESSION
		role = $AI_ROLE
		agent = $AI_AGENT
		shell = "pwsh"
		timestamp_start = (Get-Date -Format o)
		git_root = $GIT_ROOT
		typescript_file = $SESSION_LOG
		commands_executed = 0
		exit_code = $null
	} | ConvertTo-Json -Depth 3
	$meta | Set-Content -Path $SESSION_META
}

# TEST MODE
if ($TestFlag -eq "--test") {
    Write-Output "aishell@agent"
    Write-Output "AGENCE PURE AGENTIC SHELL"
    "[AISHELL] Test mode: session logging validation" | Out-File -FilePath $SESSION_LOG -Append
    exit 0
}

# PROMPT CUSTOMIZATION
function prompt {
    $tileName = "aishell@agent"
    $color = "Cyan"
    $sessionShort = $AI_SESSION.Substring(0, [Math]::Min(8, $AI_SESSION.Length))
    Write-Host "[$tileName][$AI_AGENT][$sessionShort] " -ForegroundColor $color -NoNewline
    Write-Host "$($executionContext.SessionState.Path.CurrentLocation)> " -NoNewline
    return " "
}

# SESSION HEADER
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  AGENCE PURE AGENTIC SHELL (aishell@agent)                    ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Role:       $AI_ROLE                                         ║" -ForegroundColor Cyan
Write-Host "║  Session:    $AI_SESSION                                      ║" -ForegroundColor Cyan
Write-Host "║  Agent:      $AI_AGENT                                        ║" -ForegroundColor Cyan
Write-Host "║  Shell:      PowerShell $($PSVersionTable.PSVersion.Major)    ║" -ForegroundColor Cyan
Write-Host "║  Root:       $GIT_ROOT                                        ║" -ForegroundColor Cyan
Write-Host "║  Log:        $SESSION_LOG                                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Start interactive agentic shell
Set-Location -Path $GIT_ROOT | Out-Null
Write-Host "aishell@agent ready. Type 'help' for commands." -ForegroundColor Gray
Write-Host "Commands are validated through guard.ts (fail-closed)." -ForegroundColor Gray
Write-Host ""

# SEC-010: Guard-gated command loop — replaced raw Invoke-Expression
# with guard.ts classification before execution
$guardTs = Join-Path $GIT_ROOT 'lib/guard.ts'
$airunPath = Join-Path $GIT_ROOT 'bin/airun'
while ($true) {
    $input = Read-Host
    if ($input -eq "exit") { break }
    if ([string]::IsNullOrWhiteSpace($input)) { continue }
    # Gate through guard.ts
    $guardApproved = $false
    try {
        if ((Test-Path $airunPath) -and (Get-Command bun -ErrorAction SilentlyContinue)) {
            $guardOutput = & bun run $guardTs classify $input 2>$null | ConvertFrom-Json
            if ($guardOutput.action -eq "allow" -or $guardOutput.action -eq "flag") {
                $guardApproved = $true
                # SEC-012: Run check (not classify) to write audit trail to ledger
                & bun run $guardTs check $input 2>$null | Out-Null
            } else {
                Write-Host "[AISHELL] ✗ Guard $($guardOutput.tier) $($guardOutput.action): $($guardOutput.reason)" -ForegroundColor Red
            }
        } else {
            Write-Host "[AISHELL] ✗ Guard unavailable — denying (fail-closed)" -ForegroundColor Red
        }
    } catch {
        Write-Host "[AISHELL] ✗ Guard error — denying (fail-closed): $_" -ForegroundColor Red
    }
    if ($guardApproved) {
        try {
            Invoke-Expression $input
        } catch {
            Write-Host "[AISHELL] ✗ Command failed: $_" -ForegroundColor Red
        }
    }
}
