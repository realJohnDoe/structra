// PROTOTYPE (throwaway): state and pieces shared by the mobile UI variants.
import { useEffect, useMemo, useState } from "react";
import { Badge, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { optimalTree, prepare } from "./optimizer";
import type { GraphFile, OTNode, OptimalTree, OptimizerOptions, Prepared } from "./optimizer";

export const EXAMPLES = [
  { key: "requests", name: "requests", hint: "37 files" },
  { key: "flask", name: "flask", hint: "83 files" },
  { key: "django", name: "django", hint: "2,943 files" },
] as const;

export const ACCENT = "#c8f060";
export const BG = "#0f0f0f";
export const BG1 = "#171717";
export const BORDER = "#2a2a2a";

export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function writeParam(name: string, value: string | null) {
  const u = new URL(window.location.href);
  if (value === null) u.searchParams.delete(name);
  else u.searchParams.set(name, value);
  window.history.replaceState(null, "", u);
}

export interface ProtoState {
  repoKey: string; // example key or "upload"
  repoName: string;
  setRepo: (key: string) => void;
  upload: (file: File | null) => void;
  uploadError: string | null;
  loading: boolean;
  prep: Prepared | null;
  tree: OptimalTree | null;
  byId: Map<number, OTNode>;
  lambda: number; // what the slider shows
  setLambda: (l: number) => void; // live (cheap repos) or deferred
  commitLambda: (l: number) => void;
  large: boolean;
  selected: OTNode | null;
  select: (n: OTNode | null) => void;
  resolve: (id: number | null) => OTNode | null; // id → surviving node or ancestor
}

export function useProtoState(opts?: OptimizerOptions): ProtoState {
  const [repoKey, setRepoKey] = useState(readParam("repo") ?? "flask");
  const [graph, setGraph] = useState<GraphFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lambda, setLambdaRaw] = useState(() => Number(readParam("lambda") ?? 0.45));
  const [committed, setCommitted] = useState(lambda);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (repoKey === "upload") return;
    let cancelled = false;
    setLoading(true);
    // The single-file HTML build embeds the examples in window.__STRUCTRA_EXAMPLES__.
    const embedded = (window as unknown as { __STRUCTRA_EXAMPLES__?: Record<string, GraphFile> }).__STRUCTRA_EXAMPLES__?.[repoKey];
    (embedded
      ? Promise.resolve(embedded)
      : fetch(`${import.meta.env.BASE_URL}prototype-examples/${repoKey}.graph.json`).then((r) => r.json())
    )
      .then((g: GraphFile) => {
        if (!cancelled) {
          setGraph(g);
          setSelectedId(null);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [repoKey]);

  const prep = useMemo(() => (graph ? prepare(graph, opts) : null), [graph, opts]);
  const large = (graph?.nodes.length ?? 0) > 1000;
  const tree = useMemo(() => (prep ? optimalTree(prep, large ? committed : lambda) : null), [prep, lambda, committed, large]);
  const byId = useMemo(() => {
    const m = new Map<number, OTNode>();
    if (tree) {
      const walk = (n: OTNode) => {
        m.set(n.id, n);
        n.children.forEach(walk);
      };
      walk(tree.root);
    }
    return m;
  }, [tree]);

  const resolve = (id: number | null): OTNode | null => {
    if (id === null || !prep) return null;
    let x = id;
    while (x >= 0 && !byId.has(x)) x = x >= prep.dendro.parent.length ? (prep.synthParent.get(x) ?? -1) : prep.dendro.parent[x];
    return x >= 0 ? byId.get(x)! : null;
  };

  return {
    repoKey,
    repoName: graph ? graph.meta.repo.replace(/^https:\/\/github.com\//, "") : repoKey,
    setRepo: (k) => {
      setRepoKey(k);
      writeParam("repo", k);
    },
    upload: (file) => {
      if (!file) return;
      file.text().then((txt) => {
        try {
          const g = JSON.parse(txt) as GraphFile;
          if (!Array.isArray(g.nodes) || !Array.isArray(g.edges) || !g.meta) throw new Error("not a Graph File");
          setUploadError(null);
          setRepoKey("upload");
          setGraph(g);
          setSelectedId(null);
        } catch (e) {
          setUploadError(`Couldn't read ${file.name}: ${(e as Error).message}`);
        }
      });
    },
    uploadError,
    loading,
    prep,
    tree,
    byId,
    lambda,
    setLambda: (l) => {
      setLambdaRaw(l);
      if (!large) writeParam("lambda", l.toFixed(2));
    },
    commitLambda: (l) => {
      setCommitted(l);
      setLambdaRaw(l);
      writeParam("lambda", l.toFixed(2));
    },
    large,
    selected: resolve(selectedId),
    select: (n) => setSelectedId(n ? n.id : null),
    resolve,
  };
}

export function lambdaSummary(s: ProtoState) {
  const t = s.tree;
  if (!t) return "";
  return `${t.groups} groups · depth ${t.maxDepth}`;
}

export function pathTo(n: OTNode): OTNode[] {
  const out: OTNode[] = [];
  let x: OTNode | null = n;
  while (x) {
    out.unshift(x);
    x = x.parent;
  }
  return out;
}

export function isFile(n: OTNode) {
  return n.leafIndex >= 0;
}

/** Detail content for a tapped node; each variant decides where it goes. */
export function NodeDetails({
  s,
  node,
  onPick,
  compact,
}: {
  s: ProtoState;
  node: OTNode;
  onPick: (n: OTNode) => void;
  compact?: boolean;
}) {
  const prep = s.prep!;
  const tree = s.tree!;
  if (isFile(node)) {
    const i = node.leafIndex;
    const imports = prep.out[i];
    const importedBy = prep.inn[i];
    const list = (title: string, xs: number[]) => (
      <Stack gap={2}>
        <Text size="xs" c="dimmed" tt="uppercase">
          {title} ({xs.length})
        </Text>
        {xs.slice(0, compact ? 5 : 40).map((j) => (
          <UnstyledButton key={j} onClick={() => onPick(tree.byLeaf[j])}>
            <Text size="sm" c="#cfd8e0" truncate>
              {prep.graph.nodes[j]}
            </Text>
          </UnstyledButton>
        ))}
        {xs.length > (compact ? 5 : 40) && (
          <Text size="xs" c="dimmed">
            … {xs.length - (compact ? 5 : 40)} more
          </Text>
        )}
      </Stack>
    );
    return (
      <Stack gap="xs">
        <div>
          <Text fw={600} c={ACCENT} style={{ wordBreak: "break-all" }}>
            {node.label}
          </Text>
          <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
            {prep.graph.nodes[i]}
          </Text>
        </div>
        {list("Imports", imports)}
        {list("Imported by", importedBy)}
      </Stack>
    );
  }
  const sub = node.children.filter((c) => !isFile(c));
  const files = node.children.filter(isFile);
  return (
    <Stack gap="xs">
      <div>
        <Text fw={600} c={ACCENT}>
          {node.label}
        </Text>
        <Text size="xs" c="dimmed" style={{ wordBreak: "break-all" }}>
          {node.sublabel}
        </Text>
      </div>
      <Group gap={6}>
        <Badge variant="light" color="gray">
          {node.leaves.length} files
        </Badge>
        <Badge variant="light" color="gray">
          {sub.length} subgroups · {files.length} files direct
        </Badge>
        <Badge variant="light" color="gray">
          {node.internalEdges} imports within
        </Badge>
        <Badge variant="outline" style={{ color: OUT_COLOR, borderColor: OUT_COLOR }}>
          → {node.edgesOut} to outside
        </Badge>
        <Badge variant="outline" style={{ color: IN_COLOR, borderColor: IN_COLOR }}>
          ← {node.edgesIn} from outside
        </Badge>
      </Group>
      {!compact && (
        <Stack gap={2}>
          <Text size="xs" c="dimmed" tt="uppercase">
            Children
          </Text>
          {node.children.slice(0, 40).map((c) => (
            <UnstyledButton key={c.id} onClick={() => onPick(c)}>
              <Group gap={6} wrap="nowrap">
                <Text size="sm" c={isFile(c) ? "#cfd8e0" : ACCENT} truncate>
                  {isFile(c) ? c.label : `▸ ${c.label}`}
                </Text>
                {!isFile(c) && (
                  <Text size="xs" c="dimmed">
                    {c.leaves.length}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
          ))}
          {node.children.length > 40 && (
            <Text size="xs" c="dimmed">
              … {node.children.length - 40} more
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export const OUT_COLOR = "#c8f060"; // selection imports it
export const IN_COLOR = "#ff9a3c"; // it imports the selection

export interface Flow {
  out: number; // imports from the selection into this node
  in: number; // imports from this node into the selection
}

/**
 * Edges on tap: for a selected node, count its imports per visible node.
 * Each foreign file is attributed to the deepest visible node containing it;
 * files inside the selection, or only reachable via its ancestors, are skipped.
 */
export function edgeFlows(
  s: ProtoState,
  sel: OTNode | null,
  visible: Set<number>,
  redirect?: Map<number, OTNode>, // node id → display-only block standing in for it
): Map<OTNode, Flow> {
  const res = new Map<OTNode, Flow>();
  if (!sel || !s.prep || !s.tree) return res;
  const inSel = new Set(sel.leaves);
  const ancestors = new Set<number>();
  for (let a: OTNode | null = sel; a; a = a.parent) ancestors.add(a.id);
  const target = (leaf: number): OTNode | null => {
    let x: OTNode | null = s.tree!.byLeaf[leaf];
    while (x && !visible.has(x.id)) {
      const r = redirect?.get(x.id);
      if (r) return r;
      x = x.parent;
    }
    if (!x || ancestors.has(x.id)) return null;
    return x;
  };
  const bump = (n: OTNode | null, key: "out" | "in") => {
    if (!n) return;
    const f = res.get(n) ?? { out: 0, in: 0 };
    f[key]++;
    res.set(n, f);
  };
  for (const l of sel.leaves) {
    for (const t of s.prep.out[l]) if (!inSel.has(t)) bump(target(t), "out");
    for (const t of s.prep.inn[l]) if (!inSel.has(t)) bump(target(t), "in");
  }
  return res;
}

export function flowWidth(n: number) {
  return Math.min(8, 1 + Math.log2(n));
}

export const FILE_COLOR = "#8a919c";
/**
 * Groups: the current zoom (`top`) gets the whole hue wheel; each group splits
 * its parent's hue range among its child groups by file count and takes the
 * middle of its share. So sibling groups always differ, and children stay close
 * to their parent's hue. Darker with depth. Files: a neutral grey.
 */
const colorCache = new WeakMap<OTNode, Map<number, string>>();

function buildColors(top: OTNode): Map<number, string> {
  const m = new Map<number, string>();
  m.set(top.id, "hsl(80 10% 45%)");
  const walk = (n: OTNode, h0: number, h1: number, below: number) => {
    const groups = n.children.filter((c) => !isFile(c));
    const total = groups.reduce((a, c) => a + c.leaves.length, 0);
    let h = h0;
    groups.forEach((c, i) => {
      const w = ((h1 - h0) * c.leaves.length) / total;
      const mid = h + w / 2;
      // Alternate lightness a little so neighbours stay distinct when hue ranges get narrow.
      const light = Math.max(40, 64 - below * 4 - (i % 2) * 7);
      m.set(c.id, `hsl(${(mid + 200) % 360} 62% ${light}%)`);
      walk(c, h, h + w, below + 1);
      h += w;
    });
  };
  walk(top, 0, 360, 0);
  return m;
}

export function nodeColor(n: OTNode, top: OTNode): string {
  if (isFile(n)) return FILE_COLOR;
  let m = colorCache.get(top);
  if (!m) {
    m = buildColors(top);
    colorCache.set(top, m);
  }
  return m.get(n.id) ?? "hsl(80 10% 45%)";
}

/** Lowest common ancestor of two nodes of the same tree. */
export function lca(a: OTNode, b: OTNode): OTNode {
  let x: OTNode = a;
  let y: OTNode = b;
  while (x !== y) {
    if (x.depth >= y.depth) x = x.parent!;
    else y = y.parent!;
  }
  return x;
}

/** Colour by how self-contained a group is: internal deps vs. deps crossing its boundary. */
export function cohesionColor(n: OTNode): string {
  if (n.leafIndex >= 0) return "#3a3f47";
  const total = n.internalEdges + n.edgesIn + n.edgesOut;
  const f = total === 0 ? 0.5 : n.internalEdges / total;
  // red-ish (leaky) → lime (cohesive)
  const r = Math.round(220 - f * 120);
  const g = Math.round(110 + f * 110);
  const b = Math.round(70 - f * 20);
  return `rgb(${r},${g},${b})`;
}
