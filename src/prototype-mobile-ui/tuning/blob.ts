// Is the hub blob objective-optimal? Try moving each loose file of the biggest flat node into one of its sibling groups.
import fs from "node:fs";
import { prepare } from "../optimizer.ts";
import { Contraction } from "./survivors.ts";
import { runStrategy } from "./strategies.ts";
const r = process.argv[2] ?? "django", lam = Number(process.argv[3] ?? 0.4);
const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")); const prep = prepare(g); const d = prep.dendro; const n = d.n;
const surv = runStrategy(d, prep.edges, "sweepUp")[Math.round(lam * 100)];
const c = new Contraction(d, prep.edges).setSurvivors(surv); const { par, kids } = c.tree();
const P = Int32Array.from(par); const K: number[] = kids.map((k) => k.length);
const score = () => { // generic tree score (ADR 0001)
  const depth = new Int32Array(P.length).fill(-1);
  const dep = (x: number): number => (depth[x] >= 0 ? depth[x] : (depth[x] = P[x] < 0 ? 0 : dep(P[x]) + 1));
  let e = 0, nd = 0;
  for (let x = 0; x < P.length; x++) if (K[x] > 1) nd += Math.log(K[x]);
  for (const [a0, b0] of prep.edges) { let a = P[a0], b = P[b0]; while (a !== b) { if (dep(a) >= dep(b)) { e += Math.log(K[a]); a = P[a]; } else { e += Math.log(K[b]); b = P[b]; } } e += Math.log(K[a]); }
  return (lam * e) / prep.edges.length + ((1 - lam) * nd) / n;
};
const base = score();
let blob = -1, most = 0; for (let x = n; x < P.length; x++) if (x !== d.root && surv[x]) { const f = kids[x].filter((q) => q < n).length; if (f > most) { most = f; blob = x; } }
const files = kids[blob].filter((q) => q < n), groups = kids[blob].filter((q) => q >= n);
console.log(`λ=${lam} base ${base.toFixed(5)}; blob has ${files.length} loose files, ${groups.length} groups`);
const inGroup = new Int32Array(P.length).fill(-1);
for (const gr of groups) { const st = [gr]; while (st.length) { const x = st.pop()!; inGroup[x] = gr; for (const q of kids[x]) st.push(q); } }
let improving = 0, tried = 0, bestGain = 0;
const nbr: number[][] = Array.from({ length: n }, () => []); for (const [a, b] of prep.edges) { nbr[a].push(b); nbr[b].push(a); }
for (const f of files.slice(0, 300)) {
  const cand = new Map<number, number>(); for (const t of nbr[f]) if (inGroup[t] >= 0) cand.set(inGroup[t], (cand.get(inGroup[t]) ?? 0) + 1);
  const top = [...cand].sort((a, b) => b[1] - a[1]).slice(0, 3);
  let gained = false;
  for (const [gr] of top) { tried++; P[f] = gr; K[blob]--; K[gr]++; const s = score(); P[f] = blob; K[blob]++; K[gr]--; if (s < base - 1e-9) { gained = true; bestGain = Math.max(bestGain, base - s); } }
  if (gained) improving++;
}
console.log(`files with an improving move: ${improving}/${Math.min(300, files.length)} (tried ${tried} moves); best single gain ${bestGain.toExponential(2)}`);
