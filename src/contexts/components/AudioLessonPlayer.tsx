/**
 * AudioLessonPlayer — مشغّل الشروحات الصوتية (للطالب)
 * يعرض التسجيلات المتاحة للمادة مع مشغّل كامل بدون إنترنت
 */

import { useState, useRef, useEffect } from "react";
import {
  getAudioLessonsForSubject,
  loadAudioBlob,
  type AudioLesson,
} from "../lib/db";

interface Props {
  subjectId:   string;
  subjectName: string;
  subjectIcon: string;
  card:        React.CSSProperties;
}

function fmt(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

export function AudioLessonPlayer({ subjectId, subjectName, subjectIcon, card }: Props) {
  const [lessons]       = useState<AudioLesson[]>(() => getAudioLessonsForSubject(subjectId));
  const [active, setActive] = useState<AudioLesson | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [speed,       setSpeed]       = useState(1.0);
  const [error,       setError]       = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ── تنظيف الـ blob URL عند التغيير ─────────────────────────── */
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  /* ── تحديث السرعة على الـ audio element ─────────────────────── */
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  /* ── فتح تسجيل ──────────────────────────────────────────────── */
  const openLesson = async (lesson: AudioLesson) => {
    if (active?.id === lesson.id) return;
    // إيقاف الحالي
    audioRef.current?.pause();
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setActive(lesson);
    setLoading(true);

    try {
      const blob = await loadAudioBlob(lesson.id);
      if (!blob) { setError("الملف الصوتي غير موجود في الجهاز"); setLoading(false); return; }
      const url = URL.createObjectURL(blob);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlobUrl(url);

      const a = new Audio(url);
      a.playbackRate = speed;
      a.addEventListener("loadedmetadata", () => setDuration(a.duration));
      a.addEventListener("timeupdate",     () => setCurrentTime(a.currentTime));
      a.addEventListener("ended",          () => setPlaying(false));
      a.addEventListener("error",          () => setError("تعذّر تشغيل الملف"));
      audioRef.current = a;
      setLoading(false);

      // تشغيل فوري
      a.play().then(() => setPlaying(true)).catch(() => setError("اضغط ▶ للتشغيل"));
    } catch {
      setError("خطأ أثناء تحميل الملف");
      setLoading(false);
    }
  };

  /* ── تشغيل / إيقاف ──────────────────────────────────────────── */
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  /* ── سحب شريط التقدم ─────────────────────────────────────────── */
  const seek = (pct: number) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = (pct / 100) * duration;
    setCurrentTime(a.currentTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  /* ─────────────────────────────────────────────────────────────── */
  if (lessons.length === 0) {
    return (
      <div style={{ ...card, padding: "40px 24px", textAlign: "center", borderRadius: 16 }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🎙</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          لا تتوفر شروحات صوتية لـ {subjectIcon} {subjectName} بعد
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          سيُضاف الشرح الصوتي قريباً من قِبل المدرس
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── مشغّل رئيسي ─────────────────────────────────────────── */}
      {active && (
        <div style={{
          ...card, padding: "20px 24px", borderRadius: 16,
          border: "2px solid var(--primary)",
          background: "linear-gradient(135deg,rgba(108,99,255,0.06),rgba(108,99,255,0.02))",
        }}>
          {/* معلومات التسجيل */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
              background: "rgba(108,99,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26,
              animation: playing ? "pulse-icon 1.5s ease-in-out infinite" : "none",
            }}>🎙</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>{active.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                الفصل {active.chapterIndex + 1}: {active.chapterTitle}
                {active.durationSec > 0 && ` • المدة: ${fmt(active.durationSec)}`}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                👨‍🏫 {active.teacherName}
              </div>
            </div>
          </div>

          {/* رسالة خطأ */}
          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: 10, color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          {/* شريط التقدم */}
          <div
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * 100);
            }}
            style={{ height: 8, background: "var(--border)", borderRadius: 4, cursor: "pointer", position: "relative", overflow: "hidden", marginBottom: 10 }}
          >
            <div style={{
              position: "absolute", inset: 0, width: `${progress}%`,
              background: "linear-gradient(90deg,var(--primary),var(--secondary))",
              borderRadius: 4, transition: "width 0.2s linear",
            }} />
          </div>

          {/* وقت */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* أزرار التحكم */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center" }}>

            {/* 10- */}
            <button onClick={() => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - 10); }}
              style={iconBtn}>−10s</button>

            {/* تشغيل / إيقاف */}
            <button
              onClick={togglePlay}
              disabled={loading}
              style={{
                width: 58, height: 58, borderRadius: "50%",
                background: "linear-gradient(135deg,var(--primary),var(--secondary))",
                border: "none", color: "#fff", fontSize: 24,
                cursor: loading ? "wait" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: playing ? "0 0 20px rgba(108,99,255,0.5)" : "none",
                transition: "box-shadow 0.3s",
              }}
            >
              {loading ? "⏳" : playing ? "⏸" : "▶"}
            </button>

            {/* +10 */}
            <button onClick={() => { const a = audioRef.current; if (a) a.currentTime = Math.min(duration, a.currentTime + 10); }}
              style={iconBtn}>+10s</button>
          </div>

          {/* سرعة التشغيل */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>السرعة:</span>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)}
                style={{
                  padding: "4px 12px", borderRadius: 16, fontSize: 12,
                  background: s === speed ? "var(--primary)" : "var(--bg)",
                  color: s === speed ? "#fff" : "var(--text-muted)",
                  cursor: "pointer", fontFamily: "inherit", fontWeight: s === speed ? 700 : 400,
                  border: s === speed ? "none" : "1px solid var(--border)",
                } as React.CSSProperties}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── قائمة التسجيلات ─────────────────────────────────────── */}
      <div style={{ ...card, padding: "16px 20px", borderRadius: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14, color: "var(--primary)" }}>
          🎧 الشروحات الصوتية المتاحة — {subjectIcon} {subjectName} ({lessons.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lessons.map(l => {
            const isActive = active?.id === l.id;
            return (
              <button
                key={l.id}
                onClick={() => openLesson(l)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 16px", borderRadius: 12,
                  background: isActive ? "rgba(108,99,255,0.1)" : "var(--bg)",
                  border: `1px solid ${isActive ? "var(--primary)" : "var(--glass-border)"}`,
                  cursor: "pointer", textAlign: "right", fontFamily: "inherit",
                  transition: "all 0.15s",
                } as React.CSSProperties}
              >
                {/* أيقونة */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: isActive ? "rgba(108,99,255,0.2)" : "var(--card)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>
                  {isActive && playing ? "🔊" : "🎙"}
                </div>

                {/* معلومات */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: isActive ? 800 : 600, fontSize: 14,
                    color: isActive ? "var(--primary)" : "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {l.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    الفصل {l.chapterIndex + 1}: {l.chapterTitle}
                    {l.durationSec > 0 && ` • ${fmt(l.durationSec)}`}
                  </div>
                </div>

                {/* موجة أو سهم */}
                {isActive && playing ? (
                  <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 16 }}>
                    {[1,2,3,2,1].map((h,i) => (
                      <span key={i} style={{
                        display: "inline-block", width: 3, height: h * 4,
                        background: "var(--primary)", borderRadius: 2,
                        animation: `wave-alp 0.5s ease-in-out ${i*0.1}s infinite alternate`,
                      }} />
                    ))}
                  </span>
                ) : (
                  <span style={{ fontSize: 18, color: isActive ? "var(--primary)" : "var(--text-muted)" }}>▶</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes wave-alp{from{transform:scaleY(1)}to{transform:scaleY(2.5)}}
        @keyframes pulse-icon{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
      `}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "var(--bg)", border: "1px solid var(--border)",
  borderRadius: 10, padding: "8px 14px",
  color: "var(--text)", cursor: "pointer",
  fontSize: 12, fontFamily: "inherit", fontWeight: 600,
};
