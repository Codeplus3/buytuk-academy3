/* ─────────────────────────────────────────────────────────────────────────────
 * BundleManager — Course Bundle download + IndexedDB install
 *
 * Flow:
 *   1. Fetch GET /api/sync/bundle/:subjectId  →  JSON bundle (.csbundle)
 *   2. For each file in bundle: decode base64 → storeAssetBlob() → IndexedDB
 *   3. Persist install marker in localStorage for UI indicator
 *   4. Dispatch "ome-assets-updated" so OfflineMediaPanel refreshes
 *
 * The caller receives BundleProgress updates via the onProgress callback so
 * the UI can show a live progress bar without polling.
 * ─────────────────────────────────────────────────────────────────────────── */

import { storeAssetBlob } from "./db";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface BundleFile {
  key:      string;
  role:     string;
  name:     string;
  mimeType: string;
  size:     number;
  hash:     string;
  data:     string; // base64-encoded raw bytes
}

export interface BundleManifest {
  schemaVersion: "1";
  subjectId:     string;
  subjectName:   string;
  bundleVersion: string;
  bundleHash:    string;
  createdAt:     number;
  fileCount:     number;
  files:         BundleFile[];
}

export interface BundleProgress {
  phase:       "downloading" | "storing" | "done" | "error";
  fileCurrent: number;
  fileTotal:   number;
  pct:         number;
  message:     string;
  error?:      string;
}

export interface BundleInstallInfo {
  version:     string;
  installedAt: number;
  fileCount:   number;
}

type ProgressCallback = (p: BundleProgress) => void;

/* ── Constants ─────────────────────────────────────────────────────────────── */

const LS_PREFIX = "csbundle_installed_";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/* ── Public API ────────────────────────────────────────────────────────────── */

/**
 * Download the full course bundle for `subjectId` and install every file
 * into IndexedDB via storeAssetBlob.  Calls onProgress throughout.
 *
 * Throws on network error or non-2xx HTTP response.
 */
export async function downloadAndInstallBundle(
  subjectId: string,
  onProgress: ProgressCallback,
): Promise<void> {
  /* ── Phase 1: Download bundle JSON ─────────────────────────────────── */
  onProgress({
    phase: "downloading", fileCurrent: 0, fileTotal: 0,
    pct: 5, message: "جارٍ تحميل حزمة المادة…",
  });

  const res = await fetch(`/api/sync/bundle/${encodeURIComponent(subjectId)}`);
  if (!res.ok) {
    const msg = `تعذّر التحميل (HTTP ${res.status})`;
    onProgress({ phase: "error", fileCurrent: 0, fileTotal: 0, pct: 0, message: msg, error: msg });
    throw new Error(msg);
  }

  const bundle = (await res.json()) as BundleManifest;
  const total  = bundle.files?.length ?? 0;

  if (total === 0) {
    onProgress({
      phase: "done", fileCurrent: 0, fileTotal: 0,
      pct: 100, message: "لا توجد ملفات لهذه المادة بعد — تحقق لاحقاً",
    });
    return;
  }

  /* ── Phase 2: Store each file into IndexedDB ────────────────────────── */
  for (let i = 0; i < bundle.files.length; i++) {
    const file = bundle.files[i]!;
    onProgress({
      phase:       "storing",
      fileCurrent: i + 1,
      fileTotal:   total,
      pct:         Math.round(10 + ((i + 1) / total) * 85),
      message:     `حفظ: ${file.name}  (${i + 1} / ${total})`,
    });

    const bytes = base64ToUint8Array(file.data);
    await storeAssetBlob(file.key, bytes.buffer as ArrayBuffer, {
      type:        file.mimeType,
      name:        file.name,
      role:        file.role,
      subjectId,
      hash:        file.hash,
      installedAt: String(Date.now()),
    });
  }

  /* ── Persist install marker ─────────────────────────────────────────── */
  const info: BundleInstallInfo = {
    version:     bundle.bundleVersion,
    installedAt: Date.now(),
    fileCount:   total,
  };
  localStorage.setItem(`${LS_PREFIX}${subjectId}`, JSON.stringify(info));

  /* ── Notify reactive listeners (OfflineMediaPanel, StudyRoom, etc.) ── */
  window.dispatchEvent(new Event("ome-assets-updated"));

  onProgress({
    phase: "done", fileCurrent: total, fileTotal: total,
    pct: 100, message: `✅ تم تثبيت المادة كاملة — ${total} ملف محفوظ`,
  });
}

/** Return install info for a subject, or null if not yet installed. */
export function getBundleInstallInfo(subjectId: string): BundleInstallInfo | null {
  const raw = localStorage.getItem(`${LS_PREFIX}${subjectId}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as BundleInstallInfo; }
  catch { return null; }
}

/** Remove the install marker (does NOT remove files from IndexedDB). */
export function clearBundleInstallInfo(subjectId: string): void {
  localStorage.removeItem(`${LS_PREFIX}${subjectId}`);
}
