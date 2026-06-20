/* ─────────────────────────────────────────────────────────────────────────────
 * منصة التعليم الذكية — Database Schema & CRUD
 * Storage: localStorage (metadata) + IndexedDB (binary assets)
 * ───────────────────────────────────────────────────────────────────────────── */

/* ── School types ──────────────────────────────────────────────────────────── */

export type SchoolType = "boys" | "girls" | "mixed" | "primary" | "middle" | "secondary" | "university";

export interface School {
  id: string;
  name: string;
  type: SchoolType;
  city: string;
  principal: string;
  phone: string;
  createdAt: string;
  status: "active" | "inactive";
}

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  boys: "بنين", girls: "بنات", mixed: "مشتركة",
  primary: "ابتدائية", middle: "متوسطة", secondary: "ثانوية", university: "جامعية",
};
export const SCHOOL_TYPE_ICONS: Record<SchoolType, string> = {
  boys: "👦", girls: "👧", mixed: "👫",
  primary: "🏫", middle: "📚", secondary: "🎓", university: "🏛️",
};

/* ── Academic hierarchy ────────────────────────────────────────────────────── */

export type AcademicStage = "primary" | "middle" | "secondary";
export type AcademicTrack = "science" | "arts" | "general" | "commerce";

export const STAGE_LABELS: Record<AcademicStage, string> = {
  primary: "ابتدائي", middle: "الاعدادية", secondary: "ثانوي",
};
export const STAGE_ICONS: Record<AcademicStage, string> = {
  primary: "🏫", middle: "📚", secondary: "🎓",
};
export const TRACK_LABELS: Record<AcademicTrack, string> = {
  science: "علمي", arts: "أدبي", general: "عام", commerce: "تجاري",
};
export const TRACK_ICONS: Record<AcademicTrack, string> = {
  science: "🔬", arts: "📖", general: "🌍", commerce: "💼",
};

/** Valid grade numbers per stage */
export const GRADES_BY_STAGE: Record<AcademicStage, number[]> = {
  primary:   [1, 2, 3, 4, 5, 6],
  middle:    [1, 2, 3],
  secondary: [1, 2, 3],
};

/** Tracks that apply to secondary only; primary & middle are always "general" */
export const TRACKS_BY_STAGE: Record<AcademicStage, AcademicTrack[]> = {
  primary:   ["general"],
  middle:    ["general"],
  secondary: ["science", "arts", "commerce", "general"],
};

/* ── Subject (admin-created) ───────────────────────────────────────────────── */

/** An embedded video lesson (YouTube / Vimeo embed URL) */
export interface EmbedVideo {
  id:          string;   // timestamp-based unique id
  title:       string;
  embedUrl:    string;   // safe embed URL (youtube.com/embed/... or player.vimeo.com/...)
  description: string;
  addedAt:     string;   // ISO 8601
  addedBy:     string;   // teacher name
}

export interface Subject {
  id: string;
  name: string;
  icon: string;
  description: string;
  stage: AcademicStage;
  grade: number;               // 1-6 primary / 1-3 middle|secondary
  track: AcademicTrack | "all"; // "all" = applies to every track in this stage
  schoolId: string | "all";    // "all" = platform-wide
  teacherIds: number[];        // IDs of assigned teachers
  voiceProfileId: string | null;   // IDB key for teacher voice model blob
  curriculumFileId: string | null; // IDB key for PDF/EPUB curriculum
  curriculumFileName: string | null;
  videoFileId: string | null;      // IDB key for lesson video blob
  videoFileName: string | null;
  createdAt: string;
  createdBy: string;           // admin email
  status: "active" | "archived";
  /* ── i18n multilingual fields (optional, additive) ── */
  name_ar?: string;
  name_en?: string;
  description_ar?: string;
  description_en?: string;
  /* ── Embed video lessons (additive) ── */
  videos?: EmbedVideo[];
}

/* ── Question (teacher-owned) ──────────────────────────────────────────────── */

export interface Question {
  id: string;
  subjectId: string;
  teacherId: number;
  text: string;
  options: [string, string, string, string];
  correctIndex: number; // 0–3
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  createdAt: string;
  /* ── i18n multilingual fields (optional, additive) ── */
  text_ar?: string;
  text_en?: string;
  options_ar?: [string, string, string, string];
  options_en?: [string, string, string, string];
  explanation_ar?: string;
  explanation_en?: string;
}

export const DIFFICULTY_LABELS: Record<Question["difficulty"], string> = {
  easy: "سهل", medium: "متوسط", hard: "صعب",
};
export const DIFFICULTY_COLORS: Record<Question["difficulty"], string> = {
  easy: "var(--success)", medium: "var(--warning)", hard: "var(--danger)",
};

/* ── Exam (teacher-owned) ──────────────────────────────────────────────────── */

export interface Exam {
  id: string;
  subjectId: string;
  teacherId: number;
  title: string;
  description: string;
  questionIds: string[];
  durationMinutes: number;
  passingPct: number; // e.g. 60
  stage: AcademicStage;
  grade: number;
  track: AcademicTrack | "all";
  schoolId?: string;           // undefined | "all" = platform-wide; otherwise school-scoped
  status: "draft" | "published";
  createdAt: string;
  /* ── i18n multilingual fields (optional, additive) ── */
  title_ar?: string;
  title_en?: string;
  description_ar?: string;
  description_en?: string;
}

/* ── Users ─────────────────────────────────────────────────────────────────── */

/* ── Subscription Plans ────────────────────────────────────────────────────── */

