// PROTOTYPE (throwaway). Ticket "Tune the mapping from Dependency Graph to Optimal Tree":
// the chosen v1 view (variant A, drill-down icicle) with the optimizer switchable via
// `?opt=1|2|3|4` (bottom bar, or ←/→). Also `?repo=requests|flask|django` and `?lambda=0.42`.
// The earlier UI variants stay reachable with `?variant=B|C|D|E`.
import { useMemo, useState } from "react";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { readParam, useProtoState, writeParam } from "./shared";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantC } from "./VariantC";
import { VariantE } from "./VariantE";
import LegacyApp from "../App";
import type { OptimizerOptions } from "./optimizer";

const OPTS: { key: string; name: string; opts: OptimizerOptions }[] = [
  { key: "1", name: "Current: greedy per λ", opts: { linkage: "parisSize", contraction: "greedy", looseByFolder: false } },
  { key: "2", name: "Sweep up λ", opts: { linkage: "parisSize", contraction: "sweep", looseByFolder: false } },
  { key: "3", name: "Sweep + degree linkage", opts: { linkage: "parisVol", contraction: "sweep", looseByFolder: false } },
  { key: "4", name: "Sweep + folder bundles", opts: { linkage: "parisSize", contraction: "sweep", looseByFolder: true } },
];

export function MobileUiPrototype() {
  const variant = readParam("variant") ?? "A";
  const [opt, setOpt] = useState(() => readParam("opt") ?? "2");
  const opts = useMemo(() => (OPTS.find((o) => o.key === opt) ?? OPTS[1]).opts, [opt]);
  const s = useProtoState(opts);
  return (
    <>
      {variant === "A" && <VariantA key={opt} s={s} />}
      {variant === "B" && <VariantB s={s} />}
      {variant === "C" && <VariantC s={s} />}
      {variant === "D" && <LegacyApp />}
      {variant === "E" && <VariantE s={s} />}
      <PrototypeSwitcher
        variants={OPTS}
        current={opt}
        onChange={(v) => {
          setOpt(v);
          writeParam("opt", v);
        }}
      />
    </>
  );
}
