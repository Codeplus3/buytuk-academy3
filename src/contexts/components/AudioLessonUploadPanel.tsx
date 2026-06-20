/**
 * AudioLessonUploadPanel — لوحة رفع الشروحات الصوتية (للمدرس)
 * يرفع المدرس ملف MP3/WAV لكل فصل من الكتاب → يُحفظ في IndexedDB
 */

import { useState, useRef, useEffect } from "react";
import type { Teacher, Subject } from "../lib/db";
import {
  getSubjects,
  getAudioLessons,
  saveAudioLessons,
  saveAudioBlob,
  deleteAudioBlob,
  type AudioLesson,
} from "../lib/db";

interface Props {
  teacher: Teacher;
  card:    React.CSSProperties;
}

const SUBJECT_CHAPTERS: Record<string, string[]> = {
  "رياضيات": ["الاشتقاق والتكامل","المعادلات التربيعية","المتتاليات والمتسلسلات","الهندسة التحليلية","اللوغاريتمات"],
  "فيزياء":  ["قوانين نيوتن للحركة","قوانين الحركة الخطية","الشغل والطاقة","الكهرباء والمغناطيسية","الموجات والصوت والضوء"],
  "كيمياء":  ["الجدول الدوري","الروابط الكيميائية","التفاعلات الكيميائية","الأحماض والقواعد"],
  "أحياء":   ["الخلية — وحدة الحياة","الوراثة والجينات","البناء الضوئي والتنفس","النظم البيئية والتطور"],
  "حاسب":    ["الخوارزميات والتعقيد","هياكل البيانات","قواعد البيانات","الشبكات والإنترنت"],
  "عربية":   ["النحو والإعراب","البلاغة والأساليب","الصرف والاشتقاق","الأدب والشعر العربي"],
};

