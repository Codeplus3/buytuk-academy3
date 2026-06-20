/* ─────────────────────────────────────────────────────────────────────────────
 * HybridSyncEngine — Offline-First delta sync between server and IndexedDB
 *
 * DESIGN RULES (enforced here):
 *  1. Students read ONLY from IDB/localStorage during study & exams — no server
 *     calls are made inside reading paths.
 *  2. The server is a "dumb pipe" — it stores sync records and returns them
 *     on request. No heavy processing server-side.
 *  3. Binary assets (PDFs, voice models) are base64-encoded in the sync record.
 *     In production, swap for presigned object-storage URLs (S3 / R2).
 *  4. On network failure, pushes are queued in localStorage and flushed on the
 *     next successful sync cycle.
 *  5. Dispatches "ome-assets-updated" (existing reactive pattern) after applying
 *     remote records, so all dashboard components update instantly.
 * ─────────────────────────────────────────────────────────────────────────── */

import {
  storeAssetBlob,
  getSubjects, saveSubjects,
  getExams,    saveExams,
  getQuestions, saveQuestions,
  getStudents, saveStudents,
} from "./db";
import type { Subject, Exam, Question, Student, Lesson } from "./db";
import { getLessons, saveLessons } from "./db";
import { manifestScanner } from "./manifest-scanner";
import type { ScanProgress } from "./manifest-scanner";

/* ── Public types ────────────────────────────────────────────────────────── */

export type SyncRecordType =
  | "subject"
  | "curriculum"
  | "voice"
  | "exam"
  | "question"
  | "student"
  | "lesson";

export interface SyncRecord {
  key:      string;
  type:     SyncRecordType;
  /** JSON string for structured data, base64 string for binary blobs */
  payload:  string;
  encoding: "json" | "base64";
  meta:     Record<string, string>;
  updatedAt: number;
  deleted?:  boolean;
}

export interface SyncStatus {
  state:       "idle" | "syncing" | "error" | "offline";
  lastSyncAt:  number;
  lastApplied: number;
  pendingPush: number;
  error?:      string;
}

type StatusListener = (s: SyncStatus) => void;

/* ── Constants ───────────────────────────────────────────────────────────── */

const SYNC_BASE           = "/api/sync";
const LS_LAST_SYNC        = "ome_last_sync_at";
const LS_PUSH_QUEUE       = "ome_push_queue";
const LS_CONTENT_VERSION  = "ome_content_version";
const FETCH_TIMEOUT       = 12_000; // ms

/* ── Engine ──────────────────────────────────────────────────────────────── */

export class HybridSyncEngine {
  private static _instance: HybridSyncEngine | null = null;

  private _lastSyncAt = 0;
  private _timer:     ReturnType<typeof setInterval> | null = null;
  private _sse:       EventSource | null = null;
  private _online     = false;
  private _syncing    = false;
  private _status: SyncStatus = {
    state: "offline", lastSyncAt: 0, lastApplied: 0, pendingPush: 0,
  };
  private _listeners: StatusListener[] = [];

  private constructor() {
    this._lastSyncAt = Number(localStorage.getItem(LS_LAST_SYNC) ?? 0);
    this._online     = navigator.onLine;
  }

  static getInstance(): HybridSyncEngine {
    if (!HybridSyncEngine._instance) {
      HybridSyncEngine._instance = new HybridSyncEngine();
    }
    return HybridSyncEngine._instance;
  }

  /** Reset the singleton — called by Vite HMR dispose to prevent stale prototype issues */
  static resetInstance(): void {
    if (HybridSyncEngine._instance) {
      HybridSyncEngine._instance.stop();
    }
    HybridSyncEngine._instance = null;
  }

  get status(): SyncStatus { return { ...this._status }; }

  /* ── Lifecycle ───────────────────────────────────────────────────────── */

  /** Call once from App root. Safe to call multiple times (idempotent). */
  start(intervalMs = 30_000): this {
    if (this._timer) return this;

    window.addEventListener("online", () => {
      this._online = true;
      this._emit({ state: "idle" });
      void this.sync();
      this._connectSse(); // reconnect SSE when back online
    });
    window.addEventListener("offline", () => {
      this._online = false;
      this._emit({ state: "offline" });
      this._disconnectSse();
    });

    const pendingPush = this._queueLength();
    this._emit({ state: this._online ? "idle" : "offline", pendingPush });

    if (this._online) {
      void this.sync();
      this._connectSse(); // real-time push notifications from server
    }

    this._timer = setInterval(() => {
      if (this._online && !this._syncing) void this.sync();
    }, intervalMs);

    return this;
  }

