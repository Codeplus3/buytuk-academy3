/**
 * ExamManagementPanel
 * -------------------
 * Renders the exam-creation form + exam list for a given subject.
 *
 * All state (eForm, editEId, myExams, myQs) lives in TeacherDashboard.
 * This component fires callbacks only — it never touches IDB directly.
 *
 * Role-guard: form and action buttons render only when userRole === "teacher".
 */
import type { Subject, Exam, Question } from "../lib/db";

/* ── Types ─────────────────────────────────────────────────────────── */
export interface ExamFormState {
  title:           string;
  description:     string;
  durationMinutes: number;
  passingPct:      number;
  questionIds:     string[];
  status:          "draft" | "published";
}

export const EXAM_FORM_EMPTY: ExamFormState = {
  title:           "",
  description:     "",
  durationMinutes: 30,
  passingPct:      60,
  questionIds:     [],
  status:          "draft",
};

interface Props {
  userRole:      string;
  mySubjects:    Subject[];
  activeSubject: Subject | null;
  myQs:          Question[];
  myExams:       Exam[];
  eForm:         ExamFormState;
  editEId:       string | null;
  onSubjectChange: (s: Subject | null) => void;
  onFormChange:  (patch: Partial<ExamFormState>) => void;
  onSave:        () => void;
  onCancelEdit:  () => void;
  onDelete:      (id: string) => void;
  onTogglePublish: (id: string) => void;
  onStartEdit:   (e: Exam) => void;
  onToggleQ:     (qId: string) => void;
}

/* ── Shared design tokens ──────────────────────────────────────────── */
const CARD: React.CSSProperties = {
  background:    "var(--card)",
  border:        "1px solid var(--glass-border)",
  borderRadius:  "var(--radius)",
  paddingBlock:  24,
  paddingInline: 20,
  boxShadow:     "0 2px 12px rgba(0,0,0,0.18)",
  transition:    "box-shadow 0.2s",
};

const CARD_TITLE: React.CSSProperties = {
  fontSize:           15,
  fontWeight:         800,
  marginBlockEnd:     18,
  paddingBlockEnd:    12,
  borderBlockEnd:     "1px solid var(--glass-border)",
  borderInlineStart:  "3px solid var(--primary)",
  paddingInlineStart: 10,
  display:            "flex",
  alignItems:         "center",
  gap:                8,
};

const LABEL: React.CSSProperties = {
  display:        "block",
  fontSize:       12,
  color:          "var(--text-muted)",
  marginBlockEnd: 5,
  fontWeight:     600,
};

const BTN_BASE: React.CSSProperties = {
  borderRadius: "var(--radius-sm)",
  cursor:       "pointer",
  fontSize:     12,
  fontWeight:   700,
  fontFamily:   "inherit",
  transition:   "opacity 0.15s, transform 0.15s",
};

