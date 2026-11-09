// PROTOTYPE (throwaway, ticket "Simplified mobile UI"): a quick stand-in for the
// real optimizer from ADR 0002, just good enough to put realistic Optimal Trees
// in front of the UI variants. No worker, no tests, no determinism guarantees.
//
// 1. buildDendrogram: Paris-style agglomeration (merge the pair with max
//    w(a,b) / (|a|·|b|)), then merge leftover components smallest-first.
// 2. contract(λ): greedily contract dendrogram nodes into their parent while the
//    closed-form ΔTotal Cost (ADR 0001) is < −ε.
//
// Closed form: contracting child c into parent p, with X(n) = #edges crossing n
// and L(n) = #edges whose LCA is n, kp' = kp + kc − 1:
//   Δnode = ln kp' − ln kp − ln kc
//   Δedge = X(p)(ln kp' − ln kp) − X(c) ln kc + L(c) ln kp'
//   then X(p) += L(c), L(p) += L(c).
//
// Ticket "Tune the mapping from Dependency Graph to Optimal Tree" adds switchable
// options (see OptimizerOptions): the dendrogram linkage, contraction as a sweep along
// λ (nested by construction), and display-only folder groups for loose files.

export interface GraphFile {
  meta: {
    repo: string;
    commit: string;
    language: string;
    parser: { name: string };
  };
  nodes: string[];
  edges: [string, string][];
}

export interface Dendrogram {
  n: number; // leaves are 0..n-1, internal n..2n-2
  parent: Int32Array; // per node, -1 for root
  children: [number, number][]; // per internal node (index - n)
  root: number;
}

export interface OTNode {
  id: number;
  children: OTNode[];
  parent: OTNode | null;
  leafIndex: number; // -1 for internal
  leaves: number[]; // file indices below
  depth: number;
  label: string; // groups: own folder ("json/") or "{hub, hub}"; files: last two path segments
  sublabel: string;
  prefix: string; // deepest folder containing every file below
  hubs: string[]; // groups: most-imported files inside, short names
  internalEdges: number; // edges with both ends inside
  edgesIn: number; // edges from outside into this group
  edgesOut: number; // edges from this group to outside
  crossings: number; // X: edges whose path crosses this node (internal only)
  costShare: number; // λ-weighted share of Total Cost paid at this node
  synthetic?: boolean; // display-only folder bundle of loose files (not an Optimal Tree group)
}

export interface OptimalTree {
  root: OTNode;
  lambda: number;
  total: number;
  edgeTerm: number; // nats per dependency
  nodeTerm: number; // nats per file
  groups: number; // internal nodes
  maxDepth: number;
  byLeaf: OTNode[];
}

import { build as buildLinkage, type Linkage } from "./tuning/dendro.ts";
import { Contraction } from "./tuning/survivors.ts";

export interface OptimizerOptions {
  linkage: Linkage; // dendrogram merge rule
  contraction: "greedy" | "sweep"; // greedy per λ (ADR 0002 as written) or one sweep up λ = 0 → 1 with split-only moves
  looseByFolder: boolean; // display-only: bundle a group's loose files by folder
}
export const DEFAULT_OPTIONS: OptimizerOptions = { linkage: "parisVol", contraction: "sweep", looseByFolder: false };

export interface Prepared {
  opts: OptimizerOptions;
  sweep: Uint8Array[] | null; // survivor sets for the 101 λ steps (contraction "sweep")
  synthParent: Map<number, number>; // display-only folder group id → its real parent id

  graph: GraphFile;
  index: Map<string, number>;
  edges: [number, number][];
  out: number[][];
  inn: number[][];
  dendro: Dendrogram;
  cache: Map<number, OptimalTree>;
}

