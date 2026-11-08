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
  label: string;
  sublabel: string;
  internalEdges: number; // edges with both ends inside
  edgesIn: number; // edges from outside into this group
  edgesOut: number; // edges from this group to outside
  crossings: number; // X: edges whose path crosses this node (internal only)
  costShare: number; // λ-weighted share of Total Cost paid at this node
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

export interface Prepared {
  graph: GraphFile;
  index: Map<string, number>;
  edges: [number, number][];
  out: number[][];
  inn: number[][];
  dendro: Dendrogram;
  cache: Map<number, OptimalTree>;
}

export function prepare(graph: GraphFile): Prepared {
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
  return { graph, index, edges, out, inn, dendro: buildDendrogram(n, edges, graph.nodes), cache: new Map() };
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

function contract(prep: Prepared, lambda: number): OptimalTree {
  const { dendro, edges } = prep;
  const n = dendro.n;
  const total = 2 * n - 1;
  const N = n;
  const E = edges.length;

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

  const wE = E > 0 ? lambda / E : 0;
  const wN = (1 - lambda) / N;
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

// Labels for synthetic groups (an open question on the map): the deepest folder
// that contains every file, plus the group's most-imported file as a hint.
function labelNode(node: OTNode, paths: string[], prep: Prepared) {
  if (node.leafIndex >= 0) {
    const p = paths[node.leafIndex];
    node.label = p.split("/").slice(-2).join("/");
    node.sublabel = p;
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
  const prefix = first.slice(0, common).join("/");
  let hub = node.leaves[0];
  let hubDeg = -1;
  const set = new Set(node.leaves);
  for (const l of node.leaves) {
    let d = 0;
    for (const s of prep.inn[l]) if (set.has(s)) d++;
    if (d > hubDeg || (d === hubDeg && paths[l] < paths[hub])) {
      hub = l;
      hubDeg = d;
    }
  }
  // "views ⋯ flask/" = group around views.py, all files under …/flask/.
  const hubParts = paths[hub].replace(/\/(__init__|index|mod|lib)\.\w+$/, "").replace(/\.\w+$/, "").split("/");
  const hubName = hubParts[hubParts.length - 1];
  const lastDir = prefix.split("/").pop();
  node.label = lastDir && lastDir !== hubName ? `${hubName} · ${lastDir}/` : `${hubName}`;
  node.sublabel = `around ${paths[hub]} · all under ${prefix ? prefix + "/" : "the repo root"}`;
}

export function fileName(prep: Prepared, i: number) {
  return prep.graph.nodes[i];
}
