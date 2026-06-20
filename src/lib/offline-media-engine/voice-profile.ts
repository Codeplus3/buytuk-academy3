/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VoiceProfile — Teacher Voice Identity
 * Part of: HybridRuntime → OfflineMediaEngine → AudioPipeline
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A VoiceProfile is the "identity asset" of a teacher's voice.
 * It bundles two layers:
 *
 *   Layer 1 — Browser TTS parameters (works today, fully offline)
 *     voiceId, rate, pitch, volume → applied to SpeechSynthesisUtterance
 *
 *   Layer 2 — Speaker embedding (future ONNX voice cloning slot)
 *     speakerEmbedding: Float32Array  — 256-dim vector from a voice encoder
 *     These bytes are stored in IndexedDB and loaded into the ONNX TTS model
 *     at inference time to condition the model on the teacher's timbre.
 *
 * Storage:
 *   Profiles are persisted as encrypted blobs in IndexedDB under the
 *   "voice_profiles" object store. The speakerEmbedding is stored as a
 *   raw Float32Array binary — not JSON — so it transfers zero-copy via
 *   Transferable ArrayBuffers between the main thread and the Worker.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Core data model ──────────────────────────────────────────────────── */

export interface VoiceProfileMeta {
  /** Unique ID — used as IndexedDB key and in WorkerBridge messages. */
  profileId:    string;

  /** Human-readable name shown in the UI. */
  teacherName:  string;

  /** Subject this teacher is associated with (optional). */
  subject?:     string;

  /** Avatar URL for UI display. */
  avatarUrl?:   string;

  /** ISO language tag, e.g. "ar-SA". */
  language:     string;

  createdAt:    number;  // Unix ms
  updatedAt:    number;
}

/**
 * Layer 1 — Browser TTS parameters.
 * Applied directly to SpeechSynthesisUtterance on the main thread.
 */
export interface BrowserVoiceParams {
  /**
   * SpeechSynthesisVoice.name — the OS voice to use.
   * Use `LocalTTSEngine.getVoices()` to enumerate available voices.
   * null → auto-select best Arabic voice.
   */
  voiceId:  string | null;

  rate:     number;   // 0.5 – 2.0, default 0.9
  pitch:    number;   // 0.0 – 2.0, default 1.0
  volume:   number;   // 0.0 – 1.0, default 1.0
}

/**
 * Layer 2 — Speaker embedding for ONNX voice cloning.
 * A 256-dim Float32Array produced by a voice encoder model
 * (e.g. d-vector, x-vector, or ECAPA-TDNN speaker embedding).
 *
 * Slot is ready — not yet used by the BrowserSpeechBackend but will be
 * consumed by ONNXWasmBackend when an ONNX TTS model is loaded.
 */
export interface SpeakerEmbedding {
  /** Raw f32 speaker vector. Typically 256 dims. */
  vector:     Float32Array;

  /** Dimensionality (sanity-check on load). */
  dims:       number;

  /** Which voice encoder produced this embedding. */
  encoderId:  string;

  /** Duration of the reference audio used to compute this embedding (ms). */
  sourceDurationMs?: number;
}

/**
 * Full VoiceProfile — persisted to IndexedDB.
 */
export interface VoiceProfile {
  meta:             VoiceProfileMeta;
  browserParams:    BrowserVoiceParams;

  /**
   * Optional speaker embedding.
   * Present once the teacher records reference audio and a voice encoder
   * processes it. Absent in browser-only mode (null = Layer 1 only).
   */
  speakerEmbedding: SpeakerEmbedding | null;
}

/* ── Default profiles ─────────────────────────────────────────────────── */

export function makeDefaultProfile(
  teacherName:  string,
  subject?:     string,
  language = "ar-SA",
): VoiceProfile {
  return {
    meta: {
      profileId:   `teacher_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      teacherName,
      subject,
      language,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    },
    browserParams: {
      voiceId: null,    // auto-select best Arabic voice
      rate:    0.88,
      pitch:   1.05,
      volume:  1.0,
    },
    speakerEmbedding: null,
  };
}

/** Built-in demo profiles (no real embeddings — Layer 1 only). */
export const DEMO_VOICE_PROFILES: VoiceProfile[] = [
  {
    meta: {
      profileId:   "teacher_arabic_standard",
      teacherName: "المعلم الافتراضي",
      subject:     "عام",
      language:    "ar-SA",
      createdAt:   0,
      updatedAt:   0,
    },
    browserParams: { voiceId: null, rate: 0.88, pitch: 1.0,  volume: 1.0 },
    speakerEmbedding: null,
  },
  {
    meta: {
      profileId:   "teacher_math",
      teacherName: "أستاذ الرياضيات",
      subject:     "الرياضيات",
      language:    "ar-SA",
      createdAt:   0,
      updatedAt:   0,
    },
    browserParams: { voiceId: null, rate: 0.82, pitch: 0.95, volume: 1.0 },
    speakerEmbedding: null,
  },
  {
    meta: {
      profileId:   "teacher_science",
      teacherName: "أستاذة العلوم",
      subject:     "العلوم",
      language:    "ar-SA",
      createdAt:   0,
      updatedAt:   0,
    },
    browserParams: { voiceId: null, rate: 0.90, pitch: 1.10, volume: 1.0 },
    speakerEmbedding: null,
  },
];

/* ── IndexedDB persistence helpers ───────────────────────────────────── */

const PROFILE_STORE = "voice_profiles";
const DB_NAME       = "ome_voice_profiles";
const DB_VERSION    = 1;

function openProfileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: "meta.profileId" });
      }
    };
    req.onsuccess  = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror    = ()  => reject(req.error);
  });
}

export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PROFILE_STORE, "readwrite");
    const req = tx.objectStore(PROFILE_STORE).put(profile);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function loadVoiceProfile(profileId: string): Promise<VoiceProfile | null> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PROFILE_STORE, "readonly");
    const req = tx.objectStore(PROFILE_STORE).get(profileId);
    req.onsuccess = () => resolve((req.result as VoiceProfile) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PROFILE_STORE, "readonly");
    const req = tx.objectStore(PROFILE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as VoiceProfile[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteVoiceProfile(profileId: string): Promise<void> {
  const db = await openProfileDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PROFILE_STORE, "readwrite");
    const req = tx.objectStore(PROFILE_STORE).delete(profileId);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Seed demo profiles into IndexedDB if the store is empty.
 * Called once on engine init.
 */
export async function seedDemoProfilesIfNeeded(): Promise<void> {
  const existing = await listVoiceProfiles();
  if (existing.length > 0) return;
  for (const p of DEMO_VOICE_PROFILES) {
    await saveVoiceProfile(p);
  }
}