export interface SubscriptionPlan {
  id: string;
  name: string;          // e.g. "باقة شهرية"
  durationDays: number;  // 30 | 90 | 180 | 365
  price: number;         // in local currency (display only)
  features: string[];    // list of feature strings
  color: string;         // badge/card accent color
  createdAt: string;
}

export const getPlans  = (): SubscriptionPlan[] => DB.get<SubscriptionPlan[]>("subscription_plans", []);
export const savePlans = (d: SubscriptionPlan[]) => DB.set("subscription_plans", d);

/** A message sent by admin/teacher to a student */
export interface Message {
  id:      string;    // nanoid / timestamp string
  from:    string;    // sender display name (e.g. "الإدارة" / teacher name)
  content: string;
  date:    string;    // ISO 8601
  read?:   boolean;   // undefined = unread
}

export interface Student {
  id: number;
  name: string;
  email: string;
  passHash: string;
  schoolId: string;
  schoolName: string;
  stage: AcademicStage;
  grade: number;
  track: AcademicTrack;
  joinedAt: string;
  status: "active" | "blocked";
  subscriptionStatus?: "active" | "expired" | "none";
  expiryDate?: string | null;   // ISO date string
  planId?: string | null;
  planName?: string | null;
  messages?: Message[];         // inbox — appended by admin/teacher, read by student
}

/** Returns true if the student has a valid (non-expired) subscription */
export function isStudentSubscribed(student: Student): boolean {
  if (!student.subscriptionStatus || student.subscriptionStatus === "none") return false;
  if (student.subscriptionStatus === "expired") return false;
  if (!student.expiryDate) return false;
  return new Date(student.expiryDate) >= new Date();
}

/** Activate / renew subscription for a student and persist immediately */
export function renewStudentSubscription(
  studentId: number,
  plan: SubscriptionPlan,
): void {
  const students = getStudents();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + plan.durationDays);
  const updated = students.map(s =>
    s.id === studentId
      ? { ...s, subscriptionStatus: "active" as const, expiryDate: expiry.toISOString(), planId: plan.id, planName: plan.name }
      : s,
  );
  saveStudents(updated);
}

export interface Teacher {
  id: number;
  name: string;
  email: string;
  passHash: string;
  spec: string;
  schoolId: string;
  schoolName: string;
  assignedSubjectIds: string[];
  joinedAt: string;
  status: "active" | "blocked";
  avatarUrl?: string;  // base64 data URL — set via ProfileSettingsPanel
}

export interface SchoolAdmin {
  id: number;
  name: string;
  email: string;
  passHash: string;
  schoolId: string;
  schoolName: string;
  joinedAt: string;
  status: "active" | "blocked";
}

export interface ExamRecord {
  id: number;
  studentEmail: string;
  examId?: string;       // references Exam.id (null for legacy records)
  examTitle: string;
  subjectId?: string;
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  durationMs: number;
  completedAt: string;
}

/* ── localStorage micro-ORM ────────────────────────────────────────────────── */

const DB = {
  get: <T>(k: string, def: T): T => {
    try { return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? def; } catch { return def; }
  },
  set: <T>(k: string, v: T): void => { localStorage.setItem(k, JSON.stringify(v)); },
};

/* ── School CRUD ───────────────────────────────────────────────────────────── */

const DEFAULT_SCHOOLS: School[] = [
  { id: "1", name: "مدرسة الفرسان الثانوية",  type: "boys",  city: "الرياض", principal: "أحمد محمد",   phone: "0501234567", createdAt: "2024/01/01", status: "active" },
  { id: "2", name: "مدرسة الأمل الابتدائية",  type: "girls", city: "جدة",    principal: "فاطمة علي",   phone: "0509876543", createdAt: "2024/01/01", status: "active" },
  { id: "3", name: "مدرسة التميز الثانوية",   type: "mixed", city: "الدمام", principal: "خالد عبدالله", phone: "0551234567", createdAt: "2024/01/01", status: "active" },
];

export const getSchools    = (): School[] => {
  const s = DB.get<School[]>("schools", []);
  if (s.length === 0) { DB.set("schools", DEFAULT_SCHOOLS); return DEFAULT_SCHOOLS; }
  return s;
};
export const saveSchools   = (d: School[]) => DB.set("schools", d);
export const getSchoolById = (id: string): School | undefined => getSchools().find(s => s.id === id);
export const getSchoolNames = (): Record<string, string> =>
  Object.fromEntries(getSchools().map(s => [s.id, s.name]));

/* ── Subject CRUD ──────────────────────────────────────────────────────────── */

const DEFAULT_SUBJECTS: Subject[] = [
  {
    id: "subj_math_s1", name: "الرياضيات", icon: "📐", description: "الجبر، الهندسة، التحليل",
    stage: "secondary", grade: 1, track: "all", schoolId: "all", teacherIds: [],
    voiceProfileId: null, curriculumFileId: null, curriculumFileName: null, videoFileId: null, videoFileName: null,
    createdAt: "2024/01/01", createdBy: "system", status: "active",
  },
  {
    id: "subj_physics_s1", name: "الفيزياء", icon: "⚛️", description: "الميكانيكا، الكهرباء، البصريات",
    stage: "secondary", grade: 1, track: "science", schoolId: "all", teacherIds: [],
    voiceProfileId: null, curriculumFileId: null, curriculumFileName: null, videoFileId: null, videoFileName: null,
    createdAt: "2024/01/01", createdBy: "system", status: "active",
  },
  {
    id: "subj_arabic_m1", name: "اللغة العربية", icon: "📖", description: "النحو، البلاغة، الأدب",
    stage: "middle", grade: 1, track: "all", schoolId: "all", teacherIds: [],
    voiceProfileId: null, curriculumFileId: null, curriculumFileName: null, videoFileId: null, videoFileName: null,
    createdAt: "2024/01/01", createdBy: "system", status: "active",
  },
  {
    id: "subj_science_p4", name: "العلوم", icon: "🧪", description: "الكائنات الحية، الفيزياء التطبيقية",
    stage: "primary", grade: 4, track: "general", schoolId: "all", teacherIds: [],
    voiceProfileId: null, curriculumFileId: null, curriculumFileName: null, videoFileId: null, videoFileName: null,
    createdAt: "2024/01/01", createdBy: "system", status: "active",
  },
];

