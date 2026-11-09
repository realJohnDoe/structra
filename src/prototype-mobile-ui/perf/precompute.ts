// PROTOTYPE (throwaway, ticket "Keep loading and λ updates interactive on a phone"):
// the offline artifacts the "shipped" pipeline loads. The sweep only ever adds nodes,
// so its 101 survivor sets compress to one birth step per dendrogram node (255 = never).
// Usage: node src/prototype-mobile-ui/perf/precompute.ts django react
import fs from "node:fs";
import { prepare, type GraphFile } from "../optimizer.ts";
import { Contraction } from "../tuning/survivors.ts";

for (const repo of process.argv.slice(2)) {
  const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${repo}.graph.json`, "utf8")) as GraphFile;
  const prep = prepare(g);
  const d = prep.dendro;
  const c = new Contraction(d, prep.edges).flat();
  const birth = new Array<number>(2 * d.n - 1).fill(255);
  birth[d.root] = 0;
  for (let i = 0; i <= 100; i++) {
    c.descend(i / 100, "add");
    for (let x = d.n; x < 2 * d.n - 1; x++) if (c.surv[x] && birth[x] === 255) birth[x] = i;
  }
  const out = { parent: Array.from(d.parent), children: d.children, root: d.root, birth };
  fs.writeFileSync(`public/prototype-examples/${repo}.perf.json`, JSON.stringify(out));
  console.log(repo, (fs.statSync(`public/prototype-examples/${repo}.perf.json`).size / 1024).toFixed(0), "KiB");
}
