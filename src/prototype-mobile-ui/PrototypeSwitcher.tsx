// PROTOTYPE (throwaway): floating variant switcher. Deliberately shown in the
// production build too, because the GitHub Pages deploy is where the variants get
// reviewed on a phone. Remove together with the losing variants.
import { useEffect } from "react";

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (d: number) => onChange(variants[(i + d + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const btn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#111",
    fontSize: 18,
    width: 36,
    height: 32,
    cursor: "pointer",
  };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        gap: 2,
        background: "#ff5fd2",
        color: "#111",
        borderRadius: 999,
        boxShadow: "0 4px 14px rgba(0,0,0,.5)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      <button style={btn} onClick={() => go(-1)} aria-label="Previous variant">
        ‹
      </button>
      <span>
        {variants[i].key} ({variants[i].name})
      </span>
      <button style={btn} onClick={() => go(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}
