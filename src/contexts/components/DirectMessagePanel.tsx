import { useState, useEffect, useRef } from "react";
import type { Student, Teacher } from "@/lib/db";
import { getStudents, getTeachers, getThread, sendDM, getDirectMessages } from "@/lib/db";

interface StudentProps { role: "student"; user: Student; card: React.CSSProperties; }
interface TeacherProps { role: "teacher"; user: Teacher; card: React.CSSProperties; }
type Props = StudentProps | TeacherProps;

interface Contact { id: number; name: string; role: "student" | "teacher"; }

export function DirectMessagePanel(props: Props) {
  const { role, user, card } = props;
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [body, setBody] = useState("");
  const [, forceRender] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refresh = () => forceRender(n => n + 1);

  useEffect(() => {
    window.addEventListener("buytuk:dm-changed", refresh);
    return () => window.removeEventListener("buytuk:dm-changed", refresh);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedContact, body]);

  const contacts: Contact[] = role === "student"
    ? getTeachers()
        .filter(t => t.schoolId === (user as Student).schoolId)
        .map(t => ({ id: t.id, name: t.name, role: "teacher" as const }))
    : getStudents()
        .filter(s => s.schoolId === (user as Teacher).schoolId)
        .map(s => ({ id: s.id, name: s.name, role: "student" as const }));

  const allDMs = getDirectMessages();

  const getUnread = (contactId: number) =>
    allDMs.filter(m => m.fromId === contactId && m.toId === user.id && !m.read).length;

  const thread = selectedContact ? getThread(user.id, selectedContact.id) : [];

  const handleSend = () => {
    if (!body.trim() || !selectedContact) return;
    sendDM({
      fromId:   user.id,
      fromName: user.name,
      fromRole: role,
      toId:     selectedContact.id,
      toName:   selectedContact.name,
      toRole:   selectedContact.role,
      body:     body.trim(),
    });
    setBody("");
    refresh();
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, height: "65vh", minHeight: 400 }}>
      {/* Contact list */}
      <div style={{ ...card, padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", fontWeight: 800, fontSize: 14, borderBottom: "1px solid var(--border)" }}>
          {role === "student" ? "👨‍🏫 الأساتذة" : "🎓 الطلاب"}
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {contacts.length === 0 && (
            <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>لا يوجد جهات اتصال</div>
          )}
          {contacts.map(c => {
            const unread = getUnread(c.id);
            const isActive = selectedContact?.id === c.id;
            return (
              <button key={c.id} onClick={() => setSelectedContact(c)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                  background: isActive ? "rgba(108,99,255,0.1)" : "transparent",
                  border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer",
                  textAlign: "right",
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "var(--primary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {c.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? "var(--primary)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.role === "teacher" ? "أستاذ" : "طالب"}</div>
                </div>
                {unread > 0 && (
                  <span style={{ background: "var(--danger)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{unread}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread */}
      {!selectedContact
        ? (
          <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>اختر جهة اتصال للمحادثة</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>اضغط على اسم من القائمة لبدء المراسلة</div>
          </div>
        )
        : (
          <div style={{ ...card, padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "12px 16px", fontWeight: 800, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
                {selectedContact.name[0]}
              </div>
              <div>
                <div style={{ fontSize: 14 }}>{selectedContact.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>{selectedContact.role === "teacher" ? "أستاذ" : "طالب"}</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {thread.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, margin: "auto" }}>
                  لا توجد رسائل بعد — ابدأ المحادثة!
                </div>
              )}
              {thread.map(m => {
                const isMine = m.fromId === user.id;
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-start" : "flex-end" }}>
                    <div style={{
                      maxWidth: "72%", padding: "10px 14px", borderRadius: 16,
                      background: isMine ? "var(--primary)" : "var(--bg)",
                      color: isMine ? "#fff" : "var(--text)",
                      border: isMine ? "none" : "1px solid var(--border)",
                      fontSize: 14, lineHeight: 1.5,
                    }}>
                      <div>{m.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, textAlign: isMine ? "left" : "right" }}>
                        {new Date(m.sentAt).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
              <input
                className="form-input"
                style={{ flex: 1, margin: 0 }}
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="اكتب رسالتك…"
              />
              <button className="btn btn-primary" onClick={handleSend} disabled={!body.trim()} style={{ padding: "8px 18px" }}>
                إرسال ←
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

