export interface TreeNode {
  id: string;
  name: string;
  path: string;
  children: TreeNode[];
  parent: TreeNode | null;
  isLeaf: boolean;
}

export interface Edge {
  from: string;
  to: string;
}

export interface SubtreeData {
  total: number;
  nH: number;
  eH: number;
  optEH: number;
  intEdges: Edge[];
}

export interface Preset {
  name: string;
  description: string;
  /** Resolves to the repo's imports as DOT text. */
  load: () => Promise<string>;
}

export const COLORS = {
  bg: "#07090e",
  bg1: "#0b0e17",
  bg2: "#0f1320",
  border: "#181e30",
  border2: "#1e2640",
  dim: "#252e48",
  muted: "#4a5a78",
  text: "#9aaac0",
  bright: "#c8d8e8",
  amber: "#f0b040",
  green: "#38d890",
  blue: "#4488ff",
  red: "#e04848",
  violet: "#9060e0",
};

