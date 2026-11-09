// PROTOTYPE (throwaway, ticket "Keep loading and λ updates interactive on a phone"):
// time each phase of load and λ update in Node. Usage: node src/prototype-mobile-ui/perf/bench.ts react
import fs from "node:fs";
import { prepare, optimalTree, type GraphFile } from "../optimizer.ts";
import { Contraction } from "../tuning/survivors.ts";

const repo = process.argv[2] ?? "react";
const t = () => performance.now();
let t0 = t();
const txt = fs.readFileSync(`public/prototype-examples/${repo}.graph.json`, "utf8");
const g = JSON.parse(txt) as GraphFile;
const tParse = t() - t0;
t0 = t(); const prep = prepare(g); const tDendro = t() - t0;
const n = prep.dendro.n;
// sweep, counting moves and refreshes
t0 = t();
const c = new Contraction(prep.dendro, prep.edges).flat();
let moves = 0; const sets: Uint8Array[] = []; const perStep: number[] = [];
for (let i = 0; i <= 100; i++) { const s = t(); moves += c.descend(i / 100, "add"); perStep.push(t() - s); sets.push(c.surv.slice()); }
const tSweep = t() - t0;
prep.sweep = sets;
// per-step materialization (stats, labels), uncached
const mat: number[] = [];
for (let i = 0; i <= 100; i++) { prep.cache.clear(); const s = t(); optimalTree(prep, i / 100); mat.push(t() - s); }
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
const survivors = sets.map((s) => s.reduce((a, b) => a + b, 0));
console.log(JSON.stringify({ repo, files: n, edges: prep.edges.length, parseMs: +tParse.toFixed(1), dendroMs: +tDendro.toFixed(0),
  sweepMs: +tSweep.toFixed(0), moves, sweepStepMaxMs: +Math.max(...perStep).toFixed(1),
  materializeMedMs: +q(mat, 0.5).toFixed(1), materializeMaxMs: +Math.max(...mat).toFixed(1),
  groupsAt045: survivors[45], groupsAt1: survivors[100] }));
