import { useState, useEffect } from "react";
import { syncEngine } from "./lib/sync-engine";
import { sessionManager } from "./lib/session-manager";
import { addAuditLog } from "./lib/security";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ToastContainer } from "./components/Toast";
import { InstallPrompt } from "./components/InstallPrompt";
import { AuthScreen } from "./pages/AuthScreen";
import { AdminDashboard } from "./pages/AdminDashboard";
import { SchoolAdminDashboard } from "./pages/SchoolAdminDashboard";
import { TeacherDashboard } from "./pages/TeacherDashboard";
import { StudentDashboard } from "./pages/StudentDashboard";
import { ParentDashboard } from "./pages/ParentDashboard";
import { SupportDashboard } from "./pages/SupportDashboard";
import type { Student, Teacher, SchoolAdmin, Parent, SupportAgent } from "./lib/db";

type Role     = "admin" | "school-admin" | "teacher" | "student" | "parent" | "support";
type AdminUser = { name: string; email: string };
type User      = Student | Teacher | SchoolAdmin | AdminUser | Parent | SupportAgent;

interface Session {
  role: Role;
  user: User;
}

export default function App() {
  const [session,     setSession]     = useState<Session | null>(null);
  const [idleWarnSec, setIdleWarnSec] = useState(0); // > 0 shows warning overlay

  useEffect(() => {
    syncEngine.start(30_000);
    return () => syncEngine.stop();
  }, []);

  const handleLogin = (role: Role, user: User) => {
    setSession({ role, user });
    const email = (user as { email?: string }).email ?? "unknown";
    const name  = (user as { name?: string }).name  ?? "unknown";

    /* Start session idle monitor */
    sessionManager.start({
      idleMs:   30 * 60_000,
      warnMs:   60_000,
      onWarn:   (sec) => setIdleWarnSec(sec),
      onResume: () => setIdleWarnSec(0),
      onLogout: () => {
        addAuditLog({ email, name, type: "session_expired", details: "انتهت الجلسة تلقائياً بعد 30 دقيقة عدم نشاط" });
        setIdleWarnSec(0);
        setSession(null);
      },
    });

    /* Log successful login */
    addAuditLog({ email, name, type: "login_success" });
  };

  const handleLogout = () => {
    const email = (session?.user as { email?: string })?.email ?? "unknown";
    const name  = (session?.user as { name?: string })?.name  ?? "unknown";
    addAuditLog({ email, name, type: "logout" });
    sessionManager.stop();
    setIdleWarnSec(0);
    setSession(null);
  };

  return (
    <LanguageProvider>
      {/* PWA install button — always visible regardless of login state */}
      <InstallPrompt />

      {!session ? (
        <>
          <AuthScreen onLogin={handleLogin as Parameters<typeof AuthScreen>[0]["onLogin"]} />
          <ToastContainer />
        </>
      ) : (
        <>
          {session.role === "admin" && (
            <AdminDashboard user={session.user as AdminUser} onLogout={handleLogout} />
          )}
          {session.role === "school-admin" && (
            <SchoolAdminDashboard user={session.user as SchoolAdmin} onLogout={handleLogout} />
          )}
          {session.role === "teacher" && (
            <TeacherDashboard user={session.user as Teacher} onLogout={handleLogout} />
          )}
          {session.role === "student" && (
            <StudentDashboard user={session.user as Student} onLogout={handleLogout} />
          )}
          {session.role === "parent" && (
            <ParentDashboard user={session.user as Parent} onLogout={handleLogout} />
          )}
          {session.role === "support" && (
            <SupportDashboard user={session.user as SupportAgent} onLogout={handleLogout} />
          )}
          <ToastContainer />

          {/* ── Idle Session Warning Overlay ── */}
          {idleWarnSec > 0 && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                background: "var(--card)", border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius)", padding: "36px 40px",
                maxWidth: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>⏱️</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                  سيتم تسجيل الخروج تلقائياً
                </h3>
                <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.8, marginBottom: 20 }}>
                  لم يتم الكشف عن أي نشاط لفترة طويلة.<br />
                  سيتم تسجيل خروجك تلقائياً خلال{" "}
                  <strong style={{ color: idleWarnSec <= 10 ? "var(--danger)" : "var(--primary)", fontSize: 18 }}>
                    {idleWarnSec}
                  </strong>{" "}
                  ثانية.
                </p>
                <button
                  onClick={() => { sessionManager.resetTimer(); setIdleWarnSec(0); }}
                  style={{
                    padding: "12px 32px", background: "var(--primary)", border: "none",
                    borderRadius: "var(--radius-sm)", color: "#fff", fontSize: 15,
                    fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%",
                  }}>
                  🔄 استمرار الجلسة
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    marginTop: 10, padding: "10px 32px", background: "transparent",
                    border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)",
                    color: "var(--danger)", fontSize: 14, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", width: "100%",
                  }}>
                  تسجيل الخروج الآن
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </LanguageProvider>
  );
}
