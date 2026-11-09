import fs from "node:fs";
import { prepare, optimalTree } from "../optimizer.ts";
import { Contraction, type Dendro } from "./survivors.ts";

export type Strategy = "greedy" | "divisive" | "local" | "sweepUp" | "sweepDown";
export const STEPS = Array.from({ length: 101 }, (_, i) => i / 100);

// Survivor sets for all 101 λ steps.
export function runStrategy(d: Dendro, edges: [number, number][], s: Strategy): Uint8Array[] {
  const c = new Contraction(d, edges);
  const out: Uint8Array[] = new Array(101);
  if (s === "sweepUp") { c.flat(); for (let i = 0; i <= 100; i++) { c.descend(STEPS[i], "add"); out[i] = c.surv.slice(); } return out; }
  if (s === "sweepDown") { c.full(); for (let i = 100; i >= 0; i--) { c.descend(STEPS[i], "remove"); out[i] = c.surv.slice(); } return out; }
  for (let i = 0; i <= 100; i++) {
    const l = STEPS[i];
    if (s === "greedy") { c.full(); c.descend(l, "remove"); }
    else if (s === "divisive") { c.flat(); c.descend(l, "add"); }
    else { c.full(); c.descend(l, "remove"); const g = c.surv.slice(), gc = c.cost(l).total; c.flat(); c.descend(l, "add"); if (gc < c.cost(l).total) c.setSurvivors(g); c.descend(l, "both"); }
    out[i] = c.surv.slice();
  }
  return out;
}

export function report(name: string, d: Dendro, edges: [number, number][], sets: Uint8Array[], marks = [10, 20, 30, 40, 50, 70, 100]) {
  const c = new Contraction(d, edges);
  let viol = 0;
  for (let i = 0; i < 100; i++) for (let x = 0; x < sets[i].length; x++) if (sets[i][x] && !sets[i + 1][x]) viol++;
  const groups = sets.map((s) => s.reduce((a, b) => a + b, 0));
  let mono = 0; for (let i = 0; i < 100; i++) if (groups[i] > groups[i + 1]) mono++;
  const costs = marks.map((i) => { c.setSurvivors(sets[i]); return c.cost(STEPS[i]).total; });
  return { name, viol, mono, groups: marks.map((i) => groups[i]), costs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = process.argv[2] ?? "flask";
  const prep = prepare(JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8")));
  // sanity: greedy at 0.45 matches optimizer.ts
  const c = new Contraction(prep.dendro, prep.edges).full(); c.descend(0.45, "remove");
  console.log("check", c.cost(0.45).total.toFixed(6), optimalTree(prep, 0.45).total.toFixed(6));
  const rows = (["greedy", "divisive", "local", "sweepUp", "sweepDown"] as Strategy[]).map((s) => { const t = Date.now(); const rep = report(s, prep.dendro, prep.edges, runStrategy(prep.dendro, prep.edges, s)); return { ...rep, ms: Date.now() - t }; });
  const marks = [10, 20, 30, 40, 50, 70, 100];
  console.log(`${r}: cost at λ = ${marks.map((m) => (m / 100).toFixed(1)).join(" / ")}`);
  for (const row of rows) {
    console.log(row.name.padEnd(10), row.costs.map((v, j) => { const best = Math.min(...rows.map((q) => q.costs[j])); return v.toFixed(4) + (v - best < 1e-9 ? "*" : " "); }).join(" "), `| groups ${row.groups.join("/")} | nest-viol ${row.viol} | ${row.ms}ms`);
  }
}
