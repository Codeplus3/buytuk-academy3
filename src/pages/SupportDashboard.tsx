import { useState, useMemo } from "react";
import { avatarUrl } from "../lib/auth";
import {
  getSupportTickets, saveSupportTickets,
  getTicketReplies, saveTicketReplies,
  getTicketRatings, getRepliesForTicket, getRatingForTicket,
} from "../lib/db";
import type { SupportAgent, SupportTicket, TicketReply } from "../lib/db";
import { toast } from "@/contexts/components/Toast";

interface Props {
  user: SupportAgent;
  onLogout: () => void;
}

type Filter = "all" | "open" | "in_progress" | "resolved" | "closed";

const STATUS_LABEL: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "محلولة", closed: "مغلقة",
};
const STATUS_COLOR: Record<string, string> = {
  open: "var(--danger)", in_progress: "var(--warning, #f59e0b)", resolved: "var(--success)", closed: "var(--text-muted)",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة",
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "#6c757d", medium: "#f59e0b", high: "var(--primary)", urgent: "var(--danger)",
};

export function SupportDashboard({ user, onLogout }: Props) {
  const [filter, setFilter]     = useState<Filter>("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending]   = useState(false);

  const card: React.CSSProperties = {
    background: "var(--glass-bg)", borderRadius: "var(--radius)",
    border: "1px solid var(--glass-border)", padding: 20,
  };

  const allTickets = getSupportTickets();
  const myTickets  = allTickets.filter(
    t => t.assignedAgentId === user.id || t.assignedAgentId === undefined
  );

  const filtered = useMemo(() => {
    const base = filter === "all" ? allTickets : allTickets.filter(t => t.status === filter);
    return [...base].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filter, allTickets.length]);

  /* KPIs */
  const resolved  = allTickets.filter(t => t.status === "resolved" || t.status === "closed").length;
  const open      = allTickets.filter(t => t.status === "open" || t.status === "in_progress").length;
  const ratings   = getTicketRatings();
  const avgRating = ratings.length
    ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
    : "—";

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    const reply: TicketReply = {
      id:         `rep_${Date.now()}`,
      ticketId:   selected.id,
      authorId:   user.id,
      authorName: user.name,
      authorRole: "support",
      message:    replyText.trim(),
      createdAt:  new Date().toISOString(),
    };
    saveTicketReplies([...getTicketReplies(), reply]);

    /* Mark ticket as in_progress if open, or resolved if explicitly resolving */
    const tickets = getSupportTickets().map(t =>
      t.id === selected.id
        ? { ...t, status: "in_progress" as const, assignedAgentId: user.id }
        : t
    );
    saveSupportTickets(tickets);
    setReplyText("");
    setSending(false);
    setSelected({ ...selected, status: "in_progress", assignedAgentId: user.id });
    toast("تم إرسال الرد ✅", "success");
  };

  const resolveTicket = () => {
    if (!selected) return;
    const tickets = getSupportTickets().map(t =>
      t.id === selected.id
        ? { ...t, status: "resolved" as const, resolvedAt: new Date().toISOString(), assignedAgentId: user.id }
        : t
    );
    saveSupportTickets(tickets);
    setSelected({ ...selected, status: "resolved", resolvedAt: new Date().toISOString() });
    toast("تم إغلاق المذكرة كمحلولة ✅", "success");
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  /* ── Detail Panel ── */
  if (selected) {
    const replies = getRepliesForTicket(selected.id);
    const rating  = getRatingForTicket(selected.id);
    return (
      <div dir="rtl" style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 20px", fontFamily: "var(--font-arabic, inherit)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <button onClick={() => setSelected(null)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
            ← العودة للقائمة
          </button>

          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13, background: "rgba(108,99,255,0.12)", color: "var(--primary)", padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>{selected.ticketRef}</span>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[selected.status]}22`, color: STATUS_COLOR[selected.status] }}>{STATUS_LABEL[selected.status]}</span>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${PRIORITY_COLOR[selected.priority]}22`, color: PRIORITY_COLOR[selected.priority] }}>
                    {PRIORITY_LABEL[selected.priority]}
                  </span>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{selected.subject}</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13 }}>
                  <img src={avatarUrl(selected.studentName)} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />
                  {selected.studentName} — {selected.studentEmail}
                  <span style={{ color: "var(--text-muted)" }}>|</span>
                  {new Date(selected.createdAt).toLocaleDateString("ar-EG")}
                </div>
              </div>
              {selected.status !== "resolved" && selected.status !== "closed" && (
                <button onClick={resolveTicket} style={{ padding: "10px 20px", borderRadius: 8, background: "var(--success)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
                  ✅ إغلاق كمحلولة
                </button>
              )}
            </div>
          </div>

          {/* Conversation */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>💬 المحادثة</h3>
            {/* Original message */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <img src={avatarUrl(selected.studentName)} alt="" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <strong style={{ fontSize: 14 }}>{selected.studentName}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(selected.createdAt).toLocaleString("ar-EG")}</span>
                  <span style={{ fontSize: 11, background: "rgba(0,200,150,0.12)", color: "var(--success)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>طالب</span>
                </div>
                <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 16px", fontSize: 14, lineHeight: 1.7, border: "1px solid var(--border)" }}>
                  {selected.message}
                </div>
              </div>
            </div>

            {/* Replies */}
            {replies.map(r => (
              <div key={r.id} style={{ display: "flex", gap: 12, marginBottom: 16, flexDirection: r.authorRole === "support" ? "row-reverse" : "row" }}>
                <img src={avatarUrl(r.authorName)} alt="" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ flex: 1, maxWidth: "80%" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexDirection: r.authorRole === "support" ? "row-reverse" : "row" }}>
                    <strong style={{ fontSize: 14 }}>{r.authorName}</strong>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(r.createdAt).toLocaleString("ar-EG")}</span>
                    <span style={{ fontSize: 11, background: r.authorRole === "support" ? "rgba(108,99,255,0.12)" : "rgba(0,200,150,0.12)", color: r.authorRole === "support" ? "var(--primary)" : "var(--success)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>
                      {r.authorRole === "support" ? "دعم فني" : "طالب"}
                    </span>
                  </div>
                  <div style={{ background: r.authorRole === "support" ? "rgba(108,99,255,0.08)" : "var(--bg)", borderRadius: 10, padding: "12px 16px", fontSize: 14, lineHeight: 1.7, border: `1px solid ${r.authorRole === "support" ? "rgba(108,99,255,0.2)" : "var(--border)"}` }}>
                    {r.message}
                  </div>
                </div>
              </div>
            ))}

            {/* Rating */}
            {rating && (
              <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>{"⭐".repeat(rating.rating)}{"☆".repeat(5 - rating.rating)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>تقييم الطالب: {rating.rating}/5</div>
                  {rating.feedback && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{rating.feedback}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Reply box */}
          {selected.status !== "resolved" && selected.status !== "closed" && (
            <div style={{ ...card }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>✍️ رد الدعم الفني</h3>
              <textarea
                style={{ ...inp, minHeight: 100, resize: "vertical" }}
                placeholder="اكتب ردّك هنا..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                style={{ marginTop: 10, padding: "11px 28px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: "none", cursor: replyText.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", fontWeight: 700, fontSize: 14, opacity: replyText.trim() ? 1 : 0.5 }}>
                {sending ? "جارٍ الإرسال..." : "📤 إرسال الرد"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Main List ── */
  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-arabic, inherit)" }}>
      {/* Header */}
      <header style={{ background: "var(--glass-bg)", borderBottom: "1px solid var(--glass-border)", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), var(--secondary))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎧</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>لوحة الدعم الفني</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>مرحباً، {user.name}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
          🚪 خروج
        </button>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          {[
            { icon: "📨", label: "مذكرات مفتوحة", value: open,      color: "var(--danger)" },
            { icon: "✅", label: "تم حلّها",       value: resolved,  color: "var(--success)" },
            { icon: "⭐", label: "متوسط التقييم",  value: avgRating, color: "#f59e0b" },
            { icon: "📋", label: "إجمالي المذكرات", value: allTickets.length, color: "var(--primary)" },
          ].map(k => (
            <div key={k.label} style={{ ...card, textAlign: "center", padding: "20px 16px" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, padding: 14 }}>
          {(["all", "open", "in_progress", "resolved", "closed"] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 700,
              background: filter === f ? "var(--primary)" : "var(--bg)",
              color: filter === f ? "#fff" : "var(--text-muted)",
              transition: "all 0.2s",
            }}>
              {f === "all" ? "الكل" : STATUS_LABEL[f]}
              <span style={{ marginRight: 6, fontSize: 11, opacity: 0.8 }}>
                ({f === "all" ? allTickets.length : allTickets.filter(t => t.status === f).length})
              </span>
            </button>
          ))}
        </div>

        {/* Tickets table */}
        {filtered.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>لا توجد مذكرات</div>
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>رقم المذكرة</th>
                  <th>الطالب</th>
                  <th>الموضوع</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>التقييم</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const rating = getRatingForTicket(t.id);
                  const replyCt = getRepliesForTicket(t.id).length;
                  return (
                    <tr key={t.id}>
                      <td>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)", fontSize: 13 }}>{t.ticketRef}</span>
                      </td>
                      <td style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <img src={avatarUrl(t.studentName)} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{t.studentName}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.studentEmail}</div>
                        </div>
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</div>
                        {replyCt > 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>💬 {replyCt} {replyCt === 1 ? "رد" : "ردود"}</div>}
                      </td>
                      <td>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${PRIORITY_COLOR[t.priority]}22`, color: PRIORITY_COLOR[t.priority] }}>
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                      </td>
                      <td>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[t.status]}22`, color: STATUS_COLOR[t.status] }}>
                          {STATUS_LABEL[t.status]}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(t.createdAt).toLocaleDateString("ar-EG")}</td>
                      <td>
                        {rating
                          ? <span style={{ color: "#f59e0b", fontWeight: 700 }}>{"⭐".repeat(rating.rating)} {rating.rating}/5</span>
                          : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td>
                        <button onClick={() => setSelected(t)} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                          {t.status === "open" || t.status === "in_progress" ? "↩ رد" : "👁 عرض"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

