import fs from "node:fs";
import { prepare } from "../optimizer.ts";
import { Contraction } from "./survivors.ts";
import { runStrategy, STEPS, type Strategy } from "./strategies.ts";
import { build, type Linkage } from "./dendro.ts";
const r = process.argv[2] ?? "flask"; const strat = (process.argv[3] ?? "sweepUp") as Strategy;
const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")); const prep = prepare(g);
const marks = [10, 20, 30, 40, 50, 70, 100];
for (const L of ["parisSize", "parisVol", "cost"] as Linkage[]) {
  const t0 = Date.now(); const d = build(g.nodes.length, prep.edges, g.nodes, L); const tb = Date.now() - t0;
  const sets = runStrategy(d, prep.edges, strat); const c = new Contraction(d, prep.edges);
  const row = marks.map((i) => { c.setSurvivors(sets[i]); const cost = c.cost(STEPS[i]).total; const { kids } = c.tree();
    let maxLoose = 0, chains = 0, groups = 0; const lv = (x: number): number => (x < d.n ? 1 : kids[x].reduce((s, q) => s + lv(q), 0));
    for (let x = d.n; x < c.total; x++) { if (!sets[i][x]) continue; groups++; const files = kids[x].filter((q) => q < d.n).length; if (x !== d.root) maxLoose = Math.max(maxLoose, files); const tot = lv(x); if (kids[x].some((q) => q >= d.n && lv(q) >= 0.8 * tot)) chains++; }
    return `${cost.toFixed(4)} g${groups} L${maxLoose} c${chains}`; });
  console.log(L.padEnd(9), `build ${tb}ms |`, row.join(" | "));
}
