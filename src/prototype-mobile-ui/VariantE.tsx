// PROTOTYPE variant E, "Edge bundling" (Holten 2006): files sit on a circle in
// Optimal Tree order and every import is drawn as a B-spline routed through the
// tree path between its two files, i.e. through exactly the nodes Edge Cost
// charges for. Tight bundles = local imports; long curves through the middle =
// imports that cross groups. Tap the circle to select a file, the outer ring to
// select a group; selected edges light up (lime = it imports, orange = imported by).
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Button, FileButton, Group, Select, Text } from "@mantine/core";
import { Upload } from "lucide-react";
import { LambdaSlider } from "./LambdaSlider";
import { ACCENT, BG, BG1, BORDER, EXAMPLES, IN_COLOR, NodeDetails, OUT_COLOR, isFile, nodeColor, pathTo } from "./shared";
import type { ProtoState } from "./shared";
import type { OTNode } from "./optimizer";

export const name = "Edge bundling";

const BETA = 0.85; // bundling strength

interface Layout {
  focus: OTNode;
  n: number;
  leafPos: Map<number, number>; // file index → slot
  angle: (slot: number) => number;
  nodeR: Map<number, number>; // internal node id → relative radius 0..1
  nodeA: Map<number, number>; // node id → angle
  ring: { n: OTNode; a0: number; a1: number }[]; // children of focus
  ring2: { n: OTNode; a0: number; a1: number }[]; // grandchildren of focus
  edges: { src: number; dst: number; pts: number[]; len: number }[]; // pts in relative polar → xy unit circle
}

function layout(focus: OTNode, s: ProtoState): Layout {
  const prep = s.prep!;
  const tree = s.tree!;
  const n = focus.leaves.length;
  const angle = (slot: number) => (2 * Math.PI * (slot + 0.5)) / n;
  const leafPos = new Map<number, number>();
  focus.leaves.forEach((l, i) => leafPos.set(l, i));
  let maxRel = 1;
  const nodeR = new Map<number, number>();
  const nodeA = new Map<number, number>();
  let slot = 0;
  const walk = (x: OTNode) => {
    const rel = x.depth - focus.depth;
    if (isFile(x)) {
      maxRel = Math.max(maxRel, rel);
      nodeA.set(x.id, angle(slot++));
      return;
    }
    const start = slot;
    x.children.forEach(walk);
    nodeA.set(x.id, (angle(start) + angle(slot - 1)) / 2);
    nodeR.set(x.id, rel);
  };
  walk(focus);
  for (const [k, v] of nodeR) nodeR.set(k, v / maxRel);

  const ring: Layout["ring"] = [];
  const ring2: Layout["ring2"] = [];
  slot = 0;
  for (const c of focus.children) {
    const a0 = (2 * Math.PI * slot) / n;
    if (!isFile(c)) {
      let s2 = slot;
      for (const g of c.children) {
        const b0 = (2 * Math.PI * s2) / n;
        s2 += g.leaves.length;
        if (!isFile(g)) ring2.push({ n: g, a0: b0, a1: (2 * Math.PI * s2) / n });
      }
    }
    slot += c.leaves.length;
    ring.push({ n: c, a0, a1: (2 * Math.PI * slot) / n });
  }

  const edges: Layout["edges"] = [];
  for (const u of focus.leaves) {
    for (const v of prep.out[u]) {
      if (!leafPos.has(v)) continue;
      let a: OTNode = tree.byLeaf[u];
      let b: OTNode = tree.byLeaf[v];
      const up: OTNode[] = [];
      const down: OTNode[] = [];
      while (a !== b) {
        if (a.depth >= b.depth) {
          a = a.parent!;
          up.push(a);
        } else {
          b = b.parent!;
          down.push(b);
        }
      }
      // up ends with the LCA; down ends with it too, so drop the duplicate.
      if (down.length) down.pop();
      const chain = [...up, ...down.reverse()];
      const pts: number[] = [];
      const pushPolar = (r: number, ang: number) => pts.push(r * Math.sin(ang), -r * Math.cos(ang));
      pushPolar(1, angle(leafPos.get(u)!));
      for (const c of chain) pushPolar(nodeR.get(c.id) ?? 0, nodeA.get(c.id) ?? 0);
      pushPolar(1, angle(leafPos.get(v)!));
      // Holten straightening towards the chord.
      const m = pts.length / 2 - 1;
      const x0 = pts[0];
      const y0 = pts[1];
      const x1 = pts[2 * m];
      const y1 = pts[2 * m + 1];
      for (let i = 1; i < m; i++) {
        const t = i / m;
        pts[2 * i] = BETA * pts[2 * i] + (1 - BETA) * (x0 + t * (x1 - x0));
        pts[2 * i + 1] = BETA * pts[2 * i + 1] + (1 - BETA) * (y0 + t * (y1 - y0));
      }
      edges.push({ src: u, dst: v, pts, len: chain.length });
    }
  }
  return { focus, n, leafPos, angle, nodeR, nodeA, ring, ring2, edges };
}

