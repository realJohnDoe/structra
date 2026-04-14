import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Slider, Text } from "@mantine/core";
import {
  RepoExplorerHeader,
  RepoExplorerSidebar,
  RepoExplorerVisualization,
  RepoExplorerInfoPanel,
} from "./repo-explorer";
import type { TreeNode, Edge, SubtreeData } from "./repo-explorer/types";
import { COLORS, PRESETS, PRESET_GROUPS } from "./repo-explorer/types";

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

function globalH(
  tree: { root: TreeNode; byPath: Record<string, TreeNode> },
  edges: Edge[],
  W: number,
): number {
  // Simplified - full implementation is in the sub-components
  return 0;
}

// Main component
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
    setSelectedChild({ node, index });
  }, []);

  const handleNavigate = useCallback((node: TreeNode) => {
    setSelected(node);
    setSelectedChild(null);
  }, []);

  const handleNavigateUp = useCallback(() => {
    if (selected?.parent) {
      setSelected(selected.parent);
      setSelectedChild(null);
    }
  }, [selected]);

  const handleReset = useCallback(() => {
    if (!tree) return;
    let startNode = tree.root;
    while (startNode.children.length === 1 && !startNode.isLeaf) {
      startNode = startNode.children[0];
    }
    setSelected(startNode);
    setSelectedChild(null);
  }, [tree]);

  // Load default preset
  useEffect(() => {
    handlePresetClick("numpy");
  }, [handlePresetClick]);

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
      globalH: globalH(tree, edges, weight),
    };
  }, [tree, edges, weight]);

  return (
    <Box
      h="100vh"
      bg={COLORS.bg}
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <RepoExplorerHeader
        repoLabel={repoLabel}
        hasParent={!!selected?.parent}
        colors={COLORS}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNavigateUp={handleNavigateUp}
        onReset={handleReset}
      />

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
          <RepoExplorerSidebar
            isDragging={isDragging}
            stats={stats}
            presets={PRESETS}
            presetGroups={PRESET_GROUPS}
            colors={COLORS}
            onFileUpload={handleFileUpload}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onPresetClick={handlePresetClick}
          />
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
            <RepoExplorerVisualization
              selected={selected}
              tree={tree}
              edges={edges}
              weight={weight}
              colors={COLORS}
              onNodeClick={handleNodeClick}
              onNavigate={handleNavigate}
            />

            <RepoExplorerInfoPanel
              selected={selected}
              selectedChild={selectedChild}
              tree={tree}
              edges={edges}
              weight={weight}
              colors={COLORS}
              onChildSelect={handleNodeClick}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// Re-export types for external use
export type { TreeNode, Edge, SubtreeData } from "./repo-explorer/types";
