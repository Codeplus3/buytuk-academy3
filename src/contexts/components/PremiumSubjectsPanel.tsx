import { useState } from "react";
import {
  getSubjects,
  getStudents, saveStudents,
  isStudentSubscribed, renewStudentSubscription,
  getPremiumSubjects, toggleSubjectPremium,
  getPlans,
} from "../lib/db";
import { avatarUrl } from "../lib/auth";
import { toast } from "./Toast";

interface Props {
  card: React.CSSProperties;
}

type PanelTab = "subjects" | "subscribers";

export function PremiumSubjectsPanel({ card }: Props) {
  const [tab, setTab]         = useState<PanelTab>("subjects");
  const [search, setSearch]   = useState("");
  const [planMap, setPlanMap] = useState<Record<number, string>>({});

  const subjects   = getSubjects().filter(s => s.status === "active");
  const premiumIds = getPremiumSubjects();
  const students   = getStudents();
  const plans      = getPlans();
  const subscribers = students.filter(s => isStudentSubscribed(s));
  const nonSubs    = students.filter(s => !isStudentSubscribed(s));

  const handleToggle = (subjectId: string) => {
    const nowPremium = toggleSubjectPremium(subjectId);
    toast(nowPremium ? "✅ المادة أصبحت مميزة" : "المادة أصبحت مجانية", "info");
  };

  const revokeAccess = (studentId: number) => {
    if (!window.confirm("هل تريد إلغاء اشتراك هذا الطالب؟")) return;
    const updated = getStudents().map(s =>
      s.id === studentId
        ? { ...s, subscriptionStatus: "expired" as const, expiryDate: null }
        : s
    );
    saveStudents(updated);
    toast("تم إلغاء الاشتراك", "info");
  };

  const grantAccess = (studentId: number) => {
    const planId = planMap[studentId];
    const plan   = plans.find(p => p.id === planId);
    if (plan) {
      renewStudentSubscription(studentId, plan);
    } else {
      const updated = getStudents().map(s =>
        s.id === studentId
          ? { ...s, subscriptionStatus: "active" as const, expiryDate: new Date(Date.now() + 365 * 86400000).toISOString() }
          : s
      );
      saveStudents(updated);
    }
    toast("✅ تم تفعيل الاشتراك", "success");
  };

  const inp: React.CSSProperties = {
    padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>💎 إدارة المحتوى المميز</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        حدّد المواد المميزة وأدّر اشتراكات الطلاب يدوياً
      </p>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {([
          { id: "subjects",    label: "⭐ المواد المميزة", badge: premiumIds.size },
          { id: "subscribers", label: "👨‍🎓 الطلاب المشتركون", badge: subscribers.length },
        ] as { id: PanelTab; label: string; badge: number }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 20px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
            fontSize: 14, fontWeight: 700, border: "none", transition: "all 0.2s",
            background: tab === t.id ? "var(--primary)" : "var(--glass-bg)",
            color: tab === t.id ? "#fff" : "var(--text-muted)",
          }}>
            {t.label}
            <span style={{ marginRight: 8, padding: "1px 7px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: tab === t.id ? "rgba(255,255,255,0.25)" : "var(--bg)" }}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {/* ── Subjects tab ── */}
      {tab === "subjects" && (
        <div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>المواد التعليمية ({subjects.length})</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {premiumIds.size} مميزة / {subjects.length - premiumIds.size} مجانية
              </span>
            </div>
            {subjects.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>لا توجد مواد بعد</div>
            ) : (
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr><th>المادة</th><th>المرحلة / الصف</th><th>المحتوى</th><th>نوع الوصول</th><th>التبديل</th></tr>
                </thead>
                <tbody>
                  {subjects.map(s => {
                    const isPremium = premiumIds.has(s.id);
                    return (
                      <tr key={s.id}>
                        <td style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{s.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.description.slice(0, 40)}</div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>م{s.grade} — {s.stage}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {s.videoFileId && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, background: "rgba(0,200,150,0.1)", color: "var(--success)" }}>📹</span>}
                            {s.curriculumFileId && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, background: "rgba(108,99,255,0.1)", color: "var(--primary)" }}>📖</span>}
                            {s.videos?.length ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 20, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>🎬{s.videos.length}</span> : null}
                          </div>
                        </td>
                        <td>
                          <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: isPremium ? "rgba(245,158,11,0.12)" : "rgba(0,200,150,0.1)", color: isPremium ? "#f59e0b" : "var(--success)" }}>
                            {isPremium ? "⭐ مميز" : "🆓 مجاني"}
                          </span>
                        </td>
                        <td>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <div style={{ position: "relative", width: 44, height: 24 }}>
                              <input type="checkbox" checked={isPremium} onChange={() => handleToggle(s.id)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                              <div style={{ position: "absolute", inset: 0, borderRadius: 24, background: isPremium ? "var(--primary)" : "var(--border)", transition: "0.25s" }} />
                              <div style={{ position: "absolute", top: 3, left: isPremium ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "0.25s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                            </div>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Subscribers tab ── */}
      {tab === "subscribers" && (
        <div>
          {/* Active subscribers */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>✅ الطلاب المشتركون ({subscribers.length})</h3>
            {subscribers.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>لا يوجد مشتركون بعد</div>
            ) : (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead><tr><th>الطالب</th><th>الخطة</th><th>انتهاء الاشتراك</th><th>إجراء</th></tr></thead>
                  <tbody>
                    {subscribers.map(s => (
                      <tr key={s.id}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <img src={avatarUrl(s.name)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                          <div><div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.email}</div></div>
                        </td>
                        <td style={{ fontSize: 13 }}>{s.planName ?? "—"}</td>
                        <td style={{ fontSize: 12, color: s.expiryDate && new Date(s.expiryDate) < new Date(Date.now() + 7*86400000) ? "var(--danger)" : "var(--text-muted)" }}>
                          {s.expiryDate ? new Date(s.expiryDate).toLocaleDateString("ar-EG") : "—"}
                        </td>
                        <td>
                          <button onClick={() => revokeAccess(s.id)} style={{ padding: "5px 12px", borderRadius: 6, background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                            🔒 إلغاء
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Non-subscribers — can grant access manually */}
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>👨‍🎓 منح اشتراك يدوي ({nonSubs.length})</h3>
            <div style={{ marginBottom: 12 }}>
              <input style={{ ...inp, width: "100%", maxWidth: 300 }} placeholder="🔍 بحث بالاسم أو البريد..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {nonSubs.filter(s => !search || s.name.includes(search) || s.email.includes(search)).slice(0, 20).map(s => (
              <div key={s.id} style={{ ...card, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src={avatarUrl(s.name)} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
                  <div><div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.email}</div></div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {plans.length > 0 && (
                    <select style={{ ...inp, width: "auto", padding: "7px 10px", fontSize: 13 }} value={planMap[s.id] ?? ""} onChange={e => setPlanMap(prev => ({ ...prev, [s.id]: e.target.value }))}>
                      <option value="">— خطة —</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.durationDays}د)</option>)}
                    </select>
                  )}
                  <button onClick={() => grantAccess(s.id)} style={{ padding: "7px 16px", borderRadius: 8, background: "var(--success)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13 }}>
                    ✅ منح
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