/** d3.curveBasis on a flat [x0,y0,x1,y1,…] list, scaled and centred. */
function basis(ctx: CanvasRenderingContext2D, p: number[], R: number, c: number) {
  const X = (i: number) => c + p[2 * i] * R;
  const Y = (i: number) => c + p[2 * i + 1] * R;
  const k = p.length / 2;
  ctx.moveTo(X(0), Y(0));
  if (k === 2) {
    ctx.lineTo(X(1), Y(1));
    return;
  }
  ctx.lineTo((5 * X(0) + X(1)) / 6, (5 * Y(0) + Y(1)) / 6);
  for (let i = 2; i < k; i++) {
    const [ax, ay, bx, by, x, y] = [X(i - 2), Y(i - 2), X(i - 1), Y(i - 1), X(i), Y(i)];
    ctx.bezierCurveTo((2 * ax + bx) / 3, (2 * ay + by) / 3, (ax + 2 * bx) / 3, (ay + 2 * by) / 3, (ax + 4 * bx + x) / 6, (ay + 4 * by + y) / 6);
  }
  const [ax, ay, bx, by] = [X(k - 2), Y(k - 2), X(k - 1), Y(k - 1)];
  ctx.bezierCurveTo((2 * ax + bx) / 3, (2 * ay + by) / 3, (ax + 2 * bx) / 3, (ay + 2 * by) / 3, bx, by);
}

