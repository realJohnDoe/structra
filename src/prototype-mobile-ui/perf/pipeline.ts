// PROTOTYPE (throwaway, ticket "Keep loading and λ updates interactive on a phone").
// Three ways to get from a loaded Graph File to a Prepared that can answer any λ step:
//   main:    build the dendrogram and run the sweep on the main thread (what the earlier prototypes did)
//   worker:  dendrogram shipped precomputed (ADR 0002); the sweep runs in a Web Worker on load
//   shipped: dendrogram and the sweep's birth steps both shipped; nothing heavy at runtime
import { prepare, perfHook, type Dendrogram, type GraphFile, type Prepared } from "../optimizer";
import { Contraction } from "../tuning/survivors";
import SweepWorker from "./sweepWorker.ts?worker&inline";

export type Pipe = "main" | "worker" | "shipped";
export interface PerfArtifacts { parent: number[]; children: [number, number][]; root: number; birth: number[] }

export const perf = {
  marks: {} as Record<string, number>, // ms durations of load phases
  loadStart: 0, // when the Graph File fetch started
  inputAt: 0, // last slider input

};

const setsFromBirth = (birth: ArrayLike<number>, n: number): Uint8Array[] => {
  const sets: Uint8Array[] = [];
  for (let i = 0; i <= 100; i++) {
    const s = new Uint8Array(2 * n - 1);
    for (let x = n; x < 2 * n - 1; x++) if (birth[x] <= i) s[x] = 1;
    sets.push(s);
  }
  return sets;
};

void perfHook;
export async function preparePipe(graph: GraphFile, pipe: Pipe, art: PerfArtifacts | null): Promise<Prepared> {
  const t = () => performance.now();
  let t0 = t();
  if (pipe === "main" || !art) {
    const prep = prepare(graph);
    perf.marks.dendrogram = t() - t0;
    t0 = t();
    const c = new Contraction(prep.dendro, prep.edges).flat();
    const sets: Uint8Array[] = [];
    for (let i = 0; i <= 100; i++) {
      c.descend(i / 100, "add");
      sets.push(c.surv.slice());
    }
    prep.sweep = sets;
    perf.marks.sweep = t() - t0;
    return prep;
  }
  const dendro: Dendrogram = { n: graph.nodes.length, parent: Int32Array.from(art.parent), children: art.children, root: art.root };
  const prep = prepare(graph, undefined, dendro);
  perf.marks.prepare = t() - t0;
  t0 = t();
  if (pipe === "shipped") {
    prep.sweep = setsFromBirth(art.birth, dendro.n);
    perf.marks.expandSets = t() - t0;
    return prep;
  }
  const w = new SweepWorker();
  const res = await new Promise<{ birth: Uint8Array; ms: number }>((ok, fail) => {
    w.onmessage = (e) => ok(e.data);
    w.onerror = (e) => fail(e);
    w.postMessage({ dendro, edges: prep.edges });
  });
  w.terminate();
  perf.marks.workerRoundTrip = t() - t0;
  perf.marks.sweepInWorker = res.ms;
  t0 = t();
  prep.sweep = setsFromBirth(res.birth, dendro.n);
  perf.marks.expandSets = t() - t0;
  return prep;
}
