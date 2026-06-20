import { useState } from "react";
import type { Teacher, Subject, LiveSession } from "../lib/db";
import { getLiveSessions, saveLiveSessions } from "../lib/db";
import { toast } from "./Toast";

interface Props { teacher: Teacher; mySubjects: Subject[]; card: React.CSSProperties; }

const PLATFORMS: { value: LiveSession["platform"]; label: string; icon: string }[] = [
  { value: "zoom",  label: "Zoom",           icon: "🎥" },
  { value: "meet",  label: "Google Meet",     icon: "🟢" },
  { value: "teams", label: "Microsoft Teams", icon: "🟣" },
  { value: "other", label: "رابط آخر",        icon: "🔗" },
];

const EMPTY = {
  title: "", subjectId: "", meetingUrl: "", platform: "zoom" as LiveSession["platform"],
  scheduledAt: "", durationMin: 60,
};

export function LiveSessionPanel({ teacher, mySubjects, card }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [, forceRender] = useState(0);
  const refresh = () => forceRender(n => n + 1);

  const sessions = getLiveSessions().filter(s => s.teacherId === teacher.id)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const now = new Date().toISOString();
  const upcoming = sessions.filter(s => s.scheduledAt > now || s.status === "live");
  const past     = sessions.filter(s => s.scheduledAt <= now && s.status !== "live");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.subjectId || !form.meetingUrl || !form.scheduledAt) {
      toast("يرجى ملء جميع الحقول", "error"); return;
    }
    setSaving(true);
    const sub = mySubjects.find(s => s.id === form.subjectId)!;
    const all = getLiveSessions();
    const newSession: LiveSession = {
      id: `ls_${Date.now()}`,
      title: form.title,
      subjectId: sub.id,
      subjectName: sub.name,
      teacherId: teacher.id,
      teacherName: teacher.name,
      meetingUrl: form.meetingUrl,
      platform: form.platform,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      durationMin: form.durationMin,
      stage: sub.stage,
      grade: sub.grade,
      track: sub.track,
      schoolId: teacher.schoolId,
      status: "upcoming",
      createdAt: new Date().toISOString(),
    };
    saveLiveSessions([...all, newSession]);
    setForm(EMPTY);
    setSaving(false);
    refresh();
    toast("تمت إضافة الجلسة ✅", "success");
  };

  const markLive = (id: string) => {
    const all = getLiveSessions().map(s => s.id === id ? { ...s, status: "live" as const } : s);
    saveLiveSessions(all); refresh(); toast("الجلسة الآن مباشرة 🔴", "success");
  };

  const markEnded = (id: string) => {
    const all = getLiveSessions().map(s => s.id === id ? { ...s, status: "ended" as const } : s);
    saveLiveSessions(all); refresh(); toast("انتهت الجلسة", "info");
  };

  const deleteSession = (id: string) => {
    saveLiveSessions(getLiveSessions().filter(s => s.id !== id)); refresh();
  };

  const statusBadge = (s: LiveSession["status"]) =>
    s === "live"     ? <span className="badge badge-danger">🔴 مباشر</span>
    : s === "upcoming" ? <span className="badge badge-info">🕐 قادم</span>
    :                    <span className="badge" style={{ background: "var(--border)", color: "var(--text-muted)" }}>✅ انتهى</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Create form ── */}
      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>📅 إنشاء جلسة دراسة مباشرة</h3>
        <form onSubmit={handleSave} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">عنوان الجلسة</label>
            <input className="form-input" value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="مثال: مراجعة الوحدة الثالثة" />
          </div>
          <div>
            <label className="form-label">المادة</label>
            <select className="form-input" value={form.subjectId}
              onChange={e => setForm(p => ({ ...p, subjectId: e.target.value }))}>
              <option value="">— اختر المادة —</option>
              {mySubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">المنصة</label>
            <select className="form-input" value={form.platform}
              onChange={e => setForm(p => ({ ...p, platform: e.target.value as LiveSession["platform"] }))}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">رابط الاجتماع</label>
            <input className="form-input" value={form.meetingUrl} type="url"
              onChange={e => setForm(p => ({ ...p, meetingUrl: e.target.value }))}
              placeholder="https://zoom.us/j/..." />
          </div>
          <div>
            <label className="form-label">موعد الجلسة</label>
            <input className="form-input" type="datetime-local" value={form.scheduledAt}
              onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">المدة (دقيقة)</label>
            <input className="form-input" type="number" min={15} max={240} value={form.durationMin}
              onChange={e => setForm(p => ({ ...p, durationMin: +e.target.value }))} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: "100%" }}>
              {saving ? "جاري الحفظ…" : "➕ إضافة الجلسة"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Upcoming sessions ── */}
      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>🔜 الجلسات القادمة ({upcoming.length})</h3>
        {upcoming.length === 0
          ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>لا توجد جلسات قادمة</p>
          : upcoming.map(s => (
            <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                    {PLATFORMS.find(p => p.value === s.platform)?.icon} {s.subjectName} · {new Date(s.scheduledAt).toLocaleString("ar-EG")} · {s.durationMin} دقيقة
                  </div>
                </div>
                {statusBadge(s.status)}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer"
                  className="btn btn-primary" style={{ fontSize: 13, padding: "6px 14px" }}>
                  🔗 فتح الرابط
                </a>
                {s.status === "upcoming" && (
                  <button className="btn btn-danger" style={{ fontSize: 13, padding: "6px 14px" }}
                    onClick={() => markLive(s.id)}>🔴 ابدأ الآن</button>
                )}
                {s.status === "live" && (
                  <button className="btn" style={{ fontSize: 13, padding: "6px 14px", background: "var(--border)" }}
                    onClick={() => markEnded(s.id)}>⏹ إنهاء</button>
                )}
                <button className="btn btn-danger" style={{ fontSize: 13, padding: "6px 14px", marginRight: "auto" }}
                  onClick={() => deleteSession(s.id)}>🗑</button>
              </div>
            </div>
          ))}
      </div>

      {/* ── Past sessions ── */}
      {past.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>📚 الجلسات السابقة ({past.length})</h3>
          {past.slice(0, 5).map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.subjectName} · {new Date(s.scheduledAt).toLocaleDateString("ar-EG")}</div>
              </div>
              {statusBadge(s.status)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
