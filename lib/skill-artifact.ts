#!/usr/bin/env bun
// lib/skill-artifact.ts — Artifact routing and saving
//
// Routes skill output to the correct scope directory.

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { resolveOrg } from "./org.ts";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

const ORG = resolveOrg(AGENCE_ROOT);

export const ARTIFACT_ROUTES: Record<string, { scope: string; subdir: string }> = {
  skill:    { scope: "synthetic", subdir: "skills" },
  report:   { scope: "synthetic", subdir: "reports" },
  solution: { scope: "synthetic", subdir: "solutions" },
  analysis: { scope: "synthetic", subdir: "analyses" },
  document: { scope: "synthetic", subdir: "docs" },
  pattern:  { scope: "objectcode", subdir: "patterns" },
  design:   { scope: "objectcode", subdir: "designs" },
  result:   { scope: "organic", subdir: "results" },
};

export function saveArtifact(artifactType: string, content: string, skillName: string): string | null {
  const route = ARTIFACT_ROUTES[artifactType];
  if (!route) return null;

  let targetDir: string;
  if (route.scope === "synthetic") {
    targetDir = join(AGENCE_ROOT, route.scope, ORG, route.subdir);
  } else {
    targetDir = join(AGENCE_ROOT, route.scope, route.subdir);
  }

  mkdirSync(targetDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${skillName}-${ts}.md`;
  const targetPath = join(targetDir, filename);
  writeFileSync(targetPath, content, "utf-8");
  return targetPath;
}
