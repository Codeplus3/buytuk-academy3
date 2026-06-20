import { useEffect, useRef } from "react";

const COLORS = ["#6c63ff", "#f093fb", "#00d4ff", "#00c896"];

export function ParticleBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    for (let i = 0; i < 40; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.cssText = `
        left:${Math.random() * 100}%;
        width:${2 + Math.random() * 4}px;
        height:${2 + Math.random() * 4}px;
        animation-duration:${8 + Math.random() * 14}s;
        animation-delay:${Math.random() * 10}s;
        background:${COLORS[Math.floor(Math.random() * COLORS.length)]};
      `;
      container.appendChild(p);
    }
  }, []);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}
    />
  );
}
