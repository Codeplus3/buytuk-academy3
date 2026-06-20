/**
 * ChapterProgressTracker — تتبع قراءة الفصول
 * يعرض الفصول مع حالة القراءة ويسمح بتحديد الفصل الحالي
 */
import { useState, useEffect } from "react";
import type { Student } from "@/lib/db";
import { getProgressForStudent, markChapterRead } from "@/lib/db";

const SUBJECT_CHAPTERS: Record<string, string[]> = {
  "رياضيات": ["الاشتقاق والتكامل","المعادلات التربيعية","المتتاليات والمتسلسلات","الهندسة التحليلية","اللوغاريتمات"],
  "فيزياء":  ["قوانين نيوتن للحركة","قوانين الحركة الخطية","الشغل والطاقة","الكهرباء والمغناطيسية","الموجات والصوت والضوء"],
  "كيمياء":  ["الجدول الدوري","الروابط الكيميائية","التفاعلات الكيميائية","الأحماض والقواعد"],
  "أحياء":   ["الخلية — وحدة الحياة","الوراثة والجينات","البناء الضوئي والتنفس","النظم البيئية والتطور"],
  "حاسب":    ["الخوارزميات والتعقيد","هياكل البيانات","قواعد البيانات","الشبكات والإنترنت"],
  "عربية":   ["النحو والإعراب","البلاغة والأساليب","الصرف والاشتقاق","الأدب والشعر العربي"],
};

interface Props {
  subjectId:   string;
  subjectName: string;
  student:     Student;
  card:        React.CSSProperties;
  onSelectChapter?: (idx: number) => void;
}

export function ChapterProgressTracker({ subjectId, subjectName, student, card, onSelectChapter }: Props) {
  const chapters  = SUBJECT_CHAPTERS[subjectName] ?? [];
  const [readSet, setReadSet] = useState<Set<number>>(() => {
    const prog = getProgressForStudent(student.id, subjectId);
    return new Set(prog.map(p => p.chapterIndex));
  });

  /* re-sync when component mounts */
  useEffect(() => {
    const prog = getProgressForStudent(student.id, subjectId);
    setReadSet(new Set(prog.map(p => p.chapterIndex)));
  }, [student.id, subjectId]);

  const markRead = (idx: number) => {
    markChapterRead(student.id, subjectId, idx, chapters[idx] ?? `الفصل ${idx + 1}`);
    setReadSet(prev => new Set([...prev, idx]));
  };

  const readCount = [...readSet].filter(i => i < chapters.length).length;
  const pct = chapters.length ? Math.round((readCount / chapters.length) * 100) : 0;

  if (chapters.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 40, borderRadius: 16 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>لا توجد فصول محددة لهذه المادة</p>
      </div>
    );
  }

  return (
    <div style={{ ...card, borderRadius: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📚 تقدم قراءة الفصول</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            قرأت {readCount} من {chapters.length} فصل
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: pct === 100 ? "var(--success)" : "var(--primary)" }}>{pct}%</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>مكتمل</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden", marginBottom: 18 }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: pct === 100
            ? "linear-gradient(90deg,var(--success),#34d399)"
            : "linear-gradient(90deg,var(--primary),var(--secondary))",
          borderRadius: 4, transition: "width 0.5s ease",
        }} />
      </div>

      {/* Chapter list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {chapters.map((ch, idx) => {
          const isRead = readSet.has(idx);
          return (
            <div
              key={idx}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px", borderRadius: 12,
                background: isRead ? "rgba(0,200,150,0.07)" : "var(--bg)",
                border: `1px solid ${isRead ? "rgba(0,200,150,0.2)" : "var(--glass-border)"}`,
                transition: "all 0.2s",
              }}
            >
              {/* Read indicator */}
              <button
                onClick={() => { if (!isRead) markRead(idx); }}
                title={isRead ? "تمت القراءة" : "اضغط لتحديد كمقروء"}
                style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${isRead ? "var(--success)" : "var(--border)"}`,
                  background: isRead ? "var(--success)" : "transparent",
                  cursor: isRead ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "#fff",
                }}
              >
                {isRead ? "✓" : ""}
              </button>

              {/* Chapter info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: isRead ? 700 : 500, color: isRead ? "var(--text)" : "var(--text-muted)" }}>
                  {idx + 1}. {ch}
                </div>
              </div>

              {/* Open chapter button */}
              {onSelectChapter && (
                <button
                  onClick={() => { onSelectChapter(idx); if (!isRead) markRead(idx); }}
                  style={{
                    padding: "5px 12px", borderRadius: 8, border: "none",
                    background: "rgba(108,99,255,0.12)", color: "var(--primary)",
                    cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                  }}
                >
                  فتح ▶
                </button>
              )}

              {isRead && (
                <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 700, flexShrink: 0 }}>✅ مقروء</span>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

