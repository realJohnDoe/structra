// PROTOTYPE: alternative dendrogram builds. All agglomerative, binary, deterministic.
import type { Dendro } from "./survivors.ts";
export type Linkage = "parisSize" | "parisVol" | "cost";

export function build(n: number, edges: [number, number][], paths: string[], linkage: Linkage): Dendro {
  if (n === 1) return { n, parent: new Int32Array([-1]), children: [], root: 0 };
  const size = new Map<number, number>(), vol = new Map<number, number>(), cut = new Map<number, number>();
  const adj = new Map<number, Map<number, number>>();
  for (let i = 0; i < n; i++) { size.set(i, 1); vol.set(i, 0); cut.set(i, 0); adj.set(i, new Map()); }
  for (const [a, b] of edges) {
    adj.get(a)!.set(b, (adj.get(a)!.get(b) ?? 0) + 1); adj.get(b)!.set(a, (adj.get(b)!.get(a) ?? 0) + 1);
    vol.set(a, vol.get(a)! + 1); vol.set(b, vol.get(b)! + 1); cut.set(a, cut.get(a)! + 1); cut.set(b, cut.get(b)! + 1);
  }
  const parent = new Int32Array(2 * n - 1).fill(-1); const children: [number, number][] = []; let next = n;
  const merge = (a: number, b: number) => {
    const c = next++; parent[a] = c; parent[b] = c; children.push([a, b]);
    const wab = adj.get(a)!.get(b) ?? 0;
    size.set(c, size.get(a)! + size.get(b)!); vol.set(c, vol.get(a)! + vol.get(b)!); cut.set(c, cut.get(a)! + cut.get(b)! - 2 * wab);
    const m = new Map<number, number>();
    for (const src of [a, b]) for (const [k, w] of adj.get(src)!) { if (k === a || k === b) continue; m.set(k, (m.get(k) ?? 0) + w); adj.get(k)!.delete(src); }
    for (const [k, w] of m) adj.get(k)!.set(c, w);
    for (const x of [a, b]) { adj.delete(x); size.delete(x); vol.delete(x); cut.delete(x); }
    adj.set(c, m);
  };
  const score = (a: number, b: number, w: number, k: number) => {
    if (linkage === "parisSize") return w / (size.get(a)! * size.get(b)!);
    if (linkage === "parisVol") return w / (vol.get(a)! * vol.get(b)!);
    // cost: −Δ(edge term) of combining a,b under a flat root with k children (pair-dependent part)
    return w * Math.log(2 * (k - 1)) - Math.LN2 * (cut.get(a)! + cut.get(b)!);
  };
  for (;;) {
    let best = -Infinity, ba = -1, bb = -1; const k = size.size;
    for (const [a, m] of adj) for (const [b, w] of m) { if (b <= a) continue; const s = score(a, b, w, k); if (s > best) { best = s; ba = a; bb = b; } }
    if (ba < 0) break;
    merge(ba, bb);
  }
  const firstPath = (x: number): string => { while (x >= n) x = children[x - n][0]; return paths[x]; };
  let rest = [...size.keys()];
  while (rest.length > 1) {
    rest.sort((x, y) => size.get(x)! - size.get(y)! || firstPath(x).localeCompare(firstPath(y)));
    merge(rest[0], rest[1]); rest = [...size.keys()];
  }
  return { n, parent, children, root: next - 1 };
}
