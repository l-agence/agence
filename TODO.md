INFO: Symlinks created with cygwin-bash work fine in git-bash, BUT they do not function as links, directory junctions, etc. in native Windows. This affects cross-environment compatibility and should be considered in the pipeline and test design.
^TODO: Enforce pipeline conformance and audit/safety constraints as per CLAUDE.md and copilot-instructions.md after restoring working state and integrating changes.

INFO: The command router must accept .vscode/tasks.json and .vscode/keybindings.json. tasks.json should allow, via 'aido' (C:/Users/steff/git/.agence/bin/aido), universal whitelisting, blacklisting, and prompt escalation using C:/Users/steff/git/.agence/codex/AIPOLICY.yaml and C:/Users/steff/git/.agence/codex/AIPOLICY.md. 'aido' acts like sudo but:
	1. Allows execution of whitelist-safe commands with no prompting.
	2. Denies blacklisted commands and pipes (with some exceptions for '>/dev/null' or '2>&1').
	3. Allows privilege escalation with human prompts for unsafe commands.