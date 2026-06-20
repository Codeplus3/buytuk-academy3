/* ─────────────────────────────────────────────────────────────────────────────
 * ManifestScanner — Client-side Delta Sync from asset-manifest v2
 *
 * Flow:
 *  1. GET /api/sync/asset-manifest  → rich manifest (subjects + files + hashes)
 *  2. Compare top-level manifest version to local cache (fast exit if same)
 *  3. Per file: compare server hash to local hash cache in localStorage
 *  4. Download ONLY changed files from /api/sync/asset/<key>
 *  5. Store each binary in IDB via storeAssetBlob()
 *  6. Update local hash cache + manifest version on success
 *
 * Design:
 *  - Sequential downloads (one file at a time) — avoids memory spikes on mobile
 *  - Hash cache in localStorage ("ome_manifest_hashes") — O(1) delta detection
 *  - Non-blocking: caller awaits; errors per-file are swallowed (retry next sync)
 *  - Zero binary data in the manifest itself (only URLs + hashes)
 * ─────────────────────────────────────────────────────────────────────────── */

import { storeAssetBlob } from "./db";

const MANIFEST_URL        = "/api/sync/asset-manifest";
const LS_HASHES           = "ome_manifest_hashes";    // { [idbKey]: sha256hex }
const LS_MANIFEST_VERSION = "ome_manifest_version";   // last seen manifest version
const FETCH_TIMEOUT_MS    = 30_000;                   // per-asset download timeout

/* ── Manifest types (mirror server AssetManifest) ──────────────────────────── */

export type FileRole = "voice" | "curriculum" | "video";

export interface ManifestFile {
  role:       FileRole;
  url:        string;
  size:       number;
  hash:       string;
  mimeType:   string;
  name:       string;
  uploadedAt: number;
}

export interface ManifestSubject {
  id:        string;
  name:      string;
  version:   string;
  updatedAt: number;
  files:     ManifestFile[];
}

export interface AssetManifest {
  schemaVersion: "2";
  version:    string;
  lastUpdate: number;
  subjects:   ManifestSubject[];
}

export interface ScanProgress {
  phase:           "checking" | "downloading" | "done" | "error";
  totalFiles:      number;
  downloadedFiles: number;
  skippedFiles:    number;
  currentFile?:    string;
  totalBytes?:     number;
  error?:          string;
}

export type ScanProgressCb = (p: ScanProgress) => void;

export interface ScanResult {
  checked:    number;
  downloaded: number;
  skipped:    number;
}

/* ── Scanner ─────────────────────────────────────────────────────────────── */

export class ManifestScanner {

