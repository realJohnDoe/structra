import { useMemo, useState } from "react";
import { AppShell, Badge, Box, Grid, Group, Stack, Text, Title } from "@mantine/core";
import { FileTreePanel } from "./components/FileTreePanel";
import { GraphPanel } from "./components/GraphPanel";
import { NodeEditor } from "./components/NodeEditor";
import {
  buildFileTree,
  cloneNodeMap,
  computeAll,
  computeScore,
  createNodeMap,
  mentionEdges,
  PRESETS,
  type NodeMap,
} from "./lib/mentionTree";

const COLORS = {
  bg: "#0f0f0f",
  cut: "#f0a060",
  block: "#60c8f0",
  centroid: "#c8f060",
  chain: "#a060f0",
  accent: "#c8f060",
  accent2: "#60c8f0",
};

function App() {
  const [nodes, setNodes] = useState<NodeMap>(() => createPreset("star+chain"));
  const data = useMemo(() => computeAll(nodes), [nodes]);
  const tree = useMemo(() => buildFileTree(nodes, data), [nodes, data]);
  const score = useMemo(() => computeScore(nodes, tree), [nodes, tree]);

  const mentionGraph = useMemo(() => {
    if (!data) return { ids: [], edges: [] };
    return { ids: data.ids, edges: mentionEdges(nodes, data.ids) };
  }, [data, nodes]);

  return (
    <AppShell
      padding="sm"
      header={{ height: 68 }}
      styles={{
        main: { background: COLORS.bg, color: "#e8e8e8", minHeight: "100vh" },
        header: { background: "#161616", borderColor: "#2a2a2a" },
      }}
    >
      <AppShell.Header>
        <Group px="md" py="sm" justify="space-between">
          <Stack gap={0}>
            <Title order={3} c={COLORS.accent} ff="Fraunces, serif">
              MentionTree
            </Title>
            <Text size="xs" c="dimmed" fs="italic">
              block-cut tree sandbox
            </Text>
          </Stack>
          <Badge variant="light" color="cyan">
            score: {score ?? "—"}
          </Badge>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Grid gap="sm" align="stretch">
          <Grid.Col span={{ base: 12, md: 3 }}>
            <NodeEditor
              nodes={nodes}
              onAddNode={(name) =>
                setNodes((prev) => {
                  const next = cloneNodeMap(prev);
                  const max = Object.keys(next)
                    .map((id) => Number(id.slice(1)))
                    .filter((n) => Number.isFinite(n))
                    .reduce((a, b) => Math.max(a, b), 0);
                  const id = `n${max + 1}`;
                  next[id] = { id, name, mentions: new Set() };
                  return next;
                })
              }
              onRemoveNode={(id) =>
                setNodes((prev) => {
                  const next = cloneNodeMap(prev);
                  delete next[id];
                  Object.values(next).forEach((n) => n.mentions.delete(id));
                  return next;
                })
              }
              onAddMention={(a, b) =>
                setNodes((prev) => {
                  if (!a || !b || a === b || !prev[a] || !prev[b]) return prev;
                  const next = cloneNodeMap(prev);
                  next[a].mentions.add(b);
                  next[b].mentions.add(a);
                  return next;
                })
              }
              onRemoveMention={(a, b) =>
                setNodes((prev) => {
                  if (!prev[a] || !prev[b]) return prev;
                  const next = cloneNodeMap(prev);
                  next[a].mentions.delete(b);
                  next[b].mentions.delete(a);
                  return next;
                })
              }
              onLoadPreset={(name) => {
                setNodes(createPreset(name));
              }}
              onImportDot={(dotText) => {
                console.info("[dot-import] received chars:", dotText.length);
                const imported = createFromDot(dotText);
                if (imported) {
                  console.info("[dot-import] imported nodes:", Object.keys(imported).length);
                  setNodes(imported);
                  return;
                }
                console.warn("[dot-import] parser returned null");
                setNodes(createNodeMap());
                window.alert("No nodes or edges found in this DOT file.");
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Box className="viz-grid-2x2">
              <Box className="panel-fill">
            <GraphPanel
                  title="1 · MENTION GRAPH"
                  dotColor={COLORS.accent2}
                  legend={[
                    { label: "cut vertex", color: COLORS.cut },
                    { label: "regular node", color: COLORS.block },
                  ]}
                  nodeIds={mentionGraph.ids}
                  edges={mentionGraph.edges}
                  nodeColor={(id) => (data?.cutVertices.has(id) ? COLORS.cut : COLORS.block)}
                  nodeLabel={(id) => nodes[id]?.name ?? id}
                />
              </Box>
              <Box className="panel-fill">
                <GraphPanel
                  title="2 · RAW BC-TREE"
                  dotColor={COLORS.block}
                  legend={[
                    { label: "cut vertex", color: COLORS.cut },
                    { label: "block node", color: COLORS.block },
                  ]}
                  nodeIds={data?.bcNodes.map((n) => n.id) ?? []}
                  edges={data?.bcEdges ?? []}
                  nodeColor={(id) => (id.startsWith("C:") ? COLORS.cut : COLORS.block)}
                  nodeLabel={(id) => data?.bcNodes.find((n) => n.id === id)?.label ?? id}
                />
              </Box>
              <Box className="panel-fill">
                <GraphPanel
                  title="3 · COLLAPSED + CENTROID"
                  dotColor={COLORS.chain}
                  legend={[
                    { label: "centroid", color: COLORS.centroid },
                    { label: "junction/cut", color: COLORS.cut },
                    { label: "chain/leaves", color: COLORS.chain },
                    { label: "block", color: COLORS.block },
                  ]}
                  nodeIds={data?.collNodes.map((n) => n.id) ?? []}
                  edges={data?.collEdges ?? []}
                  nodeColor={(id) => {
                    if (data?.centroidSupers.has(id)) return COLORS.centroid;
                    if (id.startsWith("CG:")) return COLORS.chain;
                    if (id.startsWith("C:")) return COLORS.cut;
                    return COLORS.block;
                  }}
                  nodeLabel={(id) => data?.collNodes.find((n) => n.id === id)?.label ?? id}
                />
              </Box>
              <Box className="panel-fill">
                <FileTreePanel tree={tree} />
              </Box>
            </Box>
          </Grid.Col>
        </Grid>
      </AppShell.Main>
    </AppShell>
  );
}

function createPreset(name: string): NodeMap {
  const p = PRESETS[name];
  if (!p) return createNodeMap();
  const nodes: NodeMap = {};
  p.nodeNames.forEach((nodeName, i) => {
    const id = `n${i + 1}`;
    nodes[id] = { id, name: nodeName, mentions: new Set() };
  });
  const byName: Record<string, string> = {};
  Object.values(nodes).forEach((n) => (byName[n.name] = n.id));
  p.edges.forEach(([a, b]) => {
    const na = byName[a];
    const nb = byName[b];
    if (!na || !nb) return;
    nodes[na].mentions.add(nb);
    nodes[nb].mentions.add(na);
  });
  return nodes;
}

function createFromDot(dotText: string): NodeMap | null {
  const nodeNames = new Set<string>();
  const edgeSet = new Set<string>();
  let scannedLines = 0;
  let skippedLines = 0;
  const sampleSkipped: string[] = [];

  const clean = dotText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const readId = (s: string) => {
    const t = s.trim();
    if (!t) return "";
    if (t.startsWith("\"")) {
      const end = t.indexOf("\"", 1);
      return end > 0 ? t.slice(1, end) : "";
    }
    const m = t.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    return m?.[0] ?? "";
  };

  for (const rawLine of clean.split(/\r?\n/)) {
    scannedLines++;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === "{" || trimmed === "}") {
      skippedLines++;
      continue;
    }
    if (/^(graph|digraph|strict|subgraph)\b/i.test(trimmed)) {
      skippedLines++;
      continue;
    }

    const stmt = trimmed.split(";")[0]?.trim() ?? "";
    if (!stmt) {
      skippedLines++;
      continue;
    }
    if (/^(node|edge|rankdir|concentrate)\b/i.test(stmt)) {
      skippedLines++;
      continue;
    }

    if (stmt.includes("->") || stmt.includes("--")) {
      const op = stmt.includes("->") ? "->" : "--";
      const left = stmt.split("[")[0].trim();
      const parts = left.split(op).map((p) => readId(p)).filter(Boolean);
      if (!parts.length && sampleSkipped.length < 6) sampleSkipped.push(trimmed);
      for (let i = 0; i < parts.length - 1; i++) {
        const a = parts[i];
        const b = parts[i + 1];
        if (a === b) continue;
        nodeNames.add(a);
        nodeNames.add(b);
        edgeSet.add([a, b].sort((x, y) => x.localeCompare(y)).join("||"));
      }
      continue;
    }

    const head = stmt.split("[")[0].trim();
    const id = readId(head);
    if (!id) {
      skippedLines++;
      if (sampleSkipped.length < 6) sampleSkipped.push(trimmed);
      continue;
    }
    if (id === "node" || id === "edge" || id === "graph" || id === "digraph" || id === "subgraph" || id === "strict") {
      skippedLines++;
      continue;
    }
    nodeNames.add(id);
  }

  console.info("[dot-import] parse stats", {
    scannedLines,
    skippedLines,
    nodeCount: nodeNames.size,
    edgeCount: edgeSet.size,
    sampleSkipped,
  });

  if (!nodeNames.size) return null;
  const sortedNames = [...nodeNames].sort((a, b) => a.localeCompare(b));
  const nodes: NodeMap = {};
  const byName: Record<string, string> = {};
  sortedNames.forEach((name, i) => {
    const id = `n${i + 1}`;
    nodes[id] = { id, name, mentions: new Set() };
    byName[name] = id;
  });

  edgeSet.forEach((k) => {
    const [a, b] = k.split("||");
    const na = byName[a];
    const nb = byName[b];
    if (!na || !nb) return;
    nodes[na].mentions.add(nb);
    nodes[nb].mentions.add(na);
  });
  return nodes;
}

export default App;
