import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "osh-activity-e2e-"));
await build({
  entryPoints: ["e2e-fixtures/activity-preview.tsx"], bundle: true,
  outdir: dir, loader: { ".woff2": "file" }, jsx: "automatic",
});
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, "http://127.0.0.1").pathname.slice(1);
    if (!name) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DEMO activity test</title><link rel="stylesheet" href="/activity-preview.css"><body><div id="root"></div><script src="/activity-preview.js"></script></body></html>');
    } else if (name === path.basename(name)) {
      res.setHeader("Content-Type", name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "font/woff2");
      res.end(await readFile(path.join(dir, name)));
    } else { res.writeHead(404).end(); }
  } catch { res.writeHead(404).end(); }
});
server.listen(3114, "127.0.0.1");
process.on("SIGTERM", () => { server.close(); void rm(dir, { recursive: true, force: true }).then(() => process.exit()); });
