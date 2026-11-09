// PROTOTYPE (throwaway, ticket "Keep loading and λ updates interactive on a phone"):
// a rough regex import scanner, standing in for the real TS/JS Parser (dependency-cruiser,
// ADR 0003) only to get a react-size Graph File of realistic shape for timing.
// Usage: node src/prototype-mobile-ui/perf/scan-js.ts <react checkout> <out.graph.json>
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const [root, out] = process.argv.slice(2);
const files = execSync("git ls-files", { cwd: root, encoding: "utf8" })
  .split("\n").filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f)).sort();
const set = new Set(files);
const pkgs = new Set(fs.readdirSync(path.join(root, "packages")));
const EXT = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", "/index.js", "/index.ts", "/index.tsx"];
const tryFile = (p: string) => { for (const e of EXT) { const q = path.posix.normalize(p + e); if (set.has(q)) return q; } return null; };
const RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|require\s*\(\s*|export\s[^'"]*?from\s*|jest\.mock\s*\(\s*|requireActual\s*\(\s*)['"]([^'"]+)['"]/g;
const edges = new Set<string>();
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of src.matchAll(RE)) {
    const s = m[1];
    let t: string | null = null;
    if (s.startsWith(".")) t = tryFile(path.posix.join(path.posix.dirname(f), s));
    else {
      const parts = s.split("/");
      const name = s.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      const rest = s.startsWith("@") ? parts.slice(2) : parts.slice(1);
      if (pkgs.has(name)) t = rest.length ? tryFile(`packages/${name}/${rest.join("/")}`) ?? tryFile(`packages/${name}/src/${rest.join("/")}`) : tryFile(`packages/${name}/index`);
    }
    if (t && t !== f) edges.add(JSON.stringify([f, t]));
  }
}
const e = [...edges].map((x) => JSON.parse(x) as [string, string]).sort((a, b) => (a[0] + "\0" + a[1] < b[0] + "\0" + b[1] ? -1 : 1));
const commit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
fs.writeFileSync(out, JSON.stringify({ meta: { repo: "https://github.com/facebook/react", commit, language: "typescript", parser: { name: "prototype-regex-scan" } }, nodes: files, edges: e }));
console.log(files.length, "files", e.length, "edges");
