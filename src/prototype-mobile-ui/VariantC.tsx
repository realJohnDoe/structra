// PROTOTYPE variant C, "Sunburst": a full-width radial view. Tap a ring segment to
// zoom into it, tap the centre to go up. Repos live behind a menu; details in a bottom sheet.
import { useEffect, useRef, useState } from "react";
import { ActionIcon, Button, Drawer, FileButton, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { Menu, Upload } from "lucide-react";
import { LambdaSlider } from "./LambdaSlider";
import { ACCENT, BG, BG1, BORDER, EXAMPLES, NodeDetails, cohesionColor, isFile } from "./shared";
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

  const tap = (n: OTNode) => {
    s.select(n);
    if (!isFile(n) && n.id !== focus?.id) setFocusId(n.id);
  };
  const pick = (n: OTNode) => {
    s.select(n);
    setFocusId(isFile(n) ? (n.parent?.id ?? null) : n.id);
  };

  const arcs: React.ReactNode[] = [];
  if (focus) {
    const lay = (n: OTNode, a0: number, a1: number, level: number) => {
      for (const c of n.children) {
        const span = ((a1 - a0) * c.leaves.length) / n.leaves.length;
        const b0 = a0;
        const b1 = a0 + span;
        a0 = b1;
        if (span < 0.004) continue;
        const ri = r0 + level * ring;
        const ro = ri + ring - 1;
        const sel = s.selected?.id === c.id;
        arcs.push(
          <path
            key={c.id}
            d={arcPath(b0, b1, ri, ro)}
            fill={cohesionColor(c)}
            fillOpacity={isFile(c) ? 0.55 : 0.9}
            stroke={sel ? "#fff" : BG}
            strokeWidth={sel ? 2 : 0.5}
            onClick={() => tap(c)}
            style={{ cursor: "pointer" }}
          />,
        );
        const mid = (b0 + b1) / 2;
        const rm = (ri + ro) / 2;
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
              {focus.parent ? (focus.label.length > 14 ? focus.label.slice(0, 13) + "…" : focus.label) : "root"}
            </text>
            <text y={8} textAnchor="middle" fontSize={10} fill="#888" style={{ pointerEvents: "none" }}>
              {focus.leaves.length} files
            </text>
            {focus.parent && (
              <text y={22} textAnchor="middle" fontSize={9} fill="#666" style={{ pointerEvents: "none" }}>
                tap to go up
              </text>
            )}
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
                  : `${s.selected.leaves.length} files · ${s.selected.internalEdges} deps inside · ${s.selected.edgesIn + s.selected.edgesOut} cross`}
              </Text>
            </div>
            <Text size="xs" c={ACCENT}>
              details ›
            </Text>
          </Group>
        ) : (
          <Text size="xs" c="dimmed">
            Tap a segment to zoom in. Lime = self-contained, red = leaky.
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
