import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = `${root}ai-api/static/lanyard`;
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: `${root}web`,
  entryPoints: ["demo/lanyard/index.tsx"],
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
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="/demo/lanyard/"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>안전대 죔줄 체결 판정 | OSH AI Hub</title><link rel="stylesheet" href="./assets/app.css"></head><body><div id="root"></div><script type="module" src="./assets/app.js"></script></body></html>`,
);
console.log("Lanyard standalone UI built in ai-api/static/lanyard");
