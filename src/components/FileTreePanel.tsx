import { Box, Paper, ScrollArea, Text } from "@mantine/core";
import type { TreeNode } from "../lib/mentionTree";

export function FileTreePanel({ tree }: { tree: TreeNode | null }) {
  return (
    <Paper withBorder radius="md" style={{ display: "flex", flexDirection: "column", minHeight: 220, overflow: "hidden" }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} px="sm" py={6} style={{ borderBottom: "1px solid var(--mantine-color-dark-4)" }}>
        4 · FILE TREE
      </Text>
      <ScrollArea style={{ flex: 1 }} p="sm">
        {tree ? <TreeNodeView node={tree} depth={0} /> : <Text c="dimmed">Add nodes to see the tree.</Text>}
      </ScrollArea>
    </Paper>
  );
}

function TreeNodeView({ node, depth }: { node: TreeNode; depth: number }) {
  const icon = node.isDir ? "▸" : "·";
  const color = node.unnamed ? "#60c8f0" : node.isDir ? "#c8f060" : "#e8e8e8";
  return (
    <Box>
      <Box className="tree-row" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
        <Text className="tree-icon">{icon}</Text>
        <Text size="sm" style={{ color }}>
          {node.unnamed ? "?" : node.name || "/"}
        </Text>
      </Box>
      {node.children.length > 0 && (
        <Box className="tree-children">
          {[...node.children]
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .map((child, i) => (
            <TreeNodeView key={`${child.name}-${i}`} node={child} depth={depth + 1} />
            ))}
        </Box>
      )}
    </Box>
  );
}
