/**
 * AIQuestionGenerator — مولّد أسئلة بالذكاء الاصطناعي (offline-first)
 * المدرس يدخل موضوعاً/نصاً → النظام يولّد أسئلة MCQ جاهزة للاختبار
 * يعمل 100% بدون إنترنت باستخدام خوارزمية ذكية لتحليل النص
 */
import { useState } from "react";
import type { Teacher, Subject, Question } from "@/lib/db";
import { getQuestions, saveQuestions } from "@/lib/db";
import { toast } from "./Toast";

interface Props {
  teacher:    Teacher;
  subjects:   Subject[];
  onAdded?:   () => void;
  card:       React.CSSProperties;
}

type Difficulty = Question["difficulty"];

/* ── Arabic Question Templates ── */
const Q_TEMPLATES = [
  (term: string, ctx: string) => ({ q: `ما هو ${term}؟`, correct: ctx }),
  (term: string, ctx: string) => ({ q: `ما المقصود بـ "${term}"؟`, correct: ctx }),
  (term: string, ctx: string) => ({ q: `كيف يُعرَّف ${term}؟`, correct: ctx }),
  (term: string, ctx: string) => ({ q: `أيّ من الآتي يصف ${term} بشكل صحيح؟`, correct: ctx }),
  (term: string, ctx: string) => ({ q: `ما العلاقة بين ${term} والمفاهيم الأخرى؟`, correct: ctx }),
];

const DISTRACTORS_POOL = [
  "ليس لها تعريف محدد في هذا الموضوع",
  "تعريف مختلف تماماً عمّا ذُكر",
  "مفهوم يُستخدم في موضوع آخر",
  "معلومة غير صحيحة علمياً",
  "إجابة تبدو صحيحة لكنها خاطئة",
  "مصطلح له معنى معاكس",
  "تفسير منقوص وغير كامل",
  "مفهوم صحيح في سياق مختلف",
];

function extractTerms(text: string): string[] {
  const words = text
    .split(/[\s،,\.。\n\r\t!?؟]+/)
    .map(w => w.replace(/[()[\]{}""'']/g, "").trim())
    .filter(w => w.length > 3 && !/^(في|من|إلى|على|عن|مع|هو|هي|هم|هن|أن|إن|لا|لم|قد|وقد|ثم|كما)$/.test(w));
  return [...new Set(words)].slice(0, 15);
}

