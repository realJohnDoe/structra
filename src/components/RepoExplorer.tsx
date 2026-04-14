import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Box,
  Text,
  Group,
  Slider,
  Stack,
  Paper,
  ScrollArea,
  ActionIcon,
} from "@mantine/core";
import { Upload, Menu, ArrowUp, RefreshCw } from "lucide-react";
import { useRepoVisualization } from "../hooks/useRepoVisualization";

// Types
export interface TreeNode {
  id: string;
  name: string;
  path: string;
  children: TreeNode[];
  parent: TreeNode | null;
  isLeaf: boolean;
}

export interface Edge {
  from: string;
  to: string;
}

export interface SubtreeData {
  total: number;
  nH: number;
  eH: number;
  optEH: number;
  intEdges: Edge[];
}

interface Preset {
  name: string;
  description: string;
  data: string;
}

// Presets data
const PRESETS: Record<string, Preset> = {
  numpy: {
    name: "numpy core",
    description: "~55 nodes",
    data: `digraph numpy {
"numpy/__init__.py" -> "numpy/core/__init__.py"
"numpy/__init__.py" -> "numpy/lib/__init__.py"
"numpy/__init__.py" -> "numpy/linalg/__init__.py"
"numpy/__init__.py" -> "numpy/fft/__init__.py"
"numpy/__init__.py" -> "numpy/random/__init__.py"
"numpy/__init__.py" -> "numpy/ma/__init__.py"
"numpy/__init__.py" -> "numpy/testing/__init__.py"
"numpy/core/__init__.py" -> "numpy/core/multiarray.py"
"numpy/core/__init__.py" -> "numpy/core/numeric.py"
"numpy/core/__init__.py" -> "numpy/core/fromnumeric.py"
"numpy/core/__init__.py" -> "numpy/core/arrayprint.py"
"numpy/core/__init__.py" -> "numpy/core/defchararray.py"
"numpy/core/__init__.py" -> "numpy/core/records.py"
"numpy/core/__init__.py" -> "numpy/core/function_base.py"
"numpy/core/__init__.py" -> "numpy/core/shape_base.py"
"numpy/core/__init__.py" -> "numpy/core/einsumfunc.py"
"numpy/core/__init__.py" -> "numpy/core/_type_aliases.py"
"numpy/core/__init__.py" -> "numpy/core/overrides.py"
"numpy/core/numeric.py" -> "numpy/core/multiarray.py"
"numpy/core/numeric.py" -> "numpy/core/_type_aliases.py"
"numpy/core/fromnumeric.py" -> "numpy/core/multiarray.py"
"numpy/core/fromnumeric.py" -> "numpy/core/numeric.py"
"numpy/core/fromnumeric.py" -> "numpy/core/overrides.py"
"numpy/core/arrayprint.py" -> "numpy/core/multiarray.py"
"numpy/core/arrayprint.py" -> "numpy/core/numeric.py"
"numpy/core/arrayprint.py" -> "numpy/core/fromnumeric.py"
"numpy/core/shape_base.py" -> "numpy/core/numeric.py"
"numpy/core/shape_base.py" -> "numpy/core/overrides.py"
"numpy/core/einsumfunc.py" -> "numpy/core/multiarray.py"
"numpy/core/einsumfunc.py" -> "numpy/core/numeric.py"
"numpy/core/overrides.py" -> "numpy/core/multiarray.py"
"numpy/lib/__init__.py" -> "numpy/lib/arraysetops.py"
"numpy/lib/__init__.py" -> "numpy/lib/function_base.py"
"numpy/lib/__init__.py" -> "numpy/lib/index_tricks.py"
"numpy/lib/__init__.py" -> "numpy/lib/nanfunctions.py"
"numpy/lib/__init__.py" -> "numpy/lib/npyio.py"
"numpy/lib/__init__.py" -> "numpy/lib/polynomial.py"
"numpy/lib/__init__.py" -> "numpy/lib/shape_base.py"
"numpy/lib/__init__.py" -> "numpy/lib/stride_tricks.py"
"numpy/lib/__init__.py" -> "numpy/lib/twodim_base.py"
"numpy/lib/__init__.py" -> "numpy/lib/type_check.py"
"numpy/lib/__init__.py" -> "numpy/lib/ufunclike.py"
"numpy/lib/__init__.py" -> "numpy/lib/utils.py"
"numpy/lib/function_base.py" -> "numpy/core/numeric.py"
"numpy/lib/function_base.py" -> "numpy/core/overrides.py"
"numpy/lib/function_base.py" -> "numpy/lib/twodim_base.py"
"numpy/lib/nanfunctions.py" -> "numpy/core/numeric.py"
"numpy/lib/nanfunctions.py" -> "numpy/lib/function_base.py"
"numpy/lib/nanfunctions.py" -> "numpy/core/overrides.py"
}`,
  },
  pandas: {
    name: "pandas",
    description: "~48 nodes",
    data: `digraph pandas {
"pandas/__init__.py" -> "pandas/core/__init__.py"
"pandas/__init__.py" -> "pandas/io/__init__.py"
"pandas/__init__.py" -> "pandas/util/__init__.py"
"pandas/core/__init__.py" -> "pandas/core/frame.py"
"pandas/core/__init__.py" -> "pandas/core/series.py"
"pandas/core/__init__.py" -> "pandas/core/index.py"
"pandas/core/frame.py" -> "pandas/core/series.py"
"pandas/core/frame.py" -> "pandas/core/index.py"
"pandas/core/series.py" -> "pandas/core/index.py"
"pandas/core/series.py" -> "pandas/core/base.py"
"pandas/core/index.py" -> "pandas/core/base.py"
"pandas/io/__init__.py" -> "pandas/io/common.py"
"pandas/io/__init__.py" -> "pandas/io/csv.py"
"pandas/io/__init__.py" -> "pandas/io/excel.py"
"pandas/io/csv.py" -> "pandas/io/common.py"
"pandas/io/excel.py" -> "pandas/io/common.py"
}`,
  },
  flask: {
    name: "flask",
    description: "~35 nodes",
    data: `digraph flask {
"flask/__init__.py" -> "flask/app.py"
"flask/__init__.py" -> "flask/blueprints.py"
"flask/__init__.py" -> "flask/ctx.py"
"flask/__init__.py" -> "flask/globals.py"
"flask/__init__.py" -> "flask/helpers.py"
"flask/__init__.py" -> "flask/templating.py"
"flask/__init__.py" -> "flask/testing.py"
"flask/__init__.py" -> "flask/wrappers.py"
"flask/__init__.py" -> "flask/signals.py"
"flask/app.py" -> "flask/blueprints.py"
"flask/app.py" -> "flask/ctx.py"
"flask/app.py" -> "flask/globals.py"
"flask/app.py" -> "flask/helpers.py"
"flask/app.py" -> "flask/templating.py"
"flask/app.py" -> "flask/signals.py"
"flask/blueprints.py" -> "flask/sansio/blueprints.py"
"flask/ctx.py" -> "flask/globals.py"
"flask/ctx.py" -> "flask/signals.py"
"flask/ctx.py" -> "flask/wrappers.py"
"flask/globals.py" -> "flask/ctx.py"
"flask/helpers.py" -> "flask/globals.py"
"flask/helpers.py" -> "flask/ctx.py"
"flask/helpers.py" -> "flask/signals.py"
"flask/templating.py" -> "flask/globals.py"
"flask/templating.py" -> "flask/helpers.py"
"flask/templating.py" -> "flask/signals.py"
"flask/testing.py" -> "flask/app.py"
"flask/testing.py" -> "flask/ctx.py"
"flask/testing.py" -> "flask/globals.py"
"flask/wrappers.py" -> "flask/globals.py"
"flask/wrappers.py" -> "flask/helpers.py"
}`,
  },
};