export function prepare(graph: GraphFile, opts: OptimizerOptions = DEFAULT_OPTIONS): Prepared {
  const index = new Map<string, number>();
  graph.nodes.forEach((p, i) => index.set(p, i));
  const edges: [number, number][] = [];
  for (const [a, b] of graph.edges) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia !== undefined && ib !== undefined && ia !== ib) edges.push([ia, ib]);
  }
  const n = graph.nodes.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  const inn: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    out[a].push(b);
    inn[b].push(a);
  }
  const dendro = opts.linkage === "parisSize" ? buildDendrogram(n, edges, graph.nodes) : buildLinkage(n, edges, graph.nodes, opts.linkage);
  return { opts, sweep: null, synthParent: new Map(), graph, index, edges, out, inn, dendro, cache: new Map() };
}

function buildDendrogram(n: number, edges: [number, number][], paths: string[]): Dendrogram {
  if (n === 1) return { n, parent: new Int32Array([-1]), children: [], root: 0 };
  const size = new Map<number, number>();
  const adj = new Map<number, Map<number, number>>();
  for (let i = 0; i < n; i++) {
    size.set(i, 1);
    adj.set(i, new Map());
  }
  for (const [a, b] of edges) {
    const ma = adj.get(a)!;
    const mb = adj.get(b)!;
    ma.set(b, (ma.get(b) ?? 0) + 1);
    mb.set(a, (mb.get(a) ?? 0) + 1);
  }
  const parent = new Int32Array(2 * n - 1).fill(-1);
  const children: [number, number][] = [];
  let next = n;

  const merge = (a: number, b: number) => {
    const c = next++;
    parent[a] = c;
    parent[b] = c;
    children.push([a, b]);
    size.set(c, size.get(a)! + size.get(b)!);
    const m = new Map<number, number>();
    for (const src of [a, b]) {
      for (const [k, w] of adj.get(src)!) {
        if (k === a || k === b) continue;
        m.set(k, (m.get(k) ?? 0) + w);
        const mk = adj.get(k)!;
        mk.delete(src);
      }
    }
    for (const [k, w] of m) adj.get(k)!.set(c, w);
    adj.delete(a);
    adj.delete(b);
    size.delete(a);
    size.delete(b);
    adj.set(c, m);
  };

  // Paris-style agglomeration on the connected parts. Scanning all pairs each
  // step is O(E) per merge; fine for a few thousand files.
  for (;;) {
    let best = -1;
    let ba = -1;
    let bb = -1;
    for (const [a, m] of adj) {
      const sa = size.get(a)!;
      for (const [b, w] of m) {
        if (b <= a) continue;
        const s = w / (sa * size.get(b)!);
        if (s > best) {
          best = s;
          ba = a;
          bb = b;
        }
      }
    }
    if (ba < 0) break;
    merge(ba, bb);
  }

  // Remaining components (incl. isolated files): merge smallest first, ties by
  // the first path below them so isolated files of one folder stay together.
  const firstPath = (x: number): string => {
    while (x >= n) x = children[x - n][0];
    return paths[x];
  };
  let rest = [...size.keys()];
  while (rest.length > 1) {
    rest.sort((x, y) => size.get(x)! - size.get(y)! || firstPath(x).localeCompare(firstPath(y)));
    const [a, b] = rest;
    merge(a, b);
    rest = [...size.keys()];
  }
  return { n, parent, children, root: next - 1 };
}

const EPS = 1e-9;

export function optimalTree(prep: Prepared, lambdaRaw: number): OptimalTree {
  const lambda = Math.round(lambdaRaw * 100) / 100;
  const hit = prep.cache.get(lambda);
  if (hit) return hit;
  const t = contract(prep, lambda);
  prep.cache.set(lambda, t);
  return t;
}

// One sweep up λ: start flat, at each of the 101 steps take improving split moves
// (re-introduce a dendrogram node) until none is left. Trees are nested by construction.
function sweepSets(prep: Prepared): Uint8Array[] {
  const c = new Contraction(prep.dendro, prep.edges).flat();
  const sets: Uint8Array[] = [];
  for (let i = 0; i <= 100; i++) {
    c.descend(i / 100, "add");
    sets.push(c.surv.slice());
  }
  return sets;
}

