/* ─────────────────────────────────────────────────────────────────────────────
 * InstallPrompt — PWA persistent floating install button (Arabic RTL)
 *
 * Two-layer UI:
 *  1. Floating pill button — always visible (fixed top corner) when installable.
 *     Disappears only when the app is installed or running in standalone mode.
 *  2. Expandable install panel — opens when the button is clicked.
 *     For Chrome/Edge: clicking Install triggers deferredPrompt.prompt() directly.
 *     For iOS Safari:  shows manual "Add to Home Screen" instructions.
 *
 * ─────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect, useRef } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isRunningStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iP(ad|hone|od)/.test(ua) && /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);
}

/* ── Component ───────────────────────────────────────────────────────────── */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton,     setShowButton]     = useState(false);
  const [panelOpen,      setPanelOpen]      = useState(false);
  const [isIos,          setIsIos]          = useState(false);
  const [installed,      setInstalled]      = useState(false);
  const [installing,     setInstalling]     = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* Already running as installed PWA — never show */
    if (isRunningStandalone()) return;

    const ios = isIosSafari();
    setIsIos(ios);

    if (ios) {
      /* iOS: always show button — user must add manually */
      setShowButton(true);
      return;
    }

    /* Chrome / Edge / Samsung: wait for browser event */
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowButton(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstalled(true);
      setShowButton(false);
      setPanelOpen(false);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  /* Close panel when clicking outside */
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  const handleInstall = async () => {
    if (isIos) { setPanelOpen(p => !p); return; }
    if (!deferredPrompt) { setPanelOpen(p => !p); return; }

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setShowButton(false);
        setPanelOpen(false);
      }
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  if (!showButton || installed) return null;

  return (
    <div ref={panelRef} style={{ position: "fixed", top: 16, left: 16, zIndex: 10000 }}>

      {/* ── Floating Pill Button ─────────────────────────────────────────── */}
      <button
        onClick={handleInstall}
        aria-label="تثبيت التطبيق"
        title="تثبيت التطبيق على جهازك"
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            8,
          padding:        "9px 16px 9px 12px",
          background:     "rgba(20, 15, 40, 0.72)",
          backdropFilter: "blur(18px) saturate(1.5)",
          WebkitBackdropFilter: "blur(18px) saturate(1.5)",
          border:         "1px solid rgba(168, 85, 247, 0.45)",
          borderRadius:   50,
          cursor:         "pointer",
          color:          "#e2e8f0",
          fontSize:       13,
          fontWeight:     700,
          fontFamily:     "inherit",
          boxShadow:      "0 4px 24px rgba(124,58,237,0.35), 0 1px 0 rgba(255,255,255,0.06) inset",
          transition:     "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          whiteSpace:     "nowrap",
          userSelect:     "none",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform     = "scale(1.06)";
          e.currentTarget.style.boxShadow     = "0 6px 32px rgba(124,58,237,0.55), 0 1px 0 rgba(255,255,255,0.06) inset";
          e.currentTarget.style.borderColor   = "rgba(168,85,247,0.75)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform     = "scale(1)";
          e.currentTarget.style.boxShadow     = "0 4px 24px rgba(124,58,237,0.35), 0 1px 0 rgba(255,255,255,0.06) inset";
          e.currentTarget.style.borderColor   = "rgba(168,85,247,0.45)";
        }}
      >
        {/* Pulsing dot */}
        <span style={{ position: "relative", display: "flex", width: 8, height: 8 }}>
          <span style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "#a855f7",
            animation: "pwa-ping 1.8s ease-in-out infinite",
          }} />
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "linear-gradient(135deg, #a855f7, #7c3aed)",
            display: "block", flexShrink: 0,
          }} />
        </span>

        <span style={{ fontSize: 16 }}>📲</span>
        <span>{installing ? "جارٍ التثبيت…" : "تثبيت"}</span>

        {/* Chevron */}
        <span style={{
          fontSize: 10, color: "rgba(168,85,247,0.8)",
          transform: panelOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.3s ease",
          display: isIos || !deferredPrompt ? "inline-block" : "none",
        }}>▼</span>
      </button>

      {/* ── Expandable Panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <div
          role="dialog"
          aria-label="تعليمات تثبيت التطبيق"
          style={{
            position:       "absolute",
            top:            "calc(100% + 10px)",
            left:           0,
            width:          280,
            background:     "rgba(14, 10, 32, 0.88)",
            backdropFilter: "blur(24px) saturate(1.6)",
            WebkitBackdropFilter: "blur(24px) saturate(1.6)",
            border:         "1px solid rgba(168,85,247,0.35)",
            borderRadius:   16,
            padding:        "18px 16px",
            boxShadow:      "0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(168,85,247,0.1)",
            animation:      "pwa-slide-down 0.25s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, flexShrink: 0,
              background: "linear-gradient(135deg, #6d28d9, #a855f7)",
              borderRadius: 11, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 20,
              boxShadow: "0 4px 12px rgba(124,58,237,0.4)",
            }}>🎓</div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
                BuyTuk Academy
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#a78bfa" }}>
                {isIos ? "أضفه إلى شاشتك الرئيسية" : "ثبّته على جهازك مجاناً"}
              </p>
            </div>
          </div>

          {isIos ? (
            /* iOS manual instruction */
            <div style={{
              padding: "12px 14px",
              background: "rgba(124,58,237,0.1)",
              border: "1px solid rgba(124,58,237,0.25)",
              borderRadius: 12,
              fontSize: 13, color: "#c4b5fd", lineHeight: 1.8,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>📤</div>
              اضغط <strong style={{ color: "#e2e8f0" }}>شارك</strong>
              <br />
              ثم اختر <strong style={{ color: "#e2e8f0" }}>إضافة إلى الشاشة الرئيسية</strong>
            </div>
          ) : (
            <>
              {/* Feature pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {[
                  { icon: "📴", label: "بدون إنترنت" },
                  { icon: "⚡", label: "سريع جداً" },
                  { icon: "🔒", label: "بياناتك خاصة" },
                ].map(f => (
                  <span key={f.label} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 9px",
                    background: "rgba(124,58,237,0.12)",
                    border: "1px solid rgba(124,58,237,0.25)",
                    borderRadius: 20, fontSize: 11, color: "#c084fc", fontWeight: 600,
                  }}>
                    {f.icon} {f.label}
                  </span>
                ))}
              </div>

              {/* Install CTA */}
              <button
                onClick={handleInstall}
                disabled={installing}
                style={{
                  width: "100%", padding: "11px 0",
                  background: installing
                    ? "rgba(124,58,237,0.4)"
                    : "linear-gradient(135deg, #7c3aed, #a855f7)",
                  border: "none", borderRadius: 11,
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: installing ? "default" : "pointer",
                  fontFamily: "inherit",
                  boxShadow: installing ? "none" : "0 4px 16px rgba(124,58,237,0.45)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { if (!installing) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                {installing ? "⏳ جارٍ التثبيت…" : "⬇ تثبيت الآن"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Keyframe styles ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes pwa-ping {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%       { transform: scale(2.2); opacity: 0; }
        }
        @keyframes pwa-slide-down {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
