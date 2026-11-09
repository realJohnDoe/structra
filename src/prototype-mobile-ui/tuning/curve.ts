import fs from "node:fs";
import { prepare } from "../optimizer.ts";
import { Contraction } from "./survivors.ts";
import { runStrategy, type Strategy } from "./strategies.ts";
const r = process.argv[2] ?? "django";
const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")); const prep = prepare(g); const d = prep.dendro;
for (const s of ["greedy", "sweepUp"] as Strategy[]) {
  const sets = runStrategy(d, prep.edges, s); const c = new Contraction(d, prep.edges);
  const out: string[] = [];
  for (let i = 0; i <= 100; i += 10) { c.setSurvivors(sets[i]); c.refresh(); let gr = 0, bin = 0, ksum = 0; for (let x = d.n; x < c.total; x++) if (sets[i][x]) { gr++; if (c.bk[x] === 2) bin++; ksum += c.bk[x]; } out.push(`${(i / 100).toFixed(1)}:${gr}g/${gr ? Math.round((100 * bin) / gr) : 0}%bin`); }
  console.log(s.padEnd(8), out.join(" "));
}