// Colors
const COLORS = {
  bg: "#07090e",
  bg1: "#0b0e17",
  bg2: "#0f1320",
  border: "#181e30",
  border2: "#1e2640",
  dim: "#252e48",
  muted: "#4a5a78",
  text: "#9aaac0",
  bright: "#c8d8e8",
  amber: "#f0b040",
  green: "#38d890",
  blue: "#4488ff",
  red: "#e04848",
  violet: "#9060e0",
};

// Utility functions
function parseDot(src: string): { nodes: string[]; edges: Edge[] } {
  src = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const nodeSet = new Set<string>();
  const edgeArr: Edge[] = [];

  const re =
    /"([^"]+)"\s*-[->]\s*"([^"]+)"|([A-Za-z0-9_./:-]+)\s*-[->]\s*([A-Za-z0-9_./:-]+)/g;
  let m;

  while ((m = re.exec(src)) !== null) {
    const a = (m[1] || m[3]).trim();
    const b = (m[2] || m[4]).trim();
    if (a && b && !a.startsWith("{")) {
      nodeSet.add(a);
      nodeSet.add(b);
      edgeArr.push({ from: a, to: b });
    }
  }

  const nr = /"([^"]+)"\s*\[/g;
  while ((m = nr.exec(src)) !== null) nodeSet.add(m[1]);

  return { nodes: [...nodeSet], edges: edgeArr };
}

