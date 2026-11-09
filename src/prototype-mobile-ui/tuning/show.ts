import fs from "node:fs";
import { prepare } from "../optimizer.ts";
import { Contraction, type Dendro } from "./survivors.ts";
import { runStrategy, type Strategy } from "./strategies.ts";
export function show(paths: string[], d: Dendro, edges: [number, number][], surv: Uint8Array, maxDepth = 4, maxKids = 14) {
  const c = new Contraction(d, edges).setSurvivors(surv); const { kids } = c.tree(); const n = d.n;
  const leaves = (x: number): number => (x < n ? 1 : kids[x].reduce((s, k) => s + leaves(k), 0));
  const lines: string[] = [];
  const rec = (x: number, depth: number) => {
    const ks = [...kids[x]].sort((p, q) => leaves(q) - leaves(p));
    const files = ks.filter((k) => k < n), groups = ks.filter((k) => k >= n);
    const pad = "  ".repeat(depth);
    lines.push(`${pad}[${leaves(x)}] ${groups.length} groups + ${files.length} files${files.length ? ": " + files.slice(0, 6).map((f) => paths[f].split("/").slice(-2).join("/")).join(", ") + (files.length > 6 ? ", …" : "") : ""}`);
    if (depth >= maxDepth) return;
    for (const g of groups.slice(0, maxKids)) rec(g, depth + 1);
    if (groups.length > maxKids) lines.push(`${pad}  … ${groups.length - maxKids} more groups`);
  };
  rec(d.root, 0);
  return lines.join("\n");
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [r, s, l, md] = [process.argv[2] ?? "flask", (process.argv[3] ?? "sweepUp") as Strategy, Number(process.argv[4] ?? 0.5), Number(process.argv[5] ?? 4)];
  const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")); const prep = prepare(g);
  console.log(show(g.nodes, prep.dendro, prep.edges, runStrategy(prep.dendro, prep.edges, s)[Math.round(l * 100)], md));
}
