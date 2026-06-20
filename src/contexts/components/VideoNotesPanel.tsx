/**
 * VideoNotesPanel — ملاحظات الفيديو بطوابع زمنية
 * الطالب يضيف ملاحظة عند أي لحظة في الفيديو
 * تظهر كعلامات ملونة على شريط التقدم
 */
import { useState, useRef, useEffect } from "react";
import type { Student } from "../lib/db";
import { getNotesForSubject, getVideoNotes, saveVideoNotes, type VideoNote } from "../lib/db";

const COLORS: VideoNote["color"][] = ["yellow", "green", "blue", "red"];
const COLOR_HEX: Record<VideoNote["color"], string> = {
  yellow: "#f59e0b",
  green:  "#00c896",
  blue:   "#3b82f6",
  red:    "#ef4444",
};
const COLOR_LABELS: Record<VideoNote["color"], string> = {
  yellow: "مهم",
  green:  "مفهوم",
  blue:   "مراجعة",
  red:    "صعب",
};

function fmt(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface Props {
  subjectId:   string;
  student:     Student;
  videoRef:    React.RefObject<HTMLVideoElement | null>;
  duration:    number;
  card:        React.CSSProperties;
  onSeek?:     (sec: number) => void;
}

export function VideoNotesPanel({ subjectId, student, videoRef, duration, card, onSeek }: Props) {
  const [notes, setNotes]     = useState<VideoNote[]>(() => getNotesForSubject(student.id, subjectId));
  const [noteText, setNoteText] = useState("");
  const [selColor, setSelColor] = useState<VideoNote["color"]>("yellow");
  const [currentTs, setCurrentTs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Track video current time */
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const v = videoRef.current;
      if (v) setCurrentTs(v.currentTime);
    }, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [videoRef]);

  const addNote = () => {
    if (!noteText.trim()) return;
    const note: VideoNote = {
      id:           `vn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      studentId:    student.id,
      subjectId,
      timestampSec: Math.round(currentTs),
      note:         noteText.trim(),
      color:        selColor,
      createdAt:    new Date().toISOString(),
    };
    const all = [...getVideoNotes(), note];
    saveVideoNotes(all);
    const updated = getNotesForSubject(student.id, subjectId);
    setNotes(updated);
    setNoteText("");
  };

  const deleteNote = (id: string) => {
    saveVideoNotes(getVideoNotes().filter(n => n.id !== id));
    setNotes(getNotesForSubject(student.id, subjectId));
  };

  const sorted = [...notes].sort((a, b) => a.timestampSec - b.timestampSec);

  return (
    <div style={{ ...card, borderRadius: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📌 ملاحظات الفيديو</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        أضف ملاحظة عند اللحظة الحالية في الفيديو
      </div>

      {/* Progress bar with note markers */}
      {duration > 0 && notes.length > 0 && (
        <div style={{ position: "relative", height: 14, background: "var(--border)", borderRadius: 7, marginBottom: 16, cursor: "pointer" }}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - r.left) / r.width;
            if (videoRef.current) videoRef.current.currentTime = pct * duration;
          }}>
          {/* Current position */}
          <div style={{ position: "absolute", top: 0, bottom: 0, width: `${(currentTs / duration) * 100}%`, background: "rgba(108,99,255,0.4)", borderRadius: 7 }} />
          {/* Note markers */}
          {sorted.map(n => (
            <div
              key={n.id}
              title={`${fmt(n.timestampSec)} — ${n.note}`}
              onClick={e => { e.stopPropagation(); onSeek?.(n.timestampSec); if (videoRef.current) videoRef.current.currentTime = n.timestampSec; }}
              style={{
                position: "absolute", top: "50%", transform: "translate(-50%,-50%)",
                left: `${(n.timestampSec / duration) * 100}%`,
                width: 10, height: 10, borderRadius: "50%",
                background: COLOR_HEX[n.color], border: "2px solid #fff",
                cursor: "pointer", zIndex: 2,
                boxShadow: `0 0 6px ${COLOR_HEX[n.color]}`,
              }}
            />
          ))}
        </div>
      )}

      {/* Add note form */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setSelColor(c)}
              title={COLOR_LABELS[c]}
              style={{
                width: 24, height: 24, borderRadius: "50%",
                background: COLOR_HEX[c], border: selColor === c ? "2px solid #fff" : "2px solid transparent",
                cursor: "pointer", boxShadow: selColor === c ? `0 0 0 2px ${COLOR_HEX[c]}` : "none",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center", background: "var(--bg)", padding: "2px 8px", borderRadius: 6 }}>
          ⏱ {fmt(currentTs)}
        </span>
        <input
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addNote()}
          placeholder="ملاحظتك…"
          style={{ flex: 1, minWidth: 120, padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13 }}
        />
        <button
          onClick={addNote}
          disabled={!noteText.trim()}
          style={{ padding: "8px 14px", background: noteText.trim() ? "var(--primary)" : "var(--border)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: noteText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 12, flexShrink: 0 }}>
          ➕
        </button>
      </div>

      {/* Notes list */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📌</div>
          أضف ملاحظات على أي لحظة في الفيديو
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
          {sorted.map(n => (
            <div
              key={n.id}
              onClick={() => { onSeek?.(n.timestampSec); if (videoRef.current) videoRef.current.currentTime = n.timestampSec; }}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                background: `${COLOR_HEX[n.color]}10`,
                border: `1px solid ${COLOR_HEX[n.color]}30`,
                transition: "all 0.15s",
              }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR_HEX[n.color], marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: COLOR_HEX[n.color], fontWeight: 700, marginBottom: 2 }}>
                  ⏱ {fmt(n.timestampSec)} — {COLOR_LABELS[n.color]}
                </div>
                <div style={{ fontSize: 13 }}>{n.note}</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteNote(n.id); }}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
