#!/usr/bin/env bun
// lib/skill-bundle.ts — ^bundle: Local CI/CD pipeline
//
// Steps: bash lint → bun test → npm pack audit → typecheck → summary
// No LLM — just sequential shell steps with structured output.

import { existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const AGENCE_ROOT = process.env.AGENCE_ROOT
  || process.env.AI_ROOT
  || join(import.meta.dir, "..");

interface StepResult {
  name: string;
  pass: boolean;
  duration: number;
  output: string;
}

export async function runBundle(): Promise<number> {
  const root = AGENCE_ROOT;
  const env = { ...process.env, AGENCE_ROOT: root, AI_ROOT: root };

  const results: StepResult[] = [];
  const totalStart = Date.now();

  console.log("\x1b[1m[bundle] CI/CD pipeline starting…\x1b[0m\n");

  // Step 1: Bash lint
  const lintStart = Date.now();
  console.log("  ① bash -n lint…");
  const lintScripts = [
    "bin/agence", "bin/aibash", "bin/aido", "bin/aisession",
    "bin/swarm", "lib/env.sh", "lib/ailedger.sh", "lib/format.sh",
    "lib/router.sh", "lib/aicmd-lib.sh",
  ].filter(f => existsSync(join(root, f)));
  let lintFailed = 0;
  for (const f of lintScripts) {
    const r = spawnSync("bash", ["-n", f], { cwd: root, timeout: 10_000 });
    if (r.status !== 0) lintFailed++;
  }
  results.push({
    name: "bash-lint",
    pass: lintFailed === 0,
    duration: Date.now() - lintStart,
    output: lintFailed === 0 ? `${lintScripts.length} scripts OK` : `${lintFailed}/${lintScripts.length} failed`,
  });
  console.log(`     ${lintFailed === 0 ? "✓" : "✗"} ${results[0].output} (${results[0].duration}ms)`);

  // Step 2: Bun test
  const testStart = Date.now();
  console.log("  ② bun test…");
  const testResult = spawnSync("bun", ["test", "--timeout", "60000"], {
    cwd: root, env, timeout: 300_000,
  });
  const testOutput = testResult.stdout?.toString() || "";
  const testStderr = testResult.stderr?.toString() || "";
  const passMatch = (testOutput + testStderr).match(/(\d+)\s+pass/);
  const failMatch = (testOutput + testStderr).match(/(\d+)\s+fail/);
  const passes = passMatch ? parseInt(passMatch[1]) : 0;
  const fails = failMatch ? parseInt(failMatch[1]) : 0;
  results.push({
    name: "bun-test",
    pass: testResult.status === 0,
    duration: Date.now() - testStart,
    output: `${passes} pass, ${fails} fail`,
  });
  console.log(`     ${testResult.status === 0 ? "✓" : "✗"} ${results[1].output} (${results[1].duration}ms)`);

  // Step 3: npm pack dry-run (security audit)
  const packStart = Date.now();
  console.log("  ③ npm pack --dry-run (security audit)…");
  const packResult = spawnSync("npm", ["pack", "--dry-run"], {
    cwd: root, env, timeout: 30_000,
  });
  const packOutput = (packResult.stderr?.toString() || "") + (packResult.stdout?.toString() || "");
  const hasLeak = /nexus\/|knowledge\/private|knowledge\/hermetic|\.ailedger|organic\//.test(packOutput);
  const fileCount = (packOutput.match(/total files:\s*(\d+)/i) || [])[1] || "?";
  const pkgSize = (packOutput.match(/package size:\s*([^\n]+)/i) || [])[1] || "?";
  results.push({
    name: "pack-audit",
    pass: !hasLeak && packResult.status === 0,
    duration: Date.now() - packStart,
    output: hasLeak ? "SECURITY: private data in package!" : `${fileCount} files, ${pkgSize}`,
  });
  console.log(`     ${!hasLeak ? "✓" : "✗"} ${results[2].output} (${results[2].duration}ms)`);

  // Step 4: Type check
  const typeStart = Date.now();
  console.log("  ④ typecheck (import validation)…");
  const typeResult = spawnSync("bun", ["build", "--no-bundle", "--target", "bun", "lib/mcp.ts", "--outdir", "/tmp/agence-typecheck"], {
    cwd: root, env, timeout: 30_000,
  });
  results.push({
    name: "typecheck",
    pass: typeResult.status === 0,
    duration: Date.now() - typeStart,
    output: typeResult.status === 0 ? "OK" : "failed",
  });
  console.log(`     ${typeResult.status === 0 ? "✓" : "✗"} ${results[3].output} (${results[3].duration}ms)`);

  // Summary
  const totalMs = Date.now() - totalStart;
  const allPass = results.every(r => r.pass);
  console.log(`\n\x1b[1m[bundle] ${allPass ? "\x1b[32m✓ PASS" : "\x1b[31m✗ FAIL"}\x1b[0m\x1b[1m — ${results.length} steps in ${(totalMs / 1000).toFixed(1)}s\x1b[0m`);

  if (!allPass) {
    console.log("\n  Failed steps:");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ✗ ${r.name}: ${r.output}`);
    }
  }

  return allPass ? 0 : 1;
}
