import { useRef, useEffect } from "react";
import { Box, Text } from "@mantine/core";

interface COLORS {
  bg: string;
  muted: string;
  amber: string;
  text: string;
  green: string;
  red: string;
  border: string;
  dim: string;
  bright: string;
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

interface RepoExplorerVisualizationProps {
  selected: TreeNode | null;
  tree: { root: TreeNode; byPath: Record<string, TreeNode> } | null;
  edges: Edge[];
  weight: number;
  colors: COLORS;
  onNodeClick: (node: TreeNode, index: number) => void;
  onNavigate: (node: TreeNode) => void;
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

export const RepoExplorerVisualization: React.FC<RepoExplorerVisualizationProps> = ({
  selected,
  tree,
  edges,
  weight,
  colors,
  onNodeClick,
  onNavigate,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!selected || !tree || !svgRef.current) return;

    const svg = svgRef.current;
    const W_px = svg.clientWidth || 500;
    const H_px = svg.clientHeight || 500;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${W_px} ${H_px}`);
    const cx = W_px / 2;
    const cy = H_px / 2;

    // Dot grid background
    const gridGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridGroup.setAttribute("opacity", "0.035");
    for (let x = 0; x < W_px; x += 24) {
      for (let y = 0; y < H_px; y += 24) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x.toString());
        circle.setAttribute("cy", y.toString());
        circle.setAttribute("r", "0.8");
        circle.setAttribute("fill", "#fff");
        gridGroup.appendChild(circle);
      }
    }
    svg.appendChild(gridGroup);

    const children = selected.children;
    if (!children.length) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("x", cx.toString());
      text.setAttribute("y", cy.toString());
      text.setAttribute("fill", "#445");
      text.setAttribute("font-size", "13");
      text.setAttribute("font-family", "IBM Plex Mono, monospace");
      text.textContent = selected.name + " (leaf)";
      svg.appendChild(text);
      return;
    }

    const n = children.length;
    const R = Math.min(cx, cy) * 0.78;

    // Calculate arc layout based on entropy
    const childHvals = children.map((c) => subtreeH(c, tree.byPath, edges, weight));
    const totalChildH = childHvals.reduce((s, h) => s + Math.max(h.total, 0.01), 0);
    const minArcFrac = 0.03;
    const gapTotal = n * 0.025;
    const usable = 2 * Math.PI - gapTotal;
    const arcFracs = childHvals.map((h) => {
      const raw = Math.max(h.total, 0.01) / totalChildH;
      return Math.max(raw, minArcFrac / n);
    });
    const fracSum = arcFracs.reduce((a, b) => a + b, 0);
    const arcSpans = arcFracs.map((f) => (f / fracSum) * usable);
    const gapPer = gapTotal / n;

    // Compute start angles
    let curA = -Math.PI / 2;
    const arcMid: number[] = [];
    const arcStart: number[] = [];
    const arcEnd: number[] = [];
    arcSpans.forEach((span, i) => {
      arcStart.push(curA);
      arcMid.push(curA + span / 2);
      arcEnd.push(curA + span);
      curA += span + gapPer;
    });

    // Arc thickness
    const arcThick = Math.min(34, Math.max(14, Math.min(W_px, H_px) * 0.055));
    const innerR = R - arcThick / 2;
    const outerR = R + arcThick / 2;
    const chordR = innerR - 4;

    // Compute cross-edge bundles
    const childIds = children.map((c) => getSubtreeIds(c));
    const bundles: Record<string, any> = {};
    let maxBundleH = 0.001;

    for (const e of edges) {
      let fi = -1,
        ti = -1;
      childIds.forEach((ids, i) => {
        if (ids.has(e.from)) fi = i;
        if (ids.has(e.to)) ti = i;
      });
      if (fi >= 0 && ti >= 0 && fi !== ti) {
        const k = Math.min(fi, ti) + "_" + Math.max(fi, ti);
        if (!bundles[k]) {
          bundles[k] = {
            from: Math.min(fi, ti),
            to: Math.max(fi, ti),
            totalH: 0,
            optH: 0,
            count: 0,
            edgeList: [],
          };
        }
        const ec = edgeCost(tree.byPath, e.from, e.to, weight);
        const oc = optEdgeCost(weight);
        bundles[k].totalH += ec;
        bundles[k].optH += oc;
        bundles[k].count++;
        bundles[k].edgeList.push({
          from: e.from,
          to: e.to,
          cost: ec,
          opt: oc,
          waste: Math.max(0, ec - oc),
        });
        if (bundles[k].totalH > maxBundleH) maxBundleH = bundles[k].totalH;
      }
    }

    const bundleVals = Object.values(bundles).map((b: any) => b.totalH);
    const minBH = bundleVals.length ? Math.min(...bundleVals) : 0;
    const rangeBH = Math.max(maxBundleH - minBH, 0.001);

    // Draw chords
    for (const b of Object.values(bundles)) {
      const ai = arcMid[b.from];
      const aj = arcMid[b.to];
      const x1 = cx + chordR * Math.cos(ai);
      const y1 = cy + chordR * Math.sin(ai);
      const x2 = cx + chordR * Math.cos(aj);
      const y2 = cy + chordR * Math.sin(aj);
      const ctrl = 0.3;
      const bx1 = cx + chordR * ctrl * Math.cos(ai);
      const by1 = cy + chordR * ctrl * Math.sin(ai);
      const bx2 = cx + chordR * ctrl * Math.cos(aj);
      const by2 = cy + chordR * ctrl * Math.sin(aj);
      const waste = b.totalH > 0 ? (b.totalH - b.optH) / b.totalH : 0;
      const col = entropyColor(Math.min(1, waste * 1.3));
      const relH = (b.totalH - minBH) / rangeBH;
      const sw = Math.max(0.7, 0.8 + relH * 3.2);
      const opacity = 0.3 + 0.5 * relH;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = `M${x1},${y1} C${bx1},${by1} ${bx2},${by2} ${x2},${y2}`;
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", col);
      path.setAttribute("stroke-width", sw.toFixed(2));
      path.setAttribute("opacity", opacity.toFixed(2));
      path.setAttribute("stroke-linecap", "square");
      path.setAttribute("data-from", b.from.toString());
      path.setAttribute("data-to", b.to.toString());
      path.setAttribute("data-sw", sw.toFixed(2));
      path.setAttribute("data-op", opacity.toFixed(2));
      svg.appendChild(path);
    }

    // Max WASTE for color
    const maxWaste = Math.max(
      ...childHvals.map((h) => h.eH - h.optEH),
      0.001,
    );

    // Node arcs
    children.forEach((ch, i) => {
      const h = childHvals[i];
      const aS = arcStart[i];
      const aE = arcEnd[i];

      const waste = (h.eH - h.optEH) / Math.max(maxWaste, 0.001);
      const col = entropyColor(Math.min(1, waste));

      const x1o = cx + outerR * Math.cos(aS);
      const y1o = cy + outerR * Math.sin(aS);
      const x2o = cx + outerR * Math.cos(aE);
      const y2o = cy + outerR * Math.sin(aE);
      const x1i = cx + innerR * Math.cos(aE);
      const y1i = cy + innerR * Math.sin(aE);
      const x2i = cx + innerR * Math.cos(aS);
      const y2i = cy + innerR * Math.sin(aS);
      const lg = aE - aS > Math.PI ? 1 : 0;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("cursor", "pointer");
      g.setAttribute("data-idx", i.toString());

      const arcPath = `M${x1o},${y1o} A${outerR},${outerR} 0 ${lg},1 ${x2o},${y2o} L${x1i},${y1i} A${innerR},${innerR} 0 ${lg},0 ${x2i},${y2i} Z`;
      const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arc.setAttribute("d", arcPath);
      arc.setAttribute("fill", col);
      arc.setAttribute("opacity", "0.85");
      arc.setAttribute("stroke", colors.bg);
      arc.setAttribute("stroke-width", "1.5");
      g.appendChild(arc);

      let tapCount = 0;
      let tapTimer: number | null = null;

      g.addEventListener("click", (ev) => {
        ev.stopPropagation();

        // Highlight chords for this arc
        svg.querySelectorAll("path[data-from]").forEach((p) => {
          const from = parseInt(p.getAttribute("data-from") || "0");
          const to = parseInt(p.getAttribute("data-to") || "0");
          const conn = from === i || to === i;
          const origSw = parseFloat(p.getAttribute("data-sw") || "1");
          p.setAttribute("stroke-width", conn ? (origSw * 2).toFixed(2) : "0.4");
          p.setAttribute("opacity", conn ? "0.9" : "0.08");
        });

        svg.querySelectorAll("g[data-idx]").forEach((gr) => {
          const path = gr.querySelector("path");
          if (path) {
            path.setAttribute(
              "opacity",
              parseInt(gr.getAttribute("data-idx") || "0") === i ? "1" : "0.35",
            );
          }
        });

        onNodeClick(ch, i);

        // Double-tap to navigate
        tapCount++;
        if (tapTimer) clearTimeout(tapTimer);
        if (tapCount >= 2 && !ch.isLeaf) {
          onNavigate(ch);
          tapCount = 0;
          return;
        }
        tapTimer = window.setTimeout(() => {
          tapCount = 0;
        }, 500);
      });

      g.addEventListener("mouseenter", () => arc.setAttribute("opacity", "1"));
      g.addEventListener("mouseleave", () => arc.setAttribute("opacity", "0.85"));

      svg.appendChild(g);
    });

    // Reset on background click
    svg.addEventListener("click", (ev) => {
      if (ev.target === svg || (ev.target as Element).tagName === "circle") {
        // Re-render to reset
        svg.querySelectorAll("path[data-from]").forEach((p) => {
          const origSw = parseFloat(p.getAttribute("data-sw") || "1");
          const origOp = parseFloat(p.getAttribute("data-op") || "1");
          p.setAttribute("stroke-width", origSw.toFixed(2));
          p.setAttribute("opacity", origOp.toFixed(2));
        });
        svg.querySelectorAll("g[data-idx]").forEach((gr) => {
          const path = gr.querySelector("path");
          if (path) path.setAttribute("opacity", "0.85");
        });
      }
    });

    // Center circle
    const cR = Math.min(cx, cy) * 0.25;
    const centG = document.createElementNS("http://www.w3.org/2000/svg", "g");

    const centCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    centCircle.setAttribute("cx", cx.toString());
    centCircle.setAttribute("cy", cy.toString());
    centCircle.setAttribute("r", cR.toString());
    centCircle.setAttribute("fill", colors.bg);
    centCircle.setAttribute("stroke", colors.amber);
    centCircle.setAttribute("stroke-width", "1.5");
    centG.appendChild(centCircle);

    const centCircle2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    centCircle2.setAttribute("cx", cx.toString());
    centCircle2.setAttribute("cy", cy.toString());
    centCircle2.setAttribute("r", (cR + 4).toString());
    centCircle2.setAttribute("fill", "none");
    centCircle2.setAttribute("stroke", colors.amber);
    centCircle2.setAttribute("stroke-width", "0.5");
    centCircle2.setAttribute("opacity", "0.18");
    centG.appendChild(centCircle2);

    const dispName = selected.name.length > 13 ? selected.name.slice(0, 12) + "..." : selected.name;
    const centText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    centText.setAttribute("text-anchor", "middle");
    centText.setAttribute("x", cx.toString());
    centText.setAttribute("y", (cy - 6).toString());
    centText.setAttribute("fill", colors.amber);
    centText.setAttribute("font-size", dispName.length > 10 ? "9" : "11");
    centText.setAttribute("font-weight", "600");
    centText.setAttribute("font-family", "IBM Plex Mono, monospace");
    centText.setAttribute("dominant-baseline", "middle");
    centText.textContent = dispName;
    centG.appendChild(centText);

    const { total: tH } = subtreeH(selected, tree.byPath, edges, weight);
    const hText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    hText.setAttribute("text-anchor", "middle");
    hText.setAttribute("x", cx.toString());
    hText.setAttribute("y", (cy + 6).toString());
    hText.setAttribute("fill", "#7a6025");
    hText.setAttribute("font-size", "8");
    hText.setAttribute("font-family", "IBM Plex Mono, monospace");
    hText.setAttribute("dominant-baseline", "middle");
    hText.textContent = "H=" + tH.toFixed(1);
    centG.appendChild(hText);

    const effectiveRoot = tree.root.children.length === 1 ? tree.root.children[0] : tree.root;
    const canGoUp = selected.parent && selected.id !== effectiveRoot.id;

    if (canGoUp) {
      (centG as any).style.cursor = "pointer";
      centG.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (selected.parent) onNavigate(selected.parent);
      });

      const upText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      upText.setAttribute("text-anchor", "middle");
      upText.setAttribute("x", cx.toString());
      upText.setAttribute("y", (cy + 17).toString());
      upText.setAttribute("fill", "#3a4050");
      upText.setAttribute("font-size", "7");
      upText.setAttribute("font-family", "IBM Plex Mono, monospace");
      upText.setAttribute("dominant-baseline", "middle");
      upText.textContent = "up";
      centG.appendChild(upText);
    }

    svg.appendChild(centG);
  }, [selected, tree, edges, weight, colors, onNodeClick, onNavigate]);

  return (
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
        {/* SVG visualization rendered by useEffect */}
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
            color: colors.muted,
            pointerEvents: "none",
          }}
        >
          <Text size="36px" opacity={0.15}>
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
  );
};
