#!/usr/bin/env pwsh
# aishell: Agentic (robot) PowerShell shell for autonomous/background agent work
# Purpose: Secure, session-logged, agent-only shell for PowerShell
# Usage: ./bin/aishell [--test]

param(
	[string]$TestFlag = ""
)


# --- SECURITY HARDENING ---
# Restrict PATH to minimal safe binaries, include $env:AI_BIN and . if set
if ($env:AI_BIN) {
	$env:PATH = "/usr/bin:/bin:$($env:AI_BIN):."
} else {
	$env:PATH = "/usr/bin:/bin:."
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
if ($args.Count -gt 0 -and $args[0] -eq '--test') {
	"[AISHELL] Test mode: session logging validation" | Out-File -FilePath $SESSION_LOG -Append
	exit 0
}

# Default: launch PowerShell (agentic, non-interactive)
# (For now, just exit to avoid blocking automation)
exit 0
