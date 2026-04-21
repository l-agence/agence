#!/usr/bin/env bun
// lib/org.ts — Canonical org resolution for the TypeScript layer.
//
// Resolution order (mirrors init.sh:resolve_org_path + setup.sh:setup_org_symlinks):
//   1. AGENCE_ORG env var   (set by ^init or .agencerc)
//   2. synthetic/@ symlink  (user-created via jlink or ^init)
//   3. "l-agence.org"       (fallback for first-time users who have not run ^init)
//
// Usage:
//   import { resolveOrg } from "./org.ts";
//   const org = resolveOrg();  // uses process.env.AGENCE_ROOT
//   const org = resolveOrg("/custom/root");

import { existsSync, readlinkSync } from "fs";
import { join, basename } from "path";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

/**
 * Resolve the active org/team name.
 * Never returns an empty string — falls back to "l-agence.org".
 */
export function resolveOrg(root: string = AGENCE_ROOT): string {
  // 1. Explicit env var (set by ^init or .agencerc via AGENCE_ORG)
  if (process.env.AGENCE_ORG) return process.env.AGENCE_ORG;

  // 2. Read synthetic/@ symlink target
  const atLink = join(root, "synthetic", "@");
  if (existsSync(atLink)) {
    try {
      const target = readlinkSync(atLink);
      if (target) {
        // target may be "l-agence.org" (relative) or an absolute path
        return basename(target) || target;
      }
    } catch {
      // fall through
    }
  }

  // 3. Hard fallback — present until ^init has been run
  return "l-agence.org";
}

// CLI: airun org resolve  →  prints the resolved org
if (import.meta.main) {
  const [sub] = process.argv.slice(2);
  if (!sub || sub === "resolve") {
    console.log(resolveOrg());
  } else {
    console.error(`Usage: airun org resolve`);
    process.exit(1);
  }
}
