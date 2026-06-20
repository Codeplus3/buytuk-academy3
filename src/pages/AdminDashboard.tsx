import { useState, useRef, useEffect } from "react";
import { sha256, avatarUrl } from "../lib/auth";
import { UserAvatar } from "@/contexts/components/UserAvatar";
import { AvatarUploadWidget, getPhoto } from "@/contexts/components/AvatarUploadWidget";
import {
  getStudents, getTeachers, getSAdmins, saveTeachers, saveSAdmins, saveStudents,
  getExamRecords, getSchools, saveSchools, getSchoolNames,
  getSubjects, saveSubjects, getQuestions, getExams,
  SCHOOL_TYPE_LABELS, SCHOOL_TYPE_ICONS,
  STAGE_LABELS, STAGE_ICONS, TRACK_LABELS, GRADES_BY_STAGE,
  storeVoiceModel, storeCurriculumFile, storeVideoFile,
  getRecoveryRequests, saveRecoveryRequests,
  getPlans, savePlans, renewStudentSubscription, isStudentSubscribed,
  getParents, saveParents,
  getOrderRequests,
} from "../lib/db";
import type { Teacher, SchoolAdmin, School, SchoolType, Subject, AcademicStage, AcademicTrack, RecoveryRequest, SubscriptionPlan, Parent } from "../lib/db";
import { toast } from "@/contexts/components/Toast";
import { syncEngine } from "../lib/sync-engine";
import { OfflineMediaPanel } from "@/contexts/components/OfflineMediaPanel";
import { LessonManager } from "@/contexts/components/LessonManager";
import { ResumableUploader } from "../lib/resumable-upload";
import type { UploadProgressEvent } from "../lib/resumable-upload";
import { getAuditLogs, clearAuditLogs, addAuditLog } from "../lib/security";
import { LanguageSwitcher } from "@/contexts/components/LanguageSwitcher";
import type { AuditLog } from "../lib/security";
import { AdminSettingsPanel } from "@/contexts/components/AdminSettingsPanel";
import { MessageCenter } from "@/contexts/components/MessageCenter";
import { AdminAnnouncementsPanel } from "@/contexts/components/AdminAnnouncementsPanel";
import { AnnouncementBanner } from "@/contexts/components/AnnouncementBanner";
import { ParentAdminPanel } from "@/contexts/components/ParentAdminPanel";
import { SupportAdminPanel } from "@/contexts/components/SupportAdminPanel";
import { OrdersAdminPanel } from "@/contexts/components/OrdersAdminPanel";
import { PremiumSubjectsPanel } from "@/contexts/components/PremiumSubjectsPanel";

type Tab = "home" | "schools" | "sadmins" | "teachers" | "students" | "parents" | "support" | "subjects" | "orders" | "premium" | "subscriptions" | "recovery" | "security" | "diagnostics" | "profile" | "settings" | "messages" | "announcements";

interface Props { user: { name: string; email: string }; onLogout: () => void; }

const EMPTY_SCHOOL_FORM = { name: "", type: "mixed" as SchoolType, city: "", principal: "", phone: "" };
const EMPTY_USER_FORM   = { name: "", email: "", pass: "", spec: "", school: "" };
const EMPTY_SUBJ_FORM   = {
  name: "", icon: "📚", description: "", stage: "secondary" as AcademicStage,
  grade: 1, track: "all" as AcademicTrack | "all", schoolId: "all",
  teacherIds: [] as number[],
};

const SUBJECT_ICONS = ["📐","⚛️","🧪","🧬","💻","📖","🌍","🎨","🏛️","🔢","🔬","✏️","🎵","📊","🗺️","⚙️"];

function UploadProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {pct < 90 ? "⏳ جاري القراءة..." : pct < 100 ? "💾 جاري الحفظ..." : "✅ اكتمل"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: pct === 100 ? "var(--success)" : color,
          width: `${pct}%`,
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

export function AdminDashboard({ user, onLogout }: Props) {
  const [tab, setTab]               = useState<Tab>("home");
  const [localPhoto, setLocalPhoto] = useState<string | undefined>(() => getPhoto(user.email));
  const [userForm, setUserForm]     = useState(EMPTY_USER_FORM);
  const [schoolForm, setSchoolForm] = useState(EMPTY_SCHOOL_FORM);
  const [editSchool, setEditSchool] = useState<School | null>(null);
  const [subjForm, setSubjForm]     = useState(EMPTY_SUBJ_FORM);
  const [editSubjId, setEditSubjId] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState<string | null>(null);
  const [uploadingCurr,  setUploadingCurr]  = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [editModalOpen, setEditModalOpen]   = useState(false);
  const [subjFilter, setSubjFilter]         = useState({ schoolId: "all", grade: 0 });
  const [subjSearch, setSubjSearch]         = useState("");
  const [, forceRender]             = useState(0);
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>(() => getRecoveryRequests());

  /* ── Subscription Plans state ── */
  const EMPTY_PLAN: Omit<SubscriptionPlan, "id" | "createdAt"> = {
    name: "", durationDays: 30, price: 0, features: [""], color: "#6c63ff",
  };
  const [plans, setPlans]                   = useState<SubscriptionPlan[]>(() => getPlans());
  const [planForm, setPlanForm]             = useState<typeof EMPTY_PLAN>({ ...EMPTY_PLAN });
  const [editPlanId, setEditPlanId]         = useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen]   = useState(false);

  /* ── Lesson Manager Modal ── */
  const [lessonModal, setLessonModal] = useState<{ id: string; name: string } | null>(null);

  /* ── Subscription Renewal Modal ── */
  const [renewModalStudent, setRenewModalStudent] = useState<{ id: number; name: string } | null>(null);
  const [renewPlanId, setRenewPlanId]             = useState<string>("");
  const [tempPassVisible,  setTempPassVisible]  = useState<Record<string, boolean>>({});

  /* ── Resumable upload state ── */
  const [resumableProgress, setResumableProgress] = useState<Record<string, UploadProgressEvent>>({});
  const [syncingSubscriptions, setSyncingSubscriptions] = useState(false);

  /* ── Manifest v2 state ── */
  const [manifestStatus, setManifestStatus] = useState<{
    version: string; lastUpdate: number; totalFiles: number; subjects: number;
  } | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestScanMsg, setManifestScanMsg] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/sync/asset-manifest");
        if (!res.ok) return;
        const m = await res.json() as { version: string; lastUpdate: number; subjects: Array<{ files: unknown[] }> };
        setManifestStatus({
          version:    m.version,
          lastUpdate: m.lastUpdate,
          subjects:   m.subjects.length,
          totalFiles: m.subjects.reduce((n, s) => n + s.files.length, 0),
        });
      } catch { /* server may be offline */ }
    })();
  }, []);

  const runManifestScan = async () => {
    setManifestLoading(true);
    setManifestScanMsg("جارٍ الفحص…");
    try {
      await syncEngine.scanManifest((p) => {
        if      (p.phase === "checking")     setManifestScanMsg("🔍 فحص الـ manifest…");
        else if (p.phase === "downloading")  setManifestScanMsg(`⬇️ ${p.downloadedFiles}/${p.totalFiles} ملف… ${p.currentFile ?? ""}`);
        else if (p.phase === "done")         setManifestScanMsg(`✅ اكتمل — ${p.downloadedFiles} ملف جديد`);
        else if (p.phase === "error")        setManifestScanMsg(`❌ ${p.error ?? "خطأ"}`);
      });
      /* Refresh manifest stats */
      const res2 = await fetch("/api/sync/asset-manifest");
      if (res2.ok) {
        const m2 = await res2.json() as { version: string; lastUpdate: number; subjects: Array<{ files: unknown[] }> };
        setManifestStatus({ version: m2.version, lastUpdate: m2.lastUpdate, subjects: m2.subjects.length, totalFiles: m2.subjects.reduce((n, s) => n + s.files.length, 0) });
      }
    } catch { setManifestScanMsg("❌ تعذّر الاتصال"); }
    finally   { setManifestLoading(false); setTimeout(() => setManifestScanMsg(""), 5000); }
  };
  /* Single hidden <input> per type — MUST be outside .map() so there is exactly one ref */
  const voiceInputRef  = useRef<HTMLInputElement>(null);
  const currInputRef   = useRef<HTMLInputElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);
  /* Mutable refs track WHICH subject triggered the picker — set synchronously before .click() */
  const pendingVoiceIdRef = useRef<string | null>(null);
  const pendingCurrIdRef  = useRef<string | null>(null);
  const pendingVideoIdRef = useRef<string | null>(null);

  const refresh = () => forceRender(n => n + 1);

  /* Listen for recovery requests submitted from AuthScreen */
  useEffect(() => {
    const handler = () => setRecoveryRequests(getRecoveryRequests());
    window.addEventListener("recovery-request-added", handler);
    return () => window.removeEventListener("recovery-request-added", handler);
  }, []);

  /* Refresh any time local storage changes (student self-register, sync pull) */
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("ome-assets-updated", handler);
    return () => window.removeEventListener("ome-assets-updated", handler);
  }, []);

  const refreshRecovery = () => setRecoveryRequests(getRecoveryRequests());

  /* Generate a random 8-char alphanumeric temp password */
  const genTempPass = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const sendTempPassword = async (req: RecoveryRequest) => {
    /* Find student by name (case-insensitive, trims spaces) */
    const students = getStudents();
    const student  = students.find(s => s.name.trim().toLowerCase() === req.name.trim().toLowerCase());
    const tempPass = genTempPass();
    const hashed   = await sha256(tempPass);

    if (student) {
      /* Update student's password to the temp password */
      student.passHash = hashed;
      saveStudents(students);
      toast(`تم تعيين كلمة مرور مؤقتة للطالب ${student.name} ✅`, "success");
    } else {
      toast(`⚠️ لم يُعثر على حساب بالاسم "${req.name}" — يمكنك إرسال كلمة المرور يدوياً`, "warning");
    }

    /* Update request: mark resolved + store plaintext temp pass for admin to send via WA */
    const all = getRecoveryRequests().map(r =>
      r.id === req.id ? { ...r, status: "resolved" as const, resolvedAt: new Date().toLocaleString("ar-SA"), tempPassword: tempPass } : r
    );
    saveRecoveryRequests(all);
    refreshRecovery();
  };

  const dismissRequest = (id: string) => {
    const all = getRecoveryRequests().map(r => r.id === id ? { ...r, status: "dismissed" as const } : r);
    saveRecoveryRequests(all);
    refreshRecovery();
  };

  const deleteRequest = (id: string) => {
    if (!confirm("حذف هذا الطلب نهائياً؟")) return;
    saveRecoveryRequests(getRecoveryRequests().filter(r => r.id !== id));
    refreshRecovery();
  };

  const students = getStudents();
  const teachers = getTeachers();
  const sadmins  = getSAdmins();
  const schools  = getSchools();
  const records  = getExamRecords();
  const subjects = getSubjects();
  const schoolNames = getSchoolNames();

  /* ─── SCHOOL CRUD ─── */
  const handleAddSchool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolForm.name.trim() || !schoolForm.city.trim()) { toast("الاسم والمدينة مطلوبان", "error"); return; }
    const newSchool: School = { id: String(Date.now()), name: schoolForm.name.trim(), type: schoolForm.type, city: schoolForm.city.trim(), principal: schoolForm.principal.trim(), phone: schoolForm.phone.trim(), createdAt: new Date().toLocaleDateString("ar-SA"), status: "active" };
    saveSchools([...getSchools(), newSchool]);
    setSchoolForm(EMPTY_SCHOOL_FORM);
    toast("تم إضافة المدرسة بنجاح ✅", "success"); refresh();
  };
  const handleUpdateSchool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSchool) return;
    saveSchools(getSchools().map(s => s.id === editSchool.id ? { ...editSchool, ...schoolForm } : s));
    setEditSchool(null); setSchoolForm(EMPTY_SCHOOL_FORM);
    toast("تم تحديث بيانات المدرسة ✅", "success"); refresh();
  };
  const startEditSchool = (s: School) => { setEditSchool(s); setSchoolForm({ name: s.name, type: s.type, city: s.city, principal: s.principal, phone: s.phone }); };
  const cancelEdit = () => { setEditSchool(null); setSchoolForm(EMPTY_SCHOOL_FORM); };
  const deleteSchool = (id: string) => {
    const hasPeople = [...students, ...teachers, ...sadmins].some(u => u.schoolId === id);
    if (hasPeople) { toast("لا يمكن حذف مدرسة بها مستخدمون. أزل المستخدمين أولاً.", "error"); return; }
    if (!confirm("حذف هذه المدرسة نهائياً؟")) return;
    saveSchools(getSchools().filter(s => s.id !== id));
    toast("تم حذف المدرسة", "warning"); refresh();
  };
  const toggleSchoolStatus = (id: string) => {
    saveSchools(getSchools().map(s => s.id === id ? { ...s, status: s.status === "active" ? "inactive" as const : "active" as const } : s));
    toast("تم تغيير حالة المدرسة", "info"); refresh();
  };

  /* ─── TEACHER / SADMIN CRUD ─── */
  const addTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email || !userForm.pass || !userForm.spec || !userForm.school) { toast("يرجى ملء جميع الحقول", "error"); return; }
    const all = [...getStudents(), ...getTeachers(), ...getSAdmins()];
    if (all.find(u => u.email.toLowerCase() === userForm.email.toLowerCase())) { toast("البريد مستخدم بالفعل", "error"); return; }
    setLoading(true);
    const passHash = await sha256(userForm.pass);
    const t: Teacher = { id: Date.now(), name: userForm.name, email: userForm.email, passHash, spec: userForm.spec, schoolId: userForm.school, schoolName: schoolNames[userForm.school] ?? userForm.school, assignedSubjectIds: [], joinedAt: new Date().toLocaleDateString("ar-SA"), status: "active" };
    const list = getTeachers(); list.push(t); saveTeachers(list);
    setLoading(false); setUserForm(EMPTY_USER_FORM);
    toast("تم إضافة الأستاذ بنجاح ✅", "success"); refresh();
  };
  const addSAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email || !userForm.pass || !userForm.school) { toast("يرجى ملء جميع الحقول", "error"); return; }
    const all = [...getStudents(), ...getTeachers(), ...getSAdmins()];
    if (all.find(u => u.email.toLowerCase() === userForm.email.toLowerCase())) { toast("البريد مستخدم بالفعل", "error"); return; }
    setLoading(true);
    const passHash = await sha256(userForm.pass);
    const s: SchoolAdmin = { id: Date.now(), name: userForm.name, email: userForm.email, passHash, schoolId: userForm.school, schoolName: schoolNames[userForm.school] ?? userForm.school, joinedAt: new Date().toLocaleDateString("ar-SA"), status: "active" };
    const list = getSAdmins(); list.push(s); saveSAdmins(list);
    setLoading(false); setUserForm(EMPTY_USER_FORM);
    toast("تم إضافة مدير المدرسة بنجاح ✅", "success"); refresh();
  };
  const deleteTeacher  = (id: number) => { if (!confirm("حذف هذا الأستاذ؟")) return; saveTeachers(getTeachers().filter(t => t.id !== id)); toast("تم حذف الأستاذ", "warning"); refresh(); };
  const deleteSAdmin   = (id: number) => { if (!confirm("حذف مدير المدرسة؟")) return; saveSAdmins(getSAdmins().filter(s => s.id !== id)); toast("تم الحذف", "warning"); refresh(); };
  const deleteStudent  = (id: number) => { if (!confirm("حذف هذا الطالب؟")) return; saveStudents(getStudents().filter(s => s.id !== id)); toast("تم الحذف", "warning"); refresh(); };
  const toggleTeacher  = (id: number) => { saveTeachers(getTeachers().map(t => t.id === id ? { ...t, status: t.status === "active" ? "blocked" as const : "active" as const } : t)); toast("تم التحديث", "info"); refresh(); };

  /* ─── SUBJECT CRUD ─── */
  const saveSubj = () => {
    if (!subjForm.name.trim()) { toast("اسم المادة مطلوب", "error"); return; }
    const all = getSubjects();
    const grades = GRADES_BY_STAGE[subjForm.stage];
    const grade = grades.includes(subjForm.grade) ? subjForm.grade : grades[0]!;
    if (editSubjId) {
      const idx = all.findIndex(s => s.id === editSubjId);
      if (idx !== -1) all[idx] = { ...all[idx]!, name: subjForm.name, icon: subjForm.icon, description: subjForm.description, stage: subjForm.stage, grade, track: subjForm.track, schoolId: subjForm.schoolId, teacherIds: subjForm.teacherIds };
      saveSubjects(all);
      const updatedSubj = all.find(s => s.id === editSubjId);
      if (updatedSubj) void syncEngine.pushSubject(updatedSubj);
      toast("تم تحديث المادة ✅", "success");
    } else {
      const subj: Subject = {
        id: `subj_${Date.now()}`, name: subjForm.name, icon: subjForm.icon, description: subjForm.description,
        stage: subjForm.stage, grade, track: subjForm.track, schoolId: subjForm.schoolId,
        teacherIds: subjForm.teacherIds,
        voiceProfileId: null, curriculumFileId: null, curriculumFileName: null,
        videoFileId: null, videoFileName: null,
        createdAt: new Date().toLocaleDateString("ar-SA"), createdBy: user.email, status: "active",
      };
      all.push(subj); saveSubjects(all);
      void syncEngine.pushSubject(subj);
      toast("تم إنشاء المادة ✅", "success");
    }
    setSubjForm(EMPTY_SUBJ_FORM); setEditSubjId(null); setEditModalOpen(false);
    window.dispatchEvent(new CustomEvent("ome-assets-updated", { detail: { source: "subject-save" } }));
    refresh();
  };

  const startEditSubj = (s: Subject) => {
    setSubjForm({ name: s.name, icon: s.icon, description: s.description, stage: s.stage, grade: s.grade, track: s.track, schoolId: s.schoolId, teacherIds: [...s.teacherIds] });
    setEditSubjId(s.id);
    setEditModalOpen(true);
    setTab("subjects");
  };

  const cancelEditSubj = () => {
    setSubjForm(EMPTY_SUBJ_FORM); setEditSubjId(null); setEditModalOpen(false);
  };

  const deleteSubj = (id: string) => {
    const qCount = getQuestions().filter(q => q.subjectId === id).length;
    const eCount = getExams().filter(e => e.subjectId === id).length;
    if (qCount > 0 || eCount > 0) { toast(`المادة بها ${qCount} سؤال و${eCount} اختبار — احذفها أولاً`, "error"); return; }
    if (!confirm("حذف هذه المادة نهائياً؟")) return;
    if (editSubjId === id) { setEditModalOpen(false); setEditSubjId(null); setSubjForm(EMPTY_SUBJ_FORM); }
    saveSubjects(getSubjects().filter(s => s.id !== id));
    toast("تم حذف المادة", "warning"); refresh();
  };

  const toggleSubjStatus = (id: string) => {
    saveSubjects(getSubjects().map(s => s.id === id ? { ...s, status: s.status === "active" ? "archived" as const : "active" as const } : s));
    toast("تم تغيير حالة المادة", "info"); refresh();
  };

  const toggleTeacherAssign = (subjId: string, teacherId: number) => {
    const all = getSubjects();
    const s = all.find(x => x.id === subjId); if (!s) return;
    const idx = s.teacherIds.indexOf(teacherId);
    if (idx >= 0) s.teacherIds.splice(idx, 1); else s.teacherIds.push(teacherId);
    // sync Teacher.assignedSubjectIds
    const tAll = getTeachers().map(t => {
      const has = t.assignedSubjectIds.includes(subjId);
      if (t.id === teacherId && !has && idx < 0) return { ...t, assignedSubjectIds: [...t.assignedSubjectIds, subjId] };
      if (t.id === teacherId && has && idx >= 0)  return { ...t, assignedSubjectIds: t.assignedSubjectIds.filter(x => x !== subjId) };
      return t;
    });
    saveTeachers(tAll); saveSubjects(all);
    toast("تم تحديث تعيين الأستاذ", "info"); refresh();
  };

  /* ─── FILE READER WITH PROGRESS (uses FileReader API for real % updates) ─── */
  const readFileWithProgress = (file: File, progressKey: string): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable)
          setUploadProgress(p => ({ ...p, [progressKey]: Math.round((e.loaded / e.total) * 80) }));
      };
      reader.onload = (e) => {
        setUploadProgress(p => ({ ...p, [progressKey]: 90 }));
        resolve(e.target!.result as ArrayBuffer);
      };
      reader.onerror = () => reject(reader.error ?? new Error("قراءة الملف فشلت"));
      reader.readAsArrayBuffer(file);
    });

  const clearProgress = (key: string) =>
    setTimeout(() => setUploadProgress(p => { const n = { ...p }; delete n[key]; return n; }), 2500);

  /* ─── Resumable server push helper (fire-and-forget, non-blocking) ─── */
  const pushToServerResumable = (subjId: string, buf: ArrayBuffer, type: "voice" | "curriculum", meta: Record<string, string>) => {
    const key = `${type}_${subjId}`;
    const uploader = new ResumableUploader();
    uploader.upload({
      key,
      type,
      meta,
      buffer: buf,
      pusherId: user.email,
      onProgress: (e) => {
        setResumableProgress(p => ({ ...p, [key]: e }));
        if (e.phase === "done" || e.phase === "error") {
          setTimeout(() => setResumableProgress(p => { const n = { ...p }; delete n[key]; return n; }), 4000);
        }
      },
    }).catch(() => { /* silently queued — server may be offline */ });
  };

  /* ─── VOICE PROFILE UPLOAD ─── */
  const uploadVoice = async (subjId: string, file: File) => {
    const pKey = `voice_${subjId}`;
    setUploadingVoice(subjId);
    setUploadProgress(p => ({ ...p, [pKey]: 0 }));
    try {
      const buf = await readFileWithProgress(file, pKey);
      await storeVoiceModel(subjId, buf, file.name);
      setUploadProgress(p => ({ ...p, [pKey]: 100 }));
      const all = getSubjects();
      const s = all.find(x => x.id === subjId); if (s) { s.voiceProfileId = `voice_${subjId}`; }
      saveSubjects(all);
      const voiceSubj = all.find(x => x.id === subjId);
      if (voiceSubj) void syncEngine.pushSubject(voiceSubj);
      /* Resumable server upload (non-blocking) */
      pushToServerResumable(subjId, buf, "voice", { name: file.name, type: file.type });
      toast(`✅ تم رفع البصمة الصوتية: ${file.name}`, "success");
    } catch (err) {
      toast("❌ فشل رفع الملف الصوتي — تحقق من المساحة المتاحة", "error");
      console.error("[uploadVoice]", err);
    } finally {
      setUploadingVoice(null);
      clearProgress(pKey);
      refresh();
    }
  };

  /* ─── CURRICULUM FILE UPLOAD ─── */
  const uploadCurriculum = async (subjId: string, file: File) => {
    const pKey = `curr_${subjId}`;
    setUploadingCurr(subjId);
    setUploadProgress(p => ({ ...p, [pKey]: 0 }));
    try {
      const buf = await readFileWithProgress(file, pKey);
      await storeCurriculumFile(subjId, buf, file.name, file.type);
      setUploadProgress(p => ({ ...p, [pKey]: 100 }));
      const all = getSubjects();
      const s = all.find(x => x.id === subjId);
      if (s) { s.curriculumFileId = `curriculum_${subjId}`; s.curriculumFileName = file.name; }
      saveSubjects(all);
      const currSubj = all.find(x => x.id === subjId);
      if (currSubj) void syncEngine.pushSubject(currSubj);
      /* Resumable server upload (non-blocking) */
      pushToServerResumable(subjId, buf, "curriculum", { name: file.name, type: file.type });
      toast(`✅ تم رفع المنهج: ${file.name}`, "success");
    } catch (err) {
      toast("❌ فشل رفع ملف المنهج — تحقق من المساحة المتاحة", "error");
      console.error("[uploadCurriculum]", err);
    } finally {
      setUploadingCurr(null);
      clearProgress(pKey);
      refresh();
    }
  };

  /* ─── VIDEO FILE UPLOAD ─── */
  const uploadVideo = async (subjId: string, file: File) => {
    const MB = file.size / 1_048_576;
    if (MB > 500) { toast("❌ حجم الملف أكبر من 500 MB — اختر ملفاً أصغر", "error"); return; }
    const pKey = `video_${subjId}`;
    setUploadingVideo(subjId);
    setUploadProgress(p => ({ ...p, [pKey]: 0 }));
    try {
      const buf = await readFileWithProgress(file, pKey);
      await storeVideoFile(subjId, buf, file.name, file.type);
      setUploadProgress(p => ({ ...p, [pKey]: 100 }));
      const all = getSubjects();
      const s = all.find(x => x.id === subjId);
      if (s) { s.videoFileId = `video_${subjId}`; s.videoFileName = file.name; }
      saveSubjects(all);
      const vidSubj = all.find(x => x.id === subjId);
      if (vidSubj) void syncEngine.pushSubject(vidSubj);
      /* Video: resumable upload via chunks — supports pause/resume on large files */
      pushToServerResumable(subjId, buf, "curriculum", { name: file.name, type: file.type, isVideo: "1" });
      toast(`✅ تم رفع الفيديو: ${file.name} (${MB.toFixed(1)} MB)`, "success");
    } catch (err) {
      toast("❌ فشل رفع ملف الفيديو — تحقق من المساحة المتاحة", "error");
      console.error("[uploadVideo]", err);
    } finally {
      setUploadingVideo(null);
      clearProgress(pKey);
      refresh();
    }
  };

  /* ─── Security / Audit Log ─── */
  const [auditLogs,      setAuditLogs]      = useState<AuditLog[]>(() => getAuditLogs());
  const [auditFilter,    setAuditFilter]    = useState<"all" | "suspicious">("all");
  const [auditSearch,    setAuditSearch]    = useState("");
  const refreshAuditLogs = () => setAuditLogs(getAuditLogs());

  const EVENT_LABELS: Record<string, string> = {
    login_success:        "✅ تسجيل دخول ناجح",
    login_failed:         "❌ محاولة دخول فاشلة",
    logout:               "🚪 تسجيل خروج",
    account_locked:       "🔒 قفل الحساب",
    account_unlocked:     "🔓 فتح الحساب",
    register:             "📝 تسجيل حساب جديد",
    permission_change:    "⚙️ تغيير صلاحيات",
    subscription_change:  "💳 تغيير الاشتراك",
    password_reset_request: "🔑 طلب استعادة كلمة مرور",
    session_expired:      "⏱️ انتهاء الجلسة تلقائياً",
  };

  const filteredAuditLogs = auditLogs.filter(l => {
    if (auditFilter === "suspicious" && !l.suspicious) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.trim().toLowerCase();
      if (!l.email.toLowerCase().includes(q) && !l.name.toLowerCase().includes(q) && !(l.details ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ─── Subscription plan helpers ─── */
  const refreshPlans = () => setPlans(getPlans());

  const openNewPlan = () => {
    setPlanForm({ ...EMPTY_PLAN });
    setEditPlanId(null);
    setPlanModalOpen(true);
  };

  const openEditPlan = (p: SubscriptionPlan) => {
    setPlanForm({ name: p.name, durationDays: p.durationDays, price: p.price, features: [...p.features], color: p.color });
    setEditPlanId(p.id);
    setPlanModalOpen(true);
  };

  const savePlan = () => {
    if (!planForm.name.trim()) { toast("اسم الباقة مطلوب", "error"); return; }
    const all = getPlans();
    if (editPlanId) {
      const updated = all.map(p => p.id === editPlanId ? { ...p, ...planForm } : p);
      savePlans(updated);
      toast("تم تحديث الباقة ✅", "success");
    } else {
      all.push({ id: `plan_${Date.now()}`, ...planForm, createdAt: new Date().toLocaleString("ar-SA") });
      savePlans(all);
      toast("تمت إضافة الباقة ✅", "success");
    }
    refreshPlans();
    setPlanModalOpen(false);
  };

  const deletePlan = (id: string) => {
    if (!confirm("حذف هذه الباقة نهائياً؟")) return;
    savePlans(getPlans().filter(p => p.id !== id));
    refreshPlans();
  };

  const doRenew = async () => {
    if (!renewModalStudent || !renewPlanId) { toast("اختر باقة أولاً", "error"); return; }
    const plan = getPlans().find(p => p.id === renewPlanId);
    if (!plan) return;
    renewStudentSubscription(renewModalStudent.id, plan);
    toast(`تم تفعيل اشتراك ${renewModalStudent.name} بـ "${plan.name}" ✅`, "success");
    setRenewModalStudent(null);
    setRenewPlanId("");
    refresh();
    /* Push to server immediately so student's device picks it up on next sync */
    try {
      const { syncEngine } = await import("../lib/sync-engine");
      await syncEngine.pushSubscriptions();
    } catch { /* non-fatal — next auto-sync will cover it */ }
  };

  /* ─── NAV / STATS ─── */
  const pendingRecoveryCount = recoveryRequests.filter(r => r.status === "pending").length;
  const activeSubCount = getStudents().filter(s => isStudentSubscribed(s)).length;
  const NAV: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: "home",          icon: "🏠",  label: "الرئيسية" },
    { id: "subjects",      icon: "📚",  label: "المواد التعليمية" },
    { id: "schools",       icon: "🏫",  label: "المدارس" },
    { id: "sadmins",       icon: "👔",  label: "مديرو المدارس" },
    { id: "teachers",      icon: "👨‍🏫", label: "الأساتذة" },
    { id: "students",      icon: "👨‍🎓", label: "الطلاب" },
    { id: "parents",       icon: "👨‍👩‍👧", label: "أولياء الأمور" },
    { id: "support",       icon: "🎧",  label: "فريق الدعم الفني" },
    { id: "orders",        icon: "🛒",  label: "طلبات الاشتراك", badge: getOrderRequests().filter(o => o.status === "pending").length },
    { id: "premium",       icon: "💎",  label: "المحتوى المميز" },
    { id: "subscriptions", icon: "💳",  label: "الاشتراكات", badge: activeSubCount },
    { id: "recovery",      icon: "🔑",  label: "استعادة الحساب", badge: pendingRecoveryCount },
    { id: "security",      icon: "🛡️",  label: "سجل النشاط الأمني" },
    { id: "diagnostics",   icon: "⚙️",  label: "تشخيص النظام" },
    { id: "announcements", icon: "📢",  label: "الإعلانات" },
    { id: "messages",      icon: "💬",  label: "المراسلات" },
    { id: "settings",      icon: "🔧",  label: "إعدادات المنصة" },
    { id: "profile",       icon: "👤",  label: "الملف الشخصي" },
  ];

  const stats = [
    { icon: "📚", label: "المواد",         value: subjects.length,  color: "var(--accent)" },
    { icon: "🏫", label: "المدارس",        value: schools.length,   color: "var(--primary)" },
    { icon: "👨‍🏫", label: "الأساتذة",     value: teachers.length,  color: "var(--success)" },
    { icon: "👨‍🎓", label: "الطلاب",       value: students.length,  color: "var(--secondary)" },
  ];

  const filteredSubjects = subjects.filter(s => {
    if (subjFilter.schoolId !== "all" && s.schoolId !== "all" && s.schoolId !== subjFilter.schoolId) return false;
    if (subjFilter.grade !== 0 && s.grade !== subjFilter.grade) return false;
    if (subjSearch.trim()) {
      const q = subjSearch.trim().toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const SchoolSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select className="form-control" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">اختر المدرسة</option>
      {getSchools().filter(s => s.status === "active").map(s => (
        <option key={s.id} value={s.id}>{SCHOOL_TYPE_ICONS[s.type]} {s.name} — {s.city}</option>
      ))}
    </select>
  );

  const label12 = { display: "block" as const, fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 as const };
  const card    = { background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 20 } as const;

  return (
    <div>
      <nav className="main-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🎓</span>
          <span style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>لوحة تحكم المدير</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <UserAvatar name={user.name} src={localPhoto} size={36} border="2px solid var(--primary)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          <LanguageSwitcher compact />
          <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>خروج</button>
        </div>
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, padding: "24px", maxWidth: 1400, margin: "0 auto" }} className="two-col">
        <aside className="sidebar" style={{ height: "fit-content" }}>
          <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, padding: "0 4px" }}>القائمة</div>
          {NAV.map(n => (
            <button key={n.id} className={`menu-link ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}
              style={{ position: "relative" }}>
              <span>{n.icon}</span>{n.label}
              {!!n.badge && n.badge > 0 && (
                <span style={{ position: "absolute", top: 6, insetInlineStart: 8, minWidth: 18, height: 18, borderRadius: 9, background: "var(--danger)", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                  {n.badge}
                </span>
              )}
            </button>
          ))}
          <div style={{ marginTop: 16, padding: 12, background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", fontSize: 12, textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>⚡</div>HybridRuntime<br />Offline-First
          </div>
        </aside>

        <main>

          {/* ── HOME ── */}
          {tab === "home" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>مرحباً، <span style={{ color: "var(--primary)" }}>{user.name}</span> 👋</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>إدارة شاملة لجميع عناصر المنصة التعليمية</p>
              <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
                {stats.map(s => (
                  <div key={s.label} className="stat-card">
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{s.icon}</div>
                    <div><div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div><div style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.label}</div></div>
                  </div>
                ))}
              </div>
              <div style={card}>
                <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>🏆 آخر نتائج الاختبارات</h4>
                {records.length === 0
                  ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "30px 0" }}>لا توجد نتائج بعد</p>
                  : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="data-table">
                        <thead><tr><th>الطالب</th><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th></tr></thead>
                        <tbody>
                          {records.slice(-8).reverse().map((r, i) => (
                            <tr key={i}>
                              <td>{r.studentEmail}</td><td>{r.examTitle}</td>
                              <td><strong style={{ color: "var(--success)" }}>{r.score}/{r.maxScore}</strong></td>
                              <td><span className={`badge ${r.percentage >= 60 ? "badge-success" : "badge-danger"}`}>{r.percentage}%</span></td>
                              <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.completedAt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* ── SUBJECTS ── */}
          {tab === "subjects" && (
            <div className="fade-in">
              {/* ── Hidden file inputs (one per type, outside .map so refs are stable) ── */}
              <input ref={voiceInputRef} type="file" accept=".bin,.onnx,.model,.pt,.pth,.wav,.mp3"
                style={{ display: "none" }}
                onChange={async e => {
                  const f = e.target.files?.[0]; const id = pendingVoiceIdRef.current;
                  if (f && id) await uploadVoice(id, f);
                  e.target.value = ""; pendingVoiceIdRef.current = null;
                }} />
              <input ref={currInputRef} type="file" accept=".pdf,.epub"
                style={{ display: "none" }}
                onChange={async e => {
                  const f = e.target.files?.[0]; const id = pendingCurrIdRef.current;
                  if (f && id) await uploadCurriculum(id, f);
                  e.target.value = ""; pendingCurrIdRef.current = null;
                }} />
              <input ref={videoInputRef} type="file" accept=".mp4,.webm,.mkv,.mov,.avi"
                style={{ display: "none" }}
                onChange={async e => {
                  const f = e.target.files?.[0]; const id = pendingVideoIdRef.current;
                  if (f && id) await uploadVideo(id, f);
                  e.target.value = ""; pendingVideoIdRef.current = null;
                }} />

              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>📚 إدارة المواد التعليمية</h2>

              {/* ── Manifest v2 Status Panel ──────────────────────────────── */}
              <div style={{ ...card, marginBottom: 20, padding: 16, borderRight: "3px solid var(--primary)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>📋</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Asset Manifest v2</span>
                    {manifestStatus && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", background: "rgba(108,99,255,0.1)", padding: "2px 8px", borderRadius: 10 }}>
                        v{manifestStatus.version}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void runManifestScan()}
                    disabled={manifestLoading}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: manifestLoading ? "default" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                    <span style={{ display: "inline-block", animation: manifestLoading ? "spin 1s linear infinite" : "none" }}>🔄</span>
                    {manifestLoading ? "جارٍ…" : "فحص التحديثات"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center" }}>
                  {manifestStatus ? (
                    <>
                      <span>📁 {manifestStatus.subjects} مادة</span>
                      <span>🗂️ {manifestStatus.totalFiles} ملف</span>
                      <span>🕐 {manifestStatus.lastUpdate > 0 ? new Date(manifestStatus.lastUpdate).toLocaleDateString("ar-EG") : "لا يوجد"}</span>
                    </>
                  ) : (
                    <span>لا توجد ملفات في الـ manifest بعد — ارفع ملفاً لتوليده تلقائياً</span>
                  )}
                  {manifestScanMsg && (
                    <span style={{ color: manifestScanMsg.startsWith("✅") ? "var(--success)" : manifestScanMsg.startsWith("❌") ? "var(--danger)" : "var(--primary)", fontWeight: 600 }}>
                      {manifestScanMsg}
                    </span>
                  )}
                </div>
              </div>

              {/* Subject form — Create only (Edit opens as modal) */}
              <div style={{ ...card, marginBottom: 20 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>➕ إنشاء مادة تعليمية جديدة</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {/* Name */}
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={label12}>اسم المادة *</label>
                    <input className="form-control" placeholder="مثال: الرياضيات" value={subjForm.name} onChange={e => setSubjForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  {/* Icon picker */}
                  <div>
                    <label style={label12}>أيقونة المادة</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                      {SUBJECT_ICONS.map(ic => (
                        <button key={ic} type="button" onClick={() => setSubjForm(f => ({ ...f, icon: ic }))}
                          style={{ width: 34, height: 34, fontSize: 18, borderRadius: 6, border: subjForm.icon === ic ? "2px solid var(--primary)" : "1px solid var(--border)", background: subjForm.icon === ic ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer" }}>
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Description */}
                  <div>
                    <label style={label12}>وصف المادة</label>
                    <input className="form-control" placeholder="وصف مختصر للمادة..." value={subjForm.description} onChange={e => setSubjForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  {/* Stage */}
                  <div>
                    <label style={label12}>المرحلة الدراسية *</label>
                    <select className="form-control" value={subjForm.stage} onChange={e => { const s = e.target.value as AcademicStage; setSubjForm(f => ({ ...f, stage: s, grade: GRADES_BY_STAGE[s][0]!, track: s === "secondary" ? "science" : "all" })); }}>
                      {(Object.keys(STAGE_LABELS) as AcademicStage[]).map(s => (
                        <option key={s} value={s}>{STAGE_ICONS[s]} {STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  {/* Grade */}
                  <div>
                    <label style={label12}>الصف الدراسي *</label>
                    <select className="form-control" value={subjForm.grade} onChange={e => setSubjForm(f => ({ ...f, grade: Number(e.target.value) }))}>
                      {GRADES_BY_STAGE[subjForm.stage].map(g => (
                        <option key={g} value={g}>الصف {g === 1 ? "الأول" : g === 2 ? "الثاني" : g === 3 ? "الثالث" : g === 4 ? "الرابع" : g === 5 ? "الخامس" : "السادس"}</option>
                      ))}
                    </select>
                  </div>
                  {/* Track */}
                  <div>
                    <label style={label12}>المسار / الشعبة</label>
                    <select className="form-control" value={subjForm.track} onChange={e => setSubjForm(f => ({ ...f, track: e.target.value as AcademicTrack | "all" }))}>
                      <option value="all">جميع المسارات</option>
                      {subjForm.stage === "secondary" && (
                        <>
                          <option value="science">🔬 علمي</option>
                          <option value="arts">📖 أدبي</option>
                          <option value="commerce">💼 تجاري</option>
                          <option value="general">🌍 عام</option>
                        </>
                      )}
                    </select>
                  </div>
                  {/* School scope */}
                  <div>
                    <label style={label12}>نطاق المدرسة</label>
                    <select className="form-control" value={subjForm.schoolId} onChange={e => setSubjForm(f => ({ ...f, schoolId: e.target.value }))}>
                      <option value="all">جميع المدارس</option>
                      {schools.filter(s => s.status === "active").map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Teacher assignment */}
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={label12}>الأساتذة المعيّنون ({subjForm.teacherIds.length} محدد)</label>
                    {teachers.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>لا يوجد أساتذة بعد</p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                        {teachers.map(t => {
                          const sel = subjForm.teacherIds.includes(t.id);
                          return (
                            <button key={t.id} type="button" onClick={() => setSubjForm(f => ({ ...f, teacherIds: sel ? f.teacherIds.filter(id => id !== t.id) : [...f.teacherIds, t.id] }))}
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, border: `2px solid ${sel ? "var(--primary)" : "var(--border)"}`, background: sel ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: sel ? 700 : 400 }}>
                              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(t.name)}`} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                              {t.name} — {t.spec}
                              {sel && <span style={{ color: "var(--primary)" }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Buttons — create only; editing is via the modal */}
                  <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
                    <button onClick={saveSubj} style={{ flex: 1, padding: 11, background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      ➕ إنشاء المادة
                    </button>
                  </div>
                </div>
              </div>

              {/* Filter bar — School + Grade + Search */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <select className="form-control" style={{ flex: "0 0 auto", minWidth: 180 }} value={subjFilter.schoolId} onChange={e => setSubjFilter(f => ({ ...f, schoolId: e.target.value }))}>
                  <option value="all">🏫 جميع المدارس</option>
                  {schools.filter(sc => sc.status === "active").map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
                <select className="form-control" style={{ flex: "0 0 auto", minWidth: 140 }} value={subjFilter.grade} onChange={e => setSubjFilter(f => ({ ...f, grade: Number(e.target.value) }))}>
                  <option value={0}>جميع الصفوف</option>
                  {[1,2,3,4,5,6].map(g => <option key={g} value={g}>الصف {g === 1 ? "الأول" : g === 2 ? "الثاني" : g === 3 ? "الثالث" : g === 4 ? "الرابع" : g === 5 ? "الخامس" : "السادس"}</option>)}
                </select>
                <input className="form-control" type="search" placeholder="🔍 بحث باسم المادة..." style={{ flex: 1, minWidth: 140 }} value={subjSearch} onChange={e => setSubjSearch(e.target.value)} />
                <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {filteredSubjects.length}/{subjects.length} مادة
                </span>
              </div>

              {/* Subject list */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
                {filteredSubjects.length === 0 && <p style={{ color: "var(--text-muted)", gridColumn: "1/-1", textAlign: "center", padding: "40px 0" }}>{subjects.length === 0 ? "لا توجد مواد — أنشئ أول مادة أعلاه" : "لا توجد نتائج للفلتر المحدد"}</p>}
                {filteredSubjects.map(s => {
                  const assignedTeachers = teachers.filter(t => s.teacherIds.includes(t.id));
                  const qCount = getQuestions().filter(q => q.subjectId === s.id).length;
                  const eCount = getExams().filter(e => e.subjectId === s.id).length;
                  return (
                    <div key={s.id} style={{ ...card, opacity: s.status === "active" ? 1 : 0.6, border: `1px solid ${s.status === "active" ? "var(--glass-border)" : "rgba(255,71,87,0.2)"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 36 }}>{s.icon}</span>
                        <span className={`badge ${s.status === "active" ? "badge-success" : "badge-danger"}`}>{s.status === "active" ? "نشطة" : "مؤرشفة"}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{s.description}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        <span className="badge badge-info">{STAGE_LABELS[s.stage]} ص{s.grade}</span>
                        {s.track !== "all" && <span className="badge badge-warning">{TRACK_LABELS[s.track as AcademicTrack]}</span>}
                        {s.schoolId !== "all" && <span className="badge" style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-muted)" }}>🏫 {schoolNames[s.schoolId] ?? s.schoolId}</span>}
                        {qCount > 0 && <span className="badge badge-success">❓ {qCount} سؤال</span>}
                        {eCount > 0 && <span className="badge badge-success">📝 {eCount} اختبار</span>}
                      </div>

                      {/* Assigned teachers */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الأساتذة المعيّنون:</div>
                        {assignedTeachers.length === 0 ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>لم يُعيَّن أحد</span>
                        ) : (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {assignedTeachers.map(t => <span key={t.id} className="badge badge-primary">{t.name}</span>)}
                          </div>
                        )}
                      </div>

                      {/* Quick teacher assign toggles */}
                      {teachers.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>تعيين أستاذ سريع:</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {teachers.map(t => {
                              const assigned = s.teacherIds.includes(t.id);
                              return (
                                <button key={t.id} onClick={() => toggleTeacherAssign(s.id, t.id)}
                                  style={{ padding: "3px 8px", borderRadius: 12, border: `1px solid ${assigned ? "var(--success)" : "var(--border)"}`, background: assigned ? "rgba(0,200,150,0.1)" : "transparent", color: assigned ? "var(--success)" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                                  {assigned ? "✓" : "+"} {t.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Upload sections — require specific school assignment */}
                      {s.schoolId === "all" ? (
                        <div style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(255,165,2,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(255,165,2,0.35)", fontSize: 12, color: "var(--warning)", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>⚠️</span>
                          <span>لتفعيل رفع الملفات، عيّن مدرسة محددة — اضغط <strong>✏️ تعديل</strong></span>
                        </div>
                      ) : (
                        <>
                          {/* Voice profile upload */}
                          <div style={{ marginBottom: 8, padding: 10, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--glass-border)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>🎙 البصمة الصوتية للمدرس</div>
                            {s.voiceProfileId ? (
                              <div style={{ fontSize: 11, color: "var(--success)", marginBottom: 4 }}>✅ تم رفع الملف الصوتي</div>
                            ) : (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>لم يتم الرفع بعد</div>
                            )}
                            {uploadingVoice === s.id ? (
                              <UploadProgressBar pct={uploadProgress[`voice_${s.id}`] ?? 0} color="var(--primary)" />
                            ) : (
                              <button
                                onClick={() => { pendingVoiceIdRef.current = s.id; voiceInputRef.current?.click(); }}
                                style={{ padding: "5px 10px", background: "rgba(108,99,255,0.15)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                                {s.voiceProfileId ? "🔄 تحديث" : "📤 رفع"}
                              </button>
                            )}
                          </div>

                          {/* Curriculum upload */}
                          <div style={{ marginBottom: 8, padding: 10, background: "rgba(0,200,150,0.04)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--glass-border)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>📄 ملف المنهج (PDF/EPUB)</div>
                            {s.curriculumFileName ? (
                              <div style={{ fontSize: 11, color: "var(--success)", marginBottom: 4 }}>✅ {s.curriculumFileName}</div>
                            ) : (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>لم يتم الرفع بعد</div>
                            )}
                            {uploadingCurr === s.id ? (
                              <UploadProgressBar pct={uploadProgress[`curr_${s.id}`] ?? 0} color="var(--success)" />
                            ) : (
                              <button
                                onClick={() => { pendingCurrIdRef.current = s.id; currInputRef.current?.click(); }}
                                style={{ padding: "5px 10px", background: "rgba(0,200,150,0.12)", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", color: "var(--success)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                                {s.curriculumFileId ? "🔄 تحديث" : "📤 رفع"}
                              </button>
                            )}
                          </div>

                          {/* Video upload */}
                          <div style={{ marginBottom: 12, padding: 10, background: "rgba(255,165,2,0.04)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--glass-border)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>🎬 فيديو الدرس (MP4/WEBM/AVI — حتى 500 MB)</div>
                            {s.videoFileName ? (
                              <div style={{ fontSize: 11, color: "var(--success)", marginBottom: 4 }}>✅ {s.videoFileName}</div>
                            ) : (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>لم يتم الرفع بعد</div>
                            )}
                            {uploadingVideo === s.id ? (
                              <UploadProgressBar pct={uploadProgress[`video_${s.id}`] ?? 0} color="var(--warning)" />
                            ) : (
                              <button
                                onClick={() => { pendingVideoIdRef.current = s.id; videoInputRef.current?.click(); }}
                                style={{ padding: "5px 10px", background: "rgba(255,165,2,0.12)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", color: "var(--warning)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                                {s.videoFileId ? "🔄 تحديث" : "📤 رفع"}
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Lessons button */}
                      <button
                        onClick={() => setLessonModal({ id: s.id, name: s.name })}
                        style={{ width: "100%", marginBottom: 8, padding: "7px 0", background: "rgba(0,200,150,0.08)", border: "1px solid var(--success)", borderRadius: 6, color: "var(--success)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        📚 دروس الكتاب
                      </button>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => startEditSubj(s)} style={{ flex: 1, padding: "7px 0", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: 6, color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✏️ تعديل</button>
                        <button onClick={() => toggleSubjStatus(s.id)} style={{ flex: 1, padding: "7px 0", background: s.status === "active" ? "rgba(255,165,2,0.1)" : "rgba(0,200,150,0.1)", border: `1px solid ${s.status === "active" ? "var(--warning)" : "var(--success)"}`, borderRadius: 6, color: s.status === "active" ? "var(--warning)" : "var(--success)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                          {s.status === "active" ? "🗄 أرشفة" : "✅ تفعيل"}
                        </button>
                        <button onClick={() => deleteSubj(s.id)} style={{ padding: "7px 10px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── EDIT SUBJECT MODAL ── */}
              {/* ── LESSON MANAGER MODAL ── */}
              {lessonModal && (
                <LessonManager
                  subjectId={lessonModal.id}
                  subjectName={lessonModal.name}
                  onClose={() => setLessonModal(null)}
                />
              )}

              {editModalOpen && editSubjId && (
                <div
                  onClick={e => { if (e.target === e.currentTarget) cancelEditSubj(); }}
                  style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                  <div style={{ background: "var(--card)", borderRadius: "var(--radius)", padding: 28, width: "min(620px,95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>✏️ تعديل المادة</h3>
                      <button onClick={cancelEditSubj} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      {/* Name */}
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={label12}>اسم المادة *</label>
                        <input className="form-control" placeholder="مثال: الرياضيات" value={subjForm.name} onChange={e => setSubjForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      {/* Icon picker */}
                      <div>
                        <label style={label12}>أيقونة المادة</label>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                          {SUBJECT_ICONS.map(ic => (
                            <button key={ic} type="button" onClick={() => setSubjForm(f => ({ ...f, icon: ic }))}
                              style={{ width: 34, height: 34, fontSize: 18, borderRadius: 6, border: subjForm.icon === ic ? "2px solid var(--primary)" : "1px solid var(--border)", background: subjForm.icon === ic ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer" }}>
                              {ic}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Description */}
                      <div>
                        <label style={label12}>وصف المادة</label>
                        <input className="form-control" placeholder="وصف مختصر..." value={subjForm.description} onChange={e => setSubjForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                      {/* Stage */}
                      <div>
                        <label style={label12}>المرحلة الدراسية *</label>
                        <select className="form-control" value={subjForm.stage} onChange={e => { const st = e.target.value as AcademicStage; setSubjForm(f => ({ ...f, stage: st, grade: GRADES_BY_STAGE[st][0]!, track: st === "secondary" ? "science" : "all" })); }}>
                          {(Object.keys(STAGE_LABELS) as AcademicStage[]).map(st => (
                            <option key={st} value={st}>{STAGE_ICONS[st]} {STAGE_LABELS[st]}</option>
                          ))}
                        </select>
                      </div>
                      {/* Grade */}
                      <div>
                        <label style={label12}>الصف الدراسي *</label>
                        <select className="form-control" value={subjForm.grade} onChange={e => setSubjForm(f => ({ ...f, grade: Number(e.target.value) }))}>
                          {GRADES_BY_STAGE[subjForm.stage].map(g => (
                            <option key={g} value={g}>الصف {g === 1 ? "الأول" : g === 2 ? "الثاني" : g === 3 ? "الثالث" : g === 4 ? "الرابع" : g === 5 ? "الخامس" : "السادس"}</option>
                          ))}
                        </select>
                      </div>
                      {/* Track */}
                      <div>
                        <label style={label12}>المسار / الشعبة</label>
                        <select className="form-control" value={subjForm.track} onChange={e => setSubjForm(f => ({ ...f, track: e.target.value as AcademicTrack | "all" }))}>
                          <option value="all">جميع المسارات</option>
                          {subjForm.stage === "secondary" && (
                            <>
                              <option value="science">🔬 علمي</option>
                              <option value="arts">📖 أدبي</option>
                              <option value="commerce">💼 تجاري</option>
                              <option value="general">🌍 عام</option>
                            </>
                          )}
                        </select>
                      </div>
                      {/* School scope */}
                      <div>
                        <label style={label12}>نطاق المدرسة *</label>
                        <select className="form-control" value={subjForm.schoolId} onChange={e => setSubjForm(f => ({ ...f, schoolId: e.target.value }))}>
                          <option value="all">⚠️ جميع المدارس (لن يُفعَّل الرفع)</option>
                          {schools.filter(sc => sc.status === "active").map(sc => (
                            <option key={sc.id} value={sc.id}>{sc.name}</option>
                          ))}
                        </select>
                        {subjForm.schoolId === "all" && (
                          <p style={{ fontSize: 11, color: "var(--warning)", margin: "4px 0 0" }}>⚠️ اختر مدرسة محددة لتفعيل رفع الملفات</p>
                        )}
                      </div>
                      {/* Teacher assignment */}
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={label12}>الأساتذة المعيّنون ({subjForm.teacherIds.length} محدد)</label>
                        {teachers.length === 0 ? (
                          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>لا يوجد أساتذة بعد</p>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                            {teachers.map(t => {
                              const sel = subjForm.teacherIds.includes(t.id);
                              return (
                                <button key={t.id} type="button" onClick={() => setSubjForm(f => ({ ...f, teacherIds: sel ? f.teacherIds.filter(id => id !== t.id) : [...f.teacherIds, t.id] }))}
                                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, border: `2px solid ${sel ? "var(--primary)" : "var(--border)"}`, background: sel ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: sel ? 700 : 400 }}>
                                  <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(t.name)}`} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                                  {t.name} — {t.spec}
                                  {sel && <span style={{ color: "var(--primary)" }}>✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {/* Buttons */}
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
                        <button onClick={saveSubj} style={{ flex: 1, padding: 13, background: "linear-gradient(135deg,var(--warning),#cc8800)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                          💾 حفظ التعديلات
                        </button>
                        <button onClick={cancelEditSubj} style={{ padding: "13px 22px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SCHOOLS ── */}
          {tab === "schools" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>🏫 إدارة المدارس</h2>
              <form onSubmit={editSchool ? handleUpdateSchool : handleAddSchool} style={{ ...card, marginBottom: 28 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editSchool ? "✏️ تعديل بيانات المدرسة" : "➕ إضافة مدرسة جديدة"}</h4>
                <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={label12}>اسم المدرسة *</label>
                    <input className="form-control" placeholder="مثال: مدرسة النور الثانوية" value={schoolForm.name} onChange={e => setSchoolForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={label12}>نوع المدرسة *</label>
                    <select className="form-control" value={schoolForm.type} onChange={e => setSchoolForm(f => ({ ...f, type: e.target.value as SchoolType }))}>
                      {(Object.keys(SCHOOL_TYPE_LABELS) as SchoolType[]).map(t => <option key={t} value={t}>{SCHOOL_TYPE_ICONS[t]} {SCHOOL_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label12}>المدينة *</label>
                    <input className="form-control" placeholder="مثال: الرياض" value={schoolForm.city} onChange={e => setSchoolForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <label style={label12}>اسم المدير/ة</label>
                    <input className="form-control" placeholder="اسم مدير المدرسة" value={schoolForm.principal} onChange={e => setSchoolForm(f => ({ ...f, principal: e.target.value }))} />
                  </div>
                  <div>
                    <label style={label12}>رقم الهاتف</label>
                    <input className="form-control" placeholder="05XXXXXXXX" value={schoolForm.phone} onChange={e => setSchoolForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
                    <button type="submit" style={{ flex: 1, padding: 11, background: editSchool ? "linear-gradient(135deg,var(--warning),#cc8800)" : "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      {editSchool ? "💾 حفظ التعديلات" : "➕ إضافة المدرسة"}
                    </button>
                    {editSchool && <button type="button" onClick={cancelEdit} style={{ padding: "11px 20px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>إلغاء</button>}
                  </div>
                </div>
              </form>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                {getSchools().map(s => {
                  const sCnt = students.filter(st => st.schoolId === s.id).length;
                  const tCnt = teachers.filter(t => t.schoolId === s.id).length;
                  const aCnt = sadmins.filter(a => a.schoolId === s.id).length;
                  return (
                    <div key={s.id} style={{ ...card, border: `1px solid ${s.status === "active" ? "var(--glass-border)" : "rgba(255,71,87,0.2)"}`, opacity: s.status === "active" ? 1 : 0.65 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ fontSize: 36 }}>{SCHOOL_TYPE_ICONS[s.type]}</div>
                        <span className={`badge ${s.status === "active" ? "badge-success" : "badge-danger"}`}>{s.status === "active" ? "نشطة" : "متوقفة"}</span>
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{s.name}</h4>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                        <span className="badge badge-primary">{SCHOOL_TYPE_ICONS[s.type]} {SCHOOL_TYPE_LABELS[s.type]}</span>
                        <span className="badge badge-info">📍 {s.city}</span>
                      </div>
                      {s.principal && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>👤 المدير/ة: <strong>{s.principal}</strong></p>}
                      {s.phone && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>📞 {s.phone}</p>}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        <span className="badge badge-success">{sCnt} طالب</span>
                        <span className="badge badge-info">{tCnt} أستاذ</span>
                        <span className="badge badge-warning">{aCnt} مدير</span>
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>أُنشئت: {s.createdAt}</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => startEditSchool(s)} style={{ flex: 1, padding: "7px 0", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: 6, color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✏️ تعديل</button>
                        <button onClick={() => toggleSchoolStatus(s.id)} style={{ flex: 1, padding: "7px 0", background: s.status === "active" ? "rgba(255,165,2,0.1)" : "rgba(0,200,150,0.1)", border: `1px solid ${s.status === "active" ? "var(--warning)" : "var(--success)"}`, borderRadius: 6, color: s.status === "active" ? "var(--warning)" : "var(--success)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{s.status === "active" ? "🚫 إيقاف" : "✅ تفعيل"}</button>
                        <button onClick={() => deleteSchool(s.id)} style={{ padding: "7px 10px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SCHOOL ADMINS ── */}
          {tab === "sadmins" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👔 مديرو المدارس</h2>
              <form onSubmit={addSAdmin} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24, ...card }} className="form-grid">
                <h4 style={{ gridColumn: "1/-1", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>➕ إضافة مدير مدرسة جديد</h4>
                <input className="form-control" placeholder="الاسم الكامل" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
                <input type="email" className="form-control" placeholder="البريد الإلكتروني" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
                <input type="password" className="form-control" placeholder="كلمة المرور" value={userForm.pass} onChange={e => setUserForm(f => ({ ...f, pass: e.target.value }))} />
                <SchoolSelect value={userForm.school} onChange={v => setUserForm(f => ({ ...f, school: v }))} />
                <button type="submit" disabled={loading} style={{ gridColumn: "1/-1", padding: 11, background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{loading ? "جاري..." : "➕ إضافة"}</button>
              </form>
              <div style={{ overflowX: "auto", ...card }}>
                {getSAdmins().length === 0 ? <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 0" }}>لا يوجد مديرو مدارس بعد</p> : (
                  <table className="data-table">
                    <thead><tr><th>الاسم</th><th>البريد</th><th>المدرسة</th><th>الانضمام</th><th>الإجراءات</th></tr></thead>
                    <tbody>{getSAdmins().map(s => (<tr key={s.id}><td style={{ display: "flex", alignItems: "center", gap: 8 }}><img src={avatarUrl(s.name)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />{s.name}</td><td>{s.email}</td><td>{s.schoolName}</td><td style={{ color: "var(--text-muted)", fontSize: 12 }}>{s.joinedAt}</td><td><button onClick={() => deleteSAdmin(s.id)} style={{ padding: "5px 12px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑 حذف</button></td></tr>))}</tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── TEACHERS ── */}
          {tab === "teachers" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👨‍🏫 الأساتذة</h2>
              <form onSubmit={addTeacher} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24, ...card }} className="form-grid">
                <h4 style={{ gridColumn: "1/-1", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>➕ إضافة أستاذ جديد</h4>
                <input className="form-control" placeholder="الاسم الكامل" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
                <input type="email" className="form-control" placeholder="البريد الإلكتروني" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
                <input type="password" className="form-control" placeholder="كلمة المرور" value={userForm.pass} onChange={e => setUserForm(f => ({ ...f, pass: e.target.value }))} />
                <input className="form-control" placeholder="التخصص (مثال: رياضيات)" value={userForm.spec} onChange={e => setUserForm(f => ({ ...f, spec: e.target.value }))} />
                <div style={{ gridColumn: "1/-1" }}><SchoolSelect value={userForm.school} onChange={v => setUserForm(f => ({ ...f, school: v }))} /></div>
                <button type="submit" disabled={loading} style={{ gridColumn: "1/-1", padding: 11, background: "linear-gradient(135deg,var(--success),#00a07a)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{loading ? "جاري..." : "➕ إضافة أستاذ"}</button>
              </form>
              <div style={{ overflowX: "auto", ...card }}>
                {getTeachers().length === 0 ? <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 0" }}>لا يوجد أساتذة بعد</p> : (
                  <table className="data-table">
                    <thead><tr><th>الاسم</th><th>البريد</th><th>التخصص</th><th>المدرسة</th><th>المواد</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                    <tbody>{getTeachers().map(t => (
                      <tr key={t.id}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}><img src={avatarUrl(t.name)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />{t.name}</td>
                        <td>{t.email}</td><td>{t.spec}</td><td>{t.schoolName}</td>
                        <td><span className="badge badge-info">{t.assignedSubjectIds.length} مادة</span></td>
                        <td><span className={`badge ${t.status === "active" ? "badge-success" : "badge-danger"}`}>{t.status === "active" ? "فعّال" : "محظور"}</span></td>
                        <td style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => toggleTeacher(t.id)} style={{ padding: "5px 10px", background: "rgba(255,165,2,0.1)", border: "1px solid var(--warning)", borderRadius: 6, color: "var(--warning)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{t.status === "active" ? "🚫" : "✅"}</button>
                          <button onClick={() => deleteTeacher(t.id)} style={{ padding: "5px 10px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>🗑</button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── STUDENTS ── */}
          {tab === "students" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👨‍🎓 الطلاب</h2>
              <div style={{ overflowX: "auto", ...card }}>
                {getStudents().length === 0 ? <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 0" }}>لا يوجد طلاب مسجلون بعد</p> : (
                  <table className="data-table">
                    <thead><tr><th>الاسم</th><th>البريد</th><th>المدرسة</th><th>المرحلة / الصف</th><th>المسار</th><th>الحالة</th><th>الانضمام</th><th>الإجراءات</th></tr></thead>
                    <tbody>{getStudents().map(s => (
                      <tr key={s.id}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}><img src={avatarUrl(s.name)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />{s.name}</td>
                        <td>{s.email}</td><td>{s.schoolName}</td>
                        <td><span className="badge badge-info">{STAGE_LABELS[s.stage] ?? "—"} ص{s.grade ?? "—"}</span></td>
                        <td><span className="badge badge-warning">{TRACK_LABELS[s.track] ?? "—"}</span></td>
                        <td><span className={`badge ${s.status === "active" ? "badge-success" : "badge-danger"}`}>{s.status === "active" ? "فعّال" : "محظور"}</span></td>
                        <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{s.joinedAt}</td>
                        <td><button onClick={() => deleteStudent(s.id)} style={{ padding: "5px 12px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑 حذف</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── PARENTS ── */}
          {tab === "parents" && (
            <ParentAdminPanel card={card} />
          )}

          {/* ── SUPPORT AGENTS ── */}
          {tab === "support" && (
            <SupportAdminPanel card={card} />
          )}

          {/* ── ORDERS (طلبات الاشتراك) ── */}
          {tab === "orders" && (
            <OrdersAdminPanel adminEmail={user.email} card={card} />
          )}

          {/* ── PREMIUM SUBJECTS (المحتوى المميز) ── */}
          {tab === "premium" && (
            <PremiumSubjectsPanel card={card} />
          )}

          {/* ── RECOVERY REQUESTS ── */}
          {tab === "recovery" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🔑 طلبات استعادة الحساب</h2>
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    الطلبات مخزنة محلياً وتظهر فقط لمدير النظام
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span className="badge badge-danger">{recoveryRequests.filter(r => r.status === "pending").length} معلّق</span>
                  <span className="badge badge-success">{recoveryRequests.filter(r => r.status === "resolved").length} تمّت معالجته</span>
                  <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>{recoveryRequests.filter(r => r.status === "dismissed").length} مرفوض</span>
                </div>
              </div>

              {recoveryRequests.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
                  <p style={{ fontSize: 15 }}>لا توجد طلبات استعادة حتى الآن</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[...recoveryRequests].reverse().map(req => {
                    /* WhatsApp link with pre-filled message */
                    const waNum    = req.whatsapp.replace(/\D/g, "");
                    const waText   = req.tempPassword
                      ? encodeURIComponent(`مرحباً ${req.name}،\n\nبخصوص طلب استعادة حسابك في منصة التعليم الذكية:\n\nكلمة المرور المؤقتة الخاصة بك هي: *${req.tempPassword}*\n\nيرجى تسجيل الدخول وتغيير كلمة مرورك فوراً.`)
                      : encodeURIComponent(`مرحباً ${req.name}،\n\nتم استلام طلب استعادة حسابك في منصة التعليم الذكية.\nسنتواصل معك قريباً.`);
                    const waLink   = `https://wa.me/${waNum}?text=${waText}`;

                    const statusColor = req.status === "pending" ? "var(--warning)" : req.status === "resolved" ? "var(--success)" : "var(--text-muted)";
                    const statusLabel = req.status === "pending" ? "⏳ معلّق" : req.status === "resolved" ? "✅ تمّت المعالجة" : "❌ مرفوض";

                    return (
                      <div key={req.id} style={{ padding: 18, background: "var(--card)", borderRadius: "var(--radius)", border: `1px solid ${req.status === "pending" ? "rgba(255,165,2,0.3)" : "var(--glass-border)"}`, opacity: req.status === "dismissed" ? 0.55 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>👤 {req.name}</div>
                            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>📅 {req.createdAt}</div>
                          </div>
                          <span style={{ padding: "4px 12px", borderRadius: 20, background: `${statusColor}22`, color: statusColor, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{statusLabel}</span>
                        </div>

                        {/* WhatsApp number + link */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "10px 14px", background: "rgba(37,211,102,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(37,211,102,0.2)" }}>
                          <span style={{ fontSize: 20 }}>📱</span>
                          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>{req.whatsapp}</span>
                          <a href={waLink} target="_blank" rel="noreferrer"
                            style={{ marginRight: "auto", padding: "5px 14px", background: "#25D366", border: "none", borderRadius: 20, color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            💬 واتساب
                          </a>
                        </div>

                        {/* Temp password (if resolved) */}
                        {req.tempPassword && (
                          <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(108,99,255,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>كلمة المرور المؤقتة:</span>
                            <code style={{ fontSize: 15, fontWeight: 800, color: "var(--primary)", letterSpacing: 2, background: "rgba(108,99,255,0.12)", padding: "2px 10px", borderRadius: 6, display: tempPassVisible[req.id] ? "inline" : "none" }}>
                              {req.tempPassword}
                            </code>
                            {!tempPassVisible[req.id] && <span style={{ fontSize: 13 }}>••••••••</span>}
                            <button onClick={() => setTempPassVisible(v => ({ ...v, [req.id]: !v[req.id] }))}
                              style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                              {tempPassVisible[req.id] ? "🙈 إخفاء" : "👁 عرض"}
                            </button>
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {req.status === "pending" && (
                            <>
                              <button onClick={() => void sendTempPassword(req)}
                                style={{ padding: "7px 16px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                                🔑 إرسال كلمة مرور مؤقتة
                              </button>
                              <button onClick={() => dismissRequest(req.id)}
                                style={{ padding: "7px 14px", background: "rgba(255,71,87,0.08)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                                ✕ رفض
                              </button>
                            </>
                          )}
                          {req.status === "resolved" && req.tempPassword && (
                            <a href={waLink} target="_blank" rel="noreferrer"
                              style={{ padding: "7px 16px", background: "#25D366", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                              📨 إرسال عبر واتساب
                            </a>
                          )}
                          <button onClick={() => deleteRequest(req.id)}
                            style={{ padding: "7px 12px", background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.3)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── SUBSCRIPTIONS TAB ── */}
          {tab === "subscriptions" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>💳 إدارة الاشتراكات</h2>
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>أنشئ باقات الاشتراك وفعّل اشتراكات الطلاب يدوياً</p>
                </div>
                <button onClick={openNewPlan}
                  style={{ padding: "10px 20px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
                  + إضافة باقة جديدة
                </button>
              </div>

              {/* Sync subscriptions to server */}
              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  onClick={async () => {
                    setSyncingSubscriptions(true);
                    try {
                      const { manualSync } = await import("../lib/sync-engine").then(m => ({ manualSync: () => m.syncEngine.manualSync(undefined) }));
                      await manualSync();
                      toast("✅ تم مزامنة الاشتراكات مع السيرفر بنجاح", "success");
                    } catch { toast("⚠️ تعذّرت مزامنة الاشتراكات — تحقق من الاتصال", "error"); }
                    finally { setSyncingSubscriptions(false); }
                  }}
                  disabled={syncingSubscriptions}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 20px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: syncingSubscriptions ? "default" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                  <span style={{ display: "inline-block", animation: syncingSubscriptions ? "spin 1s linear infinite" : "none" }}>🔄</span>
                  {syncingSubscriptions ? "جارٍ المزامنة…" : "مزامنة الاشتراكات مع السيرفر"}
                </button>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>يُرسل بيانات الاشتراك للطلاب عبر التزامن التلقائي</span>
              </div>

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
                {[
                  { label: "إجمالي الباقات", value: plans.length, icon: "📋", color: "var(--primary)" },
                  { label: "اشتراكات نشطة", value: getStudents().filter(s => isStudentSubscribed(s)).length, icon: "✅", color: "var(--success)" },
                  { label: "بدون اشتراك", value: getStudents().filter(s => !isStudentSubscribed(s)).length, icon: "⏳", color: "var(--warning)" },
                ].map(st => (
                  <div key={st.label} style={{ ...card, textAlign: "center", padding: 18 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{st.icon}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: st.color }}>{st.value}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{st.label}</div>
                  </div>
                ))}
              </div>

              {/* Plans list */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-muted)" }}>📋 الباقات المتاحة</h3>
              {plans.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
                  <p>لا توجد باقات بعد — اضغط "إضافة باقة جديدة" للبدء</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16, marginBottom: 32 }}>
                  {plans.map(p => (
                    <div key={p.id} style={{ ...card, borderTop: `3px solid ${p.color}`, padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>⏱ {p.durationDays} يوم</span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: p.color }}>{p.price > 0 ? `${p.price} ج.م` : "مجاناً"}</div>
                      </div>
                      <ul style={{ margin: "8px 0 14px", padding: "0 16px", fontSize: 12, color: "var(--text-muted)", lineHeight: 2 }}>
                        {p.features.filter(Boolean).map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEditPlan(p)} style={{ flex: 1, padding: "7px 0", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>✏️ تعديل</button>
                        <button onClick={() => deletePlan(p.id)} style={{ padding: "7px 12px", background: "rgba(255,71,87,0.08)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 12 }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Students subscription status */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: "var(--text-muted)" }}>👨‍🎓 حالة اشتراك الطلاب</h3>
              <div style={{ overflowX: "auto", ...card }}>
                {getStudents().length === 0 ? (
                  <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 0" }}>لا يوجد طلاب مسجلون بعد</p>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>الطالب</th><th>المدرسة</th><th>حالة الاشتراك</th><th>الباقة</th><th>تاريخ الانتهاء</th><th>تفعيل/تجديد</th></tr></thead>
                    <tbody>{getStudents().map(s => {
                      const active = isStudentSubscribed(s);
                      const expiry = s.expiryDate ? new Date(s.expiryDate).toLocaleDateString("ar-SA") : "—";
                      const daysLeft = s.expiryDate ? Math.ceil((new Date(s.expiryDate).getTime() - Date.now()) / 86400000) : null;
                      return (
                        <tr key={s.id}>
                          <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <img src={avatarUrl(s.name)} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                            {s.name}
                          </td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.schoolName}</td>
                          <td>
                            {active
                              ? <span className="badge badge-success">✅ نشط {daysLeft !== null && daysLeft <= 7 ? `(${daysLeft} أيام)` : ""}</span>
                              : !s.subscriptionStatus || s.subscriptionStatus === "none"
                                ? <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>⏳ بدون اشتراك</span>
                                : <span className="badge badge-danger">❌ منتهي</span>
                            }
                          </td>
                          <td style={{ fontSize: 12 }}>{s.planName ?? "—"}</td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{expiry}</td>
                          <td>
                            <button onClick={() => { setRenewModalStudent({ id: s.id, name: s.name }); setRenewPlanId(plans[0]?.id ?? ""); }}
                              style={{ padding: "6px 14px", background: active ? "rgba(108,99,255,0.1)" : "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: active ? "1px solid var(--primary)" : "none", borderRadius: 6, color: active ? "var(--primary)" : "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                              {active ? "🔄 تجديد" : "🔑 تفعيل"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── SECURITY AUDIT LOG ── */}
          {tab === "security" && (
            <div className="fade-in">
              {/* Header */}
              <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>🛡️ سجل النشاط الأمني</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
                    سجل كامل لجميع أحداث الدخول، المحاولات الفاشلة، وتغييرات الصلاحيات.
                    السجلات المميزة باللون الأحمر تشير إلى نشاط مريب.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => { refreshAuditLogs(); toast("تم تحديث السجل ✅", "success"); }}
                    style={{ padding: "8px 16px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    🔄 تحديث
                  </button>
                  <button
                    onClick={() => { if (!confirm("حذف جميع سجلات النشاط الأمني نهائياً؟")) return; clearAuditLogs(); refreshAuditLogs(); toast("تم مسح السجل", "info"); }}
                    style={{ padding: "8px 16px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    🗑️ مسح السجل
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { icon: "📊", label: "إجمالي الأحداث",    value: auditLogs.length,                              color: "var(--primary)" },
                  { icon: "❌", label: "محاولات فاشلة",     value: auditLogs.filter(l => l.type === "login_failed").length,  color: "var(--warning)" },
                  { icon: "🔒", label: "حسابات مقفلة",     value: auditLogs.filter(l => l.type === "account_locked").length, color: "var(--danger)" },
                  { icon: "⚠️", label: "أنشطة مريبة",      value: auditLogs.filter(l => l.suspicious).length,   color: "var(--danger)" },
                ].map(s => (
                  <div key={s.label} style={{ ...card, textAlign: "center", padding: 14 }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                    <strong style={{ display: "block", fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</strong>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Filter + Search */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text" className="form-control" placeholder="🔍 بحث بالبريد أو الاسم..."
                  value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 220 }} />
                <div style={{ display: "flex", borderRadius: "var(--radius-sm)", background: "var(--card)", padding: 3, border: "1px solid var(--glass-border)" }}>
                  {(["all", "suspicious"] as const).map(f => (
                    <button key={f}
                      onClick={() => setAuditFilter(f)}
                      style={{
                        padding: "6px 14px", border: "none", cursor: "pointer", borderRadius: 6,
                        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                        background: auditFilter === f ? (f === "suspicious" ? "var(--danger)" : "var(--primary)") : "transparent",
                        color: auditFilter === f ? "#fff" : "var(--text-muted)",
                      }}>
                      {f === "all" ? "🌐 الكل" : "⚠️ مريبة فقط"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audit Log Table */}
              {filteredAuditLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
                  <p style={{ fontSize: 14 }}>{auditFilter === "suspicious" ? "لا توجد أنشطة مريبة" : "لا توجد سجلات بعد"}</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredAuditLogs.map(log => (
                    <div key={log.id} style={{
                      ...card,
                      padding: "12px 16px",
                      borderRight: `4px solid ${log.suspicious ? "var(--danger)" : log.type === "login_success" ? "var(--success)" : log.type === "account_locked" ? "var(--danger)" : "var(--glass-border)"}`,
                      background: log.suspicious ? "rgba(255,71,87,0.06)" : "var(--card)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        {/* Event + email */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: log.suspicious ? "var(--danger)" : log.type === "login_success" ? "var(--success)" : "var(--text)" }}>
                              {EVENT_LABELS[log.type] ?? log.type}
                            </span>
                            {log.suspicious && (
                              <span style={{ fontSize: 10, padding: "2px 8px", background: "var(--danger)", color: "#fff", borderRadius: 12, fontWeight: 700 }}>
                                ⚠️ مريب
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
                            📧 <strong>{log.email}</strong>
                            {log.name && log.name !== log.email && ` — ${log.name}`}
                          </div>
                          {log.details && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontStyle: "italic" }}>
                              {log.details}
                            </div>
                          )}
                        </div>

                        {/* Meta: time + device */}
                        <div style={{ textAlign: "end", flexShrink: 0 }}>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                            🕐 {new Date(log.timestamp).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                          </div>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", background: "rgba(108,99,255,0.1)", color: "var(--primary)", borderRadius: 12 }}>
                              {log.device === "mobile" ? "📱" : log.device === "tablet" ? "📟" : "🖥️"} {log.device}
                            </span>
                            <span style={{ fontSize: 10, padding: "2px 8px", background: "rgba(108,99,255,0.1)", color: "var(--primary)", borderRadius: 12 }}>
                              🌐 {log.browser}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination hint */}
              {auditLogs.length >= 50 && (
                <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                  يعرض أحدث {filteredAuditLogs.length} سجل من إجمالي {auditLogs.length} — الحد الأقصى للتخزين: 500 سجل
                </div>
              )}
            </div>
          )}

          {/* ── SYSTEM DIAGNOSTICS ── */}
          {tab === "diagnostics" && (
            <div className="fade-in">
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
                  ⚙️ تشخيص النظام — System Diagnostics
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>
                  مراقبة صحة المحرك المحلي: GPU، Web Workers، التشفير، ومحرك البحث الدلالي.
                  هذه اللوحة مخصصة للمشرفين فقط ولا تظهر للطلاب.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <span className="badge badge-success" style={{ fontSize: 11 }}>🛡️ مدير النظام فقط</span>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>📴 OfflineMediaEngine</span>
                  <span className="badge" style={{ background: "rgba(108,99,255,0.12)", color: "var(--primary)", fontSize: 11 }}>🔒 HybridRuntime Sandbox</span>
                </div>
              </div>
              <OfflineMediaPanel studentEmail={user.email} />
            </div>
          )}

          {tab === "announcements" && (
            <div className="fade-in">
              <AdminAnnouncementsPanel card={card} />
            </div>
          )}

          {/* ── PROFILE ── */}
          {tab === "messages" && (
            <MessageCenter card={card} />
          )}

          {tab === "settings" && (
            <AdminSettingsPanel card={card} />
          )}

          {tab === "profile" && (
            <div className="fade-in" style={{ maxWidth: 480 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>👤 الملف الشخصي</h2>
              <div style={{ ...card, textAlign: "center", marginBottom: 20 }}>
                <UserAvatar name={user.name} src={localPhoto} size={90} border="3px solid var(--primary)" />
                <h3 style={{ marginTop: 12, fontSize: 20, fontWeight: 800 }}>{user.name}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{user.email}</p>
                <span className="badge badge-primary" style={{ marginTop: 6 }}>🛡️ مدير النظام</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 0 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ textAlign: "center", ...card, padding: 16 }}>
                    <strong style={{ display: "block", fontSize: 20, color: s.color }}>{s.value}</strong>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}</span>
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

      {/* ══ PLAN CRUD MODAL ══ */}
      {planModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setPlanModalOpen(false); }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>{editPlanId ? "✏️ تعديل الباقة" : "➕ إضافة باقة جديدة"}</h3>

            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>اسم الباقة *</label>
            <input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))}
              placeholder="مثال: باقة شهرية"
              style={{ width: "100%", padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, marginBottom: 14, boxSizing: "border-box" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>المدة (بالأيام)</label>
                <select value={planForm.durationDays} onChange={e => setPlanForm(f => ({ ...f, durationDays: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontFamily: "inherit", fontSize: 14 }}>
                  <option value={30}>شهر (30 يوم)</option>
                  <option value={90}>فصل دراسي (90 يوم)</option>
                  <option value={180}>نصف سنة (180 يوم)</option>
                  <option value={365}>سنة كاملة (365 يوم)</option>
                  <option value={7}>أسبوع تجريبي (7 أيام)</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>السعر (ج.م) — 0 = مجاني</label>
                <input type="number" min={0} value={planForm.price} onChange={e => setPlanForm(f => ({ ...f, price: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>لون البطاقة</label>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {["#6c63ff","#00d2ff","#f0a500","#ff6584","#43e97b","#4facfe"].map(c => (
                <button key={c} onClick={() => setPlanForm(f => ({ ...f, color: c }))}
                  style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: planForm.color === c ? "3px solid #fff" : "2px solid transparent", cursor: "pointer", outline: planForm.color === c ? `2px solid ${c}` : "none" }} />
              ))}
            </div>

            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>الميزات (سطر لكل ميزة)</label>
            {planForm.features.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={f} onChange={e => { const arr = [...planForm.features]; arr[i] = e.target.value; setPlanForm(pf => ({ ...pf, features: arr })); }}
                  placeholder={`ميزة ${i + 1}`}
                  style={{ flex: 1, padding: "8px 12px", background: "var(--input-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontFamily: "inherit", fontSize: 13 }} />
                <button onClick={() => setPlanForm(pf => ({ ...pf, features: pf.features.filter((_, j) => j !== i) }))}
                  style={{ background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", padding: "0 10px", fontSize: 14 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setPlanForm(pf => ({ ...pf, features: [...pf.features, ""] }))}
              style={{ fontSize: 12, background: "none", border: "1px dashed var(--glass-border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer", padding: "6px 14px", fontFamily: "inherit", marginBottom: 20 }}>
              + إضافة ميزة
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={savePlan}
                style={{ flex: 1, padding: "11px 0", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
                💾 {editPlanId ? "حفظ التعديلات" : "إنشاء الباقة"}
              </button>
              <button onClick={() => setPlanModalOpen(false)}
                style={{ padding: "11px 20px", background: "rgba(255,71,87,0.08)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SUBSCRIPTION RENEWAL MODAL ══ */}
      {renewModalStudent && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setRenewModalStudent(null); }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 420 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>🔑 تفعيل / تجديد الاشتراك</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>الطالب: <strong style={{ color: "var(--text)" }}>{renewModalStudent.name}</strong></p>

            {plans.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)" }}>
                <p>لا توجد باقات — أنشئ باقة أولاً من تبويب الاشتراكات</p>
              </div>
            ) : (
              <>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>اختر الباقة</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {plans.map(p => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-sm)", border: `2px solid ${renewPlanId === p.id ? p.color : "var(--glass-border)"}`, background: renewPlanId === p.id ? `${p.color}18` : "transparent", cursor: "pointer", transition: "all 0.2s" }}>
                      <input type="radio" name="plan" value={p.id} checked={renewPlanId === p.id} onChange={() => setRenewPlanId(p.id)} style={{ accentColor: p.color }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>⏱ {p.durationDays} يوم · {p.price > 0 ? `${p.price} ج.م` : "مجاناً"}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {renewPlanId && (() => {
                  const p = plans.find(x => x.id === renewPlanId);
                  if (!p) return null;
                  const exp = new Date(); exp.setDate(exp.getDate() + p.durationDays);
                  return (
                    <div style={{ padding: "10px 14px", background: "rgba(67,233,123,0.08)", border: "1px solid rgba(67,233,123,0.25)", borderRadius: "var(--radius-sm)", fontSize: 13, marginBottom: 18, color: "var(--success)" }}>
                      ✅ سينتهي الاشتراك في: <strong>{exp.toLocaleDateString("ar-SA")}</strong>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={doRenew}
                    style={{ flex: 1, padding: "11px 0", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
                    🔑 تفعيل الاشتراك
                  </button>
                  <button onClick={() => setRenewModalStudent(null)}
                    style={{ padding: "11px 20px", background: "rgba(255,71,87,0.08)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

