import type { GraphFile } from "../../core/graphFile.ts";
import type { Preset } from "./types";

/** Renders a Graph File as the DOT text the explorer parses. */
export function graphFileToDot(graph: GraphFile): string {
  const name = JSON.stringify(graph.meta.repo.split("/").pop() ?? "repo");
  const lines = graph.nodes.map((n) => `${JSON.stringify(n)} []`);
  const edges = graph.edges.map(([a, b]) => `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return `digraph ${name} {\n${[...lines, ...edges].join("\n")}\n}`;
}

// Loaded on demand, so django's Graph File is only fetched when picked.
const graphFiles = import.meta.glob("../../../examples/*.graph.json", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const preset = (name: string, description: string): Preset => ({
  name,
  description,
  load: async () => {
    const read = graphFiles[`../../../examples/${name}.graph.json`];
    return graphFileToDot(JSON.parse(await read()) as GraphFile);
  },
});

/** Example Repos in `examples/` (see `repos.toml`). flask first: it is shown on first load. */
export const PRESETS: Record<string, Preset> = {
  flask: preset("flask", "Python"),
  requests: preset("requests", "Python"),
  numpy: preset("numpy", "Python"),
  django: preset("django", "Python"),
};

export const PRESET_GROUPS = [{ label: "Python", keys: ["flask", "requests", "numpy", "django"] }];
