// Cloudflare Pages "advanced mode" worker: serves the whole site from this one file. The static files
// (from site/, embedded at build time by scripts/build_worker.mjs) plus the live data files
// (functions/_lib/data.js). One file means the site publishes in a single upload.
import { serveFile } from "../functions/_lib/data.js";
import { FILES } from "./assets.js";

const DATA_FILES = new Set(["animals", "coming-soon", "unavailable", "fosters", "adopted", "stats", "events"]);
const REDIRECTS = { "/fieldguide": "/fieldguide/", "/fieldguide.html": "/fieldguide/", "/index.html": "/" };
const TYPES = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8", webmanifest: "application/manifest+json", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", pdf: "application/pdf", ico: "image/x-icon",
};
const bytes = {};   // decoded once per worker instance

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (REDIRECTS[path]) return Response.redirect(url.origin + REDIRECTS[path] + url.search, 301);
    const m = path.match(/^\/([a-z-]+)\.json$/);
    if (m && DATA_FILES.has(m[1])) {
      if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
      return serveFile({ env, waitUntil: (p) => ctx.waitUntil(p) }, m[1]);
    }
    if (path.endsWith("/")) path += "index.html";
    let key = path.slice(1);
    if (!FILES[key] && FILES[key + ".html"]) key += ".html";   // /screen -> screen.html
    if (!FILES[key]) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" } });
    if (!bytes[key]) bytes[key] = Uint8Array.from(atob(FILES[key]), (c) => c.charCodeAt(0));
    const ext = key.split(".").pop().toLowerCase();
    return new Response(request.method === "HEAD" ? null : bytes[key], {
      headers: {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        // Pages, data and the widget scripts/styles are rechecked every 5 minutes so changes reach visitors quickly;
        // images and PDFs can be kept for an hour.
        "Cache-Control": /^(html|json|webmanifest|js|css)$/.test(ext) ? "public, max-age=300" : "public, max-age=3600",
      },
    });
  },
};
