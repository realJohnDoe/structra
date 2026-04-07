import { useState } from "react";
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
    <div className="editor-col">
      <div className="panel-header editor">
        <div className="dot accent"></div>
        NODES
      </div>
      <div className="editor-body">
        <div className="row">
          <select defaultValue="" onChange={(e) => e.target.value && onLoadPreset(e.target.value)}>
            <option value="">load preset...</option>
            {Object.keys(PRESETS).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <AddNodeRow onAddNode={onAddNode} />
        <div>
          {!ids.length && <div className="empty">No nodes yet.</div>}
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
        </div>
      </div>
    </div>
  );
}

function AddNodeRow({ onAddNode }: { onAddNode: (name: string) => void }) {
  return (
    <div className="row">
      <input
        type="text"
        placeholder="node name..."
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const el = e.currentTarget;
          const name = el.value.trim();
          if (!name) return;
          onAddNode(name);
          el.value = "";
        }}
      />
      <button
        className="btn"
        onClick={(e) => {
          const input = e.currentTarget.parentElement?.querySelector("input");
          if (!(input instanceof HTMLInputElement)) return;
          const name = input.value.trim();
          if (!name) return;
          onAddNode(name);
          input.value = "";
        }}
      >
        +
      </button>
    </div>
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
    <details className="node-card">
      <summary className="node-card-hd">
        <span className="node-name">{n.name}</span>
        <span className="mc">{n.mentions.size}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={(e) => {
            e.preventDefault();
            onRemoveNode(id);
          }}
        >
          x
        </button>
      </summary>
      <div className="node-card-bd">
        <div className="sec-lbl">mentions</div>
        <div className="chips">
          {mentions.length ? (
            mentions.map((m) => (
              <span className="chip" key={m}>
                {nodes[m].name}
                <button type="button" onClick={() => onRemoveMention(id, m)}>
                  x
                </button>
              </span>
            ))
          ) : (
            <span className="none">none</span>
          )}
        </div>
        {!!others.length && (
          <div className="mini-row">
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">add...</option>
              {others.map((o) => (
                <option key={o} value={o}>
                  {nodes[o].name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn sec"
              onClick={() => {
                if (!selected) return;
                onAddMention(id, selected);
                setSelected("");
              }}
            >
              +
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
