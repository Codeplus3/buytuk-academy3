/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VoiceProfilesPanel — بصمات الصوت المرجعية
 * يعرض بصمات المقرئين / الأساتذة ويتيح تشغيلها والتبديل بينها
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect, CSSProperties } from "react";

/* ── أنواع ─────────────────────────────────────────────────────────────────── */

interface VoiceEntry {
  id:          string;
  name:        string;
  description: string;
  file:        string;   // URL relative to public/
  icon:        string;
  color:       string;
}

interface Props {
  card: CSSProperties;
}

/* ── بيانات البصمات الثلاث ──────────────────────────────────────────────── */

export const VOICES: VoiceEntry[] = [
  {
    id:          "v_114",
    name:        "المدرس الأول",
    description: "سورة الناس — النموذج الصوتي الأول",
    file:        "/voice_114.mp3",
    icon:        "👨‍🏫",
    color:       "#6366f1",
  },
  {
    id:          "v_001",
    name:        "المدرس الثاني",
    description: "سورة الفاتحة — النموذج الصوتي الثاني",
    file:        "/voice_001.mp3",
    icon:        "👨‍🏫",
    color:       "#10b981",
  },
  {
    id:          "v_abdulbasit",
    name:        "المدرس الثالث",
    description: "سورة الفاتحة — النموذج الصوتي الثالث",
    file:        "/voice_abdulbasit.mp3",
    icon:        "👨‍🏫",
    color:       "#f59e0b",
  },
];

const ACTIVE_KEY = "buytuk_active_voice";

/* ══════════════════════════════════════════════════════════════════════════════ */