function buildTree(nodes: string[]): {
  root: TreeNode;
  byPath: Record<string, TreeNode>;
} {
  const root: TreeNode = {
    id: "",
    name: "root",
    path: "",
    children: [],
    parent: null,
    isLeaf: false,
  };
  const byPath: Record<string, TreeNode> = { "": root };

  function ensure(p: string): TreeNode {
    if (byPath[p]) return byPath[p];
    const parts = p.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const par = ensure(parentPath);
    const nd: TreeNode = {
      id: p,
      name,
      path: p,
      children: [],
      parent: par,
      isLeaf: true,
    };
    par.children.push(nd);
    par.isLeaf = false;
    byPath[p] = nd;
    return nd;
  }

  [...nodes]
    .sort(
      (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
    )
    .forEach((n) => ensure(n));

  // Collapse single-child pass-through dirs
  function collapse(nd: TreeNode) {
    nd.children.forEach(collapse);
    while (
      nd.children.length === 1 &&
      !nodes.includes(nd.path) &&
      nd.path !== ""
    ) {
      const ch = nd.children[0];
      nd.name = nd.name + "/" + ch.name;
      nd.path = ch.path;
      nd.id = ch.path;
      nd.children = ch.children;
      nd.isLeaf = ch.isLeaf;
      nd.children.forEach((c) => (c.parent = nd));
      byPath[nd.path] = nd;
    }
  }

  collapse(root);
  return { root, byPath };
}

// Entropy calculations
let W = 0; // Global weight

function getSubtreeIds(nd: TreeNode): Set<string> {
  const s = new Set<string>();
  (function walk(n: TreeNode) {
    s.add(n.path);
    n.children.forEach(walk);
  })(nd);
  return s;
}

function pathNodes(nd1: TreeNode, nd2: TreeNode): TreeNode[] {
  const ancA: TreeNode[] = [];
  const ancB: TreeNode[] = [];
  let n = nd1;
  while (n) {
    ancA.push(n);
    n = n.parent;
  }
  let m = nd2;
  while (m) {
    ancB.push(m);
    m = m.parent;
  }
  const setA = new Set(ancA.map((x) => x.id));
  let lca: TreeNode | null = null;
  for (const x of ancB) {
    if (setA.has(x.id)) {
      lca = x;
      break;
    }
  }
  if (!lca) return [];

  const toA: TreeNode[] = [];
  const toB: TreeNode[] = [];
  n = nd1;
  while (n && n.id !== lca.id) {
    toA.push(n);
    n = n.parent;
  }
  m = nd2;
  while (m && m.id !== lca.id) {
    toB.push(m);
    m = m.parent;
  }
  return [...toA.reverse(), lca, ...toB];
}

function edgeCost(
  byPath: Record<string, TreeNode>,
  a: string,
  b: string,
): number {
  const na = byPath[a];
  const nb = byPath[b];
  if (!na || !nb) return 0;
  const path = pathNodes(na, nb);
  const internalNodes = path.filter(
    (nd) => !nd.isLeaf && nd.children.length > 0,
  );
  const pathLen = internalNodes.length;
  const sumLnK = internalNodes.reduce(
    (s, nd) => s + Math.log(Math.max(2, nd.children.length)),
    0,
  );
  return W * pathLen + (1 - W) * sumLnK;
}

function optEdgeCost(): number {
  const optLnK = Math.log(2);
  return W * 1 + (1 - W) * optLnK;
}

function nodeStructCost(nd: TreeNode): number {
  let nH = 0;
  (function walk(n: TreeNode) {
    if (!n.isLeaf && n.children.length > 0)
      nH += (1 - W) * Math.log(Math.max(2, n.children.length));
    n.children.forEach(walk);
  })(nd);
  return nH;
}

function subtreeH(
  nd: TreeNode,
  byPath: Record<string, TreeNode>,
  edgeArr: Edge[],
): SubtreeData {
  const ids = getSubtreeIds(nd);
  const nH = nodeStructCost(nd);
  const intEdges = edgeArr.filter((e) => ids.has(e.from) && ids.has(e.to));
  let eH = intEdges.reduce((s, e) => s + edgeCost(byPath, e.from, e.to), 0);
  const optEH = intEdges.length * optEdgeCost();
  return { total: nH + eH, nH, eH, optEH, intEdges };
}

function globalH(
  tree: { root: TreeNode; byPath: Record<string, TreeNode> },
  edges: Edge[],
): number {
  return tree ? subtreeH(tree.root, tree.byPath, edges).total : 0;
}

function countLeaves(nd: TreeNode): number {
  if (nd.isLeaf) return 1;
  return nd.children.reduce((s, c) => s + countLeaves(c), 0);
}

// Helper function for entropy color
function entropyColor(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  if (f < 0.5) {
    const t = f * 2;
    return `rgb(${Math.round(56 + t * 194)}, ${Math.round(216 - t * 72)}, ${Math.round(144 - t * 104)})`;
  } else {
    const t = (f - 0.5) * 2;
    return `rgb(${Math.round(250 - t * 30)}, ${Math.round(144 - t * 100)}, ${Math.round(40 - t * 32)})`;
  }
}

// React component
export const RepoExplorer: React.FC = () => {
  const [tree, setTree] = useState<{
    root: TreeNode;
    byPath: Record<string, TreeNode>;
  } | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [selectedChild, setSelectedChild] = useState<{
    node: TreeNode;
    index: number;
  } | null>(null);
  const [weight, setWeight] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [repoLabel, setRepoLabel] = useState("no repo");
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((dotSrc: string, label: string) => {
    const { nodes: ns, edges: es } = parseDot(dotSrc);
    if (!ns.length) {
      alert("No nodes found - check DOT format");
      return;
    }
    const t = buildTree(ns);
    t.root.name = label;
    setTree(t);
    setEdges(es.filter((e) => t.byPath[e.from] && t.byPath[e.to]));
    setRepoLabel(label);

    // Find first interesting node
    let startNode = t.root;
    while (startNode.children.length === 1 && !startNode.isLeaf) {
      startNode = startNode.children[0];
    }
    setSelected(startNode);
  }, []);

  const handleFileUpload = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const fileName = file.name.replace(/\.(dot|gv)$/, "");
        load(content, fileName);
      };
      reader.readAsText(file);
    },
    [load],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handlePresetClick = useCallback(
    (presetKey: string) => {
      const preset = PRESETS[presetKey];
      if (preset) {
        load(preset.data, preset.name);
      }
    },
    [load],
  );

  const handleNodeClick = useCallback((node: TreeNode, index: number) => {
    // Handle node click - show child details
    setSelectedChild({ node, index });
  }, []);

  const handleNavigate = useCallback((node: TreeNode) => {
    setSelected(node);
  }, []);

  // Use visualization hook
  useRepoVisualization(
    svgRef,
    selected,
    tree,
    edges,
    weight,
    handleNodeClick,
    handleNavigate,
  );

  // Load default preset
  useEffect(() => {
    handlePresetClick("numpy");
  }, [handlePresetClick]);

  // Update weight
  useEffect(() => {
    W = weight;
  }, [weight]);

  const stats = useMemo(() => {
    if (!tree) return { nodes: 0, edges: 0, depth: 0, globalH: 0 };

    let nodeCount = 0;
    let depth = 0;
    (function countW(n: TreeNode, d: number) {
      nodeCount++;
      depth = Math.max(depth, d);
      n.children.forEach((c) => countW(c, d + 1));
    })(tree.root, 0);

    return {
      nodes: nodeCount,
      edges: edges.length,
      depth,
      globalH: globalH(tree, edges),
    };
  }, [tree, edges]);

  return (
    <Box
      h="100vh"
      bg={COLORS.bg}
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* Header */}
      <Box
        p="xs"
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        <Text
          fw={800}
          size="16px"
          c={COLORS.amber}
          style={{ fontFamily: "Syne, sans-serif" }}
        >
          RepoLens{" "}
          <span style={{ color: COLORS.muted, fontWeight: 700 }}>entropy</span>
        </Text>
        <Text
          size="9px"
          p="2px 8px"
          style={{
            border: `1px solid ${COLORS.border2}`,
            color: COLORS.muted,
            letterSpacing: "0.08em",
          }}
        >
          {repoLabel}
        </Text>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "6px",
            alignItems: "center",
          }}
        >
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu size={12} />
          </ActionIcon>
          <ActionIcon size="sm" variant="default" disabled={!selected?.parent}>
            <ArrowUp size={12} />
          </ActionIcon>
          <ActionIcon size="sm" variant="default">
            <RefreshCw size={12} />
          </ActionIcon>
        </div>
      </Box>

      <Box
        style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}
      >
        {/* Sidebar */}
        <Box
          w={sidebarCollapsed ? 0 : 230}
          style={{
            flexShrink: 0,
            borderRight: `1px solid ${COLORS.border}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 0.2s",
          }}
        >
          <Box
            p="xs"
            style={{
              fontSize: "8px",
              color: COLORS.muted,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            SOURCE
          </Box>
          <ScrollArea.Autosize flex={1} p="xs">
            {/* Dropzone */}
            <Box
              p="md"
              style={{
                border: isDragging
                  ? `1px solid ${COLORS.amber}`
                  : `1px dashed ${COLORS.border2}`,
                background: isDragging ? "#100d00" : "transparent",
                textAlign: "center",
                cursor: "pointer",
                marginBottom: "10px",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Text size="20px" opacity={0.3} mb="xs">
                <Upload size={20} />
              </Text>
              <Text size="9px" c={COLORS.muted} style={{ lineHeight: 1.7 }}>
                drop .dot file
                <br />
                or click to browse
              </Text>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dot,.gv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </Box>

            {/* Presets */}
            <Stack gap="md" mb="md">
              <Box>
                <Text
                  size="8px"
                  c={COLORS.dim}
                  style={{
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Python scientific
                </Text>
                <Stack gap="xs">
                  {Object.entries(PRESETS)
                    .filter(([key]) =>
                      ["numpy", "pandas", "scipy"].includes(key),
                    )
                    .map(([key, preset]) => (
                      <Paper
                        key={key}
                        p="xs"
                        style={{
                          border: `1px solid ${COLORS.border}`,
                          cursor: "pointer",
                        }}
                        onClick={() => handlePresetClick(key)}
                      >
                        <Group justify="space-between">
                          <Text size="9px">{preset.name}</Text>
                          <Text size="8px" c={COLORS.muted}>
                            {preset.description}
                          </Text>
                        </Group>
                      </Paper>
                    ))}
                </Stack>
              </Box>

              <Box>
                <Text
                  size="8px"
                  c={COLORS.dim}
                  style={{
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Web frameworks
                </Text>
                <Stack gap="xs">
                  {Object.entries(PRESETS)
                    .filter(([key]) =>
                      ["flask", "django", "fastapi"].includes(key),
                    )
                    .map(([key, preset]) => (
                      <Paper
                        key={key}
                        p="xs"
                        style={{
                          border: `1px solid ${COLORS.border}`,
                          cursor: "pointer",
                        }}
                        onClick={() => handlePresetClick(key)}
                      >
                        <Group justify="space-between">
                          <Text size="9px">{preset.name}</Text>
                          <Text size="8px" c={COLORS.muted}>
                            {preset.description}
                          </Text>
                        </Group>
                      </Paper>
                    ))}
                </Stack>
              </Box>
            </Stack>
          </ScrollArea.Autosize>

          {/* Stats */}
          <Box
            p="xs"
            style={{ borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}
          >
            <Group justify="space-between" mb="xs">
              <Text size="9px" c={COLORS.muted}>
                nodes
              </Text>
              <Text size="9px" c={COLORS.amber} fw={600}>
                {stats.nodes}
              </Text>
            </Group>
            <Group justify="space-between" mb="xs">
              <Text size="9px" c={COLORS.muted}>
                edges
              </Text>
              <Text size="9px" c={COLORS.amber} fw={600}>
                {stats.edges}
              </Text>
            </Group>
            <Group justify="space-between" mb="xs">
              <Text size="9px" c={COLORS.muted}>
                depth
              </Text>
              <Text size="9px" c={COLORS.amber} fw={600}>
                {stats.depth}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="9px" c={COLORS.muted}>
                H global
              </Text>
              <Text size="9px" c={COLORS.amber} fw={600}>
                {stats.globalH.toFixed(2)}
              </Text>
            </Group>
          </Box>
        </Box>

        {/* Main Content */}
        <Box
          flex={1}
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {/* Weight Control */}
          <Box
            p="xs"
            style={{
              borderBottom: `1px solid ${COLORS.border}`,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <Text size="9px" c={COLORS.muted}>
              w
            </Text>
            <Slider
              value={weight}
              onChange={setWeight}
              min={0}
              max={1}
              step={0.1}
              w={70}
              color={COLORS.amber}
            />
            <Text size="9px" c={COLORS.muted} w={22}>
              {weight.toFixed(1)}
            </Text>
            <Text size="9px" c={COLORS.muted} ml="auto">
              w=0: node-cost only · w=1: edge-count only
            </Text>
          </Box>

          {/* Visualization Area */}
          <Box
            flex={1}
            style={{ display: "flex", overflow: "hidden", minHeight: 0 }}
          >
            <Box
              flex={1}
              pos="relative"
              style={{ overflow: "hidden", minWidth: 0 }}
            >
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                style={{ display: "block" }}
              >
                {/* SVG visualization will be rendered here */}
              </svg>
              {!tree && (
                <Box
                  pos="absolute"
                  inset={0}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    color: COLORS.muted,
                    pointerEvents: "none",
                  }}
                >
                  <Text size="36px" opacity={0.15}>
                    {" "}
                    Repository Structure Visualization
                  </Text>
                  <Text
                    size="10px"
                    style={{
                      letterSpacing: "0.12em",
                      textAlign: "center",
                      lineHeight: 1.9,
                    }}
                  >
                    Select a preset or drop a .dot file
                    <br />
                    to explore repository entropy
                  </Text>
                </Box>
              )}
            </Box>

            {/* Info Panel */}
            <Box
              w={220}
              style={{
                flexShrink: 0,
                borderLeft: `1px solid ${COLORS.border}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Parent Stats */}
              <Box
                p="xs"
                style={{ borderBottom: `1px solid ${COLORS.border}` }}
              >
                <Text
                  size="8px"
                  c={COLORS.muted}
                  style={{
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                  }}
                >
                  {selected?.name || "parent"}
                </Text>
                <Box p="xs">
                  <Text
                    ta="center"
                    size="22px"
                    fw={700}
                    c={COLORS.amber}
                    style={{ fontFamily: "Syne, sans-serif", padding: "2px 0" }}
                  >
                    {selected
                      ? subtreeH(selected, tree!.byPath, edges).total.toFixed(3)
                      : "---"}
                  </Text>
                </Box>
                {selected && tree && (
                  <Stack gap="xs" mt="xs">
                    {(() => {
                      const { nH, eH, optEH, intEdges } = subtreeH(
                        selected,
                        tree.byPath,
                        edges,
                      );
                      const nLeaves = countLeaves(selected);
                      const waste = Math.max(0, eH - optEH);
                      const wasteCol =
                        waste > 1
                          ? COLORS.red
                          : waste > 0.2
                            ? COLORS.amber
                            : COLORS.green;
                      return (
                        <>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              H_node
                            </Text>
                            <Text size="9px" c={COLORS.text}>
                              {nH.toFixed(3)}
                            </Text>
                          </Group>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              H_edge current
                            </Text>
                            <Text size="9px" c={COLORS.text}>
                              {eH.toFixed(3)}
                            </Text>
                          </Group>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              H_edge optimal
                            </Text>
                            <Text size="9px" c={COLORS.text}>
                              {optEH.toFixed(3)}
                            </Text>
                          </Group>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              edge waste
                            </Text>
                            <Text size="9px" c={wasteCol}>
                              {waste.toFixed(3)}
                            </Text>
                          </Group>
                          <Box
                            style={{
                              borderTop: `1px solid ${COLORS.border}`,
                              marginTop: "3px",
                              paddingTop: "3px",
                            }}
                          >
                            <Group justify="space-between">
                              <Text size="9px" c={COLORS.muted}>
                                files
                              </Text>
                              <Text size="9px" c={COLORS.text}>
                                {nLeaves}
                              </Text>
                            </Group>
                            <Group justify="space-between">
                              <Text size="9px" c={COLORS.muted}>
                                edges
                              </Text>
                              <Text size="9px" c={COLORS.text}>
                                {intEdges.length}
                              </Text>
                            </Group>
                          </Box>
                        </>
                      );
                    })()}
                  </Stack>
                )}
              </Box>

              {/* Child List */}
              {selected && tree && selected.children.length > 0 && (
                <Box
                  p="xs"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                >
                  <Text
                    size="8px"
                    c={COLORS.muted}
                    style={{
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    children ({selected.children.length})
                  </Text>
                  <Stack gap="xs">
                    {selected.children.map((child, i) => {
                      const {
                        total: chH,
                        eH: chEH,
                        optEH: chOpt,
                      } = subtreeH(child, tree.byPath, edges);
                      const chWaste = Math.max(0, chEH - chOpt);
                      const maxWaste = Math.max(
                        ...selected.children.map((c) => {
                          const h = subtreeH(c, tree.byPath, edges);
                          return Math.max(0, h.eH - h.optEH);
                        }),
                        0.001,
                      );
                      const chCol = entropyColor(
                        selected.children.length > 1 ? chWaste / maxWaste : 0,
                      );
                      return (
                        <Paper
                          key={child.id}
                          p="xs"
                          style={{
                            cursor: "pointer",
                            borderLeft: `3px solid ${chCol}`,
                            background:
                              selectedChild?.node.id === child.id
                                ? COLORS.bg2
                                : "transparent",
                          }}
                          onClick={() =>
                            setSelectedChild({ node: child, index: i })
                          }
                        >
                          <Group justify="space-between">
                            <Text
                              size="9px"
                              c={COLORS.text}
                              style={{
                                maxWidth: "140px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {child.name}
                              {child.isLeaf ? " ·" : ""}
                            </Text>
                            <Text size="8px" c={COLORS.muted}>
                              {chH.toFixed(2)}
                            </Text>
                          </Group>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {/* Child Detail Panel or Move Suggestions */}
              {selectedChild && tree ? (
                <Box
                  flex={1}
                  p="xs"
                  style={{
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Text
                    size="8px"
                    c={COLORS.amber}
                    style={{
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedChild.node.name}
                    {selectedChild.node.isLeaf ? " (leaf)" : ""}
                  </Text>
                  <Box flex={1} style={{ overflowY: "auto" }}>
                    {(() => {
                      const { total, nH, eH, optEH, intEdges } = subtreeH(
                        selectedChild.node,
                        tree.byPath,
                        edges,
                      );
                      const nLeaves = countLeaves(selectedChild.node);
                      const waste = Math.max(0, eH - optEH);
                      const wasteCol =
                        waste > 1
                          ? COLORS.red
                          : waste > 0.2
                            ? COLORS.amber
                            : COLORS.green;
                      return (
                        <Stack gap="xs" mt="xs">
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              H total
                            </Text>
                            <Text size="9px" c={COLORS.text}>
                              {total.toFixed(3)}
                            </Text>
                          </Group>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              H_node
                            </Text>
                            <Text size="9px" c={COLORS.text}>
                              {nH.toFixed(3)}
                            </Text>
                          </Group>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              H_edge
                            </Text>
                            <Text size="9px" c={COLORS.text}>
                              {eH.toFixed(3)}
                            </Text>
                          </Group>
                          <Group justify="space-between">
                            <Text size="9px" c={COLORS.muted}>
                              edge waste
                            </Text>
                            <Text size="9px" c={wasteCol}>
                              {waste.toFixed(3)}
                            </Text>
                          </Group>
                          <Box
                            style={{
                              borderTop: `1px solid ${COLORS.border}`,
                              marginTop: "3px",
                              paddingTop: "3px",
                            }}
                          >
                            <Group justify="space-between">
                              <Text size="9px" c={COLORS.muted}>
                                files
                              </Text>
                              <Text size="9px" c={COLORS.text}>
                                {nLeaves}
                              </Text>
                            </Group>
                            <Group justify="space-between">
                              <Text size="9px" c={COLORS.muted}>
                                internal edges
                              </Text>
                              <Text size="9px" c={COLORS.text}>
                                {intEdges.length}
                              </Text>
                            </Group>
                          </Box>
                        </Stack>
                      );
                    })()}
                  </Box>
                </Box>
              ) : (
                <Box
                  flex={1}
                  p="xs"
                  style={{
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Text
                    size="8px"
                    c={COLORS.muted}
                    style={{
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                    }}
                  >
                    move suggestions
                  </Text>
                  <Box flex={1} p="xs" style={{ overflow: "hidden" }}>
                    <Text size="9px" c={COLORS.muted} fs="italic">
                      {tree ? "no improvements found" : "load a repo"}
                    </Text>
                  </Box>
                </Box>
              )}

              {/* Legend */}
              <Box
                p="xs"
                style={{
                  borderTop: `1px solid ${COLORS.border}`,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                <Group gap={4}>
                  <Box
                    w={16}
                    h={3}
                    bg={COLORS.green}
                    style={{ borderRadius: "1px" }}
                  />
                  <Text size="8px" c={COLORS.muted}>
                    optimal
                  </Text>
                </Group>
                <Group gap={4}>
                  <Box
                    w={16}
                    h={3}
                    bg={COLORS.amber}
                    style={{ borderRadius: "1px" }}
                  />
                  <Text size="8px" c={COLORS.muted}>
                    medium
                  </Text>
                </Group>
                <Group gap={4}>
                  <Box
                    w={16}
                    h={3}
                    bg={COLORS.red}
                    style={{ borderRadius: "1px" }}
                  />
                  <Text size="8px" c={COLORS.muted}>
                    misplaced
                  </Text>
                </Group>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
