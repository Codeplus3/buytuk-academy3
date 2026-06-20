/* LessonLibrary — Student component for browsing book lessons by unit */
import { useState, useEffect } from "react";
import { getLessons, loadLessonFile, getSubjects } from "../lib/db";
import type { Lesson } from "../lib/db";

interface Props {
  studentSubjectIds?: string[];
}

export function LessonLibrary({ studentSubjectIds }: Props) {
  const [, tick] = useState(0);
  const [openSubjectId, setOpenSubjectId]   = useState<string | null>(null);
  const [openUnitKey, setOpenUnitKey]       = useState<string | null>(null);
  const [pdfUrl, setPdfUrl]                 = useState<string | null>(null);
  const [pdfTitle, setPdfTitle]             = useState("");
  const [loading, setLoading]               = useState<string | null>(null);

  useEffect(() => {
    const h = () => tick(n => n + 1);
    window.addEventListener("ome-assets-updated", h);
    return () => window.removeEventListener("ome-assets-updated", h);
  }, []);

  /* Cleanup blob URL on unmount */
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  const allLessons  = getLessons().filter(l => l.status === "active");
  const allSubjects = getSubjects().filter(s => s.status === "active");

  const subjectsWithLessons = allSubjects.filter(s =>
    allLessons.some(l => l.subjectId === s.id) &&
    (!studentSubjectIds?.length || studentSubjectIds.includes(s.id))
  );

  const openPdf = async (lesson: Lesson) => {
    if (!lesson.fileId) return;
    setLoading(lesson.id);
    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const result = await loadLessonFile(lesson.id);
      if (!result) { setLoading(null); return; }
      const blob = new Blob([result.data], { type: result.meta?.type ?? "application/pdf" });
      setPdfUrl(URL.createObjectURL(blob));
      setPdfTitle(`الدرس ${lesson.lessonNumber} — ${lesson.lessonName}`);
    } catch { /* ignore */ }
    finally { setLoading(null); }
  };

  if (subjectsWithLessons.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0", fontSize: 14 }}>
        لا تتوفر دروس بعد في هذه المادة
      </div>
    );
  }

  return (
    <div>
      {/* ── PDF Viewer Overlay ── */}
      {pdfUrl && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); } }}
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column", padding: 16 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>📄 {pdfTitle}</span>
            <button
              onClick={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }}
              style={{ padding: "6px 18px", background: "rgba(255,71,87,0.2)", border: "1px solid var(--danger)", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              ✕ إغلاق
            </button>
          </div>
          <iframe src={pdfUrl} style={{ flex: 1, border: "none", borderRadius: 10 }} title={pdfTitle} />
        </div>
      )}

      {/* ── Subject list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {subjectsWithLessons.map(subject => {
          const subjectLessons = allLessons.filter(l => l.subjectId === subject.id);

          /* Group by unit */
          const unitMap = new Map<number, Lesson[]>();
          for (const l of subjectLessons) {
            if (!unitMap.has(l.unitNumber)) unitMap.set(l.unitNumber, []);
            unitMap.get(l.unitNumber)!.push(l);
          }
          const sortedUnits = [...unitMap.entries()].sort((a, b) => a[0] - b[0]);
          const isSubjectOpen = openSubjectId === subject.id;

          return (
            <div key={subject.id}
              style={{ background: "var(--card)", borderRadius: "var(--radius)", border: "1px solid var(--glass-border)", overflow: "hidden" }}>
              {/* Subject header */}
              <button
                onClick={() => setOpenSubjectId(isSubjectOpen ? null : subject.id)}
                style={{ width: "100%", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "right", color: "var(--text)", fontFamily: "inherit" }}
              >
                <span style={{ fontSize: 30 }}>{subject.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{subject.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {sortedUnits.length} وحدة • {subjectLessons.length} درس
                  </div>
                </div>
                <span style={{ fontSize: 18, color: "var(--text-muted)" }}>{isSubjectOpen ? "▲" : "▼"}</span>
              </button>

              {/* Units accordion */}
              {isSubjectOpen && (
                <div style={{ padding: "0 16px 16px" }}>
                  {sortedUnits.map(([unitNum, unitLessons]) => {
                    const unitKey = `${subject.id}_${unitNum}`;
                    const isUnitOpen = openUnitKey === unitKey;
                    return (
                      <div key={unitNum} style={{ marginBottom: 10 }}>
                        <button
                          onClick={() => setOpenUnitKey(isUnitOpen ? null : unitKey)}
                          style={{ width: "100%", padding: "10px 14px", background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.22)", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "right", color: "var(--text)", fontFamily: "inherit" }}
                        >
                          <span style={{ fontSize: 16 }}>📖</span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>
                              الوحدة {unitNum} — {unitLessons[0]?.unitName}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>
                              ({unitLessons.length} درس)
                            </span>
                          </div>
                          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{isUnitOpen ? "▲" : "▼"}</span>
                        </button>

                        {/* Lessons */}
                        {isUnitOpen && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, paddingRight: 16 }}>
                            {[...unitLessons].sort((a, b) => a.lessonNumber - b.lessonNumber).map(lesson => (
                              <div key={lesson.id}
                                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)" }}>
                                <span style={{ fontSize: 14 }}>📄</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                                    الدرس {lesson.lessonNumber} — {lesson.lessonName}
                                  </div>
                                </div>
                                {lesson.fileId ? (
                                  <button
                                    onClick={() => openPdf(lesson)}
                                    disabled={loading === lesson.id}
                                    style={{ padding: "6px 14px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, opacity: loading === lesson.id ? 0.7 : 1 }}>
                                    {loading === lesson.id ? "⏳" : "📖 قراءة الدرس"}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>لم يُرفع بعد</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
