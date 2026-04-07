import { useMemo, useState } from "react";
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
    <>
      <header>
        <h1>MentionTree</h1>
        <span className="subtitle">block-cut tree sandbox</span>
        <div className="score-badge">
          score: <span>{score ?? "—"}</span>
        </div>
      </header>
      <div className="app">
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
        />
        <div className="viz-col">
          <div className="viz-grid">
            <GraphPanel
              title="1 · MENTION GRAPH"
              dotClass="accent2"
              legend={[
                { label: "cut vertex", className: "cut" },
                { label: "regular node", className: "block" },
              ]}
              nodeIds={mentionGraph.ids}
              edges={mentionGraph.edges}
              nodeColor={(id) => (data?.cutVertices.has(id) ? "var(--col-cut)" : "var(--col-block)")}
              nodeLabel={(id) => nodes[id]?.name ?? id}
            />
            <GraphPanel
              title="2 · RAW BC-TREE"
              dotClass="block"
              legend={[
                { label: "cut vertex", className: "cut" },
                { label: "block node", className: "block" },
              ]}
              nodeIds={data?.bcNodes.map((n) => n.id) ?? []}
              edges={data?.bcEdges ?? []}
              nodeColor={(id) => (id.startsWith("C:") ? "var(--col-cut)" : "var(--col-block)")}
              nodeLabel={(id) => data?.bcNodes.find((n) => n.id === id)?.label ?? id}
            />
            <GraphPanel
              title="3 · COLLAPSED + CENTROID"
              dotClass="chain"
              legend={[
                { label: "centroid", className: "centroid" },
                { label: "junction/cut", className: "cut" },
                { label: "chain/leaves", className: "chain" },
                { label: "block", className: "block" },
              ]}
              nodeIds={data?.collNodes.map((n) => n.id) ?? []}
              edges={data?.collEdges ?? []}
              nodeColor={(id) => {
                if (data?.centroidSupers.has(id)) return "var(--col-centroid)";
                if (id.startsWith("CG:")) return "var(--col-chain)";
                if (id.startsWith("C:")) return "var(--col-cut)";
                return "var(--col-block)";
              }}
              nodeLabel={(id) => data?.collNodes.find((n) => n.id === id)?.label ?? id}
            />
            <FileTreePanel tree={tree} />
          </div>
        </div>
      </div>
    </>
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

export default App;