export function ExamManagementPanel({
  userRole,
  mySubjects,
  activeSubject,
  myQs,
  myExams,
  eForm,
  editEId,
  onSubjectChange,
  onFormChange,
  onSave,
  onCancelEdit,
  onDelete,
  onTogglePublish,
  onStartEdit,
  onToggleQ,
}: Props) {
  const isTeacher = userRole === "teacher";

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          marginBlockEnd: 20,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>
          📝 الاختبارات {activeSubject ? `— ${activeSubject.name}` : ""}
        </h2>
      </div>

      {/* ── Subject selector ── */}
      {mySubjects.length > 0 && (
        <div style={{ marginBlockEnd: 16 }}>
          <select
            className="form-control"
            value={activeSubject?.id ?? ""}
            onChange={e =>
              onSubjectChange(
                mySubjects.find(s => s.id === e.target.value) ?? null,
              )
            }
          >
            <option value="">— اختر المادة —</option>
            {mySubjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeSubject && (
        <>
          {/* ── Exam form — teacher only ── */}
          {isTeacher && (
            <div style={{ ...CARD, marginBlockEnd: 24 }}>
              <h4 style={CARD_TITLE}>
                {editEId ? "✏️ تعديل الاختبار" : "➕ إنشاء اختبار جديد"}
              </h4>

              <div
                style={{
                  display:             "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap:                 10,
                  marginBlockEnd:      12,
                }}
              >
                {/* Title */}
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={LABEL}>عنوان الاختبار *</label>
                  <input
                    className="form-control"
                    value={eForm.title}
                    onChange={e => onFormChange({ title: e.target.value })}
                    placeholder="مثال: اختبار الفصل الأول"
                  />
                </div>

                {/* Description */}
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={LABEL}>وصف الاختبار</label>
                  <input
                    className="form-control"
                    value={eForm.description}
                    onChange={e => onFormChange({ description: e.target.value })}
                    placeholder="وصف مختصر..."
                  />
                </div>

                {/* Duration */}
                <div>
                  <label style={LABEL}>المدة (دقيقة)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={eForm.durationMinutes}
                    min={5}
                    max={180}
                    onChange={e =>
                      onFormChange({ durationMinutes: Number(e.target.value) })
                    }
                  />
                </div>

                {/* Passing pct */}
                <div>
                  <label style={LABEL}>درجة النجاح (%)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={eForm.passingPct}
                    min={40}
                    max={100}
                    onChange={e =>
                      onFormChange({ passingPct: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {/* Question picker */}
              <div>
                <label style={LABEL}>
                  اختر الأسئلة ({eForm.questionIds.length} محددة)
                </label>
                {myQs.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    لا توجد أسئلة في بنك الأسئلة لهذه المادة — أضف أسئلة أولاً
                  </p>
                ) : (
                  <div
                    style={{
                      maxHeight:     220,
                      overflowY:     "auto",
                      border:        "1px solid var(--border)",
                      borderRadius:  "var(--radius-sm)",
                      paddingBlock:  4,
                      paddingInline: 8,
                    }}
                  >
                    {myQs.map(q => (
                      <label
                        key={q.id}
                        style={{
                          display:       "flex",
                          gap:           10,
                          alignItems:    "flex-start",
                          paddingBlock:  6,
                          paddingInline: 4,
                          cursor:        "pointer",
                          borderBottom:  "1px solid var(--glass-border)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={eForm.questionIds.includes(q.id)}
                          onChange={() => onToggleQ(q.id)}
                          style={{ marginBlockStart: 3 }}
                        />
                        <span style={{ fontSize: 13, flex: 1 }}>{q.text}</span>
                        <span
                          style={{
                            fontSize:  11,
                            color:     "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        >
                          {q.points} نقطة
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Form actions */}
              <div
                style={{
                  display:         "flex",
                  gap:             8,
                  marginBlockStart: 14,
                }}
              >
                <button
                  onClick={onSave}
                  style={{
                    ...BTN_BASE,
                    paddingBlock:  9,
                    paddingInline: 20,
                    background:    "var(--primary)",
                    border:        "none",
                    color:         "#fff",
                    fontSize:      13,
                  }}
                >
                  {editEId ? "💾 حفظ التعديل" : "➕ إنشاء الاختبار"}
                </button>

                {editEId && (
                  <button
                    onClick={onCancelEdit}
                    style={{
                      ...BTN_BASE,
                      paddingBlock:  9,
                      paddingInline: 16,
                      background:    "transparent",
                      border:        "1px solid var(--border)",
                      color:         "var(--text-muted)",
                      fontSize:      13,
                    }}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Exam list ── */}
          {myExams.length === 0 ? (
            <div
              style={{
                textAlign:     "center",
                paddingBlock:  40,
                paddingInline: 0,
                color:         "var(--text-muted)",
              }}
            >
              لا توجد اختبارات بعد
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {myExams.map(exam => (
                <div key={exam.id} style={CARD}>
                  <div
                    style={{
                      display:        "flex",
                      justifyContent: "space-between",
                      alignItems:     "flex-start",
                    }}
                  >
                    {/* Exam info */}
                    <div>
                      <div style={{ fontWeight: 700, marginBlockEnd: 4 }}>
                        {exam.title}
                      </div>
                      <div
                        style={{
                          fontSize:     12,
                          color:        "var(--text-muted)",
                          marginBlockEnd: 8,
                        }}
                      >
                        {exam.description}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="badge badge-info">
                          ⏱ {exam.durationMinutes} دقيقة
                        </span>
                        <span className="badge badge-warning">
                          ✅ نجاح {exam.passingPct}%
                        </span>
                        <span className="badge badge-info">
                          ❓ {exam.questionIds.length} سؤال
                        </span>
                        <span
                          className={`badge ${
                            exam.status === "published" ? "badge-success" : ""
                          }`}
                          style={
                            exam.status === "published"
                              ? undefined
                              : {
                                  background: "rgba(255,255,255,0.06)",
                                  color:      "var(--text-muted)",
                                }
                          }
                        >
                          {exam.status === "published" ? "📢 منشور" : "📋 مسودة"}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons — teacher only */}
                    {isTeacher && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => onTogglePublish(exam.id)}
                          style={{
                            ...BTN_BASE,
                            paddingBlock:  6,
                            paddingInline: 12,
                            background:    exam.status === "published"
                              ? "rgba(255,71,87,0.1)"
                              : "rgba(0,200,150,0.1)",
                            border:        `1px solid ${
                              exam.status === "published"
                                ? "var(--danger)"
                                : "var(--success)"
                            }`,
                            color:         exam.status === "published"
                              ? "var(--danger)"
                              : "var(--success)",
                          }}
                        >
                          {exam.status === "published" ? "إلغاء النشر" : "📢 نشر"}
                        </button>

                        <button
                          onClick={() => onStartEdit(exam)}
                          style={{
                            ...BTN_BASE,
                            paddingBlock:  6,
                            paddingInline: 12,
                            background:    "rgba(108,99,255,0.1)",
                            border:        "1px solid var(--primary)",
                            color:         "var(--primary)",
                          }}
                        >
                          ✏️
                        </button>

                        <button
                          onClick={() => onDelete(exam.id)}
                          style={{
                            ...BTN_BASE,
                            paddingBlock:  6,
                            paddingInline: 12,
                            background:    "rgba(255,71,87,0.08)",
                            border:        "1px solid var(--danger)",
                            color:         "var(--danger)",
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
