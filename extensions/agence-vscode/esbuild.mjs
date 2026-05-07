// esbuild.mjs — Build script for Agence VS Code extension (web + node)
import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");
const isWeb = process.argv.includes("--web");

const shared = {
  bundle: true,
  sourcemap: true,
  minify: !isWatch,
  external: ["vscode"],
  logLevel: "info",
};

// Web extension (runs in github.dev, Gitpod, vscode.dev)
const webConfig = {
  ...shared,
  entryPoints: ["src/web/extension.ts"],
  outfile: "dist/web/extension.js",
  format: "cjs",
  platform: "browser",
};

// Node extension (runs in desktop VS Code)
const nodeConfig = {
  ...shared,
  entryPoints: ["src/node/extension.ts"],
  outfile: "dist/node/extension.js",
  format: "cjs",
  platform: "node",
};

const configs = isWeb ? [webConfig] : [webConfig, nodeConfig];

if (isWatch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
  console.log("Watching...");
} else {
  for (const config of configs) {
    await esbuild.build(config);
  }
}