function contract(prep: Prepared, lambda: number): OptimalTree {
  const { dendro, edges } = prep;
  const n = dendro.n;
  const total = 2 * n - 1;
  const N = n;
  const E = edges.length;
  const wE = E > 0 ? lambda / E : 0;
  const wN = (1 - lambda) / N;
  if (prep.opts.contraction === "sweep" && n > 1) {
    if (!prep.sweep) prep.sweep = sweepSets(prep);
    const c = new Contraction(dendro, edges).setSurvivors(prep.sweep[Math.round(lambda * 100)]);
    const { kids } = c.tree();
    const X = new Float64Array(total);
    for (let x = n; x < total; x++) if (c.surv[x]) X[x] = c.X(x);
    return materialize(prep, lambda, kids, X, wE, wN);
  }

  // Mutable tree over dendrogram node ids.
  const par = Int32Array.from(dendro.parent);
  const kids: number[][] = Array.from({ length: total }, (_, i) => (i >= n ? [...dendro.children[i - n]] : []));
  const alive = new Uint8Array(total).fill(1);
  const X = new Float64Array(total);
  const L = new Float64Array(total);
  const depth = new Int32Array(total);
  {
    const stack = [dendro.root];
    while (stack.length) {
      const x = stack.pop()!;
      for (const c of kids[x]) {
        depth[c] = depth[x] + 1;
        stack.push(c);
      }
    }
  }
  for (const [a0, b0] of edges) {
    let a = par[a0];
    let b = par[b0];
    while (a !== b) {
      if (depth[a] >= depth[b]) {
        X[a]++;
        a = par[a];
      } else {
        X[b]++;
        b = par[b];
      }
    }
    X[a]++;
    L[a]++;
  }

  const delta = (c: number): number => {
    const p = par[c];
    const kp = kids[p].length;
    const kc = kids[c].length;
    const kp2 = kp + kc - 1;
    const lp = Math.log(kp);
    const lc = Math.log(kc);
    const lp2 = Math.log(kp2);
    const dNode = lp2 - lp - lc;
    const dEdge = X[p] * (lp2 - lp) - X[c] * lc + L[c] * lp2;
    return wE * dEdge + wN * dNode;
  };

  // Greedy: repeatedly take the most negative Δ. A simple O(#internal) scan per
  // step; good enough for the prototype's example sizes.
  const internal: number[] = [];
  for (let i = n; i < total; i++) if (i !== dendro.root) internal.push(i);
  for (;;) {
    let best = -EPS;
    let bc = -1;
    for (const c of internal) {
      if (!alive[c]) continue;
      const d = delta(c);
      if (d < best || (d === best && bc >= 0 && c < bc)) {
        best = d;
        bc = c;
      }
    }
    if (bc < 0) break;
    const p = par[bc];
    alive[bc] = 0;
    const pk = kids[p];
    const pos = pk.indexOf(bc);
    pk.splice(pos, 1, ...kids[bc]);
    for (const g of kids[bc]) par[g] = p;
    X[p] += L[bc];
    L[p] += L[bc];
  }

  return materialize(prep, lambda, kids, X, wE, wN);
}

