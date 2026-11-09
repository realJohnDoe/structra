// PROTOTYPE (throwaway): inline the vite build and the example Graph Files into one
// self-contained HTML file. Usage: npx vite build && node src/prototype-mobile-ui/build-single-html.mjs <out.html>
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "structra-mobile-ui-prototype.html";
const dist = "dist";
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

const safe = (s) => s.replace(/<\/script/gi, "<\\/script");

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = fs.readFileSync(path.join(dist, href.replace(/^\/structra\//, "")), "utf8");
  return `<style>${css}</style>`;
});
let js = "";
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  js = fs.readFileSync(path.join(dist, src.replace(/^\/structra\//, "")), "utf8");
  return "";
});
html = html.replace(/<link rel="icon"[^>]*>/, "");

// Raw JSON text keyed by file name, so the page times JSON.parse like after a fetch.
const examples = {};
for (const f of fs.readdirSync("public/prototype-examples")) {
  examples[f] = fs.readFileSync(path.join("public/prototype-examples", f), "utf8");
}
const data = `<script>window.__STRUCTRA_EXAMPLES__=${safe(JSON.stringify(examples))};</script>`;
html = html.replace("</body>", () => `${data}\n<script type="module">${safe(js)}</script>\n</body>`);
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0), "KiB");
