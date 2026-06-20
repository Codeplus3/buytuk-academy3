/* ─────────────────────────────────────────────────────────────────────────────
 * LanguageSwitcher — Animated AR ⇌ EN toggle
 *
 * Usage:
 *   <LanguageSwitcher />         — full pill (login page / spacious nav)
 *   <LanguageSwitcher compact /> — icon-only for tight navbars
 * ─────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../contexts/LanguageContext";

/* Inject keyframes once into <head> */
const STYLE_ID = "buytuk-lang-switcher-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    /* Globe slow rotation */
    @keyframes btkGlobeRotate {
      0%   { transform: rotate(0deg) scale(1); }
      50%  { transform: rotate(180deg) scale(1.05); }
      100% { transform: rotate(360deg) scale(1); }
    }
    /* Flip when language switches */
    @keyframes btkLabelFlip {
      0%   { transform: rotateY(0deg)   opacity(1); }
      40%  { transform: rotateY(90deg); opacity: 0; }
      60%  { transform: rotateY(90deg); opacity: 0; }
      100% { transform: rotateY(0deg);  opacity: 1; }
    }
    /* Gentle pulse glow on mount */
    @keyframes btkBorderGlow {
      0%, 100% { box-shadow: 0 0 0 0   rgba(108,99,255,0.0), 0 2px 12px rgba(0,0,0,0.3); }
      50%       { box-shadow: 0 0 0 4px rgba(108,99,255,0.35), 0 2px 12px rgba(0,0,0,0.3); }
    }
    /* Ripple on click */
    @keyframes btkRipple {
      0%   { transform: scale(0); opacity: 0.5; }
      100% { transform: scale(2.5); opacity: 0; }
    }

    .btk-lang-pill {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 15px 7px 11px;
      border-radius: 50px;
      border: 1.5px solid rgba(108,99,255,0.38);
      background: rgba(108,99,255,0.1);
      color: #a78bfa;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.22s, border-color 0.22s, transform 0.15s, color 0.22s;
      overflow: hidden;
      white-space: nowrap;
      font-family: inherit;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      user-select: none;
      outline: none;
    }
    [dir="ltr"] .btk-lang-pill { padding: 7px 11px 7px 15px; }

    .btk-lang-pill:hover {
      background: rgba(108,99,255,0.22);
      border-color: rgba(168,139,250,0.65);
      color: #c4b5fd;
      transform: translateY(-1px);
    }
    .btk-lang-pill:active { transform: scale(0.94) translateY(0); }

    /* icon-only compact circle */
    .btk-lang-compact {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1.5px solid rgba(108,99,255,0.38);
      background: rgba(108,99,255,0.1);
      color: #a78bfa;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.22s, border-color 0.22s, transform 0.15s;
      overflow: hidden;
      font-family: inherit;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      user-select: none;
      outline: none;
      flex-shrink: 0;
      animation: btkBorderGlow 3s ease-in-out infinite;
    }
    .btk-lang-compact:hover {
      background: rgba(108,99,255,0.25);
      border-color: rgba(168,139,250,0.65);
      color: #c4b5fd;
      transform: scale(1.08);
      animation: none;
    }
    .btk-lang-compact:active { transform: scale(0.93); animation: none; }

    /* Globe icon */
    .btk-globe {
      display: inline-block;
      font-size: 15px;
      animation: btkGlobeRotate 9s linear infinite;
      transform-origin: center;
      line-height: 1;
    }

    /* Label with flip */
    .btk-label {
      display: inline-block;
      transition: transform 0.18s ease, opacity 0.18s ease;
      line-height: 1;
    }
    .btk-label.flipping {
      animation: btkLabelFlip 0.38s ease forwards;
    }

    /* Ripple element */
    .btk-ripple {
      position: absolute;
      border-radius: 50%;
      width: 100%;
      aspect-ratio: 1;
      background: rgba(168,139,250,0.35);
      pointer-events: none;
      animation: btkRipple 0.55s ease-out forwards;
      top: 50%; left: 50%;
      transform-origin: center;
      margin-top: -50%;
      margin-left: -50%;
    }
  `;
  document.head.appendChild(s);
}

interface Props {
  compact?: boolean;
  style?:   React.CSSProperties;
}

export function LanguageSwitcher({ compact = false, style }: Props) {
  const { lang, toggle } = useLanguage();
  const isAr = lang === "ar";

  const [flipping,    setFlipping]    = useState(false);
  const [showRipple,  setShowRipple]  = useState(false);
  const prevLang = useRef(lang);

  /* Inject CSS on first render */
  useEffect(() => { ensureStyles(); }, []);

  /* Trigger flip animation whenever lang changes */
  useEffect(() => {
    if (prevLang.current !== lang) {
      prevLang.current = lang;
      setFlipping(true);
      const t = setTimeout(() => setFlipping(false), 420);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lang]);

  const handleClick = () => {
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 600);
    toggle();
  };

  /* ── Compact (circle) variant ─────────────────────────────────────── */
  if (compact) {
    return (
      <button
        className="btk-lang-compact"
        onClick={handleClick}
        title={isAr ? "Switch to English" : "التبديل للعربية"}
        aria-label={isAr ? "Switch to English" : "التبديل للعربية"}
        style={style}
      >
        {showRipple && <span className="btk-ripple" />}
        <span className={`btk-label${flipping ? " flipping" : ""}`}>
          {isAr ? "EN" : "ع"}
        </span>
      </button>
    );
  }

  /* ── Full pill variant ────────────────────────────────────────────── */
  return (
    <button
      className="btk-lang-pill"
      onClick={handleClick}
      title={isAr ? "Switch to English" : "التبديل للعربية"}
      aria-label={isAr ? "Switch to English" : "التبديل للعربية"}
      style={style}
    >
      {showRipple && <span className="btk-ripple" />}

      {/* Spinning globe */}
      <span className="btk-globe" aria-hidden="true">🌐</span>

      {/* Flag + label — flips on language change */}
      <span className={`btk-label${flipping ? " flipping" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 15 }}>{isAr ? "🇬🇧" : "🇸🇦"}</span>
        <span>{isAr ? "English" : "العربية"}</span>
      </span>
    </button>
  );
}
