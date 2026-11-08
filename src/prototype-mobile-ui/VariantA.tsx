// PROTOTYPE variant A, "Drill-down icicle": top-down partition, tap a block to zoom
// into it, breadcrumb to go back, details in a card under the chart, λ pinned to the bottom.
import { useEffect, useRef, useState } from "react";
import { ActionIcon, FileButton, Group, ScrollArea, Select, Text, UnstyledButton } from "@mantine/core";
import { Upload } from "lucide-react";
import { LambdaSlider } from "./LambdaSlider";
import { ACCENT, BG, BG1, BORDER, EXAMPLES, NodeDetails, cohesionColor, isFile, pathTo } from "./shared";
import type { ProtoState } from "./shared";
import type { OTNode } from "./optimizer";

export const name = "Drill-down icicle";

const ROW = 46;
const LEVELS = 4;

export function VariantA({ s }: { s: ProtoState }) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const focus = s.resolve(focusId) ?? s.tree?.root ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pick = (n: OTNode) => {
    s.select(n);
    if (!isFile(n)) setFocusId(n.id);
    else if (n.parent) setFocusId(n.parent.id);
  };

  const rects: { n: OTNode; x: number; y: number; w: number }[] = [];
  if (focus) {
    const lay = (n: OTNode, x: number, width: number, level: number) => {
      rects.push({ n, x, y: level * ROW, w: width });
      if (level + 1 >= LEVELS) return;
      let cx = x;
      for (const c of n.children) {
        const cw = (width * c.leaves.length) / n.leaves.length;
        lay(c, cx, cw, level + 1);
        cx += cw;
      }
    };
    lay(focus, 0, w, 0);
  }

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: BG }}>
      <Group p="xs" gap="xs" wrap="nowrap" style={{ borderBottom: `1px solid ${BORDER}`, background: BG1 }}>
        <Text fw={700} c={ACCENT} ff="Fraunces, serif">
          Structra
        </Text>
        <Select
          style={{ flex: 1 }}
          size="sm"
          value={s.repoKey}
          onChange={(v) => v && v !== "upload" && s.setRepo(v)}
          data={[
            ...EXAMPLES.map((e) => ({ value: e.key, label: `${e.name} · ${e.hint}` })),
            ...(s.repoKey === "upload" ? [{ value: "upload", label: s.repoName }] : []),
          ]}
          allowDeselect={false}
        />
        <FileButton onChange={s.upload} accept=".json,application/json">
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

      {/* breadcrumb */}
      <ScrollArea type="never" px="xs" py={6}>
        <Group gap={4} wrap="nowrap">
          {focus &&
            pathTo(focus).map((n, i, arr) => (
              <Group key={n.id} gap={4} wrap="nowrap">
                <UnstyledButton onClick={() => pick(n)}>
                  <Text size="xs" c={i === arr.length - 1 ? ACCENT : "dimmed"} style={{ whiteSpace: "nowrap" }}>
                    {i === 0 ? "root" : n.label}
                  </Text>
                </UnstyledButton>
                {i < arr.length - 1 && (
                  <Text size="xs" c="dimmed">
                    ›
                  </Text>
                )}
              </Group>
            ))}
        </Group>
      </ScrollArea>

      <div ref={ref} style={{ flex: "0 0 auto", height: ROW * LEVELS, position: "relative" }}>
        <svg width={w} height={ROW * LEVELS} style={{ display: "block" }}>
          {rects.map(({ n, x, y, w: rw }) => {
            const sel = s.selected?.id === n.id;
            return (
              <g key={n.id} onClick={() => pick(n)} style={{ cursor: "pointer" }}>
                <rect
                  x={x + 0.5}
                  y={y + 0.5}
                  width={Math.max(0, rw - 1)}
                  height={ROW - 1}
                  rx={3}
                  fill={cohesionColor(n)}
                  fillOpacity={isFile(n) ? 0.6 : 0.85}
                  stroke={sel ? "#fff" : "none"}
                  strokeWidth={2}
                />
                {rw > 44 && (
                  <text x={x + 6} y={y + 18} fontSize={12} fill="#0b0b0b" fontWeight={600} style={{ pointerEvents: "none" }}>
                    {clip(n.label, rw)}
                  </text>
                )}
                {rw > 44 && !isFile(n) && (
                  <text x={x + 6} y={y + 34} fontSize={10} fill="#0b0b0b" style={{ pointerEvents: "none" }}>
                    {n.leaves.length} files
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <ScrollArea style={{ flex: 1 }} p="sm">
        {s.loading && <Text c="dimmed">Loading…</Text>}
        {s.selected && s.tree ? (
          <NodeDetails s={s} node={s.selected} onPick={pick} />
        ) : (
          <Text size="sm" c="dimmed">
            Tap a block to zoom in and see its details. Colour: lime = self-contained group, red = leaky.
          </Text>
        )}
      </ScrollArea>

      <div style={{ padding: "8px 16px 56px", borderTop: `1px solid ${BORDER}`, background: BG1 }}>
        <LambdaSlider s={s} />
      </div>
    </div>
  );
}

function clip(t: string, w: number) {
  const max = Math.floor((w - 10) / 7);
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + "…" : t;
}
