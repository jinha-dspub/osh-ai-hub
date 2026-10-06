import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
// KG_DEMO_OUT builds a preview elsewhere; the default is what osh-demo serves right away.
const output =
  process.env.KG_DEMO_OUT ?? `${root}ai-api/static/kosha-guide-graphrag`;
await mkdir(output, { recursive: true });
// Build id shown in the page footer; changes whenever the screen sources change.
const source = `${root}web/demo/kosha-guide-graphrag`;
const hash = createHash("sha256");
for (const name of (await readdir(source)).sort())
  hash.update(name).update(await readFile(`${source}/${name}`));
const buildId = `react-${hash.digest("hex").slice(0, 10)}`;
await build({
  absWorkingDir: `${root}web`,
  entryPoints: ["demo/kosha-guide-graphrag/index.tsx"],
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
    __KG_BUILD__: JSON.stringify(buildId),
  },
  loader: { ".woff2": "file", ".woff": "file" },
});
await writeFile(
  `${output}/index.html`,
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>KOSHA GUIDE 그래프 검색 | OSH AI Hub</title><link rel="stylesheet" href="/demo/kosha-guide-graphrag/assets/app.css"></head><body><div id="root"></div><script type="module" src="/demo/kosha-guide-graphrag/assets/app.js"></script></body></html>`,
);
console.log(`KOSHA GUIDE GraphRAG UI ${buildId} built in ${output}`);
