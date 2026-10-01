import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
// RO_DEMO_OUT builds a preview elsewhere; the default is what osh-demo serves right away.
const output =
  process.env.RO_DEMO_OUT ?? `${root}ai-api/static/public-ohs-readiness`;
await mkdir(output, { recursive: true });
// 판본 in the demand log: changes whenever the screen's sources change (package DEMO.md).
const source = `${root}web/demo/public-ohs-readiness`;
const hash = createHash("sha256");
for (const name of (await readdir(source)).sort())
  hash.update(name).update(await readFile(`${source}/${name}`));
const buildId = `react-${hash.digest("hex").slice(0, 10)}`;
await build({
  absWorkingDir: `${root}web`,
  entryPoints: ["demo/public-ohs-readiness/index.tsx"],
  bundle: true,
  outdir: `${output}/assets`,
  entryNames: "app",
  assetNames: "[name]-[hash]",
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    __RO_BUILD__: JSON.stringify(buildId),
  },
  loader: { ".woff2": "file", ".woff": "file" },
});
await writeFile(
  `${output}/index.html`,
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>공공기관 안전보건 입찰 준비 점검 | OSH AI Hub</title><link rel="stylesheet" href="/demo/public-ohs-readiness/assets/app.css"></head><body><div id="root"></div><script type="module" src="/demo/public-ohs-readiness/assets/app.js"></script></body></html>`,
);
console.log(`Public OHS readiness UI ${buildId} built in ${output}`);
