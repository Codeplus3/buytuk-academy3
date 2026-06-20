/**
 * ChapterQAPanel — أسئلة الطلاب على الفصل
 * الطالب يكتب سؤاله، المدرس يجيب من لوحته
 */
import { useState } from "react";
import type { Student, Teacher } from "@/lib/db";
import { getQAsForChapter, getQAsForTeacher, getChapterQAs, saveChapterQAs, type ChapterQA } from "@/lib/db";

const CHAPTERS: Record<string, string[]> = {
  "رياضيات": ["الاشتقاق والتكامل","المعادلات التربيعية","المتتاليات والمتسلسلات","الهندسة التحليلية","اللوغاريتمات"],
  "فيزياء":  ["قوانين نيوتن للحركة","قوانين الحركة الخطية","الشغل والطاقة","الكهرباء والمغناطيسية","الموجات والصوت والضوء"],
  "كيمياء":  ["الجدول الدوري","الروابط الكيميائية","التفاعلات الكيميائية","الأحماض والقواعد"],
  "أحياء":   ["الخلية — وحدة الحياة","الوراثة والجينات","البناء الضوئي والتنفس","النظم البيئية والتطور"],
  "حاسب":    ["الخوارزميات والتعقيد","هياكل البيانات","قواعد البيانات","الشبكات والإنترنت"],
  "عربية":   ["النحو والإعراب","البلاغة والأساليب","الصرف والاشتقاق","الأدب والشعر العربي"],
};

/* ════════════════════════════════════════════════════════════════════
   Student View
════════════════════════════════════════════════════════════════════ */
interface StudentProps {
  subjectId:    string;
  subjectName:  string;
  chapterIndex: number;
  student:      Student;
  card:         React.CSSProperties;
}

