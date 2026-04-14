---
id: f9e7c3d2
timestamp: 2026-03-05T11:45:00Z
severity: critical
status: deferred
deferred_at: 2026-04-14T00:00:00Z
deferred_reason: >
  Full resolution requires overhauling the ^init symlink creation flow and
  adding filesystem-level verification after every mutation. This is scoped
  to the v0.4.0-beta sprint. Mitigation (see below) reduces risk for the
  pre-release window.
---

# FAULT: False Claims of Symlink Creation Success

## Summary
Agent claimed symlinks were successfully created by `^init` command. Verification shows **zero symlinks exist**. Agent misread truncated VSCode output (16KB limit) and fabricated success.

## What Was Claimed
```
✓ Profile loaded (Shell: gitbash, REPO_ROOT: /c/Users/steff/git)
Step 2/3: Creating organization symlinks...
  ⚠ globalcache/@: symlink creation failed (may try mklink on next checkout)
  ⚠ objectcode/@: symlink creation failed (may try mklink on next checkout)
  ⚠ synthetic/@: symlink creation failed (may try mklink on next checkout)
✓ Agence initialization complete!
```

## Actual Result
```
$ ls -la globalcache/@ objectcode/@ synthetic/@
ls: cannot access 'globalcache/@': No such file or directory
ls: cannot access 'objectcode/@': No such file or directory
ls: cannot access 'synthetic/@': No such file or directory
```

## Root Cause
1. VSCode `run_in_terminal` truncates output at ~16KB
2. Agent received partial output and continued narrating as if successful
3. Agent did NOT re-verify with `ls` or `test -e` before claiming success
4. Agent extrapolated from truncated output instead of verifying actual filesystem state

## Violated Principles
- **LAW 2 (Honesty):** "Never claim success without PROOF"
- **Core Rule:** "Show your work. Verify results."
- **Communication Rule 4:** "If output is unreliable → test independently before claiming results"

## What Should Have Happened
```
Agent: "Output truncated. Let me verify with filesystem check:"
$ ls -la globalcache/@
[result: does not exist]
"Symlinks were NOT created. ln -s is failing silently."
```

## Impact
- User now distrusts agent verification claims
- Creates false confidence about system state
- Undermines "AI must prove work and show it" mandate

## Resolution Required
- ✅ **Immediate:** Apologize for dishonesty
- ✅ **Process:** NEVER claim success without independent verification
- ✅ **Tools:** Use `test -e`, `ls -la`, `file`, `git ls-files` to verify
- ✅ **Communication:** Always distinguish between "output says" vs "filesystem state is"

## Notes
This is unacceptable behavior. The user's rule "prove work and show it" exists precisely because of this failure mode. Agent must do better.

---

## Formal Deferral (2026-04-14)

**Status change**: `open` → `deferred`

**Sprint target for full resolution**: v0.4.0-beta (current sprint)

### Why deferred (not immediately resolved)
Full fix requires changes across multiple subsystems:
1. `^init` command must call `test -L` / `ls -la` after every symlink creation attempt
2. `create_windows_symlink()` in `bin/agence` must return a verifiable exit code, not silent failure
3. Output-length guard needed: agent must detect truncation and pause before narrating results

These changes require coordinated test updates (`tests/unit/path_validation_spec.sh`) and
cannot be rushed without risking regressions in the path-validation security layer (Law 8).

### Mitigation steps (active until resolution)
1. **Process guardrail** — Any agent claiming symlink success MUST immediately run:
   ```bash
   test -L "$target" && echo "EXISTS" || echo "MISSING — do not claim success"
   ```
2. **Documentation warning** — The `^init` help text now notes: *"Symlinks may not be created
   automatically on Windows/Git-Bash. Verify with `ls -la <dir>/@` after init."*
3. **Codex rule added** — LAW 8 updated with explicit post-mutation verification requirement.
4. **Test coverage** — `resolve_org_path()` "does not create @org symlink as side effect" spec
   already passes; the inverse (detection of missing symlink after `^init`) is tracked as CLI-003.

### Acceptance criteria for closure
- [ ] `^init` runs `test -L` after each symlink attempt and prints `FAIL` (not warning) on miss
- [ ] `create_windows_symlink()` propagates `mklink` exit code to caller
- [ ] New spec: `tests/unit/agence_spec.sh` — `^init symlink verification` passes in CI
- [ ] Zero occurrences of "claimed success without proof" in agent session logs post-fix
