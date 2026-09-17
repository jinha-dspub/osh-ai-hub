import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = `${root}ai-api/static/copd`;
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: `${root}web`,
  entryPoints: ["demo/copd/index.tsx"],
  bundle: true,
  outdir: `${output}/assets`,
  entryNames: "app",
  assetNames: "[name]-[hash]",
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "file", ".woff": "file" },
});
await writeFile(
  `${output}/index.html`,
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="/demo/copd/"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>COPD 산재 판정 사례 | OSH AI Hub</title><link rel="stylesheet" href="./assets/app.css"></head><body><div id="root"></div><script type="module" src="./assets/app.js"></script></body></html>`,
);
console.log("COPD standalone UI built in ai-api/static/copd");
