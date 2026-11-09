import fs from "node:fs";
import { prepare, optimalTree, type OTNode } from "../optimizer.ts";
const repos = process.argv.slice(2);
for (const r of repos.length ? repos : ["requests", "flask", "django"]) {
  const g = JSON.parse(fs.readFileSync(`public/prototype-examples/${r}.graph.json`, "utf8"));
  const prep = prepare(g);
  console.log(`== ${r} N=${g.nodes.length} E=${prep.edges.length}`);
  for (const l of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
    const t = optimalTree(prep, l);
    const internals: OTNode[] = [];
    const walk = (n: OTNode) => { if (n.leafIndex < 0) { internals.push(n); n.children.forEach(walk); } };
    walk(t.root);
    let chain = 0, binary = 0;
    for (const n of internals) {
      if (n.children.length === 2) binary++;
      const big = Math.max(...n.children.map((c) => c.leaves.length));
      if (n.children.some((c) => c.leafIndex < 0 && c.leaves.length >= 0.8 * n.leaves.length)) chain++;
    }
    const rootKids = t.root.children.map((c) => c.leaves.length).sort((a, b) => b - a);
    console.log(`λ=${l.toFixed(1)} cost=${t.total.toFixed(4)} groups=${t.groups} depth=${t.maxDepth} binary=${binary} chainLinks=${chain} root=[${rootKids.slice(0, 6).join(",")}${rootKids.length > 6 ? `,…(${rootKids.length})` : ""}]`);
  }
}
