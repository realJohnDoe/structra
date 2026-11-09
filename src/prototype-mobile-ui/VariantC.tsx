// PROTOTYPE variant C, "Sunburst": a full-width radial view. Tap a ring segment to
// zoom into it, tap the centre to go up. Repos live behind a menu; details in a bottom sheet.
import { useEffect, useRef, useState } from "react";
import { ActionIcon, Button, Drawer, FileButton, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { Menu, Upload } from "lucide-react";
import { LambdaSlider } from "./LambdaSlider";
import { ACCENT, BG, BG1, BORDER, EXAMPLES, IN_COLOR, NodeDetails, OUT_COLOR, FILE_COLOR, edgeFlows, lca, nodeColor, flowWidth, isFile } from "./shared";
import type { ProtoState } from "./shared";
import type { OTNode } from "./optimizer";

export const name = "Sunburst";

const RINGS = 4;

export function VariantC({ s }: { s: ProtoState }) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const focus = s.resolve(focusId) ?? s.tree?.root ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.min(el.clientWidth, el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const R = size / 2 - 4;
  const r0 = R * 0.24;
  const ring = (R - r0) / RINGS;

  // Tap selects (and shows its imports as chords); tapping the selection again zooms in.
  const tap = (n: OTNode) => {
    if (s.selected?.id === n.id && !isFile(n) && n.id !== focus?.id) setFocusId(n.id);
    else s.select(n);
  };
  const pick = (n: OTNode) => {
    s.select(n);
    setFocusId(isFile(n) ? (n.parent?.id ?? null) : n.id);
  };

  const arcs: React.ReactNode[] = [];
  const pos = new Map<number, { mid: number; ri: number }>();
  if (focus) {
    pos.set(focus.id, { mid: 0, ri: 0 });
    const lay = (n: OTNode, a0: number, a1: number, level: number) => {
      const total = a1 - a0; // fixed before a0 advances, so siblings share the parent's arc exactly
      for (const c of n.children) {
        const span = (total * c.leaves.length) / n.leaves.length;
        const b0 = a0;
        const b1 = a0 + span;
        a0 = b1;
        const ri = r0 + level * ring;
        const ro = ri + ring - 1;
        const sel = s.selected?.id === c.id;
        arcs.push(
          <path
            key={c.id}
            d={arcPath(b0, b1, ri, ro)}
            fill={nodeColor(c, focus)}
            stroke={sel ? "#fff" : BG}
            strokeWidth={sel ? 2 : span * ri > 3 ? 0.75 : 0}
            onClick={() => tap(c)}
            style={{ cursor: "pointer" }}
          />,
        );
        const mid = (b0 + b1) / 2;
        const rm = (ri + ro) / 2;
        pos.set(c.id, { mid, ri });
        if (span * rm > 34 && level < 2) {
          const x = rm * Math.sin(mid);
          const y = -rm * Math.cos(mid);
          arcs.push(
            <text key={`t${c.id}`} x={x} y={y} fontSize={10} fill="#0b0b0b" textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>
              {c.label.length > 12 ? c.label.slice(0, 11) + "…" : c.label}
            </text>,
          );
        }
        if (level + 1 < RINGS) lay(c, b0, b1, level + 1);
      }
    };
    lay(focus, 0, Math.PI * 2, 0);
  }
  const chords: React.ReactNode[] = [];
  const from = s.selected ? pos.get(s.selected.id) : undefined;
  if (from) {
    const P = (p: { mid: number; ri: number }, da = 0) => {
      const r = Math.max(p.ri, r0);
      return `${r * Math.sin(p.mid + da)},${-r * Math.cos(p.mid + da)}`;
    };
    // Dip in to the lowest common ancestor's ring (the centre if it is the current view).
    const xy = (p: { mid: number; ri: number }) => {
      const r = Math.max(p.ri, r0);
      return [r * Math.sin(p.mid), -r * Math.cos(p.mid)];
    };
    const ctrl = (n: OTNode) => {
      const anc = lca(s.selected!, n);
      const to = pos.get(n.id)!;
      const [x0, y0] = xy(from);
      const [x1, y1] = xy(to);
      if (anc.id === focus!.id) return `${(x0 + x1) / 8},${(y0 + y1) / 8}`;
      const pa = pos.get(anc.id)!;
      const rApex = pa.ri + ring / 2;
      let mx = x0 + x1;
      let my = y0 + y1;
      const len = Math.hypot(mx, my) || 1;
      mx = (mx / len) * rApex;
      my = (my / len) * rApex;
      return `${2 * mx - (x0 + x1) / 2},${2 * my - (y0 + y1) / 2}`;
    };
    const flows = edgeFlows(s, s.selected, new Set(pos.keys()));
    for (const [n, f] of flows) {
      const to = pos.get(n.id)!;
      for (const [count, color, da] of [
        [f.out, OUT_COLOR, -0.01],
        [f.in, IN_COLOR, 0.01],
      ] as const) {
        if (!count) continue;
        chords.push(
          <path
            key={`${n.id}-${color}`}
            d={`M${P(from, da)} Q${ctrl(n)} ${P(to, da)}`}
            fill="none"
            stroke={color}
            strokeWidth={flowWidth(count) * (flows.size > 20 ? 0.4 : 1)}
            strokeOpacity={flows.size > 20 ? 0.45 : 0.85}
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          />,
        );
      }
    }
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: BG }}>
      <Group p="xs" gap="xs" justify="space-between" wrap="nowrap">
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => setMenu(true)} aria-label="Repos">
          <Menu size={20} />
        </ActionIcon>
        <Text size="sm" c="#e8e8e8" fw={600} truncate>
          {s.repoName}
        </Text>
        <Text fw={700} c={ACCENT} ff="Fraunces, serif">
          Structra
        </Text>
      </Group>

      <div ref={ref} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {s.loading && <Text c="dimmed">Loading…</Text>}
        {focus && (
          <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
            {arcs}
            <circle r={r0 - 2} fill={BG1} stroke={BORDER} onClick={() => (focus.parent ? pick(focus.parent) : s.select(focus))} style={{ cursor: "pointer" }} />
            <text y={-8} textAnchor="middle" fontSize={12} fill={ACCENT} fontWeight={600} style={{ pointerEvents: "none" }}>
              {focus.label.length > 14 ? focus.label.slice(0, 13) + "…" : focus.label}
            </text>
            <text y={8} textAnchor="middle" fontSize={10} fill="#888" style={{ pointerEvents: "none" }}>
              {focus.leaves.length} files
            </text>
            {focus.parent && (
              <text y={22} textAnchor="middle" fontSize={9} fill="#666" style={{ pointerEvents: "none" }}>
                tap to go up
              </text>
            )}
            {chords}
          </svg>
        )}
      </div>

      {/* peek card for the selection */}
      <UnstyledButton
        onClick={() => s.selected && setSheet(true)}
        style={{ margin: "0 12px", padding: "8px 12px", borderRadius: 8, background: BG1, border: `1px solid ${BORDER}`, minHeight: 48 }}
      >
        {s.selected ? (
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" c={ACCENT} fw={600} truncate>
                {s.selected.label}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {isFile(s.selected)
                  ? s.prep?.graph.nodes[s.selected.leafIndex]
                  : `Group of ${s.selected.leaves.length} files · ${s.selected.internalEdges} imports inside · ${s.selected.edgesIn + s.selected.edgesOut} crossing`}
              </Text>
            </div>
            <Text size="xs" c={ACCENT}>
              details ›
            </Text>
          </Group>
        ) : (
          <Text size="xs" c="dimmed">
            Colour = group (one colour per branch), <span style={{ color: FILE_COLOR }}>grey = file</span>. Segment width =
            number of files; each ring splits its parent. Tap to see imports, tap again to zoom in.
          </Text>
        )}
      </UnstyledButton>

      <div style={{ padding: "10px 16px 56px" }}>
        <LambdaSlider s={s} />
      </div>

      <Drawer opened={menu} onClose={() => setMenu(false)} title="Repository" size="80%">
        <Stack gap="xs">
          {EXAMPLES.map((e) => (
            <Button
              key={e.key}
              variant={s.repoKey === e.key ? "filled" : "light"}
              color="lime"
              justify="space-between"
              rightSection={<Text size="xs">{e.hint}</Text>}
              onClick={() => {
                s.setRepo(e.key);
                setFocusId(null);
                setMenu(false);
              }}
            >
              {e.name}
            </Button>
          ))}
          <FileButton
            onChange={(f) => {
              s.upload(f);
              setFocusId(null);
              setMenu(false);
            }}
            accept=".json,application/json"
          >
            {(props) => (
              <Button {...props} variant="outline" color="lime" leftSection={<Upload size={16} />}>
                Upload a Graph File
              </Button>
            )}
          </FileButton>
          {s.uploadError && (
            <Text size="xs" c="red">
              {s.uploadError}
            </Text>
          )}
        </Stack>
      </Drawer>

      <Drawer opened={sheet && !!s.selected} onClose={() => setSheet(false)} position="bottom" size="70%" title="Details">
        {s.selected && s.tree && (
          <NodeDetails
            s={s}
            node={s.selected}
            onPick={(n) => {
              pick(n);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function arcPath(a0: number, a1: number, r0: number, r1: number) {
  const big = a1 - a0 > Math.PI ? 1 : 0;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const p = (a: number, r: number) => `${r * Math.sin(a)},${-r * Math.cos(a)}`;
  return `M${p(a0, r1)} A${r1},${r1} 0 ${big} 1 ${p(a1, r1)} L${p(a1, r0)} A${r0},${r0} 0 ${big} 0 ${p(a0, r0)} Z`;
}
