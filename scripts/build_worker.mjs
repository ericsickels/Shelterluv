// Bundle the site into one Pages "advanced mode" worker: dist/_worker.js. Run scripts/build_site.sh first.
// Usage: node scripts/build_worker.mjs <path to esbuild package>
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join } from "path";
const esbuild = await import(process.argv[2] || "esbuild");
const files = {};
(function walk(dir, prefix) {
  for (const f of readdirSync(dir)) {
    if (f.startsWith("_")) continue;   // _headers/_redirects: handled in worker/index.js
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, prefix + f + "/");
    else files[prefix + f] = readFileSync(p).toString("base64");
  }
})("site", "");
writeFileSync("worker/assets.js", "export const FILES = " + JSON.stringify(files) + ";\n");
mkdirSync("dist", { recursive: true });
await (esbuild.default || esbuild).build({ entryPoints: ["worker/index.js"], bundle: true, format: "esm", outfile: "dist/_worker.js", minify: false, target: "es2022" });
console.log("dist/_worker.js:", (statSync("dist/_worker.js").size / 1e6).toFixed(2), "MB,", Object.keys(files).length, "files");
