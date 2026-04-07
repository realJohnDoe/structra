import { useState } from "react";
import { Accordion, ActionIcon, Badge, Box, Button, Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { PRESETS, type NodeMap } from "../lib/mentionTree";

type Props = {
  nodes: NodeMap;
  onAddNode: (name: string) => void;
  onRemoveNode: (id: string) => void;
  onAddMention: (id: string, targetId: string) => void;
  onRemoveMention: (id: string, targetId: string) => void;
  onLoadPreset: (name: string) => void;
};

export function NodeEditor({ nodes, onAddNode, onRemoveNode, onAddMention, onRemoveMention, onLoadPreset }: Props) {
  const ids = Object.keys(nodes);
  return (
    <Paper withBorder radius="md" p="sm" style={{ height: "100%", overflow: "auto" }}>
      <Stack gap="xs">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          Nodes
        </Text>
        <Select
          placeholder="load preset..."
          data={Object.keys(PRESETS).map((p) => ({ value: p, label: p }))}
          onChange={(value) => value && onLoadPreset(value)}
        />
        <AddNodeRow onAddNode={onAddNode} />
        <Box>
          {!ids.length && <Text c="dimmed">No nodes yet.</Text>}
          {ids.map((id) => (
            <NodeCard
              key={id}
              id={id}
              nodes={nodes}
              onRemoveNode={onRemoveNode}
              onAddMention={onAddMention}
              onRemoveMention={onRemoveMention}
            />
          ))}
        </Box>
      </Stack>
    </Paper>
  );
}

function AddNodeRow({ onAddNode }: { onAddNode: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Group gap={6}>
      <TextInput
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder="node name..."
        style={{ flex: 1 }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const name = value.trim();
          if (!name) return;
          onAddNode(name);
          setValue("");
        }}
      />
      <Button
        onClick={() => {
          const name = value.trim();
          if (!name) return;
          onAddNode(name);
          setValue("");
        }}
      >
        +
      </Button>
    </Group>
  );
}

function NodeCard({
  id,
  nodes,
  onRemoveNode,
  onAddMention,
  onRemoveMention,
}: {
  id: string;
  nodes: NodeMap;
  onRemoveNode: (id: string) => void;
  onAddMention: (id: string, targetId: string) => void;
  onRemoveMention: (id: string, targetId: string) => void;
}) {
  const n = nodes[id];
  const mentions = [...n.mentions].filter((m) => nodes[m]);
  const others = Object.keys(nodes).filter((o) => o !== id && !n.mentions.has(o));
  const [selected, setSelected] = useState("");
  return (
    <Accordion variant="separated" radius="sm" mb={6}>
      <Accordion.Item value={id}>
        <Accordion.Control>
          <Group justify="space-between" wrap="nowrap">
            <Text>{n.name}</Text>
            <Group gap={6}>
              <Badge variant="light" size="sm">
                {n.mentions.size}
              </Badge>
              <ActionIcon
                color="red"
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveNode(id);
                }}
              >
                x
              </ActionIcon>
            </Group>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Text size="xs" c="dimmed" mb={6}>
            mentions
          </Text>
          <Group gap={4} mb={6}>
          {mentions.length ? (
            mentions.map((m) => (
              <Badge
                key={m}
                variant="light"
                rightSection={
                  <ActionIcon size="xs" variant="transparent" onClick={() => onRemoveMention(id, m)}>
                    x
                  </ActionIcon>
                }
              >
                {nodes[m].name}
              </Badge>
            ))
          ) : (
            <Text size="xs" c="dimmed">
              none
            </Text>
          )}
          </Group>
          {!!others.length && (
            <Group gap={6}>
              <Select
                style={{ flex: 1 }}
                placeholder="add..."
                value={selected}
                onChange={(value) => setSelected(value ?? "")}
                data={others.map((o) => ({ value: o, label: nodes[o].name }))}
              />
              <Button
                variant="light"
                onClick={() => {
                  if (!selected) return;
                  onAddMention(id, selected);
                  setSelected("");
                }}
              >
                +
              </Button>
            </Group>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