export const getSubjects    = (): Subject[] => {
  const s = DB.get<Subject[]>("subjects", []);
  if (s.length === 0) { DB.set("subjects", DEFAULT_SUBJECTS); return DEFAULT_SUBJECTS; }
  return s;
};
export const saveSubjects   = (d: Subject[]) => DB.set("subjects", d);
export const getSubjectById = (id: string): Subject | undefined => getSubjects().find(s => s.id === id);

/** Filter subjects to only those visible to a specific student */
export const getSubjectsForStudent = (student: Student): Subject[] =>
  getSubjects().filter(s => {
    if (s.status !== "active") return false;
    if (s.stage !== student.stage) return false;
    if (s.grade !== student.grade) return false;
    if (s.track !== "all" && s.track !== student.track) return false;
    if (s.schoolId !== "all" && s.schoolId !== student.schoolId) return false;
    return true;
  });

/** Subjects assigned to a specific teacher */
export const getSubjectsForTeacher = (teacher: Teacher): Subject[] =>
  getSubjects().filter(s => s.teacherIds.includes(teacher.id) && s.status === "active");

/* ── Question CRUD ─────────────────────────────────────────────────────────── */

export const getQuestions    = (): Question[] => DB.get<Question[]>("questions", []);
export const saveQuestions   = (d: Question[]) => DB.set("questions", d);
export const getQuestionsBySubject = (subjectId: string, teacherId?: number): Question[] =>
  getQuestions().filter(q => q.subjectId === subjectId && (teacherId == null || q.teacherId === teacherId));

/* ── Exam CRUD ─────────────────────────────────────────────────────────────── */

export const getExams    = (): Exam[] => DB.get<Exam[]>("exams", []);
export const saveExams   = (d: Exam[]) => DB.set("exams", d);
export const getExamsByTeacher = (teacherId: number): Exam[] =>
  getExams().filter(e => e.teacherId === teacherId);
export const getPublishedExamsForStudent = (student: Student): Exam[] =>
  getExams().filter(e => {
    if (e.status !== "published") return false;
    if (e.stage !== student.stage) return false;
    if (e.grade !== student.grade) return false;
    if (e.track !== "all" && e.track !== student.track) return false;
    /* schoolId check: undefined / "all" = platform-wide; otherwise must match */
    if (e.schoolId && e.schoolId !== "all" && e.schoolId !== student.schoolId) return false;
    return true;
  });

/* ── User CRUD ─────────────────────────────────────────────────────────────── */

export const getStudents    = (): Student[]     => DB.get<Student[]>("students", []);
export const getTeachers    = (): Teacher[]     => DB.get<Teacher[]>("teachers", []);
export const getSAdmins     = (): SchoolAdmin[] => DB.get<SchoolAdmin[]>("sadmins", []);
export const getExamRecords = (): ExamRecord[]  => DB.get<ExamRecord[]>("exam_records", []);

export const saveStudents = (d: Student[]): void => {
  DB.set("students", d);
  try { window.dispatchEvent(new CustomEvent("buytuk:students-changed")); } catch { /* non-browser */ }
};
export const saveTeachers    = (d: Teacher[])    => DB.set("teachers", d);
export const saveSAdmins     = (d: SchoolAdmin[]) => DB.set("sadmins", d);
export const saveExamRecords = (d: ExamRecord[]) => DB.set("exam_records", d);

/* ── Recovery Requests ─────────────────────────────────────────────────────── */

export interface RecoveryRequest {
  id: string;
  name: string;          // Full name entered by student
  whatsapp: string;      // WhatsApp number
  createdAt: string;
  status: "pending" | "resolved" | "dismissed";
  resolvedAt?: string;
  tempPassword?: string; // plaintext temp password shown to admin for WhatsApp
}

export const getRecoveryRequests  = (): RecoveryRequest[] => DB.get<RecoveryRequest[]>("recovery_requests", []);
export const saveRecoveryRequests = (d: RecoveryRequest[]) => DB.set("recovery_requests", d);

export function addRecoveryRequest(name: string, whatsapp: string): void {
  const list = getRecoveryRequests();
  list.push({ id: `rec_${Date.now()}`, name, whatsapp, createdAt: new Date().toLocaleString("ar-SA"), status: "pending" });
  saveRecoveryRequests(list);
  /* Broadcast so AdminDashboard can update its badge without reload */
  try { window.dispatchEvent(new CustomEvent("recovery-request-added")); } catch { /* non-browser */ }
}

/* ── Admin auth ────────────────────────────────────────────────────────────── */

export const ADMIN_HASH_KEY = "__admin_hash__";
export const getAdminHash   = (): string | null => localStorage.getItem(ADMIN_HASH_KEY);
export const setAdminHash   = (h: string) => localStorage.setItem(ADMIN_HASH_KEY, h);