function fmt(sec: number) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function AudioLessonUploadPanel({ teacher, card }: Props) {
  const mySubjects = getSubjects().filter(s =>
    (s.teacherIds ?? []).includes(teacher.id) ||
    (s as unknown as { teacherId?: number }).teacherId === teacher.id,
  );

  const [lessons,   setLessons]   = useState<AudioLesson[]>(() => getAudioLessons());
  const [subjId,    setSubjId]    = useState<string | null>(mySubjects[0]?.id ?? null);
  const [chIdx,     setChIdx]     = useState(0);
  const [title,     setTitle]     = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [msg,       setMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selSubject: Subject | undefined = mySubjects.find(s => s.id === subjId);
  const chapters = selSubject ? (SUBJECT_CHAPTERS[selSubject.name] ?? []) : [];
  const myLessons = lessons.filter(l => l.subjectId === subjId);

  useEffect(() => { setChIdx(0); }, [subjId]);

  const showMsg = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  /* ── رفع ملف صوتي ─────────────────────────────────────────────── */
  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !selSubject) return;
    if (!title.trim()) { showMsg("أدخل عنوان التسجيل أولاً", false); return; }

    setUploading(true);
    setProgress(0);

    try {
      // قراءة المدة
      const url = URL.createObjectURL(file);
      const tmpAudio = new Audio(url);
      const duration = await new Promise<number>(res => {
        tmpAudio.addEventListener("loadedmetadata", () => res(tmpAudio.duration));
        tmpAudio.addEventListener("error", () => res(0));
        setTimeout(() => res(0), 5000);
      });
      URL.revokeObjectURL(url);

      setProgress(30);

      const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // حفظ الـ blob في IndexedDB
      await saveAudioBlob(id, file);
      setProgress(80);

      const lesson: AudioLesson = {
        id,
        subjectId:    selSubject.id,
        teacherId:    teacher.id,
        teacherName:  teacher.name,
        title:        title.trim(),
        chapterIndex: chIdx,
        chapterTitle: chapters[chIdx] ?? `الفصل ${chIdx + 1}`,
        durationSec:  Math.round(duration),
        uploadedAt:   new Date().toISOString(),
      };

      const updated = [...lessons, lesson];
      saveAudioLessons(updated);
      setLessons(updated);
      setProgress(100);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      showMsg(`✅ تم رفع "${lesson.title}" بنجاح`);
    } catch (e) {
      showMsg("حدث خطأ أثناء الرفع — حاول مرة أخرى", false);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  /* ── حذف تسجيل ─────────────────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذا التسجيل نهائياً؟")) return;
    await deleteAudioBlob(id);
    const updated = lessons.filter(l => l.id !== id);
    saveAudioLessons(updated);
    setLessons(updated);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── رسالة ─────────────────────────────────────────────────── */}
      {msg && (
        <div style={{
          padding: "12px 18px", borderRadius: 10,
          background: msg.ok ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${msg.ok ? "var(--success)" : "var(--danger)"}`,
          color: msg.ok ? "var(--success)" : "var(--danger)",
          fontSize: 14, fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── نموذج الرفع ───────────────────────────────────────────── */}
      <div style={{ ...card, padding: "20px 24px", borderRadius: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>
          🎙 رفع شرح صوتي جديد
        </div>

        {/* اختيار المادة */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>المادة</label>
          <select
            value={subjId ?? ""}
            onChange={e => setSubjId(e.target.value)}
            style={{ width: "100%", padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontFamily: "inherit", fontSize: 14 }}
          >
            {mySubjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
        </div>

        {/* اختيار الفصل */}
        {chapters.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>الفصل</label>
            <select
              value={chIdx}
              onChange={e => setChIdx(Number(e.target.value))}
              style={{ width: "100%", padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontFamily: "inherit", fontSize: 14 }}
            >
              {chapters.map((ch, i) => <option key={i} value={i}>{i + 1}. {ch}</option>)}
            </select>
          </div>
        )}

        {/* عنوان التسجيل */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>عنوان التسجيل</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="مثال: شرح النحو والإعراب — الجزء الأول"
            style={{ width: "100%", padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
          />
        </div>

        {/* اختيار الملف */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>الملف الصوتي (MP3 / WAV / M4A)</label>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/m4a,audio/mp4,audio/*"
            style={{ width: "100%", padding: "10px 14px", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 10, color: "var(--text)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", cursor: "pointer" }}
          />
        </div>

        {/* شريط التقدم */}
        {uploading && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ height: 6, background: "var(--border)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,var(--primary),var(--secondary))", borderRadius: 4, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>جارٍ الحفظ… {progress}%</div>
          </div>
        )}

        {/* زر الرفع */}
        <button
          onClick={handleUpload}
          disabled={uploading || !selSubject || !title.trim()}
          style={{
            width: "100%", padding: "12px", borderRadius: 12, border: "none",
            background: uploading || !selSubject || !title.trim()
              ? "var(--border)" : "linear-gradient(135deg,var(--primary),var(--secondary))",
            color: "#fff", fontWeight: 800, fontSize: 15,
            cursor: uploading || !selSubject || !title.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {uploading ? "⏳ جارٍ الرفع…" : "⬆️ رفع التسجيل"}
        </button>
      </div>

      {/* ── قائمة التسجيلات الحالية ───────────────────────────────── */}
      <div style={{ ...card, padding: "20px 24px", borderRadius: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
          📋 تسجيلاتي ({myLessons.length})
          {selSubject && <span style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 500, marginRight: 8 }}>— {selSubject.icon} {selSubject.name}</span>}
        </div>

        {myLessons.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎙</div>
            لا توجد تسجيلات لهذه المادة بعد
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {myLessons.map(l => (
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: 12,
                background: "var(--bg)", border: "1px solid var(--glass-border)",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(108,99,255,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20,
                }}>🎙</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    الفصل {l.chapterIndex + 1}: {l.chapterTitle}
                    {l.durationSec > 0 && ` • ${fmt(l.durationSec)}`}
                    {" • "}{new Date(l.uploadedAt).toLocaleDateString("ar-SA")}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(l.id)}
                  style={{ background: "none", border: "1px solid var(--danger)", borderRadius: 8, padding: "5px 12px", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
                >
                  🗑 حذف
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
