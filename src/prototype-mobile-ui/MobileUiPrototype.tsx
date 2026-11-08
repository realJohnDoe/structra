// PROTOTYPE (throwaway), ticket "Simplified mobile UI":
// three variants of the single v1 view on the app's only route, switchable via
// `?variant=A|B|C|E`, plus `D` for the pre-existing view for comparison.
// Shared: example-repo/Graph File loading, a stand-in optimizer, and the λ slider.
// Also `?repo=requests|flask|django` and `?lambda=0.42`.
import { useState } from "react";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { readParam, useProtoState, writeParam } from "./shared";
import { VariantA, name as nameA } from "./VariantA";
import { VariantB, name as nameB } from "./VariantB";
import { VariantC, name as nameC } from "./VariantC";
import { VariantE, name as nameE } from "./VariantE";
import LegacyApp from "../App";

const VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
  { key: "D", name: "Current view" },
  { key: "E", name: nameE },
];

export function MobileUiPrototype() {
  const [variant, setVariant] = useState(() => readParam("variant") ?? "A");
  const s = useProtoState();
  return (
    <>
      {variant === "A" && <VariantA s={s} />}
      {variant === "B" && <VariantB s={s} />}
      {variant === "C" && <VariantC s={s} />}
      {variant === "D" && <LegacyApp />}
      {variant === "E" && <VariantE s={s} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(v) => {
          setVariant(v);
          writeParam("variant", v);
        }}
      />
    </>
  );
}
