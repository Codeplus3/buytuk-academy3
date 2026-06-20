/**
 * MessageCenter
 * ──────────────────────────────────────────────────────────────────
 * Admin-only component for sending messages to one or all students.
 * Messages are stored inside the student record in localStorage and
 * picked up by StudentDashboard on next render / sync cycle.
 * No WebSockets required.
 */
import { useState } from "react";
import { getStudents, saveStudents } from "@/lib/db";
import type { Message } from "@/lib/db";
import { toast } from "./Toast";

interface SentEntry { to: string; content: string; date: string }

interface Props { card: React.CSSProperties }

export function MessageCenter({ card }: Props) {
  const [recipient, setRecipient] = useState<"all" | string>("all");
  const [content,   setContent]   = useState("");
  const [sending,   setSending]   = useState(false);
  const [sentLog,   setSentLog]   = useState<SentEntry[]>([]);

  const students = getStudents().filter(s => s.status === "active");

  const send = () => {
    if (!content.trim()) { toast("اكتب نص الرسالة أولاً", "warning"); return; }
    setSending(true);

    const msg: Message = {
      id:      `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from:    "الإدارة",
      content: content.trim(),
      date:    new Date().toISOString(),
      read:    false,
    };

    const all = getStudents();
    const updated = all.map(s => {
      if (recipient !== "all" && s.id.toString() !== recipient) return s;
      return { ...s, messages: [...(s.messages ?? []), msg] };
    });
    saveStudents(updated);

    const toName = recipient === "all"
      ? "جميع الطلاب"
      : all.find(s => s.id.toString() === recipient)?.name ?? "—";

    setSentLog(prev => [{ to: toName, content: msg.content, date: msg.date }, ...prev.slice(0, 19)]);
    setContent("");
    setSending(false);
    toast(`✅ تم إرسال الرسالة إلى ${toName}`, "success");
  };

  const lbl: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700,
    color: "var(--text-muted)", marginBottom: 6,
  };

  return (
    <div className="page-flip">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>💬 المراسلات الإدارية</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        أرسل رسائل فورية للطلاب — تظهر لهم فور فتح صفحة المراسلات.
      </p>

      {/* ── Compose ── */}
      <div style={{ ...card, maxWidth: 600, marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20, color: "var(--primary)" }}>
          ✏️ رسالة جديدة
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>المستلم</label>
          <select
            className="form-control"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
          >
            <option value="all">📢 جميع الطلاب ({students.length} طالب)</option>
            <optgroup label="طالب محدد">
              {students.map(s => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name} — {s.schoolName}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>نص الرسالة</label>
          <textarea
            className="form-control"
            rows={4}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            style={{ resize: "vertical", minHeight: 100, fontSize: 14, lineHeight: 1.7 }}
          />
          <div style={{ textAlign: "start", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            {content.length} حرف
          </div>
        </div>

        <button
          onClick={send}
          disabled={sending || !content.trim()}
          style={{
            padding: "10px 28px",
            background: content.trim() ? "var(--primary)" : "var(--border)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: content.trim() ? "#fff" : "var(--text-muted)",
            cursor: content.trim() ? "pointer" : "default",
            fontSize: 14, fontWeight: 700,
            transition: "background 0.18s",
          }}
        >
          {sending ? "جاري الإرسال..." : "📤 إرسال الرسالة"}
        </button>
      </div>

      {/* ── Sent log (this session) ── */}
      {sentLog.length > 0 && (
        <div style={{ ...card, maxWidth: 600 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, color: "var(--text-muted)" }}>
            📋 الرسائل المرسلة في هذه الجلسة ({sentLog.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sentLog.map((m, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 14px",
                  background: "var(--bg)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--glass-border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: "var(--primary)" }}>إلى: {m.to}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {new Date(m.date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p style={{ fontSize: 13, margin: 0, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