function extractSentences(text: string): string[] {
  return text
    .split(/[.!?؟\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200);
}

function genDistractors(correct: string, pool: string[]): [string, string, string] {
  const used = new Set([correct]);
  const picks: string[] = [];
  const shuffled = [...DISTRACTORS_POOL, ...pool].sort(() => Math.random() - 0.5);
  for (const d of shuffled) {
    if (!used.has(d) && picks.length < 3) { picks.push(d); used.add(d); }
  }
  while (picks.length < 3) picks.push(`خيار بديل ${picks.length + 1}`);
  return picks as [string, string, string];
}

function generateQuestions(
  text:       string,
  subject:    Subject,
  teacher:    Teacher,
  count:      number,
  difficulty: Difficulty,
): Question[] {
  const terms     = extractTerms(text);
  const sentences = extractSentences(text);
  const questions: Question[] = [];
  const allDistractors = terms.map(t => `مصطلح ${t} له تعريف مختلف`);

  for (let i = 0; i < Math.min(count, terms.length, sentences.length); i++) {
    const term   = terms[i % terms.length] ?? "المفهوم";
    const sentence = sentences[i % sentences.length] ?? text.slice(0, 100);
    const tmpl   = Q_TEMPLATES[i % Q_TEMPLATES.length]!;
    const { q, correct } = tmpl(term, sentence);
    const [d1, d2, d3]   = genDistractors(correct, allDistractors);

    const opts: [string, string, string, string] = [correct, d1, d2, d3];
    /* Shuffle options */
    for (let j = opts.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [opts[j], opts[k]] = [opts[k]!, opts[j]!];
    }
    const correctIdx = opts.indexOf(correct);

    questions.push({
      id:           `aq_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 4)}`,
      subjectId:    subject.id,
      teacherId:    teacher.id,
      text:         q,
      options:      opts,
      correctIndex: correctIdx,
      explanation:  `الإجابة مستخرجة من النص: "${sentence.slice(0, 80)}…"`,
      difficulty,
      points:       difficulty === "easy" ? 3 : difficulty === "medium" ? 5 : 8,
      createdAt:    new Date().toLocaleDateString("ar-SA"),
    });
  }
  return questions;
}

export function AIQuestionGenerator({ teacher, subjects, onAdded, card }: Props) {
  const [text,       setText]       = useState("");
  const [subjId,     setSubjId]     = useState<string>(subjects[0]?.id ?? "");
  const [count,      setCount]      = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [generated,  setGenerated]  = useState<Question[]>([]);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [editIdx,    setEditIdx]    = useState<number | null>(null);

  const selSubject = subjects.find(s => s.id === subjId);

  const generate = () => {
    if (!text.trim() || text.trim().length < 30) {
      toast("أدخل نصاً كافياً (30 حرف على الأقل)", "error"); return;
    }
    if (!selSubject) { toast("اختر مادة أولاً", "error"); return; }
    setGenerating(true);
    setTimeout(() => {
      const qs = generateQuestions(text, selSubject, teacher, count, difficulty);
      setGenerated(qs);
      setSelected(new Set(qs.map(q => q.id)));
      setGenerating(false);
    }, 800);
  };

  const addSelected = () => {
    const toAdd = generated.filter(q => selected.has(q.id));
    if (toAdd.length === 0) { toast("اختر أسئلة أولاً", "error"); return; }
    const all = getQuestions();
    saveQuestions([...all, ...toAdd]);
    toast(`✅ تمت إضافة ${toAdd.length} سؤال إلى بنك الأسئلة`, "success");
    setGenerated([]); setSelected(new Set()); setText("");
    onAdded?.();
  };

  const toggleQ = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const updateQ = (idx: number, field: keyof Question, value: unknown) => {
    setGenerated(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Input form ── */}
      <div style={{ ...card, borderRadius: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4, color: "var(--primary)" }}>
          🤖 مولّد الأسئلة الذكي
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
          الصق نصاً من الكتاب أو اكتب موضوعاً — سيولّد النظام أسئلة MCQ جاهزة للاختبار فوراً، بدون إنترنت
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>المادة</label>
          <select value={subjId} onChange={e => setSubjId(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 14 }}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
        </div>

        {/* Text input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
            النص المرجعي (الصق محتوى الدرس أو موضوع الفصل)
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="مثال: الاشتقاق هو عملية إيجاد مشتقة الدالة، وهي تمثّل معدل التغير اللحظي. تُستخدم في إيجاد قيم القصوى والصغرى للدوال..."
            rows={5}
            style={{ width: "100%", padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontFamily: "inherit", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{text.length} حرف</div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>عدد الأسئلة</label>
            <select value={count} onChange={e => setCount(Number(e.target.value))}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13 }}>
              {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} أسئلة</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>الصعوبة</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13 }}>
              <option value="easy">سهل</option>
              <option value="medium">متوسط</option>
              <option value="hard">صعب</option>
            </select>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={generating || text.length < 30}
          style={{
            width: "100%", padding: "12px", borderRadius: 12, border: "none",
            background: generating || text.length < 30 ? "var(--border)" : "linear-gradient(135deg,var(--primary),var(--secondary))",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: generating || text.length < 30 ? "not-allowed" : "pointer",
            fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
          {generating ? (
            <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span> جارٍ التوليد…</>
          ) : "🤖 توليد الأسئلة"}
        </button>
      </div>

      {/* ── Generated questions ── */}
      {generated.length > 0 && (
        <div style={{ ...card, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>📋 الأسئلة المولّدة ({generated.length})</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                اختر الأسئلة التي تريد إضافتها · يمكنك تعديل أي سؤال
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSelected(new Set(generated.map(q => q.id)))}
                style={{ padding: "6px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                تحديد الكل
              </button>
              <button
                onClick={addSelected}
                disabled={selected.size === 0}
                style={{ padding: "6px 16px", background: selected.size > 0 ? "var(--success)" : "var(--border)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: selected.size > 0 ? "pointer" : "not-allowed", fontSize: 12, fontFamily: "inherit" }}>
                ✅ أضف المحدد ({selected.size})
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {generated.map((q, idx) => {
              const isSelected = selected.has(q.id);
              const isEditing  = editIdx === idx;
              return (
                <div key={q.id} style={{
                  borderRadius: 12, border: `2px solid ${isSelected ? "var(--primary)" : "var(--glass-border)"}`,
                  overflow: "hidden", background: isSelected ? "rgba(108,99,255,0.04)" : "var(--bg)",
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px" }}>
                    {/* Checkbox */}
                    <button onClick={() => toggleQ(q.id)} style={{
                      width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                      background: isSelected ? "var(--primary)" : "transparent",
                      cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff",
                    }}>
                      {isSelected ? "✓" : ""}
                    </button>

                    <div style={{ flex: 1 }}>
                      {isEditing ? (
                        <textarea
                          value={q.text}
                          onChange={e => updateQ(idx, "text", e.target.value)}
                          rows={2}
                          style={{ width: "100%", padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--primary)", borderRadius: 6, color: "var(--text)", fontFamily: "inherit", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                        />
                      ) : (
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                          {idx + 1}. {q.text}
                        </div>
                      )}

                      {/* Options */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                        {(q.options as string[]).map((opt, oIdx) => (
                          <div key={oIdx} style={{
                            padding: "5px 10px", borderRadius: 6, fontSize: 12,
                            background: oIdx === q.correctIndex ? "rgba(0,200,150,0.12)" : "rgba(0,0,0,0.04)",
                            border: `1px solid ${oIdx === q.correctIndex ? "rgba(0,200,150,0.3)" : "var(--glass-border)"}`,
                            color: oIdx === q.correctIndex ? "var(--success)" : "var(--text-muted)",
                            fontWeight: oIdx === q.correctIndex ? 700 : 400,
                          }}>
                            {["أ","ب","ج","د"][oIdx]}. {opt}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button onClick={() => setEditIdx(isEditing ? null : idx)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>
                      {isEditing ? "✓" : "✏️"}
                    </button>
                  </div>

                  <div style={{ padding: "6px 48px", borderTop: "1px solid var(--glass-border)", fontSize: 11, color: "var(--text-muted)", background: "var(--bg)" }}>
                    💡 {q.explanation}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

