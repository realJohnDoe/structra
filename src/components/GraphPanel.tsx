import { useEffect, useMemo, useRef } from "react";
import { Box, Group, Paper, Text } from "@mantine/core";
import { drawGraph, initLayout, stepLayout, type ForceLayout } from "../lib/layout";
import type { GraphEdge } from "../lib/mentionTree";

type Props = {
  title: string;
  dotColor: string;
  legend: { label: string; color: string }[];
  nodeIds: string[];
  edges: GraphEdge[];
  nodeColor: (id: string) => string;
  nodeLabel: (id: string) => string;
};

export function GraphPanel({ title, dotColor, legend, nodeIds, edges, nodeColor, nodeLabel }: Props) {
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
    <Paper withBorder radius="md" style={{ display: "flex", flexDirection: "column", minHeight: 220, overflow: "hidden" }}>
      <Group px="sm" py={6} gap={6} style={{ borderBottom: "1px solid var(--mantine-color-dark-4)" }}>
        <Box w={6} h={6} style={{ borderRadius: "50%", background: dotColor }} />
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 1.2 }}>
          {title}
        </Text>
      </Group>
      <Box style={{ flex: 1, minHeight: 180, position: "relative" }}>
        <canvas ref={canvasRef} />
      </Box>
      <Group gap="sm" px="sm" py={6} style={{ borderTop: "1px solid var(--mantine-color-dark-4)", flexWrap: "wrap" }}>
        {legend.map((l) => (
          <Group gap={4} key={l.label}>
            <Box w={8} h={8} style={{ borderRadius: "50%", background: l.color }} />
            <Text size="xs">{l.label}</Text>
          </Group>
        ))}
      </Group>
    </Paper>
  );
}
