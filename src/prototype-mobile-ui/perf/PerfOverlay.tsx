// PROTOTYPE (throwaway, ticket "Keep loading and λ updates interactive on a phone"):
// timing overlay. Load: page start → first tree painted, split by phase. Slider: input →
// next paint, split into optimizer (materialize one λ step) and React render + layout.
// "Run" steps λ 0 → 1 by 0.05 (fresh steps, so uncached) and reports median / max.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { perfHook } from "../optimizer";
void perfHook;
import { readParam, writeParam, type ProtoState } from "../shared";
import { perf } from "./pipeline";

const afterPaint = (f: () => void) => requestAnimationFrame(() => setTimeout(f, 0));
const ms = (x: number) => `${x.toFixed(0)} ms`;

interface Redraw { lambda: number; total: number; opt: number }

export function PerfOverlay({ s }: { s: ProtoState }) {
  const [open, setOpen] = useState(true);
  // Settings in React state: the React Compiler memoizes plain readParam() reads.
  const [cfg, setCfg] = useState(() => ({ pipe: readParam("pipe") ?? "shipped", live: readParam("live") ?? "", nodecache: readParam("nodecache") ?? "", cache: readParam("cache") ?? "" }));
  const set = (k: keyof typeof cfg, v: string | null) => {
    writeParam(k, v);
    setCfg({ ...cfg, [k]: v ?? "" });
    s.reload();
  };
  const [first, setFirst] = useState<{ fromPage: number; fromFetch: number; marks: Record<string, number> } | null>(null);
  const [last, setLast] = useState<Redraw | null>(null);
  const [run, setRun] = useState<{ redraws: Redraw[]; done: boolean } | null>(null);
  const firstDone = useRef<string | null>(null);
  const waiter = useRef<((r: Redraw) => void) | null>(null);

  useEffect(() => {
    if (s.prep) return;
    firstDone.current = null; // a (re)load is in progress
    setFirst(null);
    setRun(null);
    setLast(null);
  }, [s.prep]);

  useLayoutEffect(() => {
    if (!s.tree) return;
    const lambda = s.tree.lambda;
    const opt = perfHook.lastMaterialize;
    afterPaint(() => {
      const now = performance.now();
      if (firstDone.current === null) {
        firstDone.current = s.repoKey;
        setFirst({ fromPage: now, fromFetch: now - perf.loadStart, marks: { ...perf.marks } }); // a snapshot: the React Compiler memoizes reads of the mutable perf object
        return;
      }
      if (perf.inputAt) {
        const r = { lambda, total: now - perf.inputAt, opt };
        setLast(r);
        waiter.current?.(r);
      }
    });
  }, [s.tree, s.repoKey]);

  const start = async () => {
    const redraws: Redraw[] = [];
    setRun({ redraws, done: false });
    for (let i = 0; i <= 20; i++) {
      const l = i / 20;
      if (s.tree && Math.abs(s.tree.lambda - l) < 1e-9) continue;
      const p = new Promise<Redraw>((ok) => (waiter.current = ok));
      s.commitLambda(l);
      redraws.push(await p);
      setRun({ redraws: [...redraws], done: false });
      await new Promise((ok) => setTimeout(ok, 30));
    }
    waiter.current = null;
    setRun({ redraws, done: true });
  };

  const q = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] : 0);
  const pipe = cfg.pipe;
  const lines = [
    `repo=${s.repoKey} files=${s.prep?.dendro.n ?? "?"} pipe=${pipe}${cfg.live === "1" ? " live" : ""}${cfg.cache === "0" ? " nocache" : ""}${cfg.nodecache === "0" ? " nonodecache" : ""}`,
    first ? `first tree: ${ms(first.fromFetch)} from load start (page start: ${ms(first.fromPage)})` : "first tree: …",
    ...Object.entries(first?.marks ?? {}).map(([k, v]) => `  ${k}: ${ms(v)}`),
    last ? `last redraw λ=${last.lambda.toFixed(2)}: ${ms(last.total)} (optimizer ${ms(last.opt)}, render ${ms(last.total - last.opt)})` : "last redraw: move the slider",
  ];
  if (run) {
    const t = run.redraws.map((r) => r.total), o = run.redraws.map((r) => r.opt);
    lines.push(`run ${run.done ? "" : "(running) "}${run.redraws.length} steps: redraw median ${ms(q(t, 0.5))} max ${ms(Math.max(0, ...t))}; optimizer median ${ms(q(o, 0.5))} max ${ms(Math.max(0, ...o))}`);
  }
  lines.push(`${navigator.userAgent} · ${navigator.hardwareConcurrency} cores`);
  const text = lines.join("\n");

  return (
    <div style={{ position: "fixed", top: 4, right: 4, zIndex: 1000, maxWidth: "min(92vw, 420px)", background: "rgba(0,0,0,.85)", color: "#c8f060", border: "1px solid #444", borderRadius: 6, font: "11px/1.35 ui-monospace, monospace", padding: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setOpen(!open)}>{open ? "hide" : "perf"}</button>
        {open && <button onClick={start} disabled={!s.tree || (run !== null && !run.done)}>Run λ 0→1</button>}
        {open && <button onClick={() => navigator.clipboard?.writeText(text)}>copy</button>}
      </div>
      {open && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          {["main", "worker", "shipped"].map((p) => (
            <button key={p} style={{ fontWeight: p === pipe ? 700 : 400 }} onClick={() => set("pipe", p)}>{p === pipe ? `[${p}]` : p}</button>
          ))}
          {([["live", "1", "live drag"], ["nodecache", "0", "no group cache"]] as const).map(([k, v, label]) => {
            const on = cfg[k] === v;
            return <button key={k} onClick={() => set(k, on ? null : v)}>{on ? `[${label}]` : label}</button>;
          })}
        </div>
      )}
      {open && <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</pre>}
    </div>
  );
}
