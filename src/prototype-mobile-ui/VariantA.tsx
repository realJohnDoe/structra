// PROTOTYPE variant A, "Drill-down icicle": top-down partition, tap a block to select
// it, tap again to zoom in, breadcrumb to go back, details in a card under the chart,
// λ pinned to the bottom. All imports between visible blocks are always drawn;
// the selection's own imports are highlighted.
import { useEffect, useRef, useState } from "react";
import { Badge, Button, FileButton, Group, Menu, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { ChevronDown, Upload } from "lucide-react";
import { LambdaSlider } from "./LambdaSlider";
import { ACCENT, BG, BG1, BORDER, EXAMPLES, FILE_COLOR, IN_COLOR, NodeDetails, OUT_COLOR, isFile, lca, nodeColor, pathTo } from "./shared";
import type { ProtoState } from "./shared";
import type { OTNode } from "./optimizer";

export const name = "Drill-down icicle";

const ROW = 46;
const LEVELS = 4;
const FILE_MIN = 12; // px: below this, a group's direct files fold into one "N files" block
const GROUP_MIN = 6; // px: below this, groups fold into one "+N small groups" block

// Display-only blocks: a group's own (direct) files, or its groups too narrow to
// draw. Not Tree nodes: drawn hatched in the owner's colour; tap to list the contents.
interface Rest {
  kind: "files" | "groups";
  owner: OTNode;
  members: OTNode[];
}
interface Block {
  n: OTNode; // the node, or a pseudo node standing in for a Rest block
  x: number;
  y: number;
  w: number;
  rest?: Rest;
}

export function VariantA({ s }: { s: ProtoState }) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const [restSel, setRestSel] = useState<{ owner: number; kind: Rest["kind"] } | null>(null);
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

  // ---- layout ----
  const blocks: Block[] = [];
  const redirect = new Map<number, OTNode>(); // folded node id → its Rest pseudo node
  if (focus) {
    const lay = (n: OTNode, x: number, width: number, level: number) => {
      blocks.push({ n, x, y: level * ROW, w: width });
      if (level + 1 >= LEVELS) return;
      const per = width / n.leaves.length; // px per file
      const groups = n.children.filter((c) => !isFile(c));
      const files = n.children.filter(isFile);
      const big = groups.filter((g) => g.leaves.length * per >= GROUP_MIN);
      const small = groups.filter((g) => g.leaves.length * per < GROUP_MIN);
      let cx = x;
      for (const c of big) {
        lay(c, cx, c.leaves.length * per, level + 1);
        cx += c.leaves.length * per;
      }
      const restBlock = (kind: Rest["kind"], members: OTNode[]) => {
        const leaves = members.flatMap((m) => m.leaves);
        const stand: OTNode = {
          ...n,
          id: -(n.id * 2 + (kind === "files" ? 1 : 2)),
          parent: n,
          depth: n.depth + 1,
          children: [],
          leaves,
          leafIndex: -1,
          label: kind === "files" ? `${members.length} files` : `+${members.length} small groups`,
        };
        for (const m of members) redirect.set(m.id, stand);
        blocks.push({ n: stand, x: cx, y: (level + 1) * ROW, w: leaves.length * per, rest: { kind, owner: n, members } });
        cx += leaves.length * per;
      };
      if (small.length) restBlock("groups", small);
      if (files.length && per < FILE_MIN) restBlock("files", files);
      else
        for (const f of files) {
          lay(f, cx, per, level + 1);
          cx += per;
        }
    };
    lay(focus, 0, w, 0);
  }
  const pos = new Map(blocks.map((b) => [b.n.id, b]));

  // ---- selection ----
  const selRest = restSel ? blocks.find((b) => b.rest && b.rest.owner.id === restSel.owner && b.rest.kind === restSel.kind) : undefined;
  const active: OTNode | null = selRest ? selRest.n : s.selected;
  const activeLeaves = new Set(active ? active.leaves : []);
  // The block that stands for the selection (itself, or the Rest block it is folded into).
  const activeBlockId = active ? (pos.has(active.id) ? active.id : redirect.get(active.id)?.id) : undefined;

  const tap = (n: OTNode) => {
    setRestSel(null);
    if (s.selected?.id === n.id && !isFile(n) && n.id !== focus?.id) setFocusId(n.id);
    else s.select(n);
  };
  const tapRest = (r: Rest) => {
    s.select(null);
    setRestSel({ owner: r.owner.id, kind: r.kind });
  };
  // From a details list: select it and zoom so it sits one level below the focus.
  const pick = (n: OTNode) => {
    setRestSel(null);
    s.select(n);
    if (n.parent) setFocusId(n.parent.id);
  };
  const crumb = (n: OTNode) => {
    setRestSel(null);
    setFocusId(n.id);
    s.select(n);
  };

  // ---- all imports between visible blocks, aggregated ----
  const lines: React.ReactNode[] = [];
  if (focus && s.prep && s.tree) {
    const blockOf = (leaf: number): number | null => {
      let x: OTNode | null = s.tree!.byLeaf[leaf];
      while (x && !pos.has(x.id)) {
        const r = redirect.get(x.id);
        if (r) return r.id;
        x = x.parent;
      }
      return x ? x.id : null; // null: outside the current zoom
    };
    const leafBlock = new Map<number, number | null>();
    for (const l of focus.leaves) leafBlock.set(l, blockOf(l));
    type Cat = "other" | "out" | "in";
    const agg = new Map<string, { a: number; b: number | null; cat: Cat; count: number }>();
    const add = (a: number, b: number | null, cat: Cat) => {
      const [p, q] = b === null || a < b ? [a, b] : [b, a];
      const key = `${p}|${q}|${cat}`;
      const e = agg.get(key);
      if (e) e.count++;
      else agg.set(key, { a: p, b: q, cat, count: 1 });
    };
    for (const [u, v] of s.prep.edges) {
      const bu = leafBlock.has(u) ? leafBlock.get(u)! : null;
      const bv = leafBlock.has(v) ? leafBlock.get(v)! : null;
      if (bu === null && bv === null) continue;
      if (bu === bv) continue; // inside one block
      const inU = activeLeaves.has(u);
      const inV = activeLeaves.has(v);
      const cat: Cat = active && inU !== inV ? (inU ? "out" : "in") : "other";
      if (bu === null) add(bv!, null, cat);
      else if (bv === null) add(bu, null, cat);
      else add(bu, bv, cat);
    }
    const many = agg.size > 250;
    const order: Cat[] = ["other", "in", "out"];
    for (const cat of order) {
      for (const e of agg.values()) {
        if (e.cat !== cat) continue;
        const A = pos.get(e.a)!;
        const ax = A.x + A.w / 2;
        const ay = A.y + ROW / 2;
        const color = cat === "out" ? OUT_COLOR : cat === "in" ? IN_COLOR : "#d8dde4";
        const opacity = cat === "other" ? (active ? 0.1 : many ? 0.22 : 0.4) : 0.85;
        const width = Math.min(5, 0.6 + Math.log2(e.count) * 0.6) * (cat === "other" ? 1 : 1.4);
        let d: string;
        if (e.b === null) {
          // leaves the current zoom: a stub up to the top edge
          d = `M${ax},${ay} L${ax},1`;
        } else {
          const B = pos.get(e.b)!;
          const bx = B.x + B.w / 2;
          const by = B.y + ROW / 2;
          const apex = (lca(A.n, B.n).depth - focus.depth) * ROW + ROW / 2; // rise to the LCA's row
          d = `M${ax},${ay} Q${(ax + bx) / 2},${2 * apex - (ay + by) / 2} ${bx},${by}`;
        }
        lines.push(
          <path
            key={`${e.a}|${e.b}|${cat}`}
            d={d}
            fill="none"
            stroke={color}
            strokeOpacity={opacity}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={e.b === null ? "2 3" : undefined}
            style={{ pointerEvents: "none" }}
          />,
        );
      }
    }
  }

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    const f = ev.dataTransfer.files[0];
    if (f) s.upload(f);
  };

  return (
    <div
      style={{ height: "100dvh", display: "flex", flexDirection: "column", background: BG }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Group p="xs" gap="xs" wrap="nowrap" style={{ borderBottom: `1px solid ${BORDER}`, background: BG1 }}>
        <Text fw={700} c={ACCENT} ff="Fraunces, serif">
          Structra
        </Text>
        {/* One picker: examples, then "upload your own" in the same menu (and drag-and-drop anywhere). */}
        <Menu position="bottom-start" width={260}>
          <Menu.Target>
            <Button variant="default" size="sm" rightSection={<ChevronDown size={16} />} style={{ flex: 1, minWidth: 0 }} justify="space-between">
              <Text size="sm" truncate>
                {s.repoName}
              </Text>
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Examples</Menu.Label>
            {EXAMPLES.map((e) => (
              <Menu.Item
                key={e.key}
                onClick={() => {
                  setFocusId(null);
                  setRestSel(null);
                  s.setRepo(e.key);
                }}
                rightSection={
                  <Text size="xs" c="dimmed">
                    {e.hint}
                  </Text>
                }
                style={{ fontWeight: s.repoKey === e.key ? 700 : 400 }}
              >
                {e.name}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <FileButton
              onChange={(f) => {
                setFocusId(null);
                setRestSel(null);
                s.upload(f);
              }}
              accept=".json,application/json"
            >
              {(props) => (
                <Menu.Item {...props} leftSection={<Upload size={14} />} closeMenuOnClick={false}>
                  Your own Graph File…
                </Menu.Item>
              )}
            </FileButton>
          </Menu.Dropdown>
        </Menu>
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
                <UnstyledButton onClick={() => crumb(n)}>
                  <Text size="xs" c={i === arr.length - 1 ? ACCENT : "dimmed"} style={{ whiteSpace: "nowrap" }}>
                    {n.label}
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
          <defs>
            <pattern id="rest-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#000" strokeOpacity="0.35" strokeWidth="2.5" />
            </pattern>
          </defs>
          {blocks.map(({ n, x, y, w: rw, rest }) => {
            const sel = activeBlockId === n.id;
            if (rest) {
              return (
                <g key={n.id} onClick={() => tapRest(rest)} style={{ cursor: "pointer" }}>
                  <rect x={x + 0.5} y={y + 0.5} width={Math.max(0, rw - 1)} height={ROW - 1} rx={3} fill={nodeColor(rest.owner, focus!)} fillOpacity={0.45} />
                  <rect
                    x={x + 0.5}
                    y={y + 0.5}
                    width={Math.max(0, rw - 1)}
                    height={ROW - 1}
                    rx={3}
                    fill="url(#rest-hatch)"
                    stroke={sel ? "#fff" : "none"}
                    strokeWidth={2}
                  />
                  {rw > 30 && (
                    <text x={x + 5} y={y + 18} fontSize={11} fill="#e8e8e8" fontWeight={600} style={{ pointerEvents: "none" }}>
                      {clip(n.label, rw)}
                    </text>
                  )}
                </g>
              );
            }
            return (
              <g key={n.id} onClick={() => tap(n)} style={{ cursor: "pointer" }}>
                <rect
                  x={x + 0.5}
                  y={y + 0.5}
                  width={Math.max(0, rw - 1)}
                  height={ROW - 1}
                  rx={3}
                  fill={nodeColor(n, focus!)}
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
          {lines}
        </svg>
      </div>

      <ScrollArea style={{ flex: 1 }} p="sm">
        {s.loading && <Text c="dimmed">Loading…</Text>}
        {selRest && s.tree ? (
          <RestDetails s={s} rest={selRest.rest!} stand={selRest.n} onPick={pick} onZoom={(g) => crumb(g)} />
        ) : s.selected && s.tree ? (
          <NodeDetails s={s} node={s.selected} onPick={pick} />
        ) : (
          <Text size="sm" c="dimmed">
            Tap a block to select it, tap again to zoom in. Lines are imports between blocks; they rise to the lowest group
            containing both ends. Selecting highlights <span style={{ color: OUT_COLOR }}>what it imports</span> and{" "}
            <span style={{ color: IN_COLOR }}>what imports it</span>. Colour = group, <span style={{ color: FILE_COLOR }}>grey = file</span>,
            hatched = a group's own files or its groups too small to draw. Width = number of files. Drop a Graph File
            anywhere to load it.
          </Text>
        )}
      </ScrollArea>

      <div style={{ padding: "8px 16px 56px", borderTop: `1px solid ${BORDER}`, background: BG1 }}>
        <LambdaSlider s={s} />
      </div>
    </div>
  );
}

function RestDetails({
  s,
  rest,
  stand,
  onPick,
  onZoom,
}: {
  s: ProtoState;
  rest: Rest;
  stand: OTNode;
  onPick: (n: OTNode) => void;
  onZoom: (n: OTNode) => void;
}) {
  const prep = s.prep!;
  const inside = new Set(stand.leaves);
  let within = 0;
  let out = 0;
  let inn = 0;
  for (const l of stand.leaves) {
    for (const t of prep.out[l]) {
      if (inside.has(t)) within++;
      else out++;
    }
    for (const t of prep.inn[l]) if (!inside.has(t)) inn++;
  }
  return (
    <Stack gap="xs">
      <div>
        <Text fw={600} c={ACCENT}>
          {stand.label}
        </Text>
        <Text size="xs" c="dimmed">
          {rest.kind === "files"
            ? `Files directly in ${rest.owner.label} that no subgroup contains.`
            : `Groups in ${rest.owner.label} too narrow to draw (${stand.leaves.length} files).`}
        </Text>
      </div>
      <Group gap={6}>
        <Badge variant="light" color="gray">
          {within} imports within
        </Badge>
        <Badge variant="outline" style={{ color: OUT_COLOR, borderColor: OUT_COLOR }}>
          → {out} to outside
        </Badge>
        <Badge variant="outline" style={{ color: IN_COLOR, borderColor: IN_COLOR }}>
          ← {inn} from outside
        </Badge>
      </Group>
      <Stack gap={2}>
        {rest.members.slice(0, 200).map((m) => (
          <UnstyledButton key={m.id} onClick={() => (isFile(m) ? onPick(m) : onZoom(m))}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" c={isFile(m) ? "#cfd8e0" : ACCENT} truncate>
                {isFile(m) ? prep.graph.nodes[m.leafIndex] : `▸ ${m.label}`}
              </Text>
              {!isFile(m) && (
                <Text size="xs" c="dimmed">
                  {m.leaves.length}
                </Text>
              )}
              {isFile(m) && (prep.out[m.leafIndex].length > 0 || prep.inn[m.leafIndex].length > 0) && (
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  →{prep.out[m.leafIndex].length} ←{prep.inn[m.leafIndex].length}
                </Text>
              )}
            </Group>
          </UnstyledButton>
        ))}
        {rest.members.length > 200 && (
          <Text size="xs" c="dimmed">
            … {rest.members.length - 200} more
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

function clip(t: string, w: number) {
  const max = Math.floor((w - 10) / 7);
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + "…" : t;
}
