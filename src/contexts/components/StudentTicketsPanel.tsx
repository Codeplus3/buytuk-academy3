import { useState } from "react";
import {
  getSupportTickets, saveSupportTickets,
  getTicketReplies, saveTicketReplies,
  getTicketRatings, saveTicketRatings,
  getRepliesForTicket, getRatingForTicket,
  generateTicketRef,
} from "@/lib/db";
import type { Student, SupportTicket, TicketReply, TicketRating } from "@/lib/db";
import { toast } from "./Toast";

interface Props {
  student: Student;
  card: React.CSSProperties;
}

const STATUS_LABEL: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "محلولة", closed: "مغلقة",
};
const STATUS_COLOR: Record<string, string> = {
  open: "var(--danger)", in_progress: "#f59e0b", resolved: "var(--success)", closed: "var(--text-muted)",
};
const PRIORITY_OPTS = [
  { value: "low",    label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high",   label: "عالية" },
  { value: "urgent", label: "عاجلة 🔴" },
];

type View = "list" | "new" | "detail";

export function StudentTicketsPanel({ student, card }: Props) {
  const [view, setView]         = useState<View>("list");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [form, setForm]         = useState({ subject: "", message: "", priority: "medium" });
  const [replyText, setReplyText] = useState("");
  const [ratingVal, setRatingVal] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  const myTickets = getSupportTickets()
    .filter(t => t.studentId === student.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const submitTicket = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      toast("يرجى ملء الموضوع والرسالة", "error"); return;
    }
    setSubmitting(true);
    const now = new Date().toISOString();
    const newTicket: SupportTicket = {
      id:           Date.now(),
      ticketRef:    generateTicketRef(),
      studentId:    student.id,
      studentName:  student.name,
      studentEmail: student.email,
      subject:      form.subject.trim(),
      message:      form.message.trim(),
      status:       "open",
      priority:     form.priority as SupportTicket["priority"],
      createdAt:    now,
    };
    saveSupportTickets([...getSupportTickets(), newTicket]);
    setForm({ subject: "", message: "", priority: "medium" });
    setSubmitting(false);
    setView("list");
    toast(`تم إرسال مذكرتك ${newTicket.ticketRef} ✅`, "success");
  };

  const sendReply = () => {
    if (!selected || !replyText.trim()) return;
    const reply: TicketReply = {
      id:         `rep_${Date.now()}`,
      ticketId:   selected.id,
      authorId:   student.id,
      authorName: student.name,
      authorRole: "student",
      message:    replyText.trim(),
      createdAt:  new Date().toISOString(),
    };
    saveTicketReplies([...getTicketReplies(), reply]);
    setReplyText("");
    toast("تم إرسال ردك ✅", "success");
  };

  const submitRating = () => {
    if (!selected || ratingVal === 0) { toast("يرجى اختيار عدد النجوم", "error"); return; }
    const rating: TicketRating = {
      id:        `rat_${Date.now()}`,
      ticketId:  selected.id,
      studentId: student.id,
      rating:    ratingVal as TicketRating["rating"],
      feedback:  ratingFeedback.trim() || undefined,
      ratedAt:   new Date().toISOString(),
    };
    saveTicketRatings([...getTicketRatings(), rating]);
    setRatingVal(0);
    setRatingFeedback("");
    toast("شكراً على تقييمك! ⭐", "success");
  };

  /* ── NEW TICKET FORM ── */
  if (view === "new") {
    return (
      <div className="page-flip">
        <button onClick={() => setView("list")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
          ← العودة
        </button>
        <div style={{ ...card, padding: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>🎫 فتح مذكرة دعم جديدة</h2>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>موضوع المشكلة *</label>
            <input style={inp} placeholder="وصف مختصر للمشكلة" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>الأولوية</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PRIORITY_OPTS.map(o => (
                <button key={o.value} onClick={() => setForm(f => ({ ...f, priority: o.value }))} style={{
                  padding: "7px 16px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13, fontWeight: 700, transition: "all 0.2s",
                  background: form.priority === o.value ? "var(--primary)" : "var(--bg)",
                  color: form.priority === o.value ? "#fff" : "var(--text-muted)",
                  border: `1px solid ${form.priority === o.value ? "var(--primary)" : "var(--border)"}`,
                }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>تفاصيل المشكلة *</label>
            <textarea
              style={{ ...inp, minHeight: 120, resize: "vertical" }}
              placeholder="اشرح مشكلتك بالتفصيل..."
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            />
          </div>
          <button onClick={submitTicket} disabled={submitting} style={{ padding: "12px 28px", borderRadius: 10, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 15 }}>
            {submitting ? "جارٍ الإرسال..." : "📤 إرسال المذكرة"}
          </button>
        </div>
      </div>
    );
  }

  /* ── TICKET DETAIL ── */
  if (view === "detail" && selected) {
    const replies = getRepliesForTicket(selected.id);
    const rating  = getRatingForTicket(selected.id);
    const isResolved = selected.status === "resolved" || selected.status === "closed";
    const alreadyRated = !!rating;

    return (
      <div className="page-flip">
        <button onClick={() => { setSelected(null); setView("list"); }} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
          ← العودة
        </button>

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, background: "rgba(108,99,255,0.12)", color: "var(--primary)", padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>{selected.ticketRef}</span>
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[selected.status]}22`, color: STATUS_COLOR[selected.status] }}>{STATUS_LABEL[selected.status]}</span>
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>{selected.subject}</h2>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{new Date(selected.createdAt).toLocaleString("ar-EG")}</div>
        </div>

        {/* Thread */}
        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>💬 المحادثة</h3>

          {/* Original message */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>أنت</strong>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(selected.createdAt).toLocaleString("ar-EG")}</span>
              </div>
              <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 16px", fontSize: 14, lineHeight: 1.7, border: "1px solid var(--border)" }}>
                {selected.message}
              </div>
            </div>
          </div>

          {replies.map(r => (
            <div key={r.id} style={{ display: "flex", gap: 12, marginBottom: 16, flexDirection: r.authorRole === "support" ? "row-reverse" : "row" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: r.authorRole === "support" ? "linear-gradient(135deg,var(--primary),var(--secondary))" : "var(--success)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {r.authorRole === "support" ? "🎧" : "👤"}
              </div>
              <div style={{ flex: 1, maxWidth: "80%" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexDirection: r.authorRole === "support" ? "row-reverse" : "row" }}>
                  <strong style={{ fontSize: 14 }}>{r.authorRole === "support" ? "فريق الدعم الفني" : "أنت"}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(r.createdAt).toLocaleString("ar-EG")}</span>
                </div>
                <div style={{ background: r.authorRole === "support" ? "rgba(108,99,255,0.08)" : "var(--bg)", borderRadius: 10, padding: "12px 16px", fontSize: 14, lineHeight: 1.7, border: `1px solid ${r.authorRole === "support" ? "rgba(108,99,255,0.2)" : "var(--border)"}` }}>
                  {r.message}
                </div>
              </div>
            </div>
          ))}

          {replies.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: 13 }}>
              ⏳ في انتظار رد فريق الدعم...
            </div>
          )}
        </div>

        {/* Rating block — only when resolved */}
        {isResolved && !alreadyRated && (
          <div style={{ ...card, marginBottom: 16, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.05)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>⭐ قيّم تجربتك مع الدعم الفني</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRatingVal(s)} style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", opacity: s <= ratingVal ? 1 : 0.3, transition: "opacity 0.15s" }}>⭐</button>
              ))}
            </div>
            <input
              style={{ ...inp, marginBottom: 10 }}
              placeholder="تعليق اختياري..."
              value={ratingFeedback}
              onChange={e => setRatingFeedback(e.target.value)}
            />
            <button onClick={submitRating} disabled={ratingVal === 0} style={{ padding: "9px 22px", borderRadius: 8, background: "#f59e0b", color: "#fff", border: "none", cursor: ratingVal > 0 ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700, opacity: ratingVal > 0 ? 1 : 0.5 }}>
              إرسال التقييم
            </button>
          </div>
        )}

        {alreadyRated && rating && (
          <div style={{ ...card, marginBottom: 16, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{"⭐".repeat(rating.rating)}</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>قيّمت هذه المذكرة بـ {rating.rating}/5 — شكراً!</span>
          </div>
        )}

        {/* Reply box (only if not resolved) */}
        {!isResolved && (
          <div style={{ ...card }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>↩ إضافة رد</h3>
            <textarea
              style={{ ...inp, minHeight: 80, resize: "vertical" }}
              placeholder="ردّك على فريق الدعم..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
            />
            <button onClick={sendReply} disabled={!replyText.trim()} style={{ marginTop: 10, padding: "9px 22px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: "none", cursor: replyText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700, opacity: replyText.trim() ? 1 : 0.6 }}>
              📤 إرسال
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── LIST VIEW ── */
  return (
    <div className="page-flip">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🎫 مذكرات الدعم الفني</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>تواصل مع فريق الدعم لأي مشكلة تواجهها</p>
        </div>
        <button onClick={() => setView("new")} style={{ padding: "11px 22px", borderRadius: 10, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          ➕ مذكرة جديدة
        </button>
      </div>

      {myTickets.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>لا توجد مذكرات بعد</div>
          <div style={{ fontSize: 13 }}>افتح مذكرة جديدة إذا واجهت أي مشكلة</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {myTickets.map(t => {
            const rating  = getRatingForTicket(t.id);
            const replies = getRepliesForTicket(t.id);
            const hasSupport = replies.some(r => r.authorRole === "support");
            return (
              <div key={t.id} style={{ ...card, cursor: "pointer", transition: "box-shadow 0.2s" }} onClick={() => { setSelected(t); setView("detail"); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, background: "rgba(108,99,255,0.12)", color: "var(--primary)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{t.ticketRef}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status] }}>{STATUS_LABEL[t.status]}</span>
                      {hasSupport && <span style={{ fontSize: 11, color: "var(--success)" }}>💬 رد من الدعم</span>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.subject}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(t.createdAt).toLocaleDateString("ar-EG")}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {rating && <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>{"⭐".repeat(rating.rating)}</span>}
                    <span style={{ fontSize: 12, color: "var(--primary)", fontWeight: 700 }}>عرض ←</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

