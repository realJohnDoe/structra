import { useRef } from "react";
import { Box, Text, Group, Paper, ScrollArea } from "@mantine/core";
import { Upload } from "lucide-react";

interface COLORS {
  bg: string;
  border: string;
  border2: string;
  muted: string;
  amber: string;
  text: string;
  dim: string;
}

interface Preset {
  name: string;
  description: string;
  data: string;
}

interface RepoExplorerSidebarProps {
  repoLabel: string;
  isDragging: boolean;
  stats: {
    nodes: number;
    edges: number;
    depth: number;
    globalH: number;
  };
  presets: Record<string, Preset>;
  presetGroups: { label: string; keys: string[] }[];
  colors: COLORS;
  onFileUpload: (file: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onPresetClick: (key: string) => void;
}

export const RepoExplorerSidebar: React.FC<RepoExplorerSidebarProps> = ({
  isDragging,
  stats,
  presets,
  presetGroups,
  colors,
  onFileUpload,
  onDrop,
  onDragOver,
  onDragLeave,
  onPresetClick,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Box
        p="xs"
        style={{
          fontSize: "8px",
          color: colors.muted,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        SOURCE
      </Box>
      <ScrollArea.Autosize flex={1} p="xs">
        {/* Dropzone */}
        <Box
          p="md"
          style={{
            border: isDragging
              ? `1px solid ${colors.amber}`
              : `1px dashed ${colors.border2}`,
            background: isDragging ? "#100d00" : "transparent",
            textAlign: "center",
            cursor: "pointer",
            marginBottom: "10px",
          }}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <Text size="20px" opacity={0.3} mb="xs">
            <Upload size={20} />
          </Text>
          <Text size="9px" c={colors.muted} style={{ lineHeight: 1.7 }}>
            drop .dot file
            <br />
            or click to browse
          </Text>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dot,.gv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileUpload(file);
            }}
          />
        </Box>

        {/* Presets */}
        <Stack gap="md" mb="md">
          {presetGroups.map((group) => (
            <Box key={group.label}>
              <Text
                size="8px"
                c={colors.dim}
                style={{
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                {group.label}
              </Text>
              <Stack gap="xs">
                {group.keys
                  .filter((key) => presets[key])
                  .map((key) => (
                    <Paper
                      key={key}
                      p="xs"
                      style={{
                        border: `1px solid ${colors.border}`,
                        cursor: "pointer",
                      }}
                      onClick={() => onPresetClick(key)}
                    >
                      <Group justify="space-between">
                        <Text size="9px">{presets[key].name}</Text>
                        <Text size="8px" c={colors.muted}>
                          {presets[key].description}
                        </Text>
                      </Group>
                    </Paper>
                  ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </ScrollArea.Autosize>

      {/* Stats */}
      <Box
        p="xs"
        style={{ borderTop: `1px solid ${colors.border}`, flexShrink: 0 }}
      >
        <Group justify="space-between" mb="xs">
          <Text size="9px" c={colors.muted}>
            nodes
          </Text>
          <Text size="9px" c={colors.amber} fw={600}>
            {stats.nodes}
          </Text>
        </Group>
        <Group justify="space-between" mb="xs">
          <Text size="9px" c={colors.muted}>
            edges
          </Text>
          <Text size="9px" c={colors.amber} fw={600}>
            {stats.edges}
          </Text>
        </Group>
        <Group justify="space-between" mb="xs">
          <Text size="9px" c={colors.muted}>
            depth
          </Text>
          <Text size="9px" c={colors.amber} fw={600}>
            {stats.depth}
          </Text>
        </Group>
        <Group justify="space-between">
          <Text size="9px" c={colors.muted}>
            H global
          </Text>
          <Text size="9px" c={colors.amber} fw={600}>
            {stats.globalH.toFixed(2)}
          </Text>
        </Group>
      </Box>
    </>
  );
};

// Stack component for the sidebar
const Stack = ({ gap, children, mb, mt }: { gap?: string | number; children: React.ReactNode; mb?: string | number; mt?: string | number }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: gap ?? 0, marginBottom: mb, marginTop: mt }}>
    {children}
  </div>
);
