import type { TreeNode } from "../lib/mentionTree";

export function FileTreePanel({ tree }: { tree: TreeNode | null }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="dot accent"></div>4 · FILE TREE
      </div>
      <div className="panel-body tree-body">
        {tree ? <TreeNodeView node={tree} depth={0} /> : <div className="empty">Add nodes to see the tree.</div>}
      </div>
    </div>
  );
}

function TreeNodeView({ node, depth }: { node: TreeNode; depth: number }) {
  const icon = node.isDir ? "▸" : "·";
  const color = node.unnamed ? "var(--accent2)" : node.isDir ? "var(--accent)" : "var(--text)";
  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: `${depth * 12 + 4}px` }}>
        <span className="tree-icon">{icon}</span>
        <span style={{ color }}>{node.unnamed ? "?" : node.name || "/"}</span>
      </div>
      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child, i) => (
            <TreeNodeView key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
