import { useState, useMemo } from "react";
import type { Student } from "@/lib/db";
import {
  getHomework, getHomeworkSubmissions, saveHomeworkSubmissions,
  getPeerReviews, savePeerReviews,
} from "@/lib/db";
import type { HomeworkSubmission, PeerReview } from "@/lib/db";
import { toast } from "./Toast";

interface Props { student: Student; card: React.CSSProperties; }

const STARS = [1, 2, 3, 4, 5] as const;

export function PeerReviewPanel({ student, card }: Props) {
  const [selectedHomework, setSelectedHomework] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<HomeworkSubmission | null>(null);
  const [rating, setRating] = useState<1|2|3|4|5>(3);
  const [comment, setComment] = useState("");
  const [view, setView] = useState<"review" | "received">("review");

  const activeHomework = useMemo(() =>
    getHomework().filter(hw =>
      hw.status === "active" &&
      hw.stage === student.stage &&
      hw.grade === student.grade &&
      (hw.track === "all" || hw.track === student.track) &&
      (hw.schoolId === "all" || hw.schoolId === student.schoolId)
    ), [student]);

  const allSubs = useMemo(() => getHomeworkSubmissions(), []);
  const mySubmission = useMemo(() =>
    allSubs.find(s => s.homeworkId === selectedHomework && s.studentId === student.id),
    [allSubs, selectedHomework, student.id]);

  const peersSubmissions = useMemo(() =>
    allSubs.filter(s =>
      s.homeworkId === selectedHomework &&
      s.studentId !== student.id
    ), [allSubs, selectedHomework, student.id]);

  const reviews = useMemo(() => getPeerReviews(), []);
  const myReviews    = reviews.filter(r => r.reviewerId === student.id);
  const receivedRevs = reviews.filter(r => r.targetStudentId === student.id);

  const alreadyReviewed = (submissionId: string) =>
    myReviews.some(r => r.targetSubmissionId === submissionId);

  const handleSubmitReview = () => {
    if (!selectedSubmission) return;
    if (!comment.trim()) { toast("يرجى كتابة تعليق", "error"); return; }
    if (alreadyReviewed(selectedSubmission.id)) { toast("قيّمت هذا الطالب بالفعل", "error"); return; }

    const all = getPeerReviews();
    const review: PeerReview = {
      id: `pr_${Date.now()}`,
      homeworkId: selectedHomework,
      reviewerId: student.id,
      reviewerName: student.name,
      targetSubmissionId: selectedSubmission.id,
      targetStudentId: selectedSubmission.studentId,
      targetStudentName: selectedSubmission.studentName,
      rating,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    savePeerReviews([...all, review]);

    // mark as reviewed by bumping submission metadata (no new fields, just update)
    setSelectedSubmission(null);
    setComment("");
    setRating(3);
    toast("تم إرسال تقييمك ✅", "success");
  };

  const avg = (subs: PeerReview[]) =>
    subs.length === 0 ? "—" : (subs.reduce((a, r) => a + r.rating, 0) / subs.length).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {(["review", "received"] as const).map(m => (
          <button key={m} onClick={() => setView(m)}
            className={`btn ${view === m ? "btn-primary" : ""}`}
            style={{ fontSize: 13, padding: "7px 18px", opacity: view === m ? 1 : 0.6 }}>
            {m === "review" ? "✍️ قيّم زملاءك" : `📬 تقييماتي المستلمة (${receivedRevs.length})`}
          </button>
        ))}
      </div>

      {view === "review" && (
        <>
          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>اختر الواجب</h3>
            <select className="form-input" value={selectedHomework}
              onChange={e => { setSelectedHomework(e.target.value); setSelectedSubmission(null); }}>
              <option value="">— اختر واجباً —</option>
              {activeHomework.map(hw => <option key={hw.id} value={hw.id}>{hw.title} · {hw.subjectName}</option>)}
            </select>

            {selectedHomework && !mySubmission && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(245,158,11,0.08)", borderRadius: 8, fontSize: 13, color: "var(--warning)" }}>
                ⚠️ يجب أن تُسلّم الواجب أولاً قبل أن تُقيّم زملاءك
              </div>
            )}
          </div>

          {selectedHomework && mySubmission && (
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>
                👥 إجابات الزملاء ({peersSubmissions.length})
              </h3>
              {peersSubmissions.length === 0
                ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا توجد إجابات أخرى بعد</p>
                : peersSubmissions.map(sub => {
                  const done = alreadyReviewed(sub.id);
                  const isSelected = selectedSubmission?.id === sub.id;
                  return (
                    <div key={sub.id} style={{
                      border: `2px solid ${isSelected ? "var(--primary)" : done ? "var(--border)" : "var(--border)"}`,
                      borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 12,
                      opacity: done ? 0.65 : 1,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 700 }}>{sub.studentName}</div>
                        {done
                          ? <span className="badge badge-success">✅ تم التقييم</span>
                          : <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => setSelectedSubmission(isSelected ? null : sub)}>
                              {isSelected ? "إلغاء" : "قيّم"}
                            </button>}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6, maxHeight: 80, overflow: "hidden" }}>
                        {sub.answer}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                        سُلِّم {new Date(sub.submittedAt).toLocaleDateString("ar-EG")}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {selectedSubmission && (
            <div style={{ ...card, border: "2px solid var(--primary)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>✍️ تقييم إجابة: {selectedSubmission.studentName}</h3>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">التقييم</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {STARS.map(s => (
                    <button key={s} onClick={() => setRating(s)}
                      style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", opacity: s <= rating ? 1 : 0.3, transition: "opacity 0.15s" }}>
                      ⭐
                    </button>
                  ))}
                  <span style={{ alignSelf: "center", fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>{rating}/5</span>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">تعليقك</label>
                <textarea className="form-input" rows={3} value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="اكتب ملاحظاتك البنّاءة هنا…" />
              </div>
              <button className="btn btn-primary" onClick={handleSubmitReview} style={{ width: "100%" }}>
                إرسال التقييم ✅
              </button>
            </div>
          )}
        </>
      )}

      {view === "received" && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>📬 التقييمات المستلمة من زملائك</h3>
          {receivedRevs.length > 0 && (
            <div style={{ marginBottom: 16, fontSize: 14, color: "var(--text-muted)" }}>
              متوسط تقييمك: <strong style={{ color: "var(--primary)", fontSize: 18 }}>⭐ {avg(receivedRevs)}</strong> من 5
            </div>
          )}
          {receivedRevs.length === 0
            ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>لا توجد تقييمات بعد</p>
            : receivedRevs.map(r => (
              <div key={r.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>زميل مجهول</div>
                  <div style={{ color: "var(--warning)", fontWeight: 800 }}>{"⭐".repeat(r.rating)} {r.rating}/5</div>
                </div>
                <div style={{ fontSize: 14, marginTop: 8, color: "var(--text)", lineHeight: 1.6 }}>{r.comment}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{new Date(r.createdAt).toLocaleDateString("ar-EG")}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

