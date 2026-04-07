export type NodeId = string;

export type GraphNode = {
  id: NodeId;
  name: string;
  mentions: Set<NodeId>;
};

export type NodeMap = Record<NodeId, GraphNode>;

export type GraphEdge = { from: string; to: string };

export type TreeNode = {
  name: string;
  isDir: boolean;
  unnamed?: boolean;
  nodeId?: string;
  children: TreeNode[];
};

type LayoutNode = { id: string; type: string; label: string; members?: string[]; origId?: string };

export type ComputeData = {
  ids: string[];
  cutVertices: Set<string>;
  blocks: string[][];
  bcChainGroups: { cNodes: string[]; leafOrigIds: string[]; runCIds: string[] }[];
  bcNodes: LayoutNode[];
  bcEdges: GraphEdge[];
  collNodes: LayoutNode[];
  collEdges: GraphEdge[];
  superComponents: string[][];
  superAdj: Map<string, Set<string>>;
  origToSuper: Map<string, string>;
  centroidSupers: Set<string>;
};

export const PRESETS: Record<string, { nodeNames: string[]; edges: [string, string][] }> = {
  "star+chain": {
    nodeNames: ["center", "a", "b", "c", "d", "e", "f", "g"],
    edges: [
      ["center", "a"],
      ["center", "b"],
      ["center", "c"],
      ["center", "d"],
      ["d", "e"],
      ["e", "f"],
      ["f", "g"],
    ],
  },
  "two stars": {
    nodeNames: ["hub1", "hub2", "a", "b", "c", "d", "e", "f", "bridge"],
    edges: [
      ["hub1", "a"],
      ["hub1", "b"],
      ["hub1", "c"],
      ["hub1", "bridge"],
      ["hub2", "d"],
      ["hub2", "e"],
      ["hub2", "f"],
      ["hub2", "bridge"],
    ],
  },
  "triangle+chain": {
    nodeNames: ["x", "y", "z", "p", "q", "r"],
    edges: [
      ["x", "y"],
      ["y", "z"],
      ["z", "x"],
      ["x", "p"],
      ["p", "q"],
      ["q", "r"],
    ],
  },
  "auth+plotting": {
    nodeNames: ["auth", "plotting", "deployment", "login", "register", "token", "chart", "render", "config"],
    edges: [
      ["login", "auth"],
      ["register", "auth"],
      ["token", "auth"],
      ["chart", "plotting"],
      ["render", "plotting"],
      ["render", "chart"],
      ["config", "deployment"],
    ],
  },
  "biconn+chains": {
    nodeNames: ["a1", "b1", "c1", "hub1", "x", "y", "hub2", "a2", "b2", "c2"],
    edges: [
      ["a1", "hub1"],
      ["b1", "hub1"],
      ["c1", "hub1"],
      ["hub1", "x"],
      ["hub1", "y"],
      ["x", "hub2"],
      ["y", "hub2"],
      ["x", "y"],
      ["hub2", "a2"],
      ["hub2", "b2"],
      ["hub2", "c2"],
    ],
  },
  "single universal hub": {
    nodeNames: ["hub", "alpha", "beta", "gamma", "delta", "epsilon"],
    edges: [
      ["hub", "alpha"],
      ["hub", "beta"],
      ["hub", "gamma"],
      ["hub", "delta"],
      ["hub", "epsilon"],
      ["alpha", "beta"],
      ["beta", "gamma"],
      ["delta", "epsilon"],
      ["alpha", "epsilon"],
    ],
  },
  complex: {
    nodeNames: ["p", "q", "r", "s1", "s2", "A", "B", "t", "c1", "c2", "c3", "c4", "end"],
    edges: [
      ["p", "q"],
      ["q", "r"],
      ["r", "s1"],
      ["s1", "s2"],
      ["s2", "A"],
      ["s2", "B"],
      ["s2", "t"],
      ["A", "B"],
      ["A", "t"],
      ["B", "t"],
      ["t", "c1"],
      ["c1", "c2"],
      ["c2", "c3"],
      ["c3", "c4"],
      ["c4", "end"],
    ],
  },
};

export function createNodeMap(): NodeMap {
  return {};
}

export function cloneNodeMap(nodes: NodeMap): NodeMap {
  const out: NodeMap = {};
  Object.values(nodes).forEach((n) => {
    out[n.id] = { id: n.id, name: n.name, mentions: new Set(n.mentions) };
  });
  return out;
}

