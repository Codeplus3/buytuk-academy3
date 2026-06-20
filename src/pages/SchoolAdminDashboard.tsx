import { useState, useEffect, useMemo } from "react";
import { sha256, avatarUrl } from "../lib/auth";
import { UserAvatar } from "@/contexts/components/UserAvatar";
import { AvatarUploadWidget, getPhoto } from "@/contexts/components/AvatarUploadWidget";
import {
  getStudents, getTeachers, getSAdmins, saveTeachers, SCHOOL_NAMES,
  getLiveSessions, getAttendance, getHomework, getHomeworkSubmissions,
  getExamRecords, getAnnouncements,
} from "../lib/db";
import type { SchoolAdmin, Teacher } from "../lib/db";
import { toast } from "@/contexts/components/Toast";
import { LanguageSwitcher } from "@/contexts/components/LanguageSwitcher";

type Tab = "home" | "teachers" | "students" | "specs" | "attendance" | "sessions" | "homework" | "reports" | "profile";

interface Props { user: SchoolAdmin; onLogout: () => void; }

const SPECS = ["رياضيات", "فيزياء", "كيمياء", "أحياء", "لغة عربية", "لغة إنجليزية", "تاريخ", "جغرافيا", "فلسفة", "علوم الحاسب"];

const card: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius)", padding: 20,
};

