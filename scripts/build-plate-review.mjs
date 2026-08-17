import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const entry = path.join(root, "src/plate-review/client.jsx");
const outfile = path.join(root, "src/plate-review/client.bundle.js");

await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120", "edge120", "firefox121", "safari17"],
  outfile,
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

const size = fs.statSync(outfile).size;
if (size < 1000) throw new Error(`Plate editor bundle is unexpectedly small (${size} bytes)`);
console.log(`${outfile} (${size} bytes)`);
