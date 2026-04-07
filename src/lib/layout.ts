import type { GraphEdge } from "./mentionTree";

export type ForceLayout = {
  pos: Record<string, { x: number; y: number; vx: number; vy: number }>;
  nodes: string[];
  edges: GraphEdge[];
  W: number;
  H: number;
};

export function initLayout(nodeIds: string[], edges: GraphEdge[]): ForceLayout {
  const W = 200;
  const H = 200;
  const pos: ForceLayout["pos"] = {};
  nodeIds.forEach((id, i) => {
    const a = (2 * Math.PI * i) / Math.max(nodeIds.length, 1);
    pos[id] = { x: W / 2 + W * 0.35 * Math.cos(a), y: H / 2 + H * 0.35 * Math.sin(a), vx: 0, vy: 0 };
  });
  return { pos, nodes: nodeIds, edges, W, H };
}

export function stepLayout(layout: ForceLayout, iterations = 30) {
  const { pos, nodes, edges, W, H } = layout;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i]];
        const b = pos[nodes[j]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = 300 / (d * d);
        a.vx -= (f * dx) / d;
        a.vy -= (f * dy) / d;
        b.vx += (f * dx) / d;
        b.vy += (f * dy) / d;
      }
    }
    edges.forEach(({ from, to }) => {
      const a = pos[from];
      const b = pos[to];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = 0.01 * d;
      a.vx += (f * dx) / d;
      a.vy += (f * dy) / d;
      b.vx -= (f * dx) / d;
      b.vy -= (f * dy) / d;
    });
    nodes.forEach((id) => {
      const p = pos[id];
      p.vx += (W / 2 - p.x) * 0.01;
      p.vy += (H / 2 - p.y) * 0.01;
      p.x = Math.max(20, Math.min(W - 20, p.x + p.vx));
      p.y = Math.max(20, Math.min(H - 20, p.y + p.vy));
      p.vx *= 0.7;
      p.vy *= 0.7;
    });
  }
}

function hexWithAlpha(hex: string, alpha: number) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const cache: Record<string, string> = {};
function resolveCssColor(varName: string) {
  if (varName.startsWith("#") || varName.startsWith("rgb")) return varName;
  if (cache[varName]) return cache[varName];
  const el = document.createElement("div");
  el.style.color = varName;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return varName;
  const hex = `#${m
    .slice(0, 3)
    .map((x) => Number.parseInt(x, 10).toString(16).padStart(2, "0"))
    .join("")}`;
  cache[varName] = hex;
  return hex;
}

export function drawGraph(
  canvas: HTMLCanvasElement,
  layout: ForceLayout,
  nodeColor: (id: string) => string,
  nodeLabel: (id: string) => string,
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, W, H);
  const scaleX = W / layout.W;
  const scaleY = H / layout.H;

  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 1.5;
  layout.edges.forEach(({ from, to }) => {
    const a = layout.pos[from];
    const b = layout.pos[to];
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(a.x * scaleX, a.y * scaleY);
    ctx.lineTo(b.x * scaleX, b.y * scaleY);
    ctx.stroke();
  });

  layout.nodes.forEach((id) => {
    const p = layout.pos[id];
    if (!p) return;
    const x = p.x * scaleX;
    const y = p.y * scaleY;
    const col = resolveCssColor(nodeColor(id));
    const label = nodeLabel(id);
    const r = 7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = hexWithAlpha(col, 0.25);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(15,15,15,0.75)";
    ctx.fillRect(x - tw / 2 - 2, y + r + 1, tw + 4, 12);
    ctx.fillStyle = col;
    ctx.fillText(label, x, y + r + 7);
  });
}
