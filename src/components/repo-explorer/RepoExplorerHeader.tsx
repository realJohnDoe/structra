import { Box, Text, Group, ActionIcon } from "@mantine/core";
import { Menu, ArrowUp, RefreshCw } from "lucide-react";

interface COLORS {
  bg: string;
  border: string;
  border2: string;
  muted: string;
  amber: string;
}

interface RepoExplorerHeaderProps {
  repoLabel: string;
  hasParent: boolean;
  colors: COLORS;
  onToggleSidebar: () => void;
  onNavigateUp: () => void;
  onReset: () => void;
}

export const RepoExplorerHeader: React.FC<RepoExplorerHeaderProps> = ({
  repoLabel,
  hasParent,
  colors,
  onToggleSidebar,
  onNavigateUp,
  onReset,
}) => {
  return (
    <Box
      p="xs"
      style={{
        borderBottom: `1px solid ${colors.border}`,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexShrink: 0,
      }}
    >
      <Text
        fw={800}
        size="16px"
        c={colors.amber}
        style={{ fontFamily: "Syne, sans-serif" }}
      >
        RepoLens{" "}
        <span style={{ color: colors.muted, fontWeight: 700 }}>entropy</span>
      </Text>
      <Text
        size="9px"
        p="2px 8px"
        style={{
          border: `1px solid ${colors.border2}`,
          color: colors.muted,
          letterSpacing: "0.08em",
        }}
      >
        {repoLabel}
      </Text>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <ActionIcon size="sm" variant="default" onClick={onToggleSidebar}>
          <Menu size={12} />
        </ActionIcon>
        <ActionIcon size="sm" variant="default" disabled={!hasParent} onClick={onNavigateUp}>
          <ArrowUp size={12} />
        </ActionIcon>
        <ActionIcon size="sm" variant="default" onClick={onReset}>
          <RefreshCw size={12} />
        </ActionIcon>
      </div>
    </Box>
  );
};
