import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { graphFileToDot } from "./examples.ts";
import type { GraphFile } from "../../core/graphFile.ts";
import { PRESETS } from "./examples.ts";

describe("graphFileToDot", () => {
  it("lists every file and every import", () => {
    const graph: GraphFile = {
      meta: { repo: "https://github.com/x/demo", commit: "c", language: "python", parser: { name: "p" } },
      nodes: ["a.py", "b.py", "lonely.py"],
      edges: [["a.py", "b.py"]],
    };
    expect(graphFileToDot(graph)).toBe('digraph "demo" {\n"a.py" []\n"b.py" []\n"lonely.py" []\n"a.py" -> "b.py"\n}');
  });

  it("covers each Python Example Repo artifact", () => {
    for (const name of ["flask", "requests", "numpy", "django"]) {
      expect(PRESETS[name]).toBeDefined();
      const g = JSON.parse(readFileSync(`examples/${name}.graph.json`, "utf8")) as GraphFile;
      expect(graphFileToDot(g).split("\n")).toHaveLength(g.nodes.length + g.edges.length + 2);
    }
  });
});