  stop(): void {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._disconnectSse();
  }

  /* ── Subscribe to status updates ─────────────────────────────────────── */

  onStatus(fn: StatusListener): () => void {
    this._listeners.push(fn);
    fn(this._status);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  /* ── Pull: fetch delta from server, apply to IDB ─────────────────────── */

  async sync(): Promise<{ applied: number; skipped: boolean }> {
    if (!this._online || this._syncing) return { applied: 0, skipped: true };
    this._syncing = true;
    this._emit({ state: "syncing" });

    try {
      const res = await fetch(
        `${SYNC_BASE}/manifest?since=${this._lastSyncAt}`,
        { signal: this._timeout(FETCH_TIMEOUT) },
      );
      if (!res.ok) throw new Error(`server ${res.status}`);

      const manifest = await res.json() as {
        items: SyncRecord[];
        serverTime: number;
        totalCount: number;
      };

      let applied = 0;
      for (const record of manifest.items) {
        try   { await this._applyRecord(record); applied++; }
        catch { /* skip broken records — keep syncing the rest */ }
      }

      this._lastSyncAt = manifest.serverTime;
      localStorage.setItem(LS_LAST_SYNC, String(this._lastSyncAt));

      if (applied > 0) {
        window.dispatchEvent(new CustomEvent("ome-assets-updated", {
          detail: { source: "cloud-sync", count: applied },
        }));
      }

      this._emit({ state: "idle", lastSyncAt: this._lastSyncAt, lastApplied: applied });
      void this._flushPushQueue();

      return { applied, skipped: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "sync failed";
      this._emit({ state: "error", error: msg });
      return { applied: 0, skipped: true };
    } finally {
      this._syncing = false;
    }
  }

  /* ── Push: admin uploads → server (fire-and-forget with offline queue) ── */

  async pushSubject(subject: Subject): Promise<void> {
    await this._push([{
      key:       `subject_${subject.id}`,
      type:      "subject",
      payload:   JSON.stringify(subject),
      encoding:  "json",
      meta:      { name: subject.name, icon: subject.icon },
      updatedAt: Date.now(),
    }]);
  }

  async pushCurriculumAsset(
    subjId: string,
    buf:  ArrayBuffer,
    meta: Record<string, string>,
  ): Promise<void> {
    await this._push([{
      key:       `curriculum_${subjId}`,
      type:      "curriculum",
      payload:   this._toBase64(buf),
      encoding:  "base64",
      meta,
      updatedAt: Date.now(),
    }]);
  }

  async pushVoiceAsset(
    subjId: string,
    buf:  ArrayBuffer,
    meta: Record<string, string>,
  ): Promise<void> {
    await this._push([{
      key:       `voice_${subjId}`,
      type:      "voice",
      payload:   this._toBase64(buf),
      encoding:  "base64",
      meta,
      updatedAt: Date.now(),
    }]);
  }

  async pushExam(exam: Exam): Promise<void> {
    await this._push([{
      key:       `exam_${exam.id}`,
      type:      "exam",
      payload:   JSON.stringify(exam),
      encoding:  "json",
      meta:      { title: exam.title },
      updatedAt: Date.now(),
    }]);
  }

  async pushQuestion(question: Question): Promise<void> {
    await this._push([{
      key:       `question_${question.id}`,
      type:      "question",
      payload:   JSON.stringify(question),
      encoding:  "json",
      meta:      {},
      updatedAt: Date.now(),
    }]);
  }

  /** Pushes lesson metadata (unit/lesson structure) to sync server. */
  async pushLesson(lesson: Lesson): Promise<void> {
    await this._push([{
      key:       `lesson_meta_${lesson.id}`,
      type:      "lesson",
      payload:   JSON.stringify(lesson),
      encoding:  "json",
      meta:      { subjectId: lesson.subjectId, unitNumber: String(lesson.unitNumber) },
      updatedAt: Date.now(),
    }]);
  }

  /**
   * Pushes a lesson PDF binary to the sync server so students on other
   * devices can download it. Uses the curriculum binary mechanism.
   */
  async pushLessonFile(lessonId: string, buf: ArrayBuffer, meta: Record<string, string>): Promise<void> {
    await this._push([{
      key:       `lesson_${lessonId}`,
      type:      "curriculum",  /* reuse curriculum binary storage path */
      payload:   this._toBase64(buf),
      encoding:  "base64",
      meta,
      updatedAt: Date.now(),
    }]);
  }

  /**
   * Pushes a newly-registered student to the sync server so admin and
   * school-admin dashboards on other devices can see them immediately.
   * passHash is intentionally excluded — authentication stays local-only.
   */
  async pushStudent(student: Student): Promise<void> {
    const { passHash: _ph, ...safe } = student;
    await this._push([{
      key:       `student_${student.id}`,
      type:      "student",
      payload:   JSON.stringify({ ...safe, passHash: "" }),
      encoding:  "json",
      meta:      { name: student.name, schoolId: student.schoolId },
      updatedAt: Date.now(),
    }]);
  }

  /* ── Asset Manifest v2 — Delta Sync ────────────────────────────────────── */

  /**
   * Runs a full ManifestScanner delta scan.
   * Downloads only files whose hash changed since last scan.
   * Fires progress events so UI can show a download bar.
   *
   * Returns { checked, downloaded, skipped }.
   */
  async scanManifest(
    onProgress?: (p: ScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ checked: number; downloaded: number; skipped: number }> {
    if (!this._online) return { checked: 0, downloaded: 0, skipped: 0 };

    const result = await manifestScanner.scan(onProgress, signal);

    if (result.downloaded > 0) {
      /* Notify React components that new assets arrived in IDB */
      window.dispatchEvent(new CustomEvent("ome-assets-updated", {
        detail: { source: "manifest-scan", count: result.downloaded },
      }));
    }

    return result;
  }

  /* ── Content Manifest Version Check (legacy lightweight check) ──────────── */

  /**
   * Checks the lightweight content-manifest endpoint.
   * Returns true if the server has newer content than what we have locally.
   * Uses a 32-bit version hash — no payload transferred on version match.
   */
  async hasNewContent(): Promise<boolean> {
    if (!this._online) return false;
    try {
      const res = await fetch(`${SYNC_BASE}/content-manifest`, { signal: this._timeout(FETCH_TIMEOUT) });
      if (!res.ok) return false;
      const data = await res.json() as { contentVersion: string; lastUpdatedAt: number };
      const localVersion = localStorage.getItem(LS_CONTENT_VERSION) ?? "";
      return data.contentVersion !== localVersion;
    } catch {
      return false;
    }
  }

  /**
   * Manual sync — forces a full sync cycle regardless of timer state.
   * Broadcasts status events so UI can show progress.
   * Returns { applied, subscriptionUpdated }.
   */
  async manualSync(studentEmail?: string): Promise<{ applied: number; subscriptionUpdated: boolean }> {
    this._emit({ state: "syncing" });
    let applied = 0;
    let subscriptionUpdated = false;

    try {
      const result = await this.sync();
      applied = result.applied;

      /* After content sync, update content version cache */
      try {
        const mRes = await fetch(`${SYNC_BASE}/content-manifest`, { signal: this._timeout(FETCH_TIMEOUT) });
        if (mRes.ok) {
          const m = await mRes.json() as { contentVersion: string };
          localStorage.setItem(LS_CONTENT_VERSION, m.contentVersion);
        }
      } catch { /* non-fatal */ }

      /* Also sync subscription if email provided */
      if (studentEmail) {
        subscriptionUpdated = await this.subscriptionSync(studentEmail);
      }

      /* Push any admin subscription data to server */
      await this._pushAdminSubscriptions();

    } catch { /* already handled in sync() */ }

    return { applied, subscriptionUpdated };
  }

  /* ── Subscription Sync ───────────────────────────────────────────────── */

  /**
   * Pulls this student's subscription status from the server and updates
   * their local IDB record. Called on app start and on manual sync.
   * Returns true if the local record was updated.
   */
  async subscriptionSync(studentEmail: string): Promise<boolean> {
    if (!this._online || !studentEmail) return false;
    try {
      const res = await fetch(
        `${SYNC_BASE}/subscription/${encodeURIComponent(studentEmail)}`,
        { signal: this._timeout(FETCH_TIMEOUT) },
      );
      if (!res.ok) return false;
      const data = await res.json() as {
        serverKnown:        boolean;
        subscriptionStatus: "active" | "expired" | "none";
        expiryDate:         string | null;
        planId:             string | null;
        planName:           string | null;
        updatedAt:          number;
      };

      if (!data.serverKnown) return false; // server doesn't know this student yet

      const students = getStudents();
      const idx = students.findIndex(s => s.email.toLowerCase() === studentEmail.toLowerCase());
      if (idx < 0) return false;

      const s = students[idx]!;
      /* Only update if server data is newer */
      const localUpdatedAt = s.expiryDate ? new Date(s.expiryDate).getTime() : 0;
      if (data.updatedAt <= localUpdatedAt) return false;

      students[idx] = {
        ...s,
        subscriptionStatus: data.subscriptionStatus,
        expiryDate:         data.expiryDate,
        planId:             data.planId,
        planName:           data.planName,
      };
      saveStudents(students);
      window.dispatchEvent(new CustomEvent("ome-assets-updated", {
        detail: { source: "subscription-sync" },
      }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Admin helper — pushes all student subscription states to the server so
   * students can pull them. Called automatically in manualSync() and after
   * admin activates a subscription.
   * Public alias: pushSubscriptions()
   */
  async pushSubscriptions(): Promise<void> {
    return this._pushAdminSubscriptions();
  }

  private async _pushAdminSubscriptions(): Promise<void> {
    if (!this._online) return;
    try {
      const students = getStudents();
      const subs = students
        .filter(s => s.subscriptionStatus && s.subscriptionStatus !== "none")
        .map(s => ({
          email:              s.email,
          subscriptionStatus: s.subscriptionStatus ?? "none",
          expiryDate:         s.expiryDate ?? null,
          planId:             s.planId ?? null,
          planName:           s.planName ?? null,
          updatedAt:          s.expiryDate ? new Date(s.expiryDate).getTime() : Date.now(),
        }));
      if (subs.length === 0) return;
      await fetch(`${SYNC_BASE}/subscription`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ subscriptions: subs }),
        signal:  this._timeout(FETCH_TIMEOUT),
      });
    } catch { /* non-fatal — will retry on next sync */ }
  }

  /* ── Private helpers ─────────────────────────────────────────────────── */

  /** Applies one incoming sync record to local storage. */
  private async _applyRecord(r: SyncRecord): Promise<void> {
    /* OFFLINE-FIRST RULE: only write to IDB / localStorage — never network */
    if (r.type === "curriculum" || r.type === "voice") {
      const buf = this._fromBase64(r.payload);
      /* storeAssetBlob dispatches ome-assets-updated — OK (we dedupe above) */
      await storeAssetBlob(r.key, buf, r.meta);
      return;
    }
    if (r.type === "subject") {
      const data = JSON.parse(r.payload) as Subject;
      const all  = getSubjects();
      const idx  = all.findIndex(s => s.id === data.id);
      if (idx >= 0) all[idx] = data; else all.push(data);
      saveSubjects(all);
      return;
    }
    if (r.type === "exam") {
      const data = JSON.parse(r.payload) as Exam;
      const all  = getExams();
      const idx  = all.findIndex(e => e.id === data.id);
      if (idx >= 0) all[idx] = data; else all.push(data);
      saveExams(all);
      return;
    }
    if (r.type === "question") {
      const data = JSON.parse(r.payload) as Question;
      const all  = getQuestions();
      const idx  = all.findIndex(q => q.id === data.id);
      if (idx >= 0) all[idx] = data; else all.push(data);
      saveQuestions(all);
      return;
    }
    if (r.type === "student") {
      const incoming = JSON.parse(r.payload) as Student;
      const all = getStudents();
      const idx = all.findIndex(s => s.id === incoming.id);
      if (idx >= 0) {
        /* Keep local passHash — never overwrite auth credentials from remote */
        all[idx] = { ...incoming, passHash: all[idx]!.passHash };
      } else {
        all.push(incoming); /* passHash="" from server — admin visibility only */
      }
      saveStudents(all);
      return;
    }
    if (r.type === "lesson") {
      const incoming = JSON.parse(r.payload) as Lesson;
      const all = getLessons();
      const idx = all.findIndex(l => l.id === incoming.id);
      if (idx >= 0) all[idx] = incoming; else all.push(incoming);
      saveLessons(all);
    }
  }

  /** POST records to server, queue on failure. */
  private async _push(records: SyncRecord[]): Promise<void> {
    if (!this._online) { this._enqueue(records); return; }
    try {
      const res = await fetch(`${SYNC_BASE}/push`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ records }),
        signal:  this._timeout(FETCH_TIMEOUT),
      });
      if (!res.ok) throw new Error(`push HTTP ${res.status}`);
      /* Flush any previously queued items on success */
      void this._flushPushQueue();
    } catch {
      this._enqueue(records);
    }
  }

  /** Store failed pushes in localStorage for retry. */
  private _enqueue(records: SyncRecord[]): void {
    try {
      const q: SyncRecord[] = JSON.parse(localStorage.getItem(LS_PUSH_QUEUE) ?? "[]");
      q.push(...records);
      const trimmed = q.slice(-300); // cap at 300 to avoid quota
      localStorage.setItem(LS_PUSH_QUEUE, JSON.stringify(trimmed));
      this._emit({ pendingPush: trimmed.length });
    } catch { /* storage quota — not fatal */ }
  }

  /** Re-send queued records when connectivity returns. */
  private async _flushPushQueue(): Promise<void> {
    const raw = localStorage.getItem(LS_PUSH_QUEUE);
    if (!raw) return;
    let q: SyncRecord[];
    try { q = JSON.parse(raw); } catch { localStorage.removeItem(LS_PUSH_QUEUE); return; }
    if (q.length === 0) return;

    try {
      const res = await fetch(`${SYNC_BASE}/push`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ records: q }),
        signal:  this._timeout(FETCH_TIMEOUT),
      });
      if (res.ok) {
        localStorage.removeItem(LS_PUSH_QUEUE);
        this._emit({ pendingPush: 0 });
      }
    } catch { /* will retry next cycle */ }
  }

  /* ── SSE (real-time server-push notifications) ───────────────────────── */

  /**
   * Open an EventSource connection to /api/sync/events.
   * When the server broadcasts a "push" event (new content uploaded by admin),
   * we trigger an immediate sync cycle so students don't have to wait 30 s.
   * Auto-reconnects via the browser's built-in EventSource retry logic.
   */
  private _connectSse(): void {
    if (this._sse) return; // already connected

    try {
      const source = new EventSource("/api/sync/events");

      source.onmessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data as string) as { type?: string };
          if (data.type === "push" && !this._syncing) {
            void this.sync(); // pull the new delta immediately
          }
        } catch { /* ignore malformed frames */ }
      };

      source.onerror = () => {
        /* EventSource retries automatically — just clear our handle so
           _connectSse() won't block a manual reconnect attempt. */
        if (source.readyState === EventSource.CLOSED) {
          this._sse = null;
        }
      };

      this._sse = source;
    } catch {
      /* EventSource not available (e.g. SSR / very old browser) — fall back
         to the 30-second polling interval silently. */
      this._sse = null;
    }
  }

  private _disconnectSse(): void {
    if (this._sse) {
      this._sse.close();
      this._sse = null;
    }
  }

  private _queueLength(): number {
    try {
      const q: unknown[] = JSON.parse(localStorage.getItem(LS_PUSH_QUEUE) ?? "[]");
      return q.length;
    } catch { return 0; }
  }

  /** Emit a partial status update. */
  private _emit(patch: Partial<SyncStatus>): void {
    this._status = { ...this._status, ...patch };
    window.dispatchEvent(new CustomEvent("ome-sync-status", { detail: { ...this._status } }));
    this._listeners.forEach(fn => fn(this._status));
  }

  /* ── Codec ───────────────────────────────────────────────────────────── */

  private _toBase64(buf: ArrayBuffer): string {
    const bytes  = new Uint8Array(buf);
    let   binary = "";
    const CHUNK  = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  private _fromBase64(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  private _timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  }
}

/** Singleton export — import this everywhere */
export const syncEngine = HybridSyncEngine.getInstance();

/* ── Vite HMR safety: reset singleton so reloaded modules get a fresh instance
 *    without this, HMR keeps the old prototype which lacks any new methods.  ── */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    HybridSyncEngine.resetInstance();
  });
}