/* ── Legacy compat proxy ───────────────────────────────────────────────────── */

export const SCHOOL_NAMES: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, k: string) => getSchoolNames()[k],
  ownKeys: () => getSchools().map(s => s.id),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/* ── IndexedDB helpers for binary assets ───────────────────────────────────── */

const ASSET_DB_NAME    = "ome_assets";
const ASSET_STORE_NAME = "assets";
const ASSET_DB_VERSION = 1;

function openAssetDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME))
        db.createObjectStore(ASSET_STORE_NAME);
    };
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    req.onerror   = ()  => rej(req.error);
  });
}

export async function storeAssetBlob(key: string, data: ArrayBuffer, meta?: Record<string, string>): Promise<void> {
  const db = await openAssetDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(ASSET_STORE_NAME, "readwrite");
    const req = tx.objectStore(ASSET_STORE_NAME).put({ data, meta: meta ?? {} }, key);
    req.onsuccess = () => {
      res();
      try { window.dispatchEvent(new CustomEvent("ome-assets-updated", { detail: { key } })); } catch { /* non-browser env */ }
    };
    req.onerror = () => rej(req.error);
  });
}

export async function loadAssetBlob(key: string): Promise<{ data: ArrayBuffer; meta: Record<string, string> } | null> {
  const db = await openAssetDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(ASSET_STORE_NAME, "readonly");
    const req = tx.objectStore(ASSET_STORE_NAME).get(key);
    req.onsuccess = () => res((req.result as { data: ArrayBuffer; meta: Record<string, string> }) ?? null);
    req.onerror   = () => rej(req.error);
  });
}