function materialize(prep: Prepared, lambda: number, kids: number[][], X: Float64Array, wE: number, wN: number): OptimalTree {
  const n = prep.dendro.n;
  const N = n;
  const E = prep.edges.length;
  const dendro = prep.dendro;
  // Materialize, collapsing single-child internal nodes (none should exist).
  const byLeaf: OTNode[] = new Array(n);
  const paths = prep.graph.nodes;
  let groups = 0;
  let maxDepth = 0;
  let nodeSum = 0;
  let edgeSum = 0;
  const build = (x: number, parent: OTNode | null, d: number): OTNode => {
    const node: OTNode = {
      id: x,
      children: [],
      parent,
      leafIndex: x < n ? x : -1,
      leaves: [],
      depth: d,
      label: "",
      sublabel: "",
      prefix: "",
      hubs: [],
      internalEdges: 0,
      edgesIn: 0,
      edgesOut: 0,
      crossings: x >= n ? X[x] : 0,
      costShare: 0,
    };
    maxDepth = Math.max(maxDepth, d);
    if (x < n) {
      node.leaves = [x];
      byLeaf[x] = node;
      return node;
    }
    groups++;
    const k = kids[x].length;
    nodeSum += Math.log(k);
    edgeSum += X[x] * Math.log(k);
    node.costShare = wE * X[x] * Math.log(k) + wN * Math.log(k);
    node.children = kids[x].map((c) => build(c, node, d + 1));
    // Groups first, then files; bigger first; then by label.
    for (const c of node.children) node.leaves.push(...c.leaves);
    return node;
  };
  const root = build(dendro.root, null, 0);
  if (prep.opts.looseByFolder) {
    bundleLooseFiles(prep, root);
    const deepest = (x: OTNode): number => (x.children.length ? Math.max(...x.children.map(deepest)) : x.depth);
    maxDepth = deepest(root);
  }

  // Stats + labels, bottom-up.
  const inGroup = new Int32Array(n);
  const stats = (node: OTNode) => {
    node.children.forEach(stats);
    let stamp = node.id + 1;
    for (const l of node.leaves) inGroup[l] = stamp;
    let internalEdges = 0;
    let edgesOut = 0;
    let edgesIn = 0;
    for (const l of node.leaves) {
      for (const t of prep.out[l]) {
        if (inGroup[t] === stamp) internalEdges++;
        else edgesOut++;
      }
      for (const s of prep.inn[l]) if (inGroup[s] !== stamp) edgesIn++;
    }
    node.internalEdges = internalEdges;
    node.edgesIn = edgesIn;
    node.edgesOut = edgesOut;
    labelNode(node, paths, prep);
    stamp = 0;
  };
  stats(root);
  finishLabels(root, paths);
  sortTree(root);

  return {
    root,
    lambda,
    total: (E > 0 ? lambda * (edgeSum / E) : 0) + (1 - lambda) * (nodeSum / N),
    edgeTerm: E > 0 ? edgeSum / E : 0,
    nodeTerm: nodeSum / N,
    groups,
    maxDepth,
    byLeaf,
  };
}

function sortTree(node: OTNode) {
  node.children.sort(
    (a, b) =>
      Number(a.leafIndex >= 0) - Number(b.leafIndex >= 0) ||
      b.leaves.length - a.leaves.length ||
      a.label.localeCompare(b.label),
  );
  node.children.forEach(sortTree);
}

// Labels for synthetic groups (an open question on the map). Groups have no
// names of their own, so: if the group has a folder of its own (its common folder
// is deeper than its parent's), use that folder, e.g. "json/". Otherwise name it
// as a set by its two most-imported files, e.g. "{app, ctx}".
const shortName = (path: string) => {
  const parts = path.replace(/\/(__init__|index|mod|lib)\.\w+$/, "").replace(/\.\w+$/, "").split("/");
  return parts[parts.length - 1];
};

function labelNode(node: OTNode, paths: string[], prep: Prepared) {
  if (node.leafIndex >= 0) {
    const p = paths[node.leafIndex];
    node.label = p.split("/").slice(-2).join("/");
    node.sublabel = p;
    node.prefix = p.split("/").slice(0, -1).join("/");
    return;
  }
  const first = paths[node.leaves[0]].split("/");
  let common = first.length - 1;
  for (const l of node.leaves) {
    const parts = paths[l].split("/");
    let j = 0;
    while (j < common && j < parts.length - 1 && parts[j] === first[j]) j++;
    common = j;
  }
  node.prefix = first.slice(0, common).join("/");
  const set = new Set(node.leaves);
  const deg = node.leaves.map((l) => {
    let d = 0;
    for (const s of prep.inn[l]) if (set.has(s)) d++;
    return { l, d };
  });
  deg.sort((a, b) => b.d - a.d || (paths[a.l] < paths[b.l] ? -1 : 1));
  const hubs: string[] = [];
  for (const { l } of deg) {
    const nm = shortName(paths[l]);
    if (!hubs.includes(nm)) hubs.push(nm);
    if (hubs.length === 2) break;
  }
  node.hubs = hubs;
}

