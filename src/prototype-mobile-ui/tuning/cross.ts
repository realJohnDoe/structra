// Evaluate each λ's tree at every other λ: if tree(λ') beats tree(λ) at λ, greedy is suboptimal there.
import fs from "node:fs";
import { prepare, optimalTree } from "../optimizer.ts";
const r = process.argv[2] ?? "django";
const prep = prepare(JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")));
const ls = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const ts = ls.map((l) => optimalTree(prep, l));
console.log("rows: tree built at λ; cols: evaluated at λ; * = best in column");
const M = ts.map((t) => ls.map((l) => l * t.edgeTerm + (1 - l) * t.nodeTerm));
for (let i = 0; i < ls.length; i++) {
  console.log(ls[i].toFixed(1), M[i].map((v, j) => { const best = Math.min(...M.map((row) => row[j])); return (v.toFixed(3) + (v === best ? "*" : " ")).padStart(7); }).join(" "), `e=${ts[i].edgeTerm.toFixed(3)} n=${ts[i].nodeTerm.toFixed(3)}`);
}
