import { useEffect, useMemo, useRef } from "react";
import { drawGraph, initLayout, stepLayout, type ForceLayout } from "../lib/layout";
import type { GraphEdge } from "../lib/mentionTree";

type Props = {
  title: string;
  dotClass: string;
  legend: { label: string; className: string }[];
  nodeIds: string[];
  edges: GraphEdge[];
  nodeColor: (id: string) => string;
  nodeLabel: (id: string) => string;
};

export function GraphPanel({ title, dotClass, legend, nodeIds, edges, nodeColor, nodeLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<ForceLayout | null>(null);
  const signature = useMemo(() => [...nodeIds].sort().join("|"), [nodeIds]);

  useEffect(() => {
    if (!canvasRef.current || !nodeIds.length) return;
    const current = layoutRef.current;
    if (!current || signature !== [...current.nodes].sort().join("|")) {
      const next = initLayout(nodeIds, edges);
      stepLayout(next, 200);
      layoutRef.current = next;
    } else {
      current.edges = edges;
      stepLayout(current, 5);
    }
    drawGraph(canvasRef.current, layoutRef.current!, nodeColor, nodeLabel);
  }, [edges, nodeColor, nodeIds, nodeLabel, signature]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!canvasRef.current || !layoutRef.current) return;
      drawGraph(canvasRef.current, layoutRef.current, nodeColor, nodeLabel);
    });
    const parent = canvasRef.current.parentElement;
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [nodeColor, nodeLabel]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className={`dot ${dotClass}`}></div>
        {title}
      </div>
      <div className="panel-body">
        <canvas ref={canvasRef} />
      </div>
      <div className="legend">
        {legend.map((l) => (
          <div className="leg" key={l.label}>
            <div className={`leg-dot ${l.className}`}></div>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