  /**
   * Run a full delta scan.
   * - Returns immediately if manifest version matches local cache.
   * - Downloads only files whose hash differs from local IDB record.
   */
  async scan(onProgress?: ScanProgressCb, signal?: AbortSignal): Promise<ScanResult> {

    onProgress?.({ phase: "checking", totalFiles: 0, downloadedFiles: 0, skippedFiles: 0 });

    /* 1. Fetch manifest (small JSON, no binary payloads) */
    let manifest: AssetManifest;
    try {
      const res = await fetch(MANIFEST_URL, {
        signal: this._signal(FETCH_TIMEOUT_MS, signal),
      });
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      manifest = await res.json() as AssetManifest;
    } catch (err) {
      const error = err instanceof Error ? err.message : "fetch failed";
      onProgress?.({ phase: "error", totalFiles: 0, downloadedFiles: 0, skippedFiles: 0, error });
      return { checked: 0, downloaded: 0, skipped: 0 };
    }

    /* 2. Fast exit — manifest version unchanged */
    const cachedVersion = localStorage.getItem(LS_MANIFEST_VERSION) ?? "";
    if (manifest.version === cachedVersion) {
      onProgress?.({ phase: "done", totalFiles: 0, downloadedFiles: 0, skippedFiles: 0 });
      return { checked: 0, downloaded: 0, skipped: 0 };
    }

    /* 3. Determine which files need downloading (delta detection) */
    const localHashes  = this._loadHashes();
    const toDownload: Array<{ subjectId: string; file: ManifestFile }> = [];
    let totalChecked   = 0;

    for (const subject of manifest.subjects) {
      for (const file of subject.files) {
        totalChecked++;
        const idbKey    = this._idbKey(subject.id, file.role);
        const localHash = localHashes[idbKey] ?? "";
        if (file.hash !== localHash) {
          toDownload.push({ subjectId: subject.id, file });
        }
      }
    }

    /* All hashes match — bump version cache, done */
    if (toDownload.length === 0) {
      localStorage.setItem(LS_MANIFEST_VERSION, manifest.version);
      onProgress?.({ phase: "done", totalFiles: totalChecked, downloadedFiles: 0, skippedFiles: totalChecked });
      return { checked: totalChecked, downloaded: 0, skipped: totalChecked };
    }

    onProgress?.({
      phase:           "downloading",
      totalFiles:      toDownload.length,
      downloadedFiles: 0,
      skippedFiles:    totalChecked - toDownload.length,
      totalBytes:      toDownload.reduce((n, d) => n + d.file.size, 0),
    });

    /* 4. Download changed files one at a time */
    let downloaded = 0;

    for (const { subjectId, file } of toDownload) {
      if (signal?.aborted) break;

      onProgress?.({
        phase:           "downloading",
        totalFiles:      toDownload.length,
        downloadedFiles: downloaded,
        skippedFiles:    totalChecked - toDownload.length,
        currentFile:     file.name,
      });

      try {
        const idbKey = this._idbKey(subjectId, file.role);
        const buf    = await this._fetchAsset(file.url, signal);

        await storeAssetBlob(idbKey, buf, {
          name:     file.name,
          type:     file.mimeType,
        });

        localHashes[idbKey] = file.hash;
        this._saveHashes(localHashes);
        downloaded++;
      } catch {
        /* Non-fatal — will retry on next sync cycle */
      }
    }

    /* 5. Update manifest version cache */
    if (downloaded >= toDownload.length) {
      localStorage.setItem(LS_MANIFEST_VERSION, manifest.version);
    }

    onProgress?.({
      phase:           "done",
      totalFiles:      toDownload.length,
      downloadedFiles: downloaded,
      skippedFiles:    totalChecked - toDownload.length,
    });

    return { checked: totalChecked, downloaded, skipped: totalChecked - toDownload.length };
  }

  /** Quick check — true if server has a newer manifest version than local cache. */
  async hasUpdates(): Promise<boolean> {
    try {
      const res = await fetch(MANIFEST_URL, { signal: this._signal(6_000) });
      if (!res.ok) return false;
      const m = await res.json() as { version: string };
      return m.version !== (localStorage.getItem(LS_MANIFEST_VERSION) ?? "");
    } catch {
      return false;
    }
  }

  /* ── Private helpers ─────────────────────────────────────────────────── */

  private _idbKey(subjectId: string, role: FileRole): string {
    if (role === "voice")      return `voice_${subjectId}`;
    if (role === "curriculum") return `curriculum_${subjectId}`;
    return `video_${subjectId}`;
  }

  private async _fetchAsset(url: string, parent?: AbortSignal): Promise<ArrayBuffer> {
    const res = await fetch(url, { signal: this._signal(FETCH_TIMEOUT_MS, parent) });
    if (!res.ok) throw new Error(`asset HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  private _loadHashes(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(LS_HASHES) ?? "{}") as Record<string, string>;
    } catch { return {}; }
  }

  private _saveHashes(h: Record<string, string>): void {
    try { localStorage.setItem(LS_HASHES, JSON.stringify(h)); } catch { /* quota exceeded */ }
  }

  /** Creates an AbortSignal that times out after `ms` and also forwards parent abort. */
  private _signal(ms: number, parent?: AbortSignal): AbortSignal {
    const ac = new AbortController();
    const id = setTimeout(() => ac.abort(new Error(`timeout ${ms}ms`)), ms);
    ac.signal.addEventListener("abort", () => clearTimeout(id), { once: true });
    if (parent) parent.addEventListener("abort", () => ac.abort(parent.reason), { once: true });
    return ac.signal;
  }
}

/** Singleton — import and call directly */
export const manifestScanner = new ManifestScanner();