function findBlocks(nodes: NodeMap, ids: string[], idSet: Set<string>) {
  const disc: Record<string, number> = {};
  const low: Record<string, number> = {};
  const parent: Record<string, string | undefined> = {};
  const cuts = new Set<string>();
  const edgeStack: [string, string][] = [];
  const blocks: string[][] = [];
  let timer = 0;
  ids.forEach((id) => (disc[id] = -1));

  function popBlock(u: string, v: string) {
    const comp = new Set<string>();
    while (edgeStack.length) {
      const [a, b] = edgeStack[edgeStack.length - 1];
      edgeStack.pop();
      comp.add(a);
      comp.add(b);
      if (a === u && b === v) break;
    }
    if (comp.size) blocks.push([...comp]);
  }

  function dfs(u: string) {
    disc[u] = low[u] = timer++;
    let children = 0;
    for (const v of [...nodes[u].mentions].filter((m) => idSet.has(m))) {
      if (disc[v] === -1) {
        children++;
        parent[v] = u;
        edgeStack.push([u, v]);
        dfs(v);
        low[u] = Math.min(low[u], low[v]);
        const isRoot = parent[u] === undefined;
        if ((isRoot && children > 1) || (!isRoot && low[v] >= disc[u])) {
          cuts.add(u);
          popBlock(u, v);
        }
      } else if (v !== parent[u] && disc[v] < disc[u]) {
        low[u] = Math.min(low[u], disc[v]);
        edgeStack.push([u, v]);
      }
    }
  }

  for (const id of ids) {
    if (disc[id] !== -1) continue;
    parent[id] = undefined;
    dfs(id);
    if (edgeStack.length) {
      const comp = new Set<string>();
      while (edgeStack.length) {
        const [a, b] = edgeStack.pop()!;
        comp.add(a);
        comp.add(b);
      }
      if (comp.size) blocks.push([...comp]);
    }
  }
  return { cutVertices: cuts, blocks };
}