export function SchoolAdminDashboard({ user, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [localPhoto, setLocalPhoto] = useState<string | undefined>(() => getPhoto(user.email));
  const [form, setForm] = useState({ name: "", email: "", pass: "", spec: "" });
  const [loading, setLoading] = useState(false);
  const [, forceRender] = useState(0);
  const refresh = () => forceRender(n => n + 1);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("ome-assets-updated", handler);
    window.addEventListener("buytuk:sessions-changed", handler);
    return () => {
      window.removeEventListener("ome-assets-updated", handler);
      window.removeEventListener("buytuk:sessions-changed", handler);
    };
  }, []);

  const myTeachers = getTeachers().filter(t => t.schoolId === user.schoolId);
  const myStudents = getStudents().filter(s => s.schoolId === user.schoolId);
  const myStudentIds = new Set(myStudents.map(s => s.id));

  const mySessions   = getLiveSessions().filter(s => s.schoolId === user.schoolId);
  const myAttendance = getAttendance().filter(a => a.schoolId === user.schoolId);
  const myHomework   = getHomework().filter(h => h.schoolId === user.schoolId || h.schoolId === "all");
  const mySubmissions = getHomeworkSubmissions().filter(s => myStudentIds.has(s.studentId));
  const myRecords    = getExamRecords().filter(r => myStudents.find(s => s.email === r.studentEmail));
  const announcements = getAnnouncements().filter(a => a.active);

  const attendanceStats = useMemo(() => {
    const total   = myAttendance.length;
    const present = myAttendance.filter(a => a.status === "present").length;
    const absent  = myAttendance.filter(a => a.status === "absent").length;
    const pct     = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, pct };
  }, [myAttendance]);

  const examStats = useMemo(() => {
    const total  = myRecords.length;
    const passed = myRecords.filter(r => r.percentage >= 60).length;
    const avg    = total > 0 ? Math.round(myRecords.reduce((s, r) => s + r.percentage, 0) / total) : 0;
    return { total, passed, avg };
  }, [myRecords]);

  const addTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.pass || !form.spec) { toast("يرجى ملء جميع الحقول", "error"); return; }
    const all = [...getStudents(), ...getTeachers(), ...getSAdmins()];
    if (all.find(u => u.email.toLowerCase() === form.email.toLowerCase())) { toast("البريد مستخدم بالفعل", "error"); return; }
    setLoading(true);
    const passHash = await sha256(form.pass);
    const t: Teacher = {
      id: Date.now(), name: form.name, email: form.email, passHash, spec: form.spec,
      schoolId: user.schoolId, schoolName: user.schoolName, assignedSubjectIds: [],
      joinedAt: new Date().toLocaleDateString("ar-SA"), status: "active",
    };
    const list = getTeachers(); list.push(t); saveTeachers(list);
    setLoading(false); setForm({ name: "", email: "", pass: "", spec: "" });
    refresh();
    toast("تم إضافة الأستاذ ✅", "success");
  };

  const deleteTeacher = (id: number) => {
    if (!confirm("حذف هذا الأستاذ؟")) return;
    saveTeachers(getTeachers().filter(t => t.id !== id));
    refresh();
    toast("تم الحذف", "warning");
  };

  const NAV: { id: Tab; icon: string; label: string }[] = [
    { id: "home",       icon: "🏠",  label: "الرئيسية" },
    { id: "teachers",   icon: "👨‍🏫", label: "الأساتذة" },
    { id: "students",   icon: "👨‍🎓", label: "الطلاب" },
    { id: "attendance", icon: "🗓",  label: "الحضور والغياب" },
    { id: "sessions",   icon: "📡",  label: "الجلسات المباشرة" },
    { id: "homework",   icon: "📋",  label: "الواجبات" },
    { id: "reports",    icon: "📊",  label: "تقارير الأداء" },
    { id: "specs",      icon: "📚",  label: "التخصصات" },
    { id: "profile",    icon: "👤",  label: "الملف الشخصي" },
  ];

  const topStats = [
    { icon: "👨‍🏫", label: "أساتذتي",          value: myTeachers.length,                              color: "var(--primary)" },
    { icon: "👨‍🎓", label: "طلابي",             value: myStudents.length,                              color: "var(--success)" },
    { icon: "🗓",  label: "نسبة الحضور",        value: `${attendanceStats.pct}%`,                     color: "var(--secondary)" },
    { icon: "📝",  label: "متوسط الاختبارات",   value: examStats.total > 0 ? `${examStats.avg}%` : "—", color: "var(--warning)" },
    { icon: "📡",  label: "جلسات مجدولة",       value: mySessions.filter(s => s.status !== "ended").length, color: "var(--info)" },
    { icon: "📢",  label: "إعلانات نشطة",       value: announcements.length,                           color: "var(--danger)" },
  ];

  return (
    <div>
      <nav className="main-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🏫</span>
          <span style={{ fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {user.schoolName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <UserAvatar name={user.name} src={localPhoto} size={36} border="2px solid var(--primary)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          <LanguageSwitcher compact />
          <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            خروج
          </button>
        </div>
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, padding: "24px", maxWidth: 1400, margin: "0 auto" }} className="two-col">
        <aside className="sidebar" style={{ height: "fit-content" }}>
          {NAV.map(n => (
            <button key={n.id} className={`menu-link ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </aside>

        <main>
          {/* ── HOME ── */}
          {tab === "home" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>أهلاً، <span style={{ color: "var(--primary)" }}>{user.name}</span> 👋</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>لوحة تحكم مدير مدرسة: {user.schoolName}</p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
                {topStats.map(s => (
                  <div key={s.label} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Recent teachers */}
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontWeight: 800 }}>👨‍🏫 آخر الأساتذة</h4>
                  {myTeachers.length === 0
                    ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>لا يوجد أساتذة بعد</p>
                    : myTeachers.slice(-4).reverse().map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                        <img src={avatarUrl(t.name)} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.spec}</div>
                        </div>
                        <span className={`badge ${t.status === "active" ? "badge-success" : "badge-danger"}`}>{t.status === "active" ? "فعّال" : "محظور"}</span>
                      </div>
                    ))}
                </div>

                {/* Upcoming live sessions */}
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontWeight: 800 }}>📡 الجلسات القادمة</h4>
                  {mySessions.filter(s => s.status !== "ended").length === 0
                    ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>لا توجد جلسات مجدولة</p>
                    : mySessions.filter(s => s.status !== "ended").slice(0, 4).map(s => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.teacherName} · {new Date(s.scheduledAt).toLocaleDateString("ar-EG")}</div>
                        </div>
                        {s.status === "live"
                          ? <span className="badge badge-danger">🔴 مباشر</span>
                          : <span className="badge badge-info">قادم</span>}
                      </div>
                    ))}
                </div>

                {/* Homework overview */}
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontWeight: 800 }}>📋 الواجبات النشطة</h4>
                  {myHomework.filter(h => h.status === "active").length === 0
                    ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>لا توجد واجبات نشطة</p>
                    : myHomework.filter(h => h.status === "active").slice(0, 4).map(h => {
                      const subCount = mySubmissions.filter(s => s.homeworkId === h.id).length;
                      return (
                        <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{h.title}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{h.subjectName} · {h.teacherName}</div>
                          </div>
                          <span className="badge badge-info">{subCount} تسليم</span>
                        </div>
                      );
                    })}
                </div>

                {/* Exam performance */}
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontWeight: 800 }}>📝 أداء الاختبارات</h4>
                  {examStats.total === 0
                    ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>لا توجد محاولات بعد</p>
                    : (
                      <>
                        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                          {[
                            { label: "إجمالي المحاولات", val: examStats.total,  color: "var(--primary)" },
                            { label: "ناجح",              val: examStats.passed, color: "var(--success)" },
                            { label: "متوسط الدرجات",    val: `${examStats.avg}%`, color: "var(--warning)" },
                          ].map(s => (
                            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
                              <div style={{ fontWeight: 900, fontSize: 20, color: s.color }}>{s.val}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ height: 8, background: "var(--border)", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${examStats.avg}%`, background: "var(--primary)", borderRadius: 99 }} />
                        </div>
                      </>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ── TEACHERS ── */}
          {tab === "teachers" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👨‍🏫 أساتذة {user.schoolName}</h2>
              <form onSubmit={addTeacher} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                <h4 style={{ gridColumn: "1/-1", fontSize: 15, fontWeight: 700 }}>➕ إضافة أستاذ جديد</h4>
                <input className="form-control" placeholder="الاسم الكامل" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <input type="email" className="form-control" placeholder="البريد الإلكتروني" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <input type="password" className="form-control" placeholder="كلمة المرور" value={form.pass} onChange={e => setForm(f => ({ ...f, pass: e.target.value }))} />
                <select className="form-control" value={form.spec} onChange={e => setForm(f => ({ ...f, spec: e.target.value }))}>
                  <option value="">اختر التخصص</option>
                  {SPECS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="submit" disabled={loading} style={{ gridColumn: "1/-1", padding: 11, background: "linear-gradient(135deg, var(--success), #00a07a)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  {loading ? "جاري..." : "➕ إضافة"}
                </button>
              </form>
              <div style={{ ...card, overflowX: "auto" }}>
                {myTeachers.length === 0
                  ? <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0" }}>لا يوجد أساتذة بعد</p>
                  : (
                    <table className="data-table">
                      <thead><tr><th>الاسم</th><th>البريد</th><th>التخصص</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                      <tbody>
                        {myTeachers.map(t => (
                          <tr key={t.id}>
                            <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <img src={avatarUrl(t.name)} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                              {t.name}
                            </td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.email}</td>
                            <td>{t.spec}</td>
                            <td><span className={`badge ${t.status === "active" ? "badge-success" : "badge-danger"}`}>{t.status === "active" ? "فعّال" : "محظور"}</span></td>
                            <td>
                              <button onClick={() => deleteTeacher(t.id)} style={{ padding: "5px 12px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </div>
          )}

          {/* ── STUDENTS ── */}
          {tab === "students" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👨‍🎓 طلاب {user.schoolName} ({myStudents.length})</h2>
              <div style={{ ...card, overflowX: "auto" }}>
                {myStudents.length === 0
                  ? <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0" }}>لا يوجد طلاب مسجلون بعد في هذه المدرسة</p>
                  : (
                    <table className="data-table">
                      <thead><tr><th>الاسم</th><th>البريد</th><th>المرحلة / الصف</th><th>الحالة</th><th>الانضمام</th></tr></thead>
                      <tbody>
                        {myStudents.map(s => {
                          const recs = myRecords.filter(r => r.studentEmail === s.email);
                          const avg  = recs.length ? Math.round(recs.reduce((a, r) => a + r.percentage, 0) / recs.length) : null;
                          return (
                            <tr key={s.id}>
                              <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <img src={avatarUrl(s.name)} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                                {s.name}
                              </td>
                              <td style={{ fontSize: 12 }}>{s.email}</td>
                              <td style={{ fontSize: 12 }}>الصف {s.grade}</td>
                              <td><span className={`badge ${s.status === "active" ? "badge-success" : "badge-danger"}`}>{s.status === "active" ? "فعّال" : "محظور"}</span></td>
                              <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                {avg !== null ? <span style={{ fontWeight: 700, color: avg >= 60 ? "var(--success)" : "var(--danger)" }}>{avg}%</span> : "—"}
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

          {/* ── ATTENDANCE ── */}
          {tab === "attendance" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>🗓 سجل الحضور — {user.schoolName}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
                {[
                  { label: "إجمالي التسجيلات", val: attendanceStats.total,   color: "var(--primary)" },
                  { label: "حاضر",              val: attendanceStats.present,  color: "var(--success)" },
                  { label: "غائب",              val: attendanceStats.absent,   color: "var(--danger)" },
                  { label: "نسبة الحضور",       val: `${attendanceStats.pct}%`, color: "var(--warning)" },
                ].map(s => (
                  <div key={s.label} style={{ ...card, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={card}>
                <h4 style={{ marginBottom: 16, fontWeight: 800 }}>📋 آخر تسجيلات الحضور</h4>
                {myAttendance.length === 0
                  ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>لا يوجد سجل حضور بعد</p>
                  : (
                    <table className="data-table">
                      <thead><tr><th>الطالب</th><th>المادة</th><th>الأستاذ</th><th>التاريخ</th><th>الحالة</th><th>ملاحظة</th></tr></thead>
                      <tbody>
                        {myAttendance.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(a => (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 600 }}>{a.studentName}</td>
                            <td>{a.subjectName}</td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {getTeachers().find(t => t.id === a.teacherId)?.name ?? "—"}
                            </td>
                            <td style={{ fontSize: 12 }}>{a.date}</td>
                            <td>
                              <span className={`badge ${
                                a.status === "present" ? "badge-success"
                                : a.status === "absent"  ? "badge-danger"
                                : a.status === "late"    ? "badge-warning"
                                : "badge-info"
                              }`}>
                                {a.status === "present" ? "حاضر" : a.status === "absent" ? "غائب" : a.status === "late" ? "متأخر" : "معذور"}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.note ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </div>
          )}

          {/* ── LIVE SESSIONS ── */}
          {tab === "sessions" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📡 الجلسات الدراسية المباشرة — {user.schoolName}</h2>
              {mySessions.length === 0
                ? (
                  <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>لا توجد جلسات بعد</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>سيُضيف الأساتذة جلساتهم من لوحة التحكم الخاصة بهم</div>
                  </div>
                )
                : (
                  <div style={card}>
                    <table className="data-table">
                      <thead><tr><th>العنوان</th><th>الأستاذ</th><th>المادة</th><th>الموعد</th><th>المدة</th><th>الحالة</th></tr></thead>
                      <tbody>
                        {mySessions.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).map(s => (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600 }}>
                              <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "none" }}>
                                🔗 {s.title}
                              </a>
                            </td>
                            <td>{s.teacherName}</td>
                            <td>{s.subjectName}</td>
                            <td style={{ fontSize: 12 }}>{new Date(s.scheduledAt).toLocaleString("ar-EG")}</td>
                            <td style={{ fontSize: 12 }}>{s.durationMin} دقيقة</td>
                            <td>
                              <span className={`badge ${s.status === "live" ? "badge-danger" : s.status === "upcoming" ? "badge-info" : ""}`}
                                style={s.status === "ended" ? { background: "var(--border)", color: "var(--text-muted)" } : {}}>
                                {s.status === "live" ? "🔴 مباشر" : s.status === "upcoming" ? "قادم" : "✅ انتهى"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}

          {/* ── HOMEWORK ── */}
          {tab === "homework" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📋 الواجبات المنزلية — {user.schoolName}</h2>
              {myHomework.length === 0
                ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا توجد واجبات</p>
                : myHomework.map(hw => {
                  const subs = mySubmissions.filter(s => s.homeworkId === hw.id);
                  return (
                    <div key={hw.id} style={{ ...card, marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{hw.title}</div>
                          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                            {hw.subjectName} · {hw.teacherName} · تسليم: {hw.dueDate}
                          </div>
                          <div style={{ fontSize: 13, marginTop: 4, color: "var(--text-muted)" }}>{hw.description}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className={`badge ${hw.status === "active" ? "badge-success" : "badge-warning"}`}>
                            {hw.status === "active" ? "نشط" : "مُغلق"}
                          </span>
                          <span className="badge badge-info">{subs.length} تسليم</span>
                        </div>
                      </div>
                      {subs.length > 0 && (
                        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>التسليمات:</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {subs.map(s => (
                              <div key={s.id} style={{ padding: "4px 10px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12 }}>
                                {s.studentName}
                                {s.grade !== undefined && <span style={{ color: "var(--success)", fontWeight: 700, marginRight: 6 }}> {s.grade}/{hw.maxPoints}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* ── REPORTS ── */}
          {tab === "reports" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📊 تقارير أداء المدرسة</h2>

              {/* Exam performance by teacher */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h4 style={{ marginBottom: 16, fontWeight: 800 }}>📝 أداء الاختبارات حسب الأستاذ</h4>
                {myTeachers.length === 0
                  ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا بيانات</p>
                  : myTeachers.map(t => {
                    const recs = myRecords.filter(r => {
                      const subjectTeacher = r.examId; return subjectTeacher; // best effort
                    });
                    const tRecs = myRecords;
                    void tRecs;
                    const cnt  = myRecords.length;
                    void cnt;
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                        <img src={avatarUrl(t.name)} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{t.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.spec}</div>
                        </div>
                        <span className={`badge ${t.status === "active" ? "badge-success" : "badge-warning"}`}>{t.status === "active" ? "فعّال" : "غير فعّال"}</span>
                      </div>
                    );
                  })}
              </div>

              {/* Top performing students */}
              <div style={card}>
                <h4 style={{ marginBottom: 16, fontWeight: 800 }}>🏆 أفضل الطلاب أداءً</h4>
                {myStudents.length === 0
                  ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا بيانات</p>
                  : (() => {
                    const ranked = myStudents.map(s => {
                      const recs = myRecords.filter(r => r.studentEmail === s.email);
                      const avg  = recs.length ? Math.round(recs.reduce((a, r) => a + r.percentage, 0) / recs.length) : 0;
                      return { ...s, avg, attempts: recs.length };
                    }).filter(s => s.attempts > 0).sort((a, b) => b.avg - a.avg).slice(0, 10);

                    return ranked.length === 0
                      ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا توجد محاولات اختبار بعد</p>
                      : (
                        <table className="data-table">
                          <thead><tr><th>#</th><th>الطالب</th><th>متوسط الدرجات</th><th>عدد المحاولات</th></tr></thead>
                          <tbody>
                            {ranked.map((s, i) => (
                              <tr key={s.id}>
                                <td style={{ fontWeight: 800, color: i < 3 ? "var(--warning)" : "var(--text-muted)" }}>
                                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                                </td>
                                <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <img src={avatarUrl(s.name)} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} />
                                  {s.name}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 800, color: s.avg >= 80 ? "var(--success)" : s.avg >= 60 ? "var(--warning)" : "var(--danger)" }}>
                                    {s.avg}%
                                  </span>
                                </td>
                                <td style={{ color: "var(--text-muted)" }}>{s.attempts} محاولة</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                  })()}
              </div>
            </div>
          )}

          {/* ── SPECS ── */}
          {tab === "specs" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📚 التخصصات</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
                {SPECS.map(spec => {
                  const cnt = myTeachers.filter(t => t.spec === spec).length;
                  return (
                    <div key={spec} style={{ ...card, textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📖</div>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>{spec}</div>
                      <span className={`badge ${cnt > 0 ? "badge-success" : "badge-warning"}`}>{cnt} أستاذ</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PROFILE ── */}
          {tab === "profile" && (
            <div className="fade-in" style={{ maxWidth: 480 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>👤 الملف الشخصي</h2>
              <div style={{ ...card, textAlign: "center", marginBottom: 20 }}>
                <UserAvatar name={user.name} src={localPhoto} size={90} border="3px solid var(--primary)" />
                <h3 style={{ marginTop: 12, fontSize: 20, fontWeight: 800 }}>{user.name}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{user.email}</p>
                <span className="badge badge-info" style={{ marginTop: 6 }}>🏫 مدير المدرسة</span>
              </div>
              <div style={card}>
                {[
                  { label: "المدرسة",         val: user.schoolName },
                  { label: "تاريخ الانضمام",  val: user.joinedAt },
                  { label: "عدد الأساتذة",    val: String(myTeachers.length) },
                  { label: "عدد الطلاب",      val: String(myStudents.length) },
                  { label: "جلسات مجدولة",    val: String(mySessions.filter(s => s.status !== "ended").length) },
                  { label: "واجبات نشطة",     val: String(myHomework.filter(h => h.status === "active").length) },
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{r.label}</span>
                    <strong style={{ fontSize: 14 }}>{r.val}</strong>
                  </div>
                ))}
              </div>
              <AvatarUploadWidget
                email={user.email}
                name={user.name}
                initialPhoto={localPhoto}
                onPhotoChange={url => setLocalPhoto(url || undefined)}
                card={card}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

