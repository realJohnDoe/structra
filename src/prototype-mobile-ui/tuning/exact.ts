// Exact optimal contraction of a dendrogram (tree-knapsack DP, O(n^4)): small repos only.
import fs from "node:fs";
import { prepare } from "../optimizer.ts";
import { Contraction } from "./survivors.ts";
import { runStrategy, STEPS, type Strategy } from "./strategies.ts";

export function exact(c: Contraction, lambda: number): Uint8Array {
  const { n, total, kids, I, cut, order } = c;
  const a = c.E ? lambda / c.E : 0, b = (1 - lambda) / n;
  const size = new Int32Array(total);
  for (let i = order.length - 1; i >= 0; i--) { const x = order[i]; size[x] = x < n ? 1 : size[kids[2 * x]] + size[kids[2 * x + 1]]; }
  const OPT = new Float64Array(total); const bestK = new Int32Array(total);
  const post = [...order].reverse();
  // h_k(v, j) for fixed k, computed bottom-up within x's subtree
  const solve = (x: number, k: number, keep?: Uint8Array) => {
    const lk = Math.log(k);
    const h = new Map<number, Float64Array>(); const choice = new Map<number, Int32Array>();
    const stack: number[] = []; const sub: number[] = [];
    stack.push(kids[2 * x], kids[2 * x + 1]);
    while (stack.length) { const v = stack.pop()!; sub.push(v); if (v >= n) stack.push(kids[2 * v], kids[2 * v + 1]); }
    for (let i = sub.length - 1; i >= 0; i--) {
      const v = sub[i]; const m = Math.min(size[v], k);
      const arr = new Float64Array(m + 1).fill(Infinity); const ch = new Int32Array(m + 1).fill(-1);
      if (v < n) { arr[1] = 0; } else {
        arr[1] = OPT[v] - a * lk * I[v]; ch[1] = 0;
        const A = h.get(kids[2 * v])!, B = h.get(kids[2 * v + 1])!;
        for (let j1 = 1; j1 < A.length; j1++) for (let j2 = 1; j2 < B.length && j1 + j2 <= m; j2++) { const s = A[j1] + B[j2]; if (s < arr[j1 + j2]) { arr[j1 + j2] = s; ch[j1 + j2] = j1; } }
      }
      h.set(v, arr); choice.set(v, ch);
    }
    const A = h.get(kids[2 * x])!, B = h.get(kids[2 * x + 1])!;
    let best = Infinity, bj = -1;
    for (let j1 = 1; j1 < A.length; j1++) { const j2 = k - j1; if (j2 >= 1 && j2 < B.length && A[j1] + B[j2] < best) { best = A[j1] + B[j2]; bj = j1; } }
    if (keep) { // reconstruct: mark survivors
      const mark = (v: number, j: number) => { if (v < n) return; const cj = choice.get(v)![j]; if (j === 1 && cj === 0) { keep[v] = 1; rec(v); return; } mark(kids[2 * v], cj); mark(kids[2 * v + 1], j - cj); };
      mark(kids[2 * x], bj); mark(kids[2 * x + 1], k - bj);
    }
    return best;
  };
  const rec = (x: number) => { solve(x, bestK[x], keepG); };
  let keepG: Uint8Array;
  for (const x of post) {
    if (x < n) continue;
    const A = a * (cut[x] + I[x]) + b; let best = Infinity, bk = 2;
    for (let k = 2; k <= size[x]; k++) { const v = A * Math.log(k) + solve(x, k); if (v < best) { best = v; bk = k; } }
    OPT[x] = best; bestK[x] = bk;
  }
  keepG = new Uint8Array(total); keepG[c.root] = 1; rec(c.root);
  return keepG;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = process.argv[2] ?? "flask";
  const prep = prepare(JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")));
  const c = new Contraction(prep.dendro, prep.edges);
  const marks = [10, 20, 30, 40, 50, 70, 100];
  const ex: Uint8Array[] = [];
  for (const i of marks) { const s = exact(c, STEPS[i]); ex.push(s); }
  const exCost = marks.map((i, j) => { c.setSurvivors(ex[j]); return c.cost(STEPS[i]).total; });
  console.log(r, "exact".padEnd(10), exCost.map((v) => v.toFixed(4)).join("  "), "groups", ex.map((s) => s.reduce((p, q) => p + q, 0)).join("/"));
  let nv = 0; for (let j = 0; j + 1 < ex.length; j++) for (let x = 0; x < ex[j].length; x++) if (ex[j][x] && !ex[j + 1][x]) nv++;
  console.log("  exact nesting violations across marks:", nv);
  for (const s of ["greedy", "sweepUp", "sweepDown"] as Strategy[]) {
    const sets = runStrategy(prep.dendro, prep.edges, s);
    console.log(" ", s.padEnd(10), marks.map((i, j) => { c.setSurvivors(sets[i]); return ("+" + ((c.cost(STEPS[i]).total / exCost[j] - 1) * 100).toFixed(2) + "%").padStart(7); }).join(" "));
  }
}