export function computeAll(nodes: NodeMap): ComputeData | null {
  const ids = Object.keys(nodes).filter((id) => nodes[id]);
  if (!ids.length) return null;
  const idSet = new Set(ids);
  const { cutVertices, blocks } = findBlocks(nodes, ids, idSet);

  const bcNodes: LayoutNode[] = [];
  const bcEdges: GraphEdge[] = [];
  cutVertices.forEach((id) => bcNodes.push({ id: `C:${id}`, type: "cut", label: nodes[id]?.name ?? id, origId: id }));
  blocks.forEach((b, i) => {
    const members = b.map((id) => nodes[id]?.name ?? id).sort().join(",");
    bcNodes.push({ id: `B:${i}`, type: "block", label: `{${members}}`, members: b });
    b.forEach((id) => {
      if (cutVertices.has(id)) bcEdges.push({ from: `C:${id}`, to: `B:${i}` });
    });
  });

  const bridgeBlockIds = new Set(blocks.map((_, i) => `B:${i}`).filter((_, i) => blocks[i].length === 2));
  const chainEligibleC = new Set<string>();
  bcNodes
    .filter((n) => n.type === "cut")
    .forEach((n) => {
      const adjBlocks = bcEdges
        .filter((e) => e.from === n.id || e.to === n.id)
        .map((e) => (e.from === n.id ? e.to : e.from));
      if (adjBlocks.every((bid) => bridgeBlockIds.has(bid)) && adjBlocks.length <= 2) chainEligibleC.add(n.id);
    });

  const cAdj = new Map<string, string[]>();
  chainEligibleC.forEach((cid) => cAdj.set(cid, []));
  blocks.forEach((b, i) => {
    if (!bridgeBlockIds.has(`B:${i}`)) return;
    const cutsInBlock = b.filter((id) => cutVertices.has(id));
    if (cutsInBlock.length !== 2) return;
    const [a, bb] = cutsInBlock;
    const ca = `C:${a}`;
    const cb = `C:${bb}`;
    if (!chainEligibleC.has(ca) || !chainEligibleC.has(cb)) return;
    if (!cAdj.get(ca)!.includes(cb)) cAdj.get(ca)!.push(cb);
    if (!cAdj.get(cb)!.includes(ca)) cAdj.get(cb)!.push(ca);
  });

  const bcChainGroups: { cNodes: string[]; leafOrigIds: string[]; runCIds: string[] }[] = [];
  const visitedC = new Set<string>();
  chainEligibleC.forEach((cid) => {
    if (visitedC.has(cid)) return;
    const run: string[] = [];
    const queue = [cid];
    visitedC.add(cid);
    while (queue.length) {
      const u = queue.shift()!;
      run.push(u);
      (cAdj.get(u) ?? [])
        .filter((v) => !visitedC.has(v))
        .forEach((v) => {
          visitedC.add(v);
          queue.push(v);
        });
    }
    if (run.length < 3) return;
    const cOrigIds = run.map((r) => r.slice(2));
    const leafOrigIds: string[] = [];
    const runSet = new Set(cOrigIds);
    blocks.forEach((b, i) => {
      if (!bridgeBlockIds.has(`B:${i}`)) return;
      const cutsInBlock = b.filter((id) => cutVertices.has(id));
      if (!cutsInBlock.some((id) => runSet.has(id))) return;
      b.filter((id) => !cutVertices.has(id)).forEach((id) => leafOrigIds.push(id));
    });
    bcChainGroups.push({ cNodes: cOrigIds, leafOrigIds, runCIds: run });
  });

  const origToSuper = new Map<string, string>();
  bcChainGroups.forEach((cg, i) => {
    const sid = `CG:${i}`;
    cg.cNodes.forEach((id) => origToSuper.set(id, sid));
    cg.leafOrigIds.forEach((id) => origToSuper.set(id, sid));
  });
  blocks.forEach((b, i) => {
    const bid = `B:${i}`;
    if (bridgeBlockIds.has(bid)) {
      b.filter((id) => !cutVertices.has(id)).forEach((id) => {
        if (!origToSuper.has(id)) origToSuper.set(id, bid);
      });
      return;
    }
    b.filter((id) => !cutVertices.has(id)).forEach((id) => origToSuper.set(id, bid));
  });
  cutVertices.forEach((id) => {
    if (!origToSuper.has(id)) origToSuper.set(id, `C:${id}`);
  });
  ids.forEach((id) => {
    if (!origToSuper.has(id)) origToSuper.set(id, `S:${id}`);
  });

  const superNodeSet = new Set(origToSuper.values());
  const superAdj = new Map<string, Set<string>>();
  superNodeSet.forEach((sid) => superAdj.set(sid, new Set()));
  ids.forEach((id) => {
    const sa = origToSuper.get(id)!;
    nodes[id].mentions.forEach((mid) => {
      if (!nodes[mid]) return;
      const sb = origToSuper.get(mid)!;
      if (sa === sb) return;
      superAdj.get(sa)!.add(sb);
      superAdj.get(sb)!.add(sa);
    });
  });

  const superIds = [...superNodeSet];
  const superComponents: string[][] = [];
  const seen = new Set<string>();
  superIds.forEach((sid) => {
    if (seen.has(sid)) return;
    const comp: string[] = [];
    const q = [sid];
    seen.add(sid);
    while (q.length) {
      const u = q.shift()!;
      comp.push(u);
      [...(superAdj.get(u) ?? [])]
        .filter((v) => !seen.has(v))
        .forEach((v) => {
          seen.add(v);
          q.push(v);
        });
    }
    superComponents.push(comp);
  });

  function centroid(compIds: string[]) {
    if (compIds.length === 1) return compIds[0];
    const parent: Record<string, string | null> = {};
    const order: string[] = [];
    const root = compIds[0];
    const vis = new Set([root]);
    const q = [root];
    parent[root] = null;
    while (q.length) {
      const u = q.shift()!;
      order.push(u);
      [...(superAdj.get(u) ?? [])]
        .filter((v) => !vis.has(v))
        .forEach((v) => {
          vis.add(v);
          parent[v] = u;
          q.push(v);
        });
    }
    const sz: Record<string, number> = {};
    compIds.forEach((id) => (sz[id] = 1));
    for (let i = order.length - 1; i >= 0; i--) {
      const u = order[i];
      if (parent[u] !== null) sz[parent[u]!] = (sz[parent[u]!] ?? 1) + sz[u];
    }
    const total = compIds.length;
    let best = Infinity;
    let out = compIds[0];
    compIds.forEach((id) => {
      const childMax = Math.max(
        ...[...(superAdj.get(id) ?? [])].filter((v) => parent[v] === id).map((v) => sz[v]),
        total - sz[id],
        0,
      );
      if (childMax < best) {
        best = childMax;
        out = id;
      }
    });
    return out;
  }

  const centroidSupers = new Set<string>();
  superComponents.forEach((comp) => centroidSupers.add(centroid(comp)));
  const largest = superComponents.reduce((a, b) => (b.length > a.length ? b : a), superComponents[0] ?? []);
  const centroidSuper = largest.length ? centroid(largest) : null;

  function superLabel(sid: string) {
    if (sid.startsWith("CG:")) {
      const i = Number(sid.slice(3));
      const cg = bcChainGroups[i];
      const all = [...cg.cNodes, ...cg.leafOrigIds].map((id) => nodes[id]?.name ?? id).sort();
      return `[${all.join(",")}]`;
    }
    if (sid.startsWith("B:")) {
      const i = Number(sid.slice(2));
      const b = blocks[i] ?? [];
      const nonCuts = b.filter((id) => !cutVertices.has(id)).map((id) => nodes[id]?.name ?? id).sort();
      return nonCuts.length ? `{${nonCuts.join(",")}}` : "[block]";
    }
    if (sid.startsWith("C:") || sid.startsWith("S:")) return nodes[sid.slice(2)]?.name ?? sid.slice(2);
    return sid;
  }

  function superType(sid: string) {
    if (sid === centroidSuper) return "centroid";
    if (sid.startsWith("CG:")) return "chain";
    if (sid.startsWith("B:")) return "block";
    if (sid.startsWith("C:")) return "cut";
    return "node";
  }

  const collNodes: LayoutNode[] = superIds.map((sid) => ({ id: sid, type: superType(sid), label: superLabel(sid) }));
  const collEdges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  superIds.forEach((a) => {
    superAdj.get(a)!.forEach((b) => {
      const k = [a, b].sort().join("||");
      if (edgeSet.has(k)) return;
      edgeSet.add(k);
      collEdges.push({ from: a, to: b });
    });
  });

  return {
    ids,
    cutVertices,
    blocks,
    bcChainGroups,
    bcNodes,
    bcEdges,
    collNodes,
    collEdges,
    superComponents,
    superAdj,
    origToSuper,
    centroidSupers,
  };
}