export function VariantE({ s }: { s: ProtoState }) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const focus = s.resolve(focusId) ?? s.tree?.root ?? null;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(360);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.min(el.clientWidth, 560)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lay = useMemo(() => (focus && s.prep && s.tree ? layout(focus, s) : null), [focus, s.tree]); // eslint-disable-line react-hooks/exhaustive-deps
  const showLabels = !!lay && lay.n <= 120;
  const c = size / 2;
  const R = c - (showLabels ? 88 : 30);

  // Which files does the selection cover (within the focus)?
  const sel = s.selected;
  const selLeaves = useMemo(() => new Set(sel ? sel.leaves : []), [sel]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !lay) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";

    const many = lay.edges.length;
    const baseAlpha = Math.max(0.03, Math.min(0.5, 3 / Math.sqrt(many + 1)));
    // Background edges, coloured by tree distance (short = lime, long = red).
    const maxLen = Math.max(1, ...lay.edges.map((e) => e.len));
    for (const e of lay.edges) {
      const inS = selLeaves.has(e.src);
      const inD = selLeaves.has(e.dst);
      if (sel && inS !== inD) continue; // crossing the selection: drawn highlighted below
      const f = e.len / maxLen;
      // With a selection, edges entirely inside it keep their colour; the rest fade.
      const a = sel ? (inS && inD ? baseAlpha * 1.5 : baseAlpha * 0.25) : baseAlpha;
      ctx.strokeStyle = `rgba(${Math.round(150 + 100 * f)},${Math.round(220 - 140 * f)},${Math.round(90 - 40 * f)},${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      basis(ctx, e.pts, R, c);
      ctx.stroke();
    }
    if (sel) {
      for (const e of lay.edges) {
        const out = selLeaves.has(e.src);
        const inn = selLeaves.has(e.dst);
        if (out === inn) continue;
        ctx.strokeStyle = out ? OUT_COLOR : IN_COLOR;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        basis(ctx, e.pts, R, c);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Rings: the focus's children (inner) and grandchildren (outer).
    for (const [list, rr] of [
      [lay.ring, R + 8],
      [lay.ring2, R + 17],
    ] as const) {
      for (const { n, a0, a1 } of list) {
        const isSel = sel?.id === n.id;
        ctx.strokeStyle = nodeColor(n, lay.focus);
        ctx.globalAlpha = isFile(n) ? 0.35 : 0.95;
        ctx.lineWidth = 7;
        ctx.lineCap = "butt";
        ctx.beginPath();
        const gap = Math.min(0.012, (a1 - a0) * 0.15);
        ctx.arc(c, c, rr, a0 - Math.PI / 2 + gap, a1 - Math.PI / 2 - gap);
        ctx.stroke();
        if (isSel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(c, c, rr + 5, a0 - Math.PI / 2, a1 - Math.PI / 2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Leaf dots (+ labels for small focus).
    for (const [leaf, slot] of lay.leafPos) {
      const a = lay.angle(slot);
      const hit = selLeaves.has(leaf);
      ctx.fillStyle = hit ? "#fff" : "#666";
      ctx.beginPath();
      ctx.arc(c + R * Math.sin(a), c - R * Math.cos(a), hit ? 2.2 : 1.3, 0, 2 * Math.PI);
      ctx.fill();
      if (showLabels) {
        const label = s.tree!.byLeaf[leaf].label.split("/").pop()!;
        ctx.save();
        ctx.translate(c, c);
        const deg = a - Math.PI / 2;
        ctx.rotate(deg);
        const flip = a > Math.PI;
        ctx.fillStyle = hit ? "#fff" : "#9aa";
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.textBaseline = "middle";
        if (flip) {
          ctx.rotate(Math.PI);
          ctx.textAlign = "right";
          ctx.fillText(label.length > 12 ? label.slice(0, 11) + "…" : label, -(R + 25), 0);
        } else {
          ctx.textAlign = "left";
          ctx.fillText(label.length > 12 ? label.slice(0, 11) + "…" : label, R + 25, 0);
        }
        ctx.restore();
      }
    }
  }, [lay, size, sel, selLeaves, R, c, showLabels, s.tree]);

  const onTap = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!lay) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left - c;
    const y = ev.clientY - rect.top - c;
    const r = Math.hypot(x, y);
    let a = Math.atan2(x, -y);
    if (a < 0) a += 2 * Math.PI;
    if (r < R * 0.7) {
      s.select(null);
      return;
    }
    const slot = Math.min(lay.n - 1, Math.floor((a / (2 * Math.PI)) * lay.n));
    if (r > R + 3) {
      const outer = r > R + 12.5 ? lay.ring2.find((g) => a >= g.a0 && a < g.a1) : undefined;
      const g = outer ?? lay.ring.find((g) => a >= g.a0 && a < g.a1);
      if (g) s.select(g.n);
    } else {
      s.select(s.tree!.byLeaf[lay.focus.leaves[slot]]);
    }
  };

  const pick = (n: OTNode) => {
    s.select(n);
    if (focus) {
      const inFocus = new Set(focus.leaves);
      if (!n.leaves.every((l) => inFocus.has(l))) setFocusId(null);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: BG, paddingBottom: 64 }}>
      <Group p="xs" gap="xs" wrap="nowrap" style={{ borderBottom: `1px solid ${BORDER}`, background: BG1 }}>
        <Text fw={700} c={ACCENT} ff="Fraunces, serif">
          Structra
        </Text>
        <Select
          style={{ flex: 1 }}
          size="sm"
          value={s.repoKey}
          onChange={(v) => {
            if (v && v !== "upload") {
              s.setRepo(v);
              setFocusId(null);
            }
          }}
          data={[
            ...EXAMPLES.map((e) => ({ value: e.key, label: `${e.name} · ${e.hint}` })),
            ...(s.repoKey === "upload" ? [{ value: "upload", label: s.repoName }] : []),
          ]}
          allowDeselect={false}
        />
        <FileButton
          onChange={(f) => {
            s.upload(f);
            setFocusId(null);
          }}
          accept=".json,application/json"
        >
          {(props) => (
            <ActionIcon {...props} variant="light" color="lime" size="lg" aria-label="Upload Graph File">
              <Upload size={18} />
            </ActionIcon>
          )}
        </FileButton>
      </Group>
      {s.uploadError && (
        <Text size="xs" c="red" px="xs">
          {s.uploadError}
        </Text>
      )}

      <Group gap={4} px="xs" pt={6} wrap="nowrap" style={{ overflowX: "auto" }}>
        {focus &&
          pathTo(focus).map((n, i, arr) => (
            <Text
              key={n.id}
              size="xs"
              c={i === arr.length - 1 ? ACCENT : "dimmed"}
              style={{ whiteSpace: "nowrap", cursor: "pointer" }}
              onClick={() => setFocusId(n.id)}
            >
              {n.label}
              {i < arr.length - 1 ? " ›" : ""}
            </Text>
          ))}
      </Group>

      <div ref={wrap} style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        {s.loading && <Text c="dimmed">Loading…</Text>}
        <canvas ref={canvas} onClick={onTap} style={{ width: size, height: size, cursor: "pointer" }} />
      </div>
      <Text size="xs" c="dimmed" ta="center" px="sm">
        {lay ? `${lay.edges.length} imports inside this view · ` : ""}
        <span style={{ color: OUT_COLOR }}>imports</span> / <span style={{ color: IN_COLOR }}>imported by</span> · tap
        a ring = group (inner = top level, outer = next level), dots = file, centre = clear
      </Text>

      <div style={{ padding: "10px 16px", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, background: BG1, marginTop: 8 }}>
        <LambdaSlider s={s} />
      </div>

      <div style={{ padding: 12 }}>
        {sel && s.tree ? (
          <>
            {!isFile(sel) && sel.id !== focus?.id && (
              <Button size="xs" variant="light" color="lime" mb="xs" onClick={() => setFocusId(sel.id)}>
                Zoom into this group
              </Button>
            )}
            {focus?.parent && (
              <Button size="xs" variant="subtle" color="gray" mb="xs" ml={4} onClick={() => setFocusId(focus.parent!.id)}>
                Up one level
              </Button>
            )}
            <NodeDetails s={s} node={sel} onPick={pick} />
          </>
        ) : (
          <Text size="sm" c="dimmed">
            Each curve is one import, routed through the groups it crosses. Bundles hugging the rim stay local; curves
            through the centre cross top-level groups.
          </Text>
        )}
      </div>
    </div>
  );
}
