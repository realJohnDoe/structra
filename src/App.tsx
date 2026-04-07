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
                const imported = createFromDot(dotText);
                if (imported) setNodes(imported);
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

  const clean = dotText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*/gm, "");
  const quotedNode = /"([^"]+)"/g;
  for (const line of clean.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(graph|digraph|strict)\b/i.test(trimmed) || trimmed === "{" || trimmed === "}") continue;

    const edgeMatch = trimmed.match(/("?[^"\s;{}]+"?)\s*(--|->)\s*("?[^"\s;{}]+"?)/);
    if (edgeMatch) {
      const a = edgeMatch[1].replace(/^"|"$/g, "");
      const b = edgeMatch[3].replace(/^"|"$/g, "");
      if (!a || !b || a === b) continue;
      nodeNames.add(a);
      nodeNames.add(b);
      edgeSet.add([a, b].sort((x, y) => x.localeCompare(y)).join("||"));
      continue;
    }

    const localQuoted = [...trimmed.matchAll(quotedNode)].map((m) => m[1]).filter(Boolean);
    if (localQuoted.length === 1 && !trimmed.includes("--") && !trimmed.includes("->")) {
      nodeNames.add(localQuoted[0]);
      continue;
    }

    const bareNode = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[.*\])?;?$/);
    if (bareNode) nodeNames.add(bareNode[1]);
  }

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
