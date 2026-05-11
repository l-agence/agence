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
  skill:    { scope: "knowledge", subdir: "skills" },
  report:   { scope: "knowledge", subdir: "reports" },
  solution: { scope: "knowledge", subdir: "solutions" },
  analysis: { scope: "knowledge", subdir: "analyses" },
  document: { scope: "knowledge", subdir: "docs" },
  pattern:  { scope: "knowledge", subdir: "patterns" },
  design:   { scope: "knowledge", subdir: "designs" },
  result:   { scope: "organic", subdir: "results" },
};

export function saveArtifact(artifactType: string, content: string, skillName: string): string | null {
  const route = ARTIFACT_ROUTES[artifactType];
  if (!route) return null;

  let targetDir: string;
  if (route.scope === "knowledge") {
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
