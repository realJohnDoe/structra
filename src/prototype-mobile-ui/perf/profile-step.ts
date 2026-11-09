// PROTOTYPE (throwaway): where does one λ step's materialization spend its time?
// Usage: node src/prototype-mobile-ui/perf/profile-step.ts react
import fs from "node:fs";
import { prepare, optimalTree, type GraphFile } from "../optimizer.ts";
import { Contraction } from "../tuning/survivors.ts";
const repo = process.argv[2] ?? "react";
const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${repo}.graph.json`, "utf8")) as GraphFile;
const art = JSON.parse(fs.readFileSync(`public/prototype-examples/${repo}.perf.json`, "utf8"));
const n = g.nodes.length;
const prep = prepare(g, undefined, { n, parent: Int32Array.from(art.parent), children: art.children, root: art.root });
prep.sweep = Array.from({ length: 101 }, (_, i) => Uint8Array.from(art.birth, (b: number, x: number) => (x >= n && b <= i ? 1 : 0)));
const T = (f: () => void, k = 30) => { for (let i = 0; i < 5; i++) f(); const t0 = performance.now(); for (let i = 0; i < k; i++) f(); return (performance.now() - t0) / k; };
const s = prep.sweep[45];
const ctor = T(() => new Contraction(prep.dendro, prep.edges));
const c = new Contraction(prep.dendro, prep.edges);
const tree = T(() => c.setSurvivors(s).tree());
const full = T(() => { prep.cache.clear(); optimalTree(prep, 0.45); });
console.log({ repo, ctorMs: ctor.toFixed(1), treeMs: tree.toFixed(1), fullStepMs: full.toFixed(1), restMaterializeMs: (full - ctor - tree).toFixed(1) });