export function buildFileTree(nodes: NodeMap, data: ComputeData | null): TreeNode | null {
  if (!data) return null;
  const { ids, origToSuper, superAdj, superComponents } = data;
  if (!ids.length) return null;

  type LeafItem = ["leaf", string];
  type DirItem = ["dir", string, TreeItem[], boolean];
  type TreeItem = LeafItem | DirItem;
  const mkLeaf = (id: string): LeafItem => ["leaf", id];
  const mkDir = (name: string, children: TreeItem[], unnamed = false): DirItem => ["dir", name, children, unnamed];
  const nodeName = (id: string) => nodes[id]?.name || id;

  function superMembers(sid: string) {
    return [...origToSuper.entries()]
      .filter(([, s]) => s === sid)
      .map(([id]) => id)
      .filter((id) => nodes[id]);
  }
  function isContent(sid: string) {
    return !sid.startsWith("J:") && !sid.startsWith("C:");
  }
  function connectsToAll(jId: string, csid: string) {
    return superMembers(csid).every((m) => nodes[jId]?.mentions.has(m) || nodes[m]?.mentions.has(jId));
  }
  function isUniversalInGroup(candidateId: string, memberIds: string[]) {
    return memberIds.every((m) => m === candidateId || nodes[candidateId]?.mentions.has(m) || nodes[m]?.mentions.has(candidateId));
  }
  function findSingleUniversal(memberIds: string[]) {
    const unique = [...new Set(memberIds)].filter((id) => nodes[id]);
    const universals = unique.filter((id) => isUniversalInGroup(id, unique));
    return universals.length === 1 ? universals[0] : null;
  }
  function unnamedGroupFromMembers(memberIds: string[]): TreeItem[] {
    const members = [...new Set(memberIds)].filter((id) => nodes[id]);
    if (!members.length) return [];
    if (members.length === 1) return [mkLeaf(members[0])];
    const universal = findSingleUniversal(members);
    if (universal) {
      const children = members.filter((id) => id !== universal).map(mkLeaf);
      return [mkDir(nodeName(universal), children)];
    }
    return [mkDir("?", members.map(mkLeaf), true)];
  }

  function findCentroid(comp: string[]) {
    if (comp.length === 1) return comp[0];
    const inComp = new Set(comp);
    const spar: Record<string, string | null> = {};
    const sorder: string[] = [];
    const sroot = comp[0];
    const svis = new Set<string>([sroot]);
    const sq = [sroot];
    spar[sroot] = null;
    while (sq.length) {
      const u = sq.shift()!;
      sorder.push(u);
      [...(superAdj.get(u) || [])]
        .filter((v) => !svis.has(v) && inComp.has(v))
        .forEach((v) => {
          svis.add(v);
          spar[v] = u;
          sq.push(v);
        });
    }
    const ssz: Record<string, number> = {};
    comp.forEach((id) => {
      ssz[id] = 1;
    });
    for (let i = sorder.length - 1; i >= 0; i--) {
      const u = sorder[i];
      if (spar[u] !== null) ssz[spar[u]!] = (ssz[spar[u]!] || 1) + ssz[u];
    }
    const total = comp.length;
    let best = Infinity;
    let c = comp[0];
    comp.forEach((id) => {
      const cm = Math.max(
        ...[...(superAdj.get(id) || [])].filter((v) => spar[v] === id && inComp.has(v)).map((v) => ssz[v]),
        total - ssz[id],
        0,
      );
      if (cm < best) {
        best = cm;
        c = id;
      }
    });
    if (c.startsWith("S:")) {
      const bq = [c];
      const bv = new Set([c]);
      while (bq.length) {
        const u = bq.shift()!;
        if (u.startsWith("J:")) {
          c = u;
          break;
        }
        [...(superAdj.get(u) || [])]
          .filter((v) => !bv.has(v) && inComp.has(v))
          .forEach((v) => {
            bv.add(v);
            bq.push(v);
          });
      }
    }
    return c;
  }

  function buildCompItems(comp: string[]) {
    const inComp = new Set(comp);
    const centroid = findCentroid(comp);
    const bfsChildren = new Map<string, string[]>();
    comp.forEach((v) => bfsChildren.set(v, []));
    const bfsOrder: string[] = [];
    const vis = new Set([centroid]);
    const q = [centroid];
    while (q.length) {
      const u = q.shift()!;
      bfsOrder.push(u);
      [...(superAdj.get(u) || [])]
        .filter((v) => !vis.has(v) && inComp.has(v))
        .forEach((v) => {
          vis.add(v);
          bfsChildren.get(u)!.push(v);
          q.push(v);
        });
    }

    const packages = new Map<string, TreeItem[]>();
    for (let i = bfsOrder.length - 1; i >= 0; i--) {
      const sid = bfsOrder[i];
      const children = bfsChildren.get(sid) || [];
      const contentChildren = children.filter((v) => isContent(v));
      const junctionChildren = children.filter((v) => !isContent(v));
      const junctionItems = junctionChildren.flatMap((jsid) => packages.get(jsid) || []);
      if (isContent(sid)) {
        const allMems = [...superMembers(sid), ...contentChildren.flatMap((csid) => superMembers(csid))];
        const contentPkg = unnamedGroupFromMembers(allMems);
        packages.set(sid, [...contentPkg, ...junctionItems]);
      } else {
        const jOrigId = sid.slice(2);
        const singles = contentChildren.filter((v) => superMembers(v).length === 1);
        const multis = contentChildren.filter((v) => superMembers(v).length > 1);
        const allSingleMems = singles.flatMap((v) => superMembers(v));
        const hasBoth = contentChildren.length > 0 && junctionChildren.length > 0;
        if (contentChildren.length === 0) {
          packages.set(sid, [mkLeaf(nodeName(jOrigId)), ...junctionItems]);
        } else if (!hasBoth && multis.length === 0 && singles.length === 1) {
          packages.set(sid, [mkLeaf(nodeName(jOrigId)), mkLeaf(allSingleMems[0]), ...junctionItems]);
        } else if (!hasBoth && multis.length === 0 && singles.length > 1) {
          packages.set(sid, [mkDir(nodeName(jOrigId), allSingleMems.map(mkLeaf)), ...junctionItems]);
        } else if (!hasBoth && multis.length === 1 && singles.length === 0) {
          const csid = multis[0];
          const mems = superMembers(csid);
          if (connectsToAll(jOrigId, csid)) {
            packages.set(sid, [mkDir(nodeName(jOrigId), mems.map(mkLeaf)), ...junctionItems]);
          } else {
            packages.set(sid, [mkLeaf(nodeName(jOrigId)), ...unnamedGroupFromMembers(mems), ...junctionItems]);
          }
        } else {
          const items: TreeItem[] = [mkLeaf(nodeName(jOrigId))];
          if (allSingleMems.length === 1) items.push(mkLeaf(allSingleMems[0]));
          else if (allSingleMems.length > 1) items.push(...unnamedGroupFromMembers(allSingleMems));
          multis.forEach((csid) => {
            const mems = superMembers(csid);
            if (mems.length === 1) items.push(mkLeaf(mems[0]));
            else items.push(...unnamedGroupFromMembers(mems));
          });
          items.push(...junctionItems);
          packages.set(sid, items);
        }
      }
    }
    return packages.get(centroid) || [];
  }

  function dissolve(items: TreeItem[]): TreeItem[] {
    return items.flatMap((item) => {
      if (item[0] === "leaf") return [item];
      const [, name, children, unnamed] = item;
      const dc = dissolve(children);
      if (dc.length === 1) return dc;
      return [mkDir(name, dc, unnamed)];
    });
  }

  const rootFT: TreeNode = { name: "/", isDir: true, unnamed: false, children: [] };
  const primaryComp = superComponents.reduce((a, b) => (b.length > a.length ? b : a), superComponents[0] || []);
  const allRootItems: TreeItem[] = [];
  superComponents.forEach((comp) => {
    let items = buildCompItems(comp);
    items = dissolve(items);
    const isPrimary = comp.length === primaryComp.length && comp.every((v) => primaryComp.includes(v));
    if (isPrimary) allRootItems.push(...items);
    else if (items.length === 1) allRootItems.push(items[0]);
    else allRootItems.push(mkDir("?", items, true));
  });

  const finalItems = allRootItems;

  function toTreeNode(item: TreeItem): TreeNode {
    if (item[0] === "leaf") {
      const value = item[1];
      const origId = Object.keys(nodes).find((k) => nodes[k]?.name === value) || value;
      return { name: nodes[origId]?.name || value, isDir: false, nodeId: origId, children: [] };
    }
    const [, name, children, unnamed] = item;
    const origId = Object.keys(nodes).find((k) => nodes[k]?.name === name);
    return { name: unnamed ? "?" : name, isDir: true, unnamed, nodeId: origId, children: children.map(toTreeNode) };
  }

  finalItems.forEach((item) => rootFT.children.push(toTreeNode(item)));
  const placed = new Set<string>();
  function collect(n: TreeNode) {
    if (n.nodeId) placed.add(n.nodeId);
    n.children.forEach(collect);
  }
  collect(rootFT);
  Object.keys(nodes)
    .filter((id) => nodes[id] && !placed.has(id))
    .forEach((id) => rootFT.children.push({ name: nodes[id].name, isDir: false, nodeId: id, children: [] }));
  return rootFT;
}