export function ChapterQAStudentPanel({ subjectId, subjectName, chapterIndex, student, card }: StudentProps) {
  const [qText, setQText]     = useState("");
  const [, forceRender]       = useState(0);
  const refresh = () => forceRender(n => n + 1);

  const chapters     = CHAPTERS[subjectName] ?? [];
  const chapterTitle = chapters[chapterIndex] ?? `الفصل ${chapterIndex + 1}`;
  const qas          = getQAsForChapter(subjectId, chapterIndex);

  const submit = () => {
    if (!qText.trim()) return;
    const qa: ChapterQA = {
      id:          `qa_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      subjectId,   chapterIndex,
      studentId:   student.id,
      studentName: student.name,
      question:    qText.trim(),
      askedAt:     new Date().toISOString(),
      isPublic:    true,
    };
    saveChapterQAs([...getChapterQAs(), qa]);
    setQText(""); refresh();
  };

  return (
    <div style={{ ...card, borderRadius: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>❓ أسئلة الفصل</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
        {chapterTitle} — اسأل المدرس وستصله على الفور
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={qText}
          onChange={e => setQText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="اكتب سؤالك هنا…"
          style={{ flex: 1, padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontFamily: "inherit", fontSize: 14 }}
        />
        <button onClick={submit} disabled={!qText.trim()}
          style={{ padding: "10px 18px", background: qText.trim() ? "var(--primary)" : "var(--border)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: qText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 13 }}>
          ✉️ إرسال
        </button>
      </div>

      {/* Q&A list */}
      {qas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
          لا توجد أسئلة لهذا الفصل بعد — كن أول من يسأل!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {qas.map(qa => (
            <div key={qa.id} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--glass-border)" }}>
              {/* Question */}
              <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--bg)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(108,99,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>❓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                    {qa.studentName} · {new Date(qa.askedAt).toLocaleDateString("ar-SA")}
                    {qa.studentId === student.id && <span style={{ marginRight: 6, color: "var(--primary)", fontWeight: 700 }}>(أنت)</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{qa.question}</div>
                </div>
              </div>
              {/* Answer */}
              {qa.answer ? (
                <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "rgba(0,200,150,0.05)", borderTop: "1px solid rgba(0,200,150,0.15)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,200,150,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👨‍🏫</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--success)", marginBottom: 4, fontWeight: 700 }}>
                      {qa.teacherName ?? "المدرس"} · {qa.answeredAt ? new Date(qa.answeredAt).toLocaleDateString("ar-SA") : ""}
                    </div>
                    <div style={{ fontSize: 13 }}>{qa.answer}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "8px 14px", background: "rgba(245,158,11,0.05)", borderTop: "1px solid rgba(245,158,11,0.15)", fontSize: 12, color: "var(--warning)" }}>
                  ⏳ في انتظار رد المدرس…
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Teacher View — answers pending questions across all chapters
════════════════════════════════════════════════════════════════════ */
interface TeacherQAProps {
  subjectId:   string;
  subjectName: string;
  teacher:     Teacher;
  card:        React.CSSProperties;
}

export function ChapterQATeacherPanel({ subjectId, subjectName, teacher, card }: TeacherQAProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [, forceRender]       = useState(0);
  const refresh = () => forceRender(n => n + 1);

  const pending  = getQAsForTeacher(subjectId);
  const answered = getChapterQAs().filter(q => q.subjectId === subjectId && q.answer);
  const chapters = CHAPTERS[subjectName] ?? [];

  const submitAnswer = (qaId: string) => {
    const text = answers[qaId]?.trim();
    if (!text) return;
    const all = getChapterQAs();
    const idx = all.findIndex(q => q.id === qaId);
    if (idx !== -1) {
      all[idx] = { ...all[idx]!, answer: text, teacherId: teacher.id, teacherName: teacher.name, answeredAt: new Date().toISOString() };
      saveChapterQAs(all);
      setAnswers(prev => { const n = { ...prev }; delete n[qaId]; return n; });
      refresh();
    }
  };

  const deleteQA = (qaId: string) => {
    if (!confirm("حذف هذا السؤال؟")) return;
    saveChapterQAs(getChapterQAs().filter(q => q.id !== qaId));
    refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Pending */}
      <div style={{ ...card, borderRadius: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, color: "var(--warning)" }}>
          ⏳ أسئلة تنتظر إجابتك ({pending.length})
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>مادة {subjectName}</div>

        {pending.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: 13 }}>
            🎉 لا توجد أسئلة معلّقة — أحسنت!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {pending.map(qa => (
              <div key={qa.id} style={{ borderRadius: 12, border: "1px solid var(--glass-border)", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                      👤 {qa.studentName} · الفصل {qa.chapterIndex + 1}: {chapters[qa.chapterIndex] ?? ""}
                      · {new Date(qa.askedAt).toLocaleDateString("ar-SA")}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{qa.question}</div>
                  </div>
                  <button onClick={() => deleteQA(qa.id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16 }}>🗑</button>
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(108,99,255,0.03)", borderTop: "1px solid var(--glass-border)", display: "flex", gap: 8 }}>
                  <input
                    value={answers[qa.id] ?? ""}
                    onChange={e => setAnswers(prev => ({ ...prev, [qa.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && submitAnswer(qa.id)}
                    placeholder="اكتب إجابتك…"
                    style={{ flex: 1, padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13 }}
                  />
                  <button
                    onClick={() => submitAnswer(qa.id)}
                    disabled={!answers[qa.id]?.trim()}
                    style={{ padding: "8px 14px", background: answers[qa.id]?.trim() ? "var(--success)" : "var(--border)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: answers[qa.id]?.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 12 }}>
                    ✅ أرسل
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Answered */}
      {answered.length > 0 && (
        <div style={{ ...card, borderRadius: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14, color: "var(--success)" }}>
            ✅ الأسئلة المجابة ({answered.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {answered.slice(-5).map(qa => (
              <div key={qa.id} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.15)", fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{qa.question}</div>
                <div style={{ color: "var(--success)", fontSize: 12 }}>↳ {qa.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

