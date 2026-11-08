// PROTOTYPE variant B, "Outline": a file-explorer-style indented tree. λ and repo
// chips sit in a sticky header; tapping a row expands it, tapping "i" opens its details inline.
import { useState } from "react";
import { Chip, FileButton, Group, Text, UnstyledButton } from "@mantine/core";
import { ChevronDown, ChevronRight, FileCode, Info, Upload } from "lucide-react";
import { LambdaSlider } from "./LambdaSlider";
import { ACCENT, BG, BG1, BORDER, EXAMPLES, NodeDetails, cohesionColor, isFile, pathTo } from "./shared";
import type { ProtoState } from "./shared";
import type { OTNode } from "./optimizer";

export const name = "Outline";

const PAGE = 100;

export function VariantB({ s }: { s: ProtoState }) {
  // Expanded state keyed by dendrogram id, so it survives λ changes for groups that survive.
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState<Record<number, number>>({});
  const toggle = (id: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const reveal = (n: OTNode) => {
    // Jump to a node from the details list: expand its ancestors, select it.
    setOpen((o) => {
      const m = new Set(o);
      for (const a of pathTo(n).slice(0, -1)) m.add(a.id);
      return m;
    });
    s.select(n);
    setTimeout(() => document.getElementById(`row-${n.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };

  const total = s.tree?.root.leaves.length ?? 1;

  const rows: React.ReactNode[] = [];
  const walk = (n: OTNode, depth: number) => {
    const file = isFile(n);
    const isOpen = open.has(n.id) || depth === 0;
    const sel = s.selected?.id === n.id;
    rows.push(
      <div key={n.id} id={`row-${n.id}`}>
        <Group
          gap={6}
          wrap="nowrap"
          style={{
            paddingLeft: 8 + Math.min(depth, 8) * 14,
            paddingRight: 8,
            minHeight: 40,
            borderBottom: `1px solid ${BORDER}`,
            background: sel ? "#1f2a12" : undefined,
          }}
        >
          <UnstyledButton
            onClick={() => (file ? s.select(sel ? null : n) : toggle(n.id))}
            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, minHeight: 40 }}
          >
            {file ? (
              <FileCode size={14} color="#777" style={{ flexShrink: 0 }} />
            ) : isOpen ? (
              <ChevronDown size={16} color={ACCENT} style={{ flexShrink: 0 }} />
            ) : (
              <ChevronRight size={16} color={ACCENT} style={{ flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" c={file ? "#cfd8e0" : "#e8e8e8"} fw={file ? 400 : 600} truncate>
                {depth === 0 ? s.repoName : n.label}
              </Text>
              {!file && (
                <div style={{ height: 3, background: "#222", borderRadius: 2, marginTop: 3 }}>
                  <div
                    style={{
                      width: `${(100 * n.leaves.length) / total}%`,
                      minWidth: 2,
                      height: 3,
                      borderRadius: 2,
                      background: cohesionColor(n),
                    }}
                  />
                </div>
              )}
            </div>
            {!file && (
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {n.leaves.length}
              </Text>
            )}
          </UnstyledButton>
          {!file && (
            <UnstyledButton onClick={() => s.select(sel ? null : n)} aria-label="Details" style={{ padding: 6 }}>
              <Info size={16} color={sel ? ACCENT : "#666"} />
            </UnstyledButton>
          )}
        </Group>
        {sel && (
          <div style={{ padding: "10px 12px 12px", paddingLeft: 12 + Math.min(depth, 8) * 14, background: "#141a0c", borderBottom: `1px solid ${BORDER}` }}>
            <NodeDetails s={s} node={n} onPick={reveal} compact />
          </div>
        )}
      </div>,
    );
    if (!file && isOpen) {
      const limit = shown[n.id] ?? PAGE;
      n.children.slice(0, limit).forEach((c) => walk(c, depth + 1));
      if (n.children.length > limit) {
        rows.push(
          <UnstyledButton
            key={`more-${n.id}`}
            onClick={() => setShown((x) => ({ ...x, [n.id]: limit + PAGE }))}
            style={{ paddingLeft: 8 + Math.min(depth + 1, 8) * 14, minHeight: 40, display: "block", width: "100%" }}
          >
            <Text size="xs" c={ACCENT}>
              show {Math.min(PAGE, n.children.length - limit)} more of {n.children.length - limit}…
            </Text>
          </UnstyledButton>,
        );
      }
    }
  };
  if (s.tree) walk(s.tree.root, 0);

  return (
    <div style={{ minHeight: "100dvh", background: BG, paddingBottom: 64 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: BG1, borderBottom: `1px solid ${BORDER}`, padding: "8px 12px 10px" }}>
        <Group gap={6} mb={10} wrap="nowrap" style={{ overflowX: "auto" }}>
          <Text fw={700} c={ACCENT} ff="Fraunces, serif" mr={4}>
            Structra
          </Text>
          {EXAMPLES.map((e) => (
            <Chip key={e.key} size="xs" color="lime" checked={s.repoKey === e.key} onChange={() => s.setRepo(e.key)}>
              {e.name}
            </Chip>
          ))}
          {s.repoKey === "upload" && (
            <Chip size="xs" color="lime" checked>
              {s.repoName}
            </Chip>
          )}
          <FileButton onChange={s.upload} accept=".json,application/json">
            {(props) => (
              <UnstyledButton {...props} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <Upload size={14} color={ACCENT} />
                <Text size="xs" c={ACCENT}>
                  Graph File
                </Text>
              </UnstyledButton>
            )}
          </FileButton>
        </Group>
        {s.uploadError && (
          <Text size="xs" c="red" mb={6}>
            {s.uploadError}
          </Text>
        )}
        <LambdaSlider s={s} />
      </div>
      {s.loading && (
        <Text c="dimmed" p="md">
          Loading…
        </Text>
      )}
      {rows}
    </div>
  );
}