export function computeScore(nodes: NodeMap, tree: TreeNode | null): string | null {
  if (!tree) return null;
  const paths: Record<string, string[]> = {};
  function walk(n: TreeNode, p: string[]) {
    if (!n.isDir) {
      if (n.nodeId) paths[n.nodeId] = p;
      return;
    }
    n.children.forEach((c) => walk(c, [...p, n.name || "?"]));
  }
  walk(tree, []);
  let total = 0;
  let count = 0;
  const seen = new Set<string>();
  Object.keys(nodes).forEach((id) => {
    nodes[id].mentions.forEach((mid) => {
      if (!nodes[mid]) return;
      const k = [id, mid].sort().join("|");
      if (seen.has(k)) return;
      seen.add(k);
      const pa = paths[id] ?? [];
      const pb = paths[mid] ?? [];
      let common = 0;
      for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
        if (pa[i] !== pb[i]) break;
        common++;
      }
      total += pa.length - common + (pb.length - common);
      count++;
    });
  });
  return count ? (total / count).toFixed(2) : "0.00";
}

export function mentionEdges(nodes: NodeMap, ids: string[]): GraphEdge[] {
  const out: GraphEdge[] = [];
  const seen = new Set<string>();
  ids.forEach((id) => {
    nodes[id].mentions.forEach((mid) => {
      if (!nodes[mid]) return;
      const k = [id, mid].sort().join("|");
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ from: id, to: mid });
    });
  });
  return out;
}
