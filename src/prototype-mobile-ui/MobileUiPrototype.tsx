// PROTOTYPE (throwaway). Ticket "Show a group's direct files by folder": the chosen v1
// view (variant A, drill-down icicle) with the way it shows a group's direct files
// switchable via `?files=1|2|3|4` (bottom bar, or ←/→). `?folders=own` buckets by each
// file's own folder instead of the first folder level below the group's.
// Also `?repo=requests|flask|django`, `?lambda=0.42` and `?opt=1|2|3|4` (the optimizer
// options of ticket "Tune the mapping from Dependency Graph to Optimal Tree", default 3).
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
import type { FilesMode } from "./VariantA";

const FILES: { key: FilesMode; name: string }[] = [
  { key: "1", name: "Today: hatched N files" },
  { key: "2", name: "Folders, own overflow" },
  { key: "3", name: "Folders, one hatched +N" },
  { key: "4", name: "Folders, outlined +N" },
];

const OPTS: { key: string; name: string; opts: OptimizerOptions }[] = [
  { key: "1", name: "Current: greedy per λ", opts: { linkage: "parisSize", contraction: "greedy", looseByFolder: false } },
  { key: "2", name: "Sweep up λ", opts: { linkage: "parisSize", contraction: "sweep", looseByFolder: false } },
  { key: "3", name: "Sweep + degree linkage", opts: { linkage: "parisVol", contraction: "sweep", looseByFolder: false } },
  { key: "4", name: "Sweep + folder bundles", opts: { linkage: "parisSize", contraction: "sweep", looseByFolder: true } },
];

export function MobileUiPrototype() {
  const variant = readParam("variant") ?? "A";
  const opt = readParam("opt") ?? "3";
  const [files, setFiles] = useState<FilesMode>(() => (FILES.find((f) => f.key === readParam("files"))?.key ?? "4"));
  const opts = useMemo(() => (OPTS.find((o) => o.key === opt) ?? OPTS[2]).opts, [opt]);
  const s = useProtoState(opts);
  return (
    <>
      {variant === "A" && <VariantA key={files} s={s} mode={files} />}
      {variant === "B" && <VariantB s={s} />}
      {variant === "C" && <VariantC s={s} />}
      {variant === "D" && <LegacyApp />}
      {variant === "E" && <VariantE s={s} />}
      <PrototypeSwitcher
        variants={FILES}
        current={files}
        onChange={(v) => {
          setFiles(v as FilesMode);
          writeParam("files", v);
        }}
      />
    </>
  );
}
