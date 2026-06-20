/* ─────────────────────────────────────────────────────────────────────────────
 * AuthScreen — Unified Login + Student Self-Registration  (Bilingual i18n)
 *
 * Security model:
 *  • No role picker — role is resolved automatically from the DB.
 *  • Staff accounts created exclusively by system admin.
 *  • Students CAN self-register (school + academic classification required).
 *  • Generic error messages (no enumeration hints). 600 ms constant delay.
 * ─────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { sha256 } from "../lib/auth";
import {
  getStudents, getTeachers, getSAdmins, saveStudents,
  getAdminHash, setAdminHash,
  getSchools, getTeachers as _gt,
  SCHOOL_TYPE_ICONS, SCHOOL_TYPE_LABELS,
  STAGE_LABELS, TRACK_LABELS, GRADES_BY_STAGE, TRACKS_BY_STAGE,
  addRecoveryRequest, getParents, getSupportAgents,
} from "../lib/db";
import {
  checkLocked, recordFailedAttempt, clearFailedAttempts,
  addAuditLog, LOCKOUT_MS,
} from "../lib/security";
import type { Student, Teacher, SchoolAdmin, AcademicStage, AcademicTrack, Parent } from "../lib/db";
import { toast } from "../components/Toast";
import { syncEngine } from "../lib/sync-engine";
import { ParticleBackground } from "../components/ParticleBackground";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useLanguage } from "../contexts/LanguageContext";

type Role     = "admin" | "school-admin" | "teacher" | "student" | "parent" | "support";
type AuthMode = "login" | "register" | "recovery";

interface Props {
  onLogin: (role: Role, user: Student | Teacher | SchoolAdmin | Parent | { name: string; email: string }) => void;
}

/* ── Floating Label wrapper ─────────────────────────────────────────────── */
function FloatField({
  label,
  hasValue,
  children,
  style,
}: {
  label: string;
  hasValue: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  const floated = focused || hasValue;
  return (
    <div
      style={{ position: "relative", paddingBlockStart: "18px", ...style }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <span style={{
        position: "absolute",
        top: floated ? "2px" : "calc(18px + 11px)",
        insetInlineStart: "14px",
        fontSize: floated ? "10px" : "13px",
        color: floated ? "var(--primary)" : "var(--text-muted)",
        fontWeight: 500,
        lineHeight: 1,
        transition: "top 0.18s ease, font-size 0.18s ease, color 0.18s ease",
        pointerEvents: "none",
        zIndex: 2,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function AuthScreen({ onLogin }: Props) {
  const { t }          = useTranslation();
  const { isRTL, lang } = useLanguage();

  /* ── Auth mode ─────────────────────────────────────────────────────────── */
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loading,  setLoading]  = useState(false);

  /* ── Recovery state ────────────────────────────────────────────────────── */
  const [recName,      setRecName]      = useState("");
  const [recWhatsapp,  setRecWhatsapp]  = useState("");
  const [recSubmitted, setRecSubmitted] = useState(false);
  const [recErr,       setRecErr]       = useState("");

  const handleRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    setRecErr("");
    if (!recName.trim() || recName.trim().length < 3) { setRecErr("يرجى إدخال الاسم الكامل (3 أحرف على الأقل)"); return; }
    if (!/^[0-9+\s\-]{7,15}$/.test(recWhatsapp.trim()))  { setRecErr("رقم الواتساب غير صحيح (أرقام فقط)"); return; }
    addRecoveryRequest(recName.trim(), recWhatsapp.trim());
    setRecSubmitted(true);
    toast("تم إرسال طلبك — سيتواصل معك المشرف قريباً ✅", "success");
  };

  /* ── Login state ───────────────────────────────────────────────────────── */
  const [loginEmail,    setLoginEmail]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginErr,      setLoginErr]      = useState("");
  const [lockoutMs,     setLockoutMs]     = useState(0);
  const [lockoutTimer,  setLockoutTimer]  = useState<ReturnType<typeof setInterval> | null>(null);

  /* Refresh remaining lockout countdown every second */
  useEffect(() => {
    if (lockoutMs <= 0) {
      if (lockoutTimer) { clearInterval(lockoutTimer); setLockoutTimer(null); }
      return;
    }
    const id = setInterval(() => {
      const { remainingMs } = checkLocked(loginEmail);
      if (remainingMs <= 0) { setLockoutMs(0); setLoginErr(""); }
      else setLockoutMs(remainingMs);
    }, 1000);
    setLockoutTimer(id);
    return () => clearInterval(id);
  }, [lockoutMs > 0]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* Check lock state whenever email field changes */
  useEffect(() => {
    if (!loginEmail) { setLockoutMs(0); return; }
    const { locked, remainingMs } = checkLocked(loginEmail);
    if (locked) setLockoutMs(remainingMs);
    else setLockoutMs(0);
  }, [loginEmail]);

  /* ── Register state ────────────────────────────────────────────────────── */
  const [regName,     setRegName]     = useState("");
  const [regEmail,    setRegEmail]    = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm,  setRegConfirm]  = useState("");
  const [regSchool,   setRegSchool]   = useState("");
  const [regStage,    setRegStage]    = useState<AcademicStage>("secondary");
  const [regGrade,    setRegGrade]    = useState<number>(1);
  const [regTrack,    setRegTrack]    = useState<AcademicTrack>("general");
  const [showRegPass, setShowRegPass] = useState(false);
  const [regErr,      setRegErr]      = useState("");
  const [strength,    setStrength]    = useState(0);

  /* Live stats */
  const activeSchools = getSchools().filter(s => s.status === "active");
  const teacherCount  = _gt().length || 120;
  const studentCount  = getStudents().length;

  /* ── Password strength ─────────────────────────────────────────────────── */
  const strengthConfig = [
    { pct: "0%",   color: "",                label: "" },
    { pct: "25%",  color: "var(--danger)",   label: t("password.strength.veryWeak") },
    { pct: "50%",  color: "var(--warning)",  label: t("password.strength.weak") },
    { pct: "75%",  color: "var(--info)",     label: t("password.strength.good") },
    { pct: "100%", color: "var(--success)",  label: t("password.strength.strong") },
  ];
  const calcStrength = (v: string) => {
    let s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/[0-9]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    setStrength(s);
  };

  const handleStageChange = (s: AcademicStage) => {
    setRegStage(s);
    setRegGrade(GRADES_BY_STAGE[s][0]!);
    setRegTrack(TRACKS_BY_STAGE[s][0]!);
  };

  /* ── Unified Login ─────────────────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr("");
    if (!loginEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(loginEmail)) { setLoginErr(t("auth.errors.invalidEmail")); return; }
    if (!loginPassword) { setLoginErr(t("auth.errors.passwordRequired")); return; }

    /* ── Brute-force lockout check ── */
    const lockState = checkLocked(loginEmail.trim().toLowerCase());
    if (lockState.locked) {
      const mins = Math.ceil(lockState.remainingMs / 60_000);
      setLockoutMs(lockState.remainingMs);
      setLoginErr(`🔒 تم قفل الحساب مؤقتاً لأسباب أمنية. يرجى التواصل مع المدير أو الانتظار ${mins} دقيقة.`);
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    try {
      const hashed      = await sha256(loginPassword);
      const normalEmail = loginEmail.trim().toLowerCase();

      if (normalEmail === "ahmed@buytuk.com") {
        let hash = getAdminHash();
        if (!hash) { hash = await sha256("buytuk9000"); setAdminHash(hash); }
        if (hashed !== hash) throw new Error("invalid");
        clearFailedAttempts(normalEmail);
        onLogin("admin", { name: "Ahmed", email: "ahmed@buytuk.com" }); return;
      }
      const sAdmin = getSAdmins().find(u => u.email.toLowerCase() === normalEmail && u.passHash === hashed);
      if (sAdmin)  { clearFailedAttempts(normalEmail); onLogin("school-admin", sAdmin);  return; }
      const teacher = getTeachers().find(u => u.email.toLowerCase() === normalEmail && u.passHash === hashed);
      if (teacher)  { clearFailedAttempts(normalEmail); onLogin("teacher", teacher);      return; }
      const student = getStudents().find(u => u.email.toLowerCase() === normalEmail && u.passHash === hashed);
      if (student)  { clearFailedAttempts(normalEmail); onLogin("student", student);      return; }
      const parent  = getParents().find(u => u.email.toLowerCase() === normalEmail && u.passHash === hashed && u.status === "active");
      if (parent)   { clearFailedAttempts(normalEmail); onLogin("parent", parent);        return; }
      const support = getSupportAgents().find(u => u.email.toLowerCase() === normalEmail && u.passHash === hashed && u.status === "active");
      if (support)  { clearFailedAttempts(normalEmail); onLogin("support", support as Parameters<typeof onLogin>[1]); return; }
      throw new Error("invalid");
    } catch {
      /* Record failed attempt + check if now locked */
      const result = recordFailedAttempt(loginEmail.trim().toLowerCase());
      addAuditLog({
        email:   loginEmail.trim().toLowerCase(),
        name:    loginEmail.trim().toLowerCase(),
        type:    result.locked ? "account_locked" : "login_failed",
        details: result.locked
          ? `القفل بعد ${5} محاولات فاشلة`
          : `محاولة فاشلة — المتبقي: ${result.attemptsLeft}`,
      });

      if (result.locked) {
        const { remainingMs } = checkLocked(loginEmail.trim().toLowerCase());
        setLockoutMs(remainingMs);
        setLoginErr(`🔒 تم قفل الحساب مؤقتاً لأسباب أمنية. يرجى التواصل مع المدير أو المحاولة بعد 15 دقيقة.`);
        toast("⚠️ تم قفل الحساب بعد محاولات متعددة فاشلة", "error");
      } else {
        setLoginErr(t("auth.errors.invalidCredentials") + (result.attemptsLeft < 3 ? ` (${result.attemptsLeft} محاولات متبقية)` : ""));
        toast(t("auth.errors.loginFailed"), "error");
      }
    } finally { setLoading(false); }
  };

  /* ── Student Self-Registration ─────────────────────────────────────────── */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErr("");
    if (!regName || regName.trim().length < 3)                    { setRegErr(t("auth.errors.nameTooShort"));    return; }
    if (!regEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(regEmail))     { setRegErr(t("auth.errors.invalidEmail"));    return; }
    if (regPassword.length < 8)                                   { setRegErr(t("auth.errors.passwordTooShort")); return; }
    if (regPassword !== regConfirm)                               { setRegErr(t("auth.errors.passwordMismatch")); return; }
    if (!regSchool)                                               { setRegErr(t("auth.errors.schoolRequired"));  return; }

    const all = [...getStudents(), ...getTeachers(), ...getSAdmins()];
    if (all.find(u => u.email.toLowerCase() === regEmail.toLowerCase())) {
      setRegErr(t("auth.errors.emailTaken")); return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const hashed: string = await sha256(regPassword);
    const student: Student = {
      id:         Date.now(),
      name:       regName.trim(),
      email:      regEmail.toLowerCase(),
      passHash:   hashed,
      schoolId:   regSchool,
      schoolName: getSchools().find(s => s.id === regSchool)?.name ?? regSchool,
      stage:      regStage,
      grade:      regGrade,
      track:      regTrack,
      joinedAt:   new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US"),
      status:     "active",
    };
    const list = getStudents();
    list.push(student);
    saveStudents(list);

    /* Notify dashboards on same device immediately */
    window.dispatchEvent(new CustomEvent("ome-assets-updated", {
      detail: { source: "student-register" },
    }));
    /* Push to cloud so admin/school-admin on other devices see this student */
    void syncEngine.pushStudent(student);

    setLoading(false);
    toast(t("auth.errors.registerSuccess"), "success");
    setAuthMode("login");
    setLoginEmail(student.email);
  };

  const sc         = strengthConfig[strength]!;
  const fieldLabel: React.CSSProperties = {
    display: "block", fontSize: 13,
    color: "var(--text-muted)", marginBottom: 6, fontWeight: 500,
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: 20, position: "relative", zIndex: 1,
    }}>
      <ParticleBackground />
      <div className="auth-wrapper">

        {/* ── Brand panel ───────────────────────────────────────────────── */}
        <div className="auth-brand">
          <div className="brand-icon" style={{ marginBottom: 16, position: "relative", zIndex: 1 }}>
            <img
              src="/logo.png"
              alt="BuyTuk Academy"
              style={{
                width: 110, height: 110,
                borderRadius: 24,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 0 0 3px rgba(255,255,255,0.15)",
                objectFit: "cover",
              }}
            />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 12, position: "relative", zIndex: 1 }}>
            {t("platform.name")}
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", position: "relative", zIndex: 1, lineHeight: 1.8, whiteSpace: "pre-line" }}>
            {t("platform.tagline")}
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 36, position: "relative", zIndex: 1 }}>
            {[
              { v: String(activeSchools.length), l: t("platform.stats.schools") },
              { v: String(teacherCount),         l: t("platform.stats.teachers") },
              { v: String(studentCount),         l: t("platform.stats.students") },
            ].map(s => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <strong style={{ display: "block", fontSize: 22, fontWeight: 900, color: "#fff" }}>{s.v}</strong>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{s.l}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, padding: "10px 16px", position: "relative", zIndex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
            {t("auth.securityBadge")}
          </div>

          {/* ── رسالة ترحيب المؤسس ── */}
          <div style={{
            marginTop: 20, position: "relative", zIndex: 1,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 16,
            padding: "18px 18px 14px",
            backdropFilter: "blur(4px)",
          }}>
            {/* علامة الاقتباس */}
            <span style={{ fontSize: 32, lineHeight: 1, color: "rgba(255,255,255,0.25)", fontFamily: "Georgia, serif", display: "block", marginBottom: 4 }}>❝</span>

            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", lineHeight: 1.9, margin: 0, fontWeight: 500 }}>
              مرحباً بك في <strong style={{ color: "#fff" }}>BuyTuk Academy</strong>!<br />
              هدفنا: جعل التعليم ذكياً، تفاعلياً،<br />
              ومتاحاً لك في أي وقت.<br />
              نحن هنا لنصنع معك النجاح.
            </p>

            {/* توقيع المؤسس */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.1))",
                border: "2px solid rgba(255,255,255,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0,
              }}>👨‍💼</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>م/ أحمد عنتر أحمد</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>مؤسس ومدير المنصة</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Form panel ────────────────────────────────────────────────── */}
        <div style={{ flex: 1.2, background: "var(--bg-light)", padding: "40px 36px", display: "flex", flexDirection: "column", justifyContent: "center" }}>

          {/* Language switcher row */}
          <div style={{ display: "flex", justifyContent: isRTL ? "flex-start" : "flex-end", marginBottom: 20 }}>
            <LanguageSwitcher />
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{t("auth.welcome")}</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            {authMode === "login" ? t("auth.signInSubtitle") : t("auth.registerSubtitle")}
          </p>

          {/* Toggle tabs */}
          <div style={{ display: "flex", borderRadius: "var(--radius-sm)", background: "var(--card)", padding: 4, marginBottom: 24 }}>
            {(["login", "register"] as AuthMode[]).map(m => (
              <div key={m} onClick={() => setAuthMode(m)}
                style={{ flex: 1, padding: 9, textAlign: "center", cursor: "pointer", borderRadius: 6, fontSize: 14, fontWeight: 600, background: authMode === m ? "var(--primary)" : "transparent", color: authMode === m ? "#fff" : "var(--text-muted)", transition: "var(--transition)" }}>
                {m === "login" ? t("auth.login") : t("auth.register")}
              </div>
            ))}
          </div>

          {/* ══ LOGIN FORM ══ */}
          {authMode === "login" && (
            <form onSubmit={handleLogin} noValidate>
              <div style={{ marginBottom: 16 }}>
                <label style={fieldLabel}>{t("auth.email")}</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", [isRTL ? "right" : "left"]: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>✉️</span>
                  <input type="email" className="form-control" value={loginEmail}
                    onChange={e => { setLoginEmail(e.target.value); setLoginErr(""); }}
                    placeholder={t("auth.emailPlaceholder")} autoComplete="email"
                    disabled={loading} style={{ [isRTL ? "paddingRight" : "paddingLeft"]: 42 }} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={fieldLabel}>{t("auth.password")}</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", [isRTL ? "right" : "left"]: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>🔒</span>
                  <input type={showLoginPass ? "text" : "password"} className="form-control" value={loginPassword}
                    onChange={e => { setLoginPassword(e.target.value); setLoginErr(""); }}
                    placeholder={t("auth.passwordPlaceholder")} autoComplete="current-password"
                    disabled={loading} style={{ [isRTL ? "paddingRight" : "paddingLeft"]: 42 }} />
                  <button type="button" onClick={() => setShowLoginPass(p => !p)} tabIndex={-1}
                    style={{ position: "absolute", [isRTL ? "left" : "right"]: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 15 }}>
                    {showLoginPass ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              {/* Lockout banner */}
              {lockoutMs > 0 && (
                <div style={{ padding: "12px 16px", background: "rgba(255,71,87,0.08)", border: "2px solid var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--danger)", marginBottom: 12, lineHeight: 1.8 }}>
                  🔒 <strong>الحساب مقفل مؤقتاً</strong>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    يُفتح تلقائياً بعد:{" "}
                    <strong>{Math.floor(lockoutMs / 60_000)}:{String(Math.floor((lockoutMs % 60_000) / 1000)).padStart(2, "0")}</strong>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>للمساعدة: تواصل مع المدير عبر واتساب 01010389600</div>
                </div>
              )}
              {loginErr && lockoutMs <= 0 && (
                <div style={{ padding: "10px 14px", background: "rgba(255,71,87,0.08)", border: "1px solid rgba(255,71,87,0.25)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--danger)", marginBottom: 12, lineHeight: 1.5 }}>
                  ⚠️ {loginErr}
                </div>
              )}
              <button type="submit" className="btn-auth" disabled={loading}>
                {loading ? <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /> : <span>{t("auth.signInBtn")}</span>}
              </button>
              {/* Forgot password link */}
              <div style={{ textAlign: "center", marginTop: 14 }}>
                <button type="button" onClick={() => { setAuthMode("recovery"); setRecSubmitted(false); setRecErr(""); setRecName(""); setRecWhatsapp(""); }}
                  style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                  🔑 نسيت كلمة المرور؟
                </button>
              </div>
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.7 }}>
                للمعلمين والإدارة: تواصل مع مدير النظام للحصول على بيانات حسابك.{" "}
                <a
                  href="https://wa.me/201010389600"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#25D366", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                  💬 01010389600
                </a>
              </p>
            </form>
          )}

          {/* ══ RECOVERY FORM ══ */}
          {authMode === "recovery" && (
            <div>
              <button type="button" onClick={() => setAuthMode("login")}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                ← العودة لتسجيل الدخول
              </button>

              {recSubmitted ? (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>تم إرسال طلبك بنجاح</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
                    سيتواصل معك مشرف النظام عبر الواتساب في أقرب وقت<br />
                    لإرسال كلمة مرور مؤقتة جديدة.
                  </p>
                  <button onClick={() => setAuthMode("login")}
                    style={{ marginTop: 20, padding: "10px 28px", background: "var(--primary)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    العودة لتسجيل الدخول
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRecovery} noValidate>
                  <div style={{ padding: "12px 16px", background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(108,99,255,0.2)", marginBottom: 20, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
                    🔑 أدخل اسمك الكامل ورقم واتسابك وسيتواصل معك المشرف لإرسال كلمة مرور مؤقتة.
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>الاسم الكامل</label>
                    <input type="text" className="form-control" value={recName}
                      onChange={e => { setRecName(e.target.value); setRecErr(""); }}
                      placeholder="مثال: أحمد محمد علي" />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>رقم الواتساب</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", [isRTL ? "right" : "left"]: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>📱</span>
                      <input type="tel" className="form-control" value={recWhatsapp}
                        onChange={e => { setRecWhatsapp(e.target.value); setRecErr(""); }}
                        placeholder="مثال: 0599123456"
                        style={{ [isRTL ? "paddingRight" : "paddingLeft"]: 42 }} />
                    </div>
                  </div>
                  {recErr && (
                    <div style={{ padding: "10px 14px", background: "rgba(255,71,87,0.08)", border: "1px solid rgba(255,71,87,0.25)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>
                      ⚠️ {recErr}
                    </div>
                  )}
                  <button type="submit" className="btn-auth">📨 إرسال طلب الاستعادة</button>
                </form>
              )}
            </div>
          )}

          {/* ══ REGISTER FORM (students only) ══ */}
          {authMode === "register" && (
            <form onSubmit={handleRegister} noValidate style={{ overflowY: "auto", maxHeight: "60vh" }}>
              <div style={{ marginBottom: 12 }}>
                <FloatField label={t("auth.fullName")} hasValue={!!regName}>
                  <input type="text" className="form-control" value={regName} onChange={e => setRegName(e.target.value)} placeholder="" />
                </FloatField>
              </div>
              <div style={{ marginBottom: 12 }}>
                <FloatField label={t("auth.email")} hasValue={!!regEmail}>
                  <input type="email" className="form-control" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="" autoComplete="email" />
                </FloatField>
              </div>
              <div style={{ marginBottom: 12 }}>
                <FloatField label={t("auth.password")} hasValue={!!regPassword}>
                  <div style={{ position: "relative" }}>
                    <input type={showRegPass ? "text" : "password"} className="form-control" value={regPassword}
                      onChange={e => { setRegPassword(e.target.value); calcStrength(e.target.value); }}
                      placeholder="" />
                    <button type="button" onClick={() => setShowRegPass(p => !p)} tabIndex={-1}
                      style={{ position: "absolute", [isRTL ? "left" : "right"]: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                      {showRegPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </FloatField>
                <div className="strength-bar"><div className="strength-fill" style={{ width: sc.pct, background: sc.color }} /></div>
                <div style={{ fontSize: 11, marginTop: 3, color: sc.color }}>{sc.label}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <FloatField label={t("auth.confirmPassword")} hasValue={!!regConfirm}>
                  <input type="password" className="form-control" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="" />
                </FloatField>
              </div>
              <div style={{ marginBottom: 12 }}>
                <FloatField label={t("common.school")} hasValue={!!regSchool}>
                  <select className="form-control" value={regSchool} onChange={e => setRegSchool(e.target.value)}>
                    <option value="">{lang === "ar" ? "اختر المدرسة" : "Select school"}</option>
                    {activeSchools.map(s => (
                      <option key={s.id} value={s.id}>{SCHOOL_TYPE_ICONS[s.type]} {s.name} — {SCHOOL_TYPE_LABELS[s.type]}</option>
                    ))}
                  </select>
                </FloatField>
              </div>

              {/* Academic classification */}
              <div style={{ marginBottom: 8, padding: 12, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(108,99,255,0.2)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 10 }}>{t("academic.classification")}</div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ ...fieldLabel, fontSize: 12 }}>{t("academic.stage")}</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                    {(["primary", "middle", "secondary"] as AcademicStage[]).map(s => (
                      <button key={s} type="button" onClick={() => handleStageChange(s)}
                        style={{ padding: "8px 4px", borderRadius: "var(--radius-sm)", border: `2px solid ${regStage === s ? "var(--primary)" : "var(--border)"}`, background: regStage === s ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: regStage === s ? 700 : 400, textAlign: "center" }}>
                        {STAGE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ ...fieldLabel, fontSize: 12 }}>{t("academic.grade")}</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {GRADES_BY_STAGE[regStage].map(g => (
                      <button key={g} type="button" onClick={() => setRegGrade(g)}
                        style={{ minWidth: 40, padding: "6px 10px", borderRadius: "var(--radius-sm)", border: `2px solid ${regGrade === g ? "var(--primary)" : "var(--border)"}`, background: regGrade === g ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: regGrade === g ? 700 : 400 }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ ...fieldLabel, fontSize: 12 }}>{t("academic.track")}</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {TRACKS_BY_STAGE[regStage].map(tr => (
                      <button key={tr} type="button" onClick={() => setRegTrack(tr)}
                        style={{ padding: "6px 12px", borderRadius: 20, border: `2px solid ${regTrack === tr ? "var(--primary)" : "var(--border)"}`, background: regTrack === tr ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: regTrack === tr ? 700 : 400 }}>
                        {TRACK_LABELS[tr]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {regErr && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12, marginTop: 8 }}>⚠️ {regErr}</div>}
              <button type="submit" className="btn-auth" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /> : <span>{t("auth.registerBtn")}</span>}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