export function VoiceProfilesPanel({ card }: Props) {
  const [activeId, setActiveId]  = useState<string>(
    () => localStorage.getItem(ACTIVE_KEY) ?? "v_abdulbasit"
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress,  setProgress]  = useState<Record<string, number>>({});
  const [duration,  setDuration]  = useState<Record<string, number>>({});
  const [error,     setError]     = useState<Record<string, string>>({});

  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  /* ── تهيئة مشغّلات الصوت ─────────────────────────────────────────── */
  useEffect(() => {
    VOICES.forEach((v) => {
      if (audioRefs.current[v.id]) return;
      const a = new Audio(v.file);
      a.preload = "metadata";

      a.addEventListener("loadedmetadata", () => {
        setDuration(d => ({ ...d, [v.id]: a.duration }));
      });

      a.addEventListener("timeupdate", () => {
        const pct = a.duration > 0 ? (a.currentTime / a.duration) * 100 : 0;
        setProgress(p => ({ ...p, [v.id]: pct }));
      });

      a.addEventListener("ended", () => {
        setPlayingId(null);
        setProgress(p => ({ ...p, [v.id]: 0 }));
      });

      a.addEventListener("error", () => {
        setError(e => ({ ...e, [v.id]: "تعذّر تحميل الملف" }));
      });

      audioRefs.current[v.id] = a;
    });

    return () => {
      Object.values(audioRefs.current).forEach(a => {
        a.pause();
        a.src = "";
      });
    };
  }, []);

  /* ── تشغيل / إيقاف ──────────────────────────────────────────────── */
  function togglePlay(id: string) {
    const a = audioRefs.current[id];
    if (!a) return;

    if (playingId && playingId !== id) {
      audioRefs.current[playingId]?.pause();
    }

    if (playingId === id) {
      a.pause();
      setPlayingId(null);
    } else {
      a.play().catch(() => setError(e => ({ ...e, [id]: "لم يمكن التشغيل" })));
      setPlayingId(id);
    }
  }

  /* ── تغيير موضع التشغيل ─────────────────────────────────────────── */
  function seek(id: string, pct: number) {
    const a = audioRefs.current[id];
    if (!a || !a.duration) return;
    a.currentTime = (pct / 100) * a.duration;
    setProgress(p => ({ ...p, [id]: pct }));
  }

  /* ── تحديد البصمة النشطة ─────────────────────────────────────────── */
  function activateVoice(id: string) {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }

  /* ── مساعد للوقت ─────────────────────────────────────────────────── */
  function fmt(sec: number) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  /* ── العرض ──────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── عنوان اللوحة ─────────────────────────────────────────── */}
      <div style={{
        ...card,
        padding: "16px 20px",
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 32 }}>🎙</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>بصمات الصوت المرجعية</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
            اختر بصمة الصوت التي ستُستخدم في قراءة نصوص المكتبة — البصمة الثالثة هي الاختبار الحالي
          </div>
        </div>
      </div>

      {/* ── بطاقات البصمات ───────────────────────────────────────── */}
      {VOICES.map((v, idx) => {
        const isActive  = activeId === v.id;
        const isPlaying = playingId === v.id;
        const prog      = progress[v.id] ?? 0;
        const dur       = duration[v.id]  ?? 0;
        const curSec    = dur > 0 ? (prog / 100) * dur : 0;
        const hasError  = !!error[v.id];

        return (
          <div key={v.id} style={{
            ...card,
            borderRadius: 16,
            padding: "18px 20px",
            border: isActive
              ? `2px solid ${v.color}`
              : "1px solid var(--glass-border)",
            position: "relative",
            transition: "border 0.2s",
          }}>

            {/* ── شارة "نشط" ─────────────────────────────────── */}
            {isActive && (
              <div style={{
                position: "absolute",
                top: 12,
                left: 14,
                background: v.color,
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 10px",
                borderRadius: 20,
              }}>
                ✓ نشطة الآن
              </div>
            )}

            {/* ── رقم البصمة (badge أعلى اليسار) */}
            <div style={{
              position: "absolute",
              top: 12,
              right: 14,
              background: "var(--glass-border)",
              borderRadius: 20,
              padding: "2px 10px",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-muted)",
            }}>
              #{idx + 1}
            </div>

            {/* ── معلومات البصمة ──────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, marginTop: 8 }}>
              <div style={{
                width: 52, height: 52,
                borderRadius: "50%",
                background: `${v.color}22`,
                border: `2px solid ${v.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>
                {v.icon}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{v.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>{v.description}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {dur > 0 ? `المدة: ${fmt(dur)}` : "جارٍ التحميل…"}
                </div>
              </div>
            </div>

            {/* ── مشغّل الصوت ─────────────────────────────────── */}
            {hasError ? (
              <div style={{
                background: "#ef444422",
                border: "1px solid #ef4444",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#ef4444",
                fontSize: 13,
              }}>
                ⚠️ {error[v.id]}
              </div>
            ) : (
              <div style={{
                background: "var(--surface-2, rgba(255,255,255,0.05))",
                borderRadius: 12,
                padding: "12px 14px",
              }}>
                {/* شريط التقدم */}
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct  = ((e.clientX - rect.left) / rect.width) * 100;
                    seek(v.id, Math.max(0, Math.min(100, pct)));
                  }}
                  style={{
                    height: 6,
                    background: "var(--glass-border)",
                    borderRadius: 3,
                    cursor: "pointer",
                    marginBottom: 10,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    width: `${prog}%`,
                    background: v.color,
                    borderRadius: 3,
                    transition: "width 0.1s linear",
                  }} />
                </div>

                {/* أزرار التحكم */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* زر تشغيل / إيقاف */}
                  <button
                    onClick={() => togglePlay(v.id)}
                    style={{
                      width: 42, height: 42,
                      borderRadius: "50%",
                      background: v.color,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 18,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                      boxShadow: isPlaying ? `0 0 12px ${v.color}88` : "none",
                      transition: "box-shadow 0.3s",
                    }}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>

                  {/* وقت الموضع / المدة */}
                  <div style={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    color: "var(--text-muted)",
                    minWidth: 80,
                  }}>
                    {fmt(curSec)} / {fmt(dur)}
                  </div>

                  {/* موجة متحركة إذا كان يشغّل */}
                  {isPlaying && (
                    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
                      {[1,2,3,4,3].map((h, i) => (
                        <div key={i} style={{
                          width: 3,
                          height: h * 4,
                          background: v.color,
                          borderRadius: 2,
                          animation: `wave-bar 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                        }} />
                      ))}
                    </div>
                  )}

                  {/* مسافة */}
                  <div style={{ flex: 1 }} />

                  {/* زر إعادة الضبط */}
                  <button
                    onClick={() => { seek(v.id, 0); }}
                    title="إعادة للبداية"
                    style={{
                      background: "none",
                      border: "1px solid var(--glass-border)",
                      borderRadius: 8,
                      padding: "4px 10px",
                      fontSize: 14,
                      cursor: "pointer",
                      color: "var(--text-muted)",
                    }}
                  >
                    ⏮
                  </button>
                </div>
              </div>
            )}

            {/* ── زر التفعيل ──────────────────────────────────── */}
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              {isActive ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  color: v.color, fontWeight: 700, fontSize: 13,
                }}>
                  <span>✅</span> هذه البصمة نشطة في القراءة النصية
                </div>
              ) : (
                <button
                  onClick={() => activateVoice(v.id)}
                  style={{
                    background: v.color,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "7px 18px",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  تفعيل هذه البصمة
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* ── ملاحظة تقنية ──────────────────────────────────────────── */}
      <div style={{
        ...card,
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: 13,
        color: "var(--text-muted)",
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
        <div>
          البصمة النشطة تُستخدم في تبويب <strong>قراءة نصية</strong> عند الضغط على زر الاستماع بجانب كل فقرة.
          يمكن إضافة بصمات جديدة في أي وقت برفع ملف صوتي (.mp3 / .wav).
        </div>
      </div>

      {/* ── Animation keyframes ─────────────────────────────────────── */}
      <style>{`
        @keyframes wave-bar {
          from { transform: scaleY(1); }
          to   { transform: scaleY(2.5); }
        }
      `}</style>

    </div>
  );
}
