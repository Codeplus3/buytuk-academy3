/* ─────────────────────────────────────────────────────────────────────────────
 * ResumableUploader — chunked file upload with pause/resume support
 *
 * Protocol:
 *  1. initSession() on server → get uploadId
 *  2. Upload chunks sequentially (or resume from last received chunk)
 *  3. complete() to finalize on server (server injects into syncStore)
 *
 * Resumability:
 *  - uploadId stored in localStorage under key: `ru_<fileKey>`
 *  - On start, if uploadId exists, query /api/upload/status to resume
 *  - Progress callbacks: onProgress(percent: number, chunksDone: number, total: number)
 *  - On abort: state is preserved in localStorage for resumption later
 *
 * Chunk size: 768 KB raw → ~1 MB base64 (well within server 50 MB body limit)
 * ─────────────────────────────────────────────────────────────────────────── */

const UPLOAD_BASE  = "/api/upload";
const CHUNK_SIZE   = 768 * 1024;   // 768 KB raw per chunk
const FETCH_TIMEOUT = 30_000;      // ms per chunk request
const LS_PREFIX    = "ru_";

export interface UploadProgressEvent {
  uploadId:   string;
  chunksDone: number;
  totalChunks: number;
  percent:    number;
  phase:      "init" | "uploading" | "completing" | "done" | "error";
  error?:     string;
}

export type ProgressCallback = (e: UploadProgressEvent) => void;

export interface UploadOptions {
  key:      string;               // sync record key, e.g. "curriculum_5"
  type:     "curriculum" | "voice" | "subject";
  meta:     Record<string, string>;
  buffer:   ArrayBuffer;
  onProgress?: ProgressCallback;
  pusherId?: string;
}

export class ResumableUploader {
  private _aborted = false;

  abort(): void { this._aborted = true; }

  async upload(opts: UploadOptions): Promise<{ key: string; serverTime: number }> {
    this._aborted = false;
    const { key, type, meta, buffer, onProgress, pusherId } = opts;

    const bytes       = new Uint8Array(buffer);
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
    const lsKey       = `${LS_PREFIX}${key}`;

    const emit = (patch: Omit<UploadProgressEvent, "uploadId"> & { uploadId?: string }) => {
      const ev: UploadProgressEvent = {
        uploadId:   patch.uploadId   ?? "",
        chunksDone: patch.chunksDone ?? 0,
        totalChunks: patch.totalChunks ?? totalChunks,
        percent:    patch.percent    ?? 0,
        phase:      patch.phase,
        error:      patch.error,
      };
      onProgress?.(ev);
    };

    /* ── 1. Resolve or create uploadId ── */
    let uploadId = localStorage.getItem(lsKey) ?? "";
    let startFromChunk = 0;

    if (uploadId) {
      try {
        const statusRes = await this._fetch(`${UPLOAD_BASE}/status/${uploadId}`, { method: "GET" });
        if (statusRes.ok) {
          const st = await statusRes.json() as { receivedChunks: number; totalChunks: number; complete: boolean };
          if (st.complete) {
            /* Already complete on server — skip straight to finalise */
            localStorage.removeItem(lsKey);
            return await this._complete(uploadId, key);
          }
          startFromChunk = st.receivedChunks; // resume from here
        } else {
          uploadId = ""; // session expired — start fresh
        }
      } catch {
        uploadId = ""; // server unreachable — start fresh
      }
    }

    if (!uploadId) {
      emit({ phase: "init", chunksDone: 0, percent: 0, totalChunks });
      const initRes = await this._fetch(`${UPLOAD_BASE}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, type, meta, totalChunks, chunkSize: CHUNK_SIZE, pusherId }),
      });
      if (!initRes.ok) {
        const err = `init failed: HTTP ${initRes.status}`;
        emit({ phase: "error", error: err, chunksDone: 0, percent: 0, totalChunks });
        throw new Error(err);
      }
      const initData = await initRes.json() as { uploadId: string };
      uploadId = initData.uploadId;
      localStorage.setItem(lsKey, uploadId);
    }

    /* ── 2. Upload chunks ── */
    for (let i = startFromChunk; i < totalChunks; i++) {
      if (this._aborted) {
        emit({ uploadId, phase: "error", error: "aborted", chunksDone: i, totalChunks, percent: Math.round((i / totalChunks) * 95) });
        throw new Error("upload aborted");
      }

      const start = i * CHUNK_SIZE;
      const slice = bytes.slice(start, start + CHUNK_SIZE);
      const b64   = this._toBase64(slice);

      const res = await this._fetch(`${UPLOAD_BASE}/chunk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, chunkIndex: i, data: b64 }),
      });

      if (!res.ok) {
        const err = `chunk ${i} failed: HTTP ${res.status}`;
        emit({ uploadId, phase: "error", error: err, chunksDone: i, totalChunks, percent: Math.round((i / totalChunks) * 95) });
        throw new Error(err);
      }

      const percent = Math.round(((i + 1) / totalChunks) * 95);
      emit({ uploadId, phase: "uploading", chunksDone: i + 1, totalChunks, percent });
    }

    /* ── 3. Complete ── */
    emit({ uploadId, phase: "completing", chunksDone: totalChunks, totalChunks, percent: 98 });
    const result = await this._complete(uploadId, key);
    localStorage.removeItem(lsKey);
    emit({ uploadId, phase: "done", chunksDone: totalChunks, totalChunks, percent: 100 });
    return result;
  }

  private async _complete(uploadId: string, key: string): Promise<{ key: string; serverTime: number }> {
    const res = await this._fetch(`${UPLOAD_BASE}/complete/${uploadId}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `complete failed: HTTP ${res.status}`);
    }
    return res.json() as Promise<{ key: string; serverTime: number }>;
  }

  private _fetch(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
  }

  private _toBase64(bytes: Uint8Array): string {
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    return btoa(binary);
  }
}
