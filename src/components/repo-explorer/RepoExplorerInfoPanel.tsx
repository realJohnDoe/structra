import { Box, Text, Group, Paper, Stack } from "@mantine/core";

interface COLORS {
  bg: string;
  border: string;
  muted: string;
  amber: string;
  text: string;
  red: string;
  green: string;
  bg2: string;
  dim: string;
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  children: TreeNode[];
  parent: TreeNode | null;
  isLeaf: boolean;
}

interface Edge {
  from: string;
  to: string;
}

interface SubtreeData {
  total: number;
  nH: number;
  eH: number;
  optEH: number;
  intEdges: Edge[];
}

interface RepoExplorerInfoPanelProps {
  selected: TreeNode | null;
  selectedChild: { node: TreeNode; index: number } | null;
  tree: { root: TreeNode; byPath: Record<string, TreeNode> } | null;
  edges: Edge[];
  weight: number;
  colors: COLORS;
  onChildSelect: (child: TreeNode, index: number) => void;
}

// Helper functions
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
  W: number,
): number {
  const na = byPath[a];
  const nb = byPath[b];
  if (!na || !nb) return 0;
  const path = pathNodes(na, nb);
  const internalNodes = path.filter((nd) => !nd.isLeaf && nd.children.length > 0);
  const pathLen = internalNodes.length;
  const sumLnK = internalNodes.reduce(
    (s, nd) => s + Math.log(Math.max(2, nd.children.length)),
    0,
  );
  return W * pathLen + (1 - W) * sumLnK;
}

function optEdgeCost(W: number): number {
  const optLnK = Math.log(2);
  return W * 1 + (1 - W) * optLnK;
}

function nodeStructCost(nd: TreeNode, W: number): number {
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
  W: number,
): SubtreeData {
  const ids = getSubtreeIds(nd);
  const nH = nodeStructCost(nd, W);
  const intEdges = edgeArr.filter((e) => ids.has(e.from) && ids.has(e.to));
  let eH = intEdges.reduce((s, e) => s + edgeCost(byPath, e.from, e.to, W), 0);
  const optEH = intEdges.length * optEdgeCost(W);
  return { total: nH + eH, nH, eH, optEH, intEdges };
}

function countLeaves(nd: TreeNode): number {
  if (nd.isLeaf) return 1;
  return nd.children.reduce((s, c) => s + countLeaves(c), 0);
}

export const RepoExplorerInfoPanel: React.FC<RepoExplorerInfoPanelProps> = ({
  selected,
  selectedChild,
  tree,
  edges,
  weight,
  colors,
  onChildSelect,
}) => {
  return (
    <Box
      w={220}
      style={{
        flexShrink: 0,
        borderLeft: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Parent Stats */}
      <Box p="xs" style={{ borderBottom: `1px solid ${colors.border}` }}>
        <Text
          size="8px"
          c={colors.muted}
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
            c={colors.amber}
            style={{ fontFamily: "Syne, sans-serif", padding: "2px 0" }}
          >
            {selected && tree
              ? subtreeH(selected, tree.byPath, edges, weight).total.toFixed(3)
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
                weight,
              );
              const nLeaves = countLeaves(selected);
              const waste = Math.max(0, eH - optEH);
              const wasteCol =
                waste > 1 ? colors.red : waste > 0.2 ? colors.amber : colors.green;
              return (
                <>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      H_node
                    </Text>
                    <Text size="9px" c={colors.text}>
                      {nH.toFixed(3)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      H_edge current
                    </Text>
                    <Text size="9px" c={colors.text}>
                      {eH.toFixed(3)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      H_edge optimal
                    </Text>
                    <Text size="9px" c={colors.text}>
                      {optEH.toFixed(3)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      edge waste
                    </Text>
                    <Text size="9px" c={wasteCol}>
                      {waste.toFixed(3)}
                    </Text>
                  </Group>
                  <Box
                    style={{
                      borderTop: `1px solid ${colors.border}`,
                      marginTop: "3px",
                      paddingTop: "3px",
                    }}
                  >
                    <Group justify="space-between">
                      <Text size="9px" c={colors.muted}>
                        files
                      </Text>
                      <Text size="9px" c={colors.text}>
                        {nLeaves}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="9px" c={colors.muted}>
                        edges
                      </Text>
                      <Text size="9px" c={colors.text}>
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
        <Box p="xs" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Text
            size="8px"
            c={colors.muted}
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
              const { total: chH, eH: chEH, optEH: chOpt } = subtreeH(
                child,
                tree.byPath,
                edges,
                weight,
              );
              const chWaste = Math.max(0, chEH - chOpt);
              const maxWaste = Math.max(
                ...selected.children.map((c) => {
                  const h = subtreeH(c, tree.byPath, edges, weight);
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
                        ? colors.bg2
                        : "transparent",
                  }}
                  onClick={() => onChildSelect(child, i)}
                >
                  <Group justify="space-between">
                    <Text
                      size="9px"
                      c={colors.text}
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
                    <Text size="8px" c={colors.muted}>
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
            c={colors.amber}
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
                weight,
              );
              const nLeaves = countLeaves(selectedChild.node);
              const waste = Math.max(0, eH - optEH);
              const wasteCol =
                waste > 1 ? colors.red : waste > 0.2 ? colors.amber : colors.green;
              return (
                <Stack gap="xs" mt="xs">
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      H total
                    </Text>
                    <Text size="9px" c={colors.text}>
                      {total.toFixed(3)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      H_node
                    </Text>
                    <Text size="9px" c={colors.text}>
                      {nH.toFixed(3)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      H_edge
                    </Text>
                    <Text size="9px" c={colors.text}>
                      {eH.toFixed(3)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="9px" c={colors.muted}>
                      edge waste
                    </Text>
                    <Text size="9px" c={wasteCol}>
                      {waste.toFixed(3)}
                    </Text>
                  </Group>
                  <Box
                    style={{
                      borderTop: `1px solid ${colors.border}`,
                      marginTop: "3px",
                      paddingTop: "3px",
                    }}
                  >
                    <Group justify="space-between">
                      <Text size="9px" c={colors.muted}>
                        files
                      </Text>
                      <Text size="9px" c={colors.text}>
                        {nLeaves}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="9px" c={colors.muted}>
                        internal edges
                      </Text>
                      <Text size="9px" c={colors.text}>
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
            c={colors.muted}
            style={{
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            move suggestions
          </Text>
          <Box flex={1} p="xs" style={{ overflow: "hidden" }}>
            <Text size="9px" c={colors.muted} fs="italic">
              {tree ? "no improvements found" : "load a repo"}
            </Text>
          </Box>
        </Box>
      )}

      {/* Legend */}
      <Box
        p="xs"
        style={{
          borderTop: `1px solid ${colors.border}`,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >
        <Group gap={4}>
          <Box w={16} h={3} bg={colors.green} style={{ borderRadius: "1px" }} />
          <Text size="8px" c={colors.muted}>
            optimal
          </Text>
        </Group>
        <Group gap={4}>
          <Box w={16} h={3} bg={colors.amber} style={{ borderRadius: "1px" }} />
          <Text size="8px" c={colors.muted}>
            medium
          </Text>
        </Group>
        <Group gap={4}>
          <Box w={16} h={3} bg={colors.red} style={{ borderRadius: "1px" }} />
          <Text size="8px" c={colors.muted}>
            misplaced
          </Text>
        </Group>
      </Box>
    </Box>
  );
};