export async function deleteAssetBlob(key: string): Promise<void> {
  const db = await openAssetDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(ASSET_STORE_NAME, "readwrite");
    const req = tx.objectStore(ASSET_STORE_NAME).delete(key);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

/** Convenience: store a voice model blob for a subject */
export const storeVoiceModel     = (subjectId: string, buf: ArrayBuffer, name: string) =>
  storeAssetBlob(`voice_${subjectId}`, buf, { name });
export const loadVoiceModel      = (subjectId: string) => loadAssetBlob(`voice_${subjectId}`);
export const storeCurriculumFile = (subjectId: string, buf: ArrayBuffer, name: string, type: string) =>
  storeAssetBlob(`curriculum_${subjectId}`, buf, { name, type });
export const loadCurriculumFile  = (subjectId: string) => loadAssetBlob(`curriculum_${subjectId}`);
export const storeVideoFile      = (subjectId: string, buf: ArrayBuffer, name: string, type: string) =>
  storeAssetBlob(`video_${subjectId}`, buf, { name, type });
export const loadVideoFile       = (subjectId: string) => loadAssetBlob(`video_${subjectId}`);

/* ── Lesson (unit-structured book content) ─────────────────────────────── */

export interface Lesson {
  id: string;
  subjectId: string;
  unitNumber: number;
  unitName: string;
  lessonNumber: number;
  lessonName: string;
  fileId: string | null;
  fileName: string | null;
  fileType: string | null;
  createdAt: string;
  createdBy: string;
  status: "active" | "archived";
}

export const ORDINAL_AR: Record<number, string> = {
  1: "الأولى", 2: "الثانية", 3: "الثالثة", 4: "الرابعة",
  5: "الخامسة", 6: "السادسة", 7: "السابعة", 8: "الثامنة",
  9: "التاسعة", 10: "العاشرة",
};

const LS_LESSONS = "ome_lessons";
export const getLessons  = (): Lesson[] => JSON.parse(localStorage.getItem(LS_LESSONS) ?? "[]");
export const saveLessons = (a: Lesson[]) => localStorage.setItem(LS_LESSONS, JSON.stringify(a));

export const storeLessonFile = (lessonId: string, buf: ArrayBuffer, name: string, type: string) =>
  storeAssetBlob(`lesson_${lessonId}`, buf, { name, type });
export const loadLessonFile  = (lessonId: string) => loadAssetBlob(`lesson_${lessonId}`);

/* ── Gamification: Badges ───────────────────────────────────────────────────── */

export interface Badge {
  id:          string;
  name:        string;
  icon:        string;
  description: string;
  earnedAt:    string; // ISO
}

const BADGE_DEFS: Array<{ id: string; name: string; icon: string; description: string; condition: (r: ExamRecord[]) => string | null }> = [
  { id: "first_exam",  name: "أول خطوة",      icon: "🎯", description: "أكملت اختبارك الأول",         condition: r => r.length >= 1 ? r[0].completedAt : null },
  { id: "first_pass",  name: "النجاح الأول",   icon: "🌟", description: "اجتزت اختباراً بنجاح",        condition: r => { const x = r.find(e => e.percentage >= 60); return x ? x.completedAt : null; } },
  { id: "perfect",     name: "درجة كاملة",     icon: "💯", description: "حصلت على 100% في اختبار",     condition: r => { const x = r.find(e => e.percentage === 100); return x ? x.completedAt : null; } },
  { id: "five_exams",  name: "طالب متميز",     icon: "🏆", description: "أكملت 5 اختبارات",            condition: r => r.length >= 5 ? r[4].completedAt : null },
  { id: "ten_exams",   name: "خبير أكاديمي",   icon: "🎓", description: "أكملت 10 اختبارات",           condition: r => r.length >= 10 ? r[9].completedAt : null },
  { id: "high_avg",    name: "متفوق",           icon: "📈", description: "متوسطك فوق 80% في 5 اختبارات", condition: r => { if (r.length < 5) return null; const avg = r.reduce((s, e) => s + e.percentage, 0) / r.length; return avg >= 80 ? r[r.length - 1].completedAt : null; } },
  { id: "comeback",    name: "العودة القوية",   icon: "🔥", description: "رسبت ثم نجحت في الاختبار التالي", condition: r => { for (let i = 1; i < r.length; i++) { if (r[i-1].percentage < 60 && r[i].percentage >= 60) return r[i].completedAt; } return null; } },
  { id: "consistent",  name: "منتظم",           icon: "⚡", description: "نجحت في 3 اختبارات متتالية",   condition: r => { for (let i = 2; i < r.length; i++) { if (r[i-2].percentage >= 60 && r[i-1].percentage >= 60 && r[i].percentage >= 60) return r[i].completedAt; } return null; } },
];

export function computeStudentPoints(records: ExamRecord[]): number {
  return records.reduce((sum, r) => sum + r.score, 0);
}

export function computeStudentBadges(records: ExamRecord[]): Badge[] {
  const sorted = [...records].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  return BADGE_DEFS
    .map(def => { const at = def.condition(sorted); return at ? { id: def.id, name: def.name, icon: def.icon, description: def.description, earnedAt: at } : null; })
    .filter((b): b is Badge => b !== null);
}

/* ── Announcements ──────────────────────────────────────────────────────────── */

export interface Announcement {
  id:        string;
  title:     string;
  content:   string;
  type:      "info" | "warning" | "success" | "danger";
  active:    boolean;
  createdAt: string;
  createdBy: string;
}

export const getAnnouncements  = (): Announcement[] => DB.get<Announcement[]>("buytuk_announcements", []);
export const saveAnnouncements = (d: Announcement[]) => {
  DB.set("buytuk_announcements", d);
  try { window.dispatchEvent(new CustomEvent("buytuk:announcements-changed")); } catch { /* non-browser */ }
};

/* ── Homework ───────────────────────────────────────────────────────────────── */

export interface Homework {
  id:          string;
  subjectId:   string;
  subjectName: string;
  teacherId:   number;
  teacherName: string;
  title:       string;
  description: string;
  dueDate:     string; // ISO date string
  maxPoints:   number;
  stage:       AcademicStage;
  grade:       number;
  track:       AcademicTrack | "all";
  schoolId:    string;
  createdAt:   string;
  status:      "active" | "closed";
}

export interface HomeworkSubmission {
  id:            string;
  homeworkId:    string;
  studentId:     number;
  studentEmail:  string;
  studentName:   string;
  answer:        string;
  submittedAt:   string;
  grade?:        number;
  feedback?:     string;
}

export const getHomework              = (): Homework[]            => DB.get<Homework[]>("buytuk_homework", []);
export const saveHomework             = (d: Homework[])           => DB.set("buytuk_homework", d);
export const getHomeworkSubmissions   = (): HomeworkSubmission[]  => DB.get<HomeworkSubmission[]>("buytuk_hw_submissions", []);
export const saveHomeworkSubmissions  = (d: HomeworkSubmission[]) => DB.set("buytuk_hw_submissions", d);

export function getHomeworkForStudent(student: Student): Homework[] {
  return getHomework().filter(hw =>
    hw.status === "active" &&
    hw.stage === student.stage &&
    hw.grade === student.grade &&
    (hw.track === "all" || hw.track === student.track) &&
    (hw.schoolId === "all" || hw.schoolId === student.schoolId),
  );
}

/* ── In-app Notifications ───────────────────────────────────────────────────── */

export interface AppNotification {
  id:        string;
  type:      "message" | "homework" | "exam" | "badge" | "announcement";
  title:     string;
  body:      string;
  read:      boolean;
  createdAt: string;
}

const notifKey = (studentId: number) => `buytuk_notifs_${studentId}`;
export const getNotifications  = (studentId: number): AppNotification[] => DB.get<AppNotification[]>(notifKey(studentId), []);
export const saveNotifications = (studentId: number, d: AppNotification[]) => {
  DB.set(notifKey(studentId), d);
  try { window.dispatchEvent(new CustomEvent("buytuk:notifs-changed", { detail: { studentId } })); } catch { /* non-browser */ }
};
export const pushNotification = (studentId: number, notif: Omit<AppNotification, "id" | "read" | "createdAt">) => {
  const all = getNotifications(studentId);
  all.unshift({ ...notif, id: `n_${Date.now()}`, read: false, createdAt: new Date().toISOString() });
  saveNotifications(studentId, all.slice(0, 50)); // keep last 50
};

/* ── Live Sessions ──────────────────────────────────────────────────────────── */

export interface LiveSession {
  id:          string;
  title:       string;
  subjectId:   string;
  subjectName: string;
  teacherId:   number;
  teacherName: string;
  meetingUrl:  string;
  platform:    "zoom" | "meet" | "teams" | "other";
  scheduledAt: string;   // ISO datetime
  durationMin: number;
  stage:       AcademicStage;
  grade:       number;
  track:       AcademicTrack | "all";
  schoolId:    string;
  status:      "upcoming" | "live" | "ended";
  createdAt:   string;
}

export const getLiveSessions  = (): LiveSession[]  => DB.get<LiveSession[]>("buytuk_live_sessions", []);
export const saveLiveSessions = (d: LiveSession[]) => {
  DB.set("buytuk_live_sessions", d);
  try { window.dispatchEvent(new CustomEvent("buytuk:sessions-changed")); } catch { /* non-browser */ }
};
export function getLiveSessionsForStudent(student: Student): LiveSession[] {
  return getLiveSessions().filter(s =>
    s.stage === student.stage &&
    s.grade === student.grade &&
    (s.track === "all" || s.track === student.track) &&
    (s.schoolId === "all" || s.schoolId === student.schoolId),
  );
}

/* ── Attendance ─────────────────────────────────────────────────────────────── */

export interface AttendanceRecord {
  id:          string;
  date:        string;   // YYYY-MM-DD
  subjectId:   string;
  subjectName: string;
  teacherId:   number;
  studentId:   number;
  studentName: string;
  schoolId:    string;
  status:      "present" | "absent" | "late" | "excused";
  note?:       string;
}

export const getAttendance  = (): AttendanceRecord[]  => DB.get<AttendanceRecord[]>("buytuk_attendance", []);
export const saveAttendance = (d: AttendanceRecord[]) => DB.set("buytuk_attendance", d);
export function getAttendanceForStudent(studentId: number): AttendanceRecord[] {
  return getAttendance().filter(a => a.studentId === studentId);
}

/* ── Direct Messages ────────────────────────────────────────────────────────── */

export interface DirectMessage {
  id:       string;
  threadId: string;   // `${Math.min(fromId,toId)}_${Math.max(fromId,toId)}`
  fromId:   number;
  fromName: string;
  fromRole: "student" | "teacher";
  toId:     number;
  toName:   string;
  toRole:   "student" | "teacher";
  body:     string;
  sentAt:   string;
  read:     boolean;
}

export const getDirectMessages  = (): DirectMessage[]  => DB.get<DirectMessage[]>("buytuk_dms", []);
export const saveDirectMessages = (d: DirectMessage[]) => {
  DB.set("buytuk_dms", d);
  try { window.dispatchEvent(new CustomEvent("buytuk:dm-changed")); } catch { /* non-browser */ }
};
export function getThread(idA: number, idB: number): DirectMessage[] {
  const tid = `${Math.min(idA,idB)}_${Math.max(idA,idB)}`;
  return getDirectMessages().filter(m => m.threadId === tid).sort((a,b) => a.sentAt.localeCompare(b.sentAt));
}
export function sendDM(msg: Omit<DirectMessage, "id" | "threadId" | "read" | "sentAt">): void {
  const all = getDirectMessages();
  const tid = `${Math.min(msg.fromId,msg.toId)}_${Math.max(msg.fromId,msg.toId)}`;
  all.push({ ...msg, id: `dm_${Date.now()}`, threadId: tid, read: false, sentAt: new Date().toISOString() });
  saveDirectMessages(all);
}

/* ── Peer Review ────────────────────────────────────────────────────────────── */

export interface PeerReview {
  id:                 string;
  homeworkId:         string;
  reviewerId:         number;
  reviewerName:       string;
  targetSubmissionId: string;
  targetStudentId:    number;
  targetStudentName:  string;
  rating:             1 | 2 | 3 | 4 | 5;
  comment:            string;
  createdAt:          string;
}

export const getPeerReviews  = (): PeerReview[]  => DB.get<PeerReview[]>("buytuk_peer_reviews", []);
export const savePeerReviews = (d: PeerReview[]) => DB.set("buytuk_peer_reviews", d);

/* ── Study Notes ────────────────────────────────────────────────────────────── */

export interface StudyNote {
  id:        string;
  studentId: number;
  subjectId: string;
  subjectName: string;
  title:     string;
  body:      string;
  color:     "default" | "yellow" | "green" | "blue" | "pink";
  createdAt: string;
  updatedAt: string;
}

const notesKey = (studentId: number) => `buytuk_notes_${studentId}`;
export const getStudyNotes  = (studentId: number): StudyNote[] => DB.get<StudyNote[]>(notesKey(studentId), []);
export const saveStudyNotes = (studentId: number, d: StudyNote[]) => DB.set(notesKey(studentId), d);

/* ── Timetable ──────────────────────────────────────────────────────────────── */

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu";

export interface TimetableSlot {
  id:          string;
  subjectId:   string;
  subjectName: string;
  teacherId:   number;
  teacherName: string;
  day:         Weekday;
  startTime:   string;  // "HH:MM" 24h
  endTime:     string;
  room:        string;
  stage:       AcademicStage;
  grade:       number;
  track:       AcademicTrack | "all";
  schoolId:    string;
}

export const getTimetable  = (): TimetableSlot[]  => DB.get<TimetableSlot[]>("buytuk_timetable", []);
export const saveTimetable = (d: TimetableSlot[]) => {
  DB.set("buytuk_timetable", d);
  try { window.dispatchEvent(new CustomEvent("buytuk:timetable-changed")); } catch { /* non-browser */ }
};
export function getTimetableForStudent(student: Student): TimetableSlot[] {
  return getTimetable().filter(s =>
    s.stage === student.stage &&
    s.grade === student.grade &&
    (s.track === "all" || s.track === student.track) &&
    (s.schoolId === "all" || s.schoolId === student.schoolId),
  );
}

/* ── Audio Lessons ──────────────────────────────────────────────────────────── */

export interface AudioLesson {
  id:           string;
  subjectId:    string;
  teacherId:    number;
  teacherName:  string;
  title:        string;
  chapterIndex: number;
  chapterTitle: string;
  durationSec:  number;
  uploadedAt:   string;
}

export const getAudioLessons     = (): AudioLesson[]    => DB.get<AudioLesson[]>("buytuk_audio_lessons", []);
export const saveAudioLessons    = (d: AudioLesson[])   => DB.set("buytuk_audio_lessons", d);
export function getAudioLessonsForSubject(subjectId: string): AudioLesson[] {
  return getAudioLessons().filter(l => l.subjectId === subjectId);
}

/* ── Audio Blob Storage (IndexedDB) ── */
const _AUDIO_DB_NAME    = "buytuk_audio_blobs";
const _AUDIO_BLOB_STORE = "blobs";

function _openAudioDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_AUDIO_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(_AUDIO_BLOB_STORE))
        db.createObjectStore(_AUDIO_BLOB_STORE);
    };
    req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
    req.onerror   = ()  => rej(req.error);
  });
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  const db = await _openAudioDB();
  return new Promise((res, rej) => {
    const req = db.transaction(_AUDIO_BLOB_STORE, "readwrite").objectStore(_AUDIO_BLOB_STORE).put(blob, id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

export async function loadAudioBlob(id: string): Promise<Blob | null> {
  const db = await _openAudioDB();
  return new Promise((res, rej) => {
    const req = db.transaction(_AUDIO_BLOB_STORE, "readonly").objectStore(_AUDIO_BLOB_STORE).get(id);
    req.onsuccess = () => res((req.result as Blob) ?? null);
    req.onerror   = () => rej(req.error);
  });
}

export async function deleteAudioBlob(id: string): Promise<void> {
  const db = await _openAudioDB();
  return new Promise((res, rej) => {
    const req = db.transaction(_AUDIO_BLOB_STORE, "readwrite").objectStore(_AUDIO_BLOB_STORE).delete(id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

/* ── Teacher Ratings ────────────────────────────────────────────────────────── */

export interface TeacherRating {
  id:          string;
  teacherId:   number;
  studentId:   number;
  rating:      1 | 2 | 3 | 4 | 5;
  comment:     string;
  category:    "explanation" | "interaction" | "fairness" | "overall";
  createdAt:   string;
}

export const getTeacherRatings  = (): TeacherRating[]  => DB.get<TeacherRating[]>("buytuk_teacher_ratings", []);
export const saveTeacherRatings = (d: TeacherRating[]) => DB.set("buytuk_teacher_ratings", d);
export function getRatingsForTeacher(teacherId: number): TeacherRating[] {
  return getTeacherRatings().filter(r => r.teacherId === teacherId);
}

/* ── Parent (ولي الأمر) ─────────────────────────────────────────────────────── */

export interface Parent {
  id:        number;
  name:      string;
  email:     string;
  passHash:  string;
  studentId: number;   // links to Student.id
  schoolId:  string;
  joinedAt:  string;
  status:    "active" | "blocked";
  phone?:    string;
}

export const getParents     = (): Parent[]    => DB.get<Parent[]>("buytuk_parents", []);
export const saveParents    = (d: Parent[])   => DB.set("buytuk_parents", d);
export function getParentByEmail(email: string): Parent | undefined {
  return getParents().find(p => p.email.toLowerCase() === email.toLowerCase());
}
export function getParentForStudent(studentId: number): Parent | undefined {
  return getParents().find(p => p.studentId === studentId);
}

/* ── Chapter Progress (تتبع قراءة الفصول) ───────────────────────────────────── */

export interface ChapterProgress {
  id:              string;
  studentId:       number;
  subjectId:       string;
  chapterIndex:    number;
  chapterTitle:    string;
  readAt:          string;       // ISO date of first read
  readDurationSec: number;       // seconds spent
}

export const getChapterProgress     = (): ChapterProgress[]    => DB.get<ChapterProgress[]>("buytuk_chapter_progress", []);
export const saveChapterProgress    = (d: ChapterProgress[])   => DB.set("buytuk_chapter_progress", d);
export function getProgressForStudent(studentId: number, subjectId: string): ChapterProgress[] {
  return getChapterProgress().filter(p => p.studentId === studentId && p.subjectId === subjectId);
}
export function markChapterRead(studentId: number, subjectId: string, chapterIndex: number, chapterTitle: string, durationSec = 0): void {
  const all = getChapterProgress();
  const exists = all.find(p => p.studentId === studentId && p.subjectId === subjectId && p.chapterIndex === chapterIndex);
  if (!exists) {
    all.push({ id: `cp_${Date.now()}`, studentId, subjectId, chapterIndex, chapterTitle, readAt: new Date().toISOString(), readDurationSec: durationSec });
    saveChapterProgress(all);
  }
}

/* ── Chapter Q&A (أسئلة الطلاب على الفصل) ───────────────────────────────────── */

export interface ChapterQA {
  id:           string;
  subjectId:    string;
  chapterIndex: number;
  studentId:    number;
  studentName:  string;
  question:     string;
  answer?:      string;
  teacherId?:   number;
  teacherName?: string;
  askedAt:      string;
  answeredAt?:  string;
  isPublic:     boolean;
}

export const getChapterQAs     = (): ChapterQA[]    => DB.get<ChapterQA[]>("buytuk_chapter_qa", []);
export const saveChapterQAs    = (d: ChapterQA[])   => DB.set("buytuk_chapter_qa", d);
export function getQAsForChapter(subjectId: string, chapterIndex: number): ChapterQA[] {
  return getChapterQAs().filter(q => q.subjectId === subjectId && q.chapterIndex === chapterIndex);
}
export function getQAsForTeacher(subjectId: string): ChapterQA[] {
  return getChapterQAs().filter(q => q.subjectId === subjectId && !q.answer);
}

/* ── Video Notes (ملاحظات الفيديو بطوابع زمنية) ─────────────────────────────── */

export interface VideoNote {
  id:           string;
  studentId:    number;
  subjectId:    string;
  timestampSec: number;
  note:         string;
  color:        "yellow" | "green" | "blue" | "red";
  createdAt:    string;
}

export const getVideoNotes     = (): VideoNote[]    => DB.get<VideoNote[]>("buytuk_video_notes", []);
export const saveVideoNotes    = (d: VideoNote[])   => DB.set("buytuk_video_notes", d);
export function getNotesForSubject(studentId: number, subjectId: string): VideoNote[] {
  return getVideoNotes().filter(n => n.studentId === studentId && n.subjectId === subjectId);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ── Support Desk (نظام الدعم الفني التخصصي) ──────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

export interface SupportAgent {
  id:        number;
  name:      string;
  email:     string;
  passHash:  string;
  joinedAt:  string;
  status:    "active" | "blocked";
  phone?:    string;
}

export interface SupportTicket {
  id:              number;
  ticketRef:       string;   // e.g. "TKT-0001"
  studentId:       number;
  studentName:     string;
  studentEmail:    string;
  subject:         string;
  message:         string;
  status:          "open" | "in_progress" | "resolved" | "closed";
  priority:        "low" | "medium" | "high" | "urgent";
  assignedAgentId?: number;
  createdAt:       string;
  resolvedAt?:     string;
}

export interface TicketReply {
  id:          string;
  ticketId:    number;
  authorId:    number | string;
  authorName:  string;
  authorRole:  "student" | "support" | "admin";
  message:     string;
  createdAt:   string;
}

export interface TicketRating {
  id:        string;
  ticketId:  number;
  studentId: number;
  rating:    1 | 2 | 3 | 4 | 5;
  feedback?: string;
  ratedAt:   string;
}

export const getSupportAgents      = (): SupportAgent[]   => DB.get<SupportAgent[]>  ("buytuk_support_agents",  []);
export const saveSupportAgents     = (d: SupportAgent[])  => DB.set("buytuk_support_agents", d);

export const getSupportTickets     = (): SupportTicket[]  => DB.get<SupportTicket[]> ("buytuk_support_tickets", []);
export const saveSupportTickets    = (d: SupportTicket[]) => DB.set("buytuk_support_tickets", d);

export const getTicketReplies      = (): TicketReply[]    => DB.get<TicketReply[]>   ("buytuk_ticket_replies",  []);
export const saveTicketReplies     = (d: TicketReply[])   => DB.set("buytuk_ticket_replies", d);

export const getTicketRatings      = (): TicketRating[]   => DB.get<TicketRating[]>  ("buytuk_ticket_ratings",  []);
export const saveTicketRatings     = (d: TicketRating[])  => DB.set("buytuk_ticket_ratings", d);

export function generateTicketRef(): string {
  const tickets = getSupportTickets();
  const nextNum = tickets.length + 1;
  return `TKT-${String(nextNum).padStart(4, "0")}`;
}

export function getRepliesForTicket(ticketId: number): TicketReply[] {
  return getTicketReplies().filter(r => r.ticketId === ticketId);
}

export function getRatingForTicket(ticketId: number): TicketRating | undefined {
  return getTicketRatings().find(r => r.ticketId === ticketId);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ── Commercial System (النظام التجاري) ─────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */

/* Add isPremium to Subject — stored as a patch map to avoid breaking Subject[] */
export const getPremiumSubjects = (): Set<string> =>
  new Set(DB.get<string[]>("buytuk_premium_subjects", []));
export const setPremiumSubjects = (ids: string[]) =>
  DB.set("buytuk_premium_subjects", ids);
export function toggleSubjectPremium(subjectId: string): boolean {
  const set = getPremiumSubjects();
  if (set.has(subjectId)) { set.delete(subjectId); }
  else { set.add(subjectId); }
  setPremiumSubjects(Array.from(set));
  return set.has(subjectId);
}
export function isSubjectPremium(subjectId: string): boolean {
  return getPremiumSubjects().has(subjectId);
}

/* ── Order Request (طلب اشتراك) ─────────────────────────────────────────── */

export interface OrderRequest {
  id:            number;
  orderRef:      string;  // e.g. "ORD-0001"
  studentId:     number;
  studentName:   string;
  studentEmail:  string;
  paymentMethod: "bank_transfer" | "vodafone_cash" | "whatsapp_receipt";
  planId?:       string;
  planName?:     string;
  note?:         string;   // student's message / receipt description
  status:        "pending" | "approved" | "rejected";
  createdAt:     string;
  reviewedAt?:   string;
  reviewedBy?:   string;   // admin email
  rejectReason?: string;
}

export const getOrderRequests  = (): OrderRequest[]   => DB.get<OrderRequest[]>("buytuk_order_requests", []);
export const saveOrderRequests = (d: OrderRequest[])  => DB.set("buytuk_order_requests", d);

export function generateOrderRef(): string {
  const orders = getOrderRequests();
  return `ORD-${String(orders.length + 1).padStart(4, "0")}`;
}

export function submitOrderRequest(req: Omit<OrderRequest, "id" | "orderRef" | "status" | "createdAt">): OrderRequest {
  const all = getOrderRequests();
  const order: OrderRequest = {
    ...req,
    id:        Date.now(),
    orderRef:  generateOrderRef(),
    status:    "pending",
    createdAt: new Date().toISOString(),
  };
  saveOrderRequests([...all, order]);
  return order;
}
