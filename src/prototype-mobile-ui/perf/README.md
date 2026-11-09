# PROTOTYPE: phone performance (throwaway)

Ticket: "Keep loading and λ updates interactive on a phone". Builds on `prototype/optimizer-tuning`.

- `node src/prototype-mobile-ui/perf/scan-js.ts <react checkout> public/prototype-examples/react.graph.json`: rough regex import scan of react v19.3.1 (4,445 files, 7,840 edges), a stand-in for the real TS/JS Parser
- `node src/prototype-mobile-ui/perf/precompute.ts django react`: writes `<repo>.perf.json` (shipped dendrogram + one sweep birth step per node)
- `node src/prototype-mobile-ui/perf/bench.ts react`: per-phase timings in Node
- `node src/prototype-mobile-ui/perf/profile-step.ts react`: one λ step's materialization, split
- Phone page: `npx vite build && node src/prototype-mobile-ui/build-single-html.mjs structra-perf.html`, open `?repo=react`.
  The overlay (top right) shows load phases and the last redraw; **Run λ 0→1** steps λ by 0.05 and reports median/max; **copy** copies the report.
  Params: `pipe=main|worker|shipped` (default shipped), `live=1` (redraw while dragging on big repos), `cache=0`, `nodecache=0`.