function finishLabels(node: OTNode, paths: string[]) {
  if (node.leafIndex < 0 && !node.parent) {
    // The root is the group of every file, not the repository's root directory.
    node.label = `All ${node.leaves.length} files`;
    node.sublabel = "The root of the Optimal Tree: the group of every file. Its children are the top-level split.";
  } else if (node.synthetic) {
    node.label = `${node.prefix.split("/").pop() || "(repo root)"}/ (folder)`;
    node.sublabel = `Display only, not a group of the Optimal Tree: ${node.leaves.length} loose files of the parent group that share the folder ${node.prefix || "(repo root)"}/. The objective doesn't care how these are arranged.`;
  } else if (node.leafIndex < 0) {
    const parentPrefix = node.parent ? node.parent.prefix : null;
    const ownFolder = node.prefix && node.prefix !== parentPrefix;
    const set = `{${node.hubs.join(", ")}${node.leaves.length > node.hubs.length ? ", …" : ""}}`;
    node.label = ownFolder ? `${node.prefix.split("/").pop()}/` : set;
    node.sublabel = `Group of ${node.leaves.length} files${ownFolder ? ` · most imported: ${node.hubs.join(", ")}` : ""} · all under ${node.prefix ? node.prefix + "/" : "the repo root"}`;
  }
  void paths;
  node.children.forEach((c) => finishLabels(c, paths));
}

export function fileName(prep: Prepared, i: number) {
  return prep.graph.nodes[i];
}

// Display-only (not part of the Optimal Tree, costs nothing): inside a group with
// many loose files, bundle the loose files that share a folder into a pseudo group.
// The objective is indifferent to how a flat star's leaves are arranged, so the
// directory is used purely as a reading aid.
const LOOSE_MIN = 6; // bundle only in groups with at least this many loose files
const BUNDLE_MIN = 3; // a folder bundle needs at least this many files
function bundleLooseFiles(prep: Prepared, root: OTNode) {
  const paths = prep.graph.nodes;
  prep.synthParent.clear();
  let nextId = 2 * prep.dendro.n - 1;
  const folderOf = (i: number) => paths[i].split("/").slice(0, -1).join("/");
  const visit = (node: OTNode) => {
    node.children.forEach(visit);
    if (node.leafIndex >= 0) return;
    const files = node.children.filter((c) => c.leafIndex >= 0);
    if (files.length < LOOSE_MIN) return;
    const byFolder = new Map<string, OTNode[]>();
    for (const f of files) {
      const k = folderOf(f.leafIndex);
      byFolder.set(k, [...(byFolder.get(k) ?? []), f]);
    }
    if (byFolder.size < 2) return; // all in one folder: a bundle would just rename the group
    const keep = node.children.filter((c) => c.leafIndex < 0);
    for (const [folder, members] of [...byFolder].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (members.length < BUNDLE_MIN) {
        keep.push(...members);
        continue;
      }
      const g: OTNode = {
        id: nextId++, children: members, parent: node, leafIndex: -1, leaves: members.flatMap((m) => m.leaves),
        depth: node.depth + 1, label: "", sublabel: "", prefix: folder, hubs: [],
        internalEdges: 0, edgesIn: 0, edgesOut: 0, crossings: 0, costShare: 0, synthetic: true,
      };
      g.label = `${folder.split("/").pop() || "(repo root)"}/ ·`;
      for (const m of members) {
        m.parent = g;
        m.depth = g.depth + 1;
      }
      prep.synthParent.set(g.id, node.id);
      keep.push(g);
    }
    node.children = keep;
  };
  visit(root);
}
