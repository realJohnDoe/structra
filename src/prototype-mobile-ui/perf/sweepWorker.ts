// PROTOTYPE (throwaway): run the λ sweep in a Web Worker ("worker" pipeline).
import { Contraction } from "../tuning/survivors.ts";
import type { Dendrogram } from "../optimizer.ts";

self.onmessage = (e: MessageEvent<{ dendro: Dendrogram; edges: [number, number][] }>) => {
  const t0 = performance.now();
  const { dendro, edges } = e.data;
  const c = new Contraction(dendro, edges).flat();
  const birth = new Uint8Array(2 * dendro.n - 1).fill(255);
  birth[dendro.root] = 0;
  for (let i = 0; i <= 100; i++) {
    c.descend(i / 100, "add");
    for (let x = dendro.n; x < 2 * dendro.n - 1; x++) if (c.surv[x] && birth[x] === 255) birth[x] = i;
  }
  (self as unknown as Worker).postMessage({ birth, ms: performance.now() - t0 }, [birth.buffer]);
};
