"""The Python Graph File writer. The rules are in schema/README.md; the
TypeScript writer is serializeGraphFile in src/core/graphFile.ts."""

import json
from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Meta:
    repo: str
    commit: str
    language: str
    parser: str


def _str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _list(items: list[str]) -> str:
    if not items:
        return "[]"
    return "[\n" + ",\n".join(f"    {item}" for item in items) + "\n  ]"


def serialize_graph_file(meta: Meta, nodes: Iterable[str], edges: Iterable[tuple[str, str]]) -> str:
    """Writes a Graph File in its one canonical byte form.

    Sorts nodes and edges by codepoint (Python's own string order) and drops
    duplicate edges and self-imports. Every edge end must be in `nodes`.
    """
    node_list = sorted(set(nodes))
    edge_list = sorted({(src, dst) for src, dst in edges if src != dst})
    known = set(node_list)
    for src, dst in edge_list:
        if src not in known or dst not in known:
            raise ValueError(f"edge ({src!r}, {dst!r}) has an end outside nodes")
    return "\n".join(
        [
            "{",
            '  "meta": {',
            f'    "repo": {_str(meta.repo)},',
            f'    "commit": {_str(meta.commit)},',
            f'    "language": {_str(meta.language)},',
            f'    "parser": {{ "name": {_str(meta.parser)} }}',
            "  },",
            f'  "nodes": {_list([_str(n) for n in node_list])},',
            f'  "edges": {_list([f"[{_str(s)}, {_str(d)}]" for s, d in edge_list])}',
            "}",
            "",
        ]
    )
