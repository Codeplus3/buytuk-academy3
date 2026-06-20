/**
 * ─────────────────────────────────────────────────────────────────────────────
 * useOfflineMediaEngine — React Integration Hook
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Single public API for all React components.
 * Delegates heavy work to ConcreteWorkerBridge (Worker thread).
 * TTS runs on the main thread (SpeechSynthesis is window-only).
 *
 * Voice Profile integration:
 *   const { setVoiceProfile, activeVoiceProfile } = useOfflineMediaEngine();
 *   await setVoiceProfile(profile);   // teacher's voice applied to all speak() calls
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getWorkerBridge } from "../concrete/worker-bridge";
import type { ConcreteWorkerBridge } from "../concrete/worker-bridge";
import type { VoiceProfile } from "../voice-profile";
import type { KSSearchResponse } from "./worker-bridge";

/* ── Hook state shape ─────────────────────────────────────────────────── */

export interface OMEStatus {
  ready:           boolean;
  initialising:    boolean;
  backend:         "webgpu" | "webgl2" | "wasm-cpu" | null;
  ttsActive:       boolean;
  ttsPaused:       boolean;
  currentWord:     string;
  aiLoading:       boolean;
  aiStreaming:     boolean;
  activeVoiceProfile: VoiceProfile | null;
  error:           string | null;
}

export interface OMEActions {
  /** Synthesise text using the active teacher voice profile. */
  speak(
    text:  string,
    opts?: { rate?: number; onWord?: (w: string) => void; onEnd?: () => void },
  ): Promise<void>;

  pauseTTS():  void;
  resumeTTS(): void;
  stopTTS():   void;

  /**
   * Apply a teacher VoiceProfile.
   * All subsequent speak() calls use the profile's BrowserVoiceParams.
   * The speakerEmbedding is persisted to IndexedDB for future ONNX usage.
   */
  setVoiceProfile(profile: VoiceProfile): Promise<void>;

  /** Load a previously saved profile by ID. */
  loadVoiceProfile(profileId: string): Promise<VoiceProfile | null>;

  /** List all saved profiles (IndexedDB). */
  listVoiceProfiles(): Promise<VoiceProfile[]>;

  /** Semantic search across KnowledgeStore. */
  search(query: string, topK?: number): Promise<KSSearchResponse["results"]>;

  /** Get the full book list from IndexedDB. */
  getBooks(): Promise<unknown[]>;

  /** Chat with the AI Tutor (Worker thread). */
  chat(
    sessionId: string,
    message:   string,
    opts?:     { stream?: boolean; onToken?: (t: string) => void; useRAG?: boolean },
  ): Promise<string>;

  /** Load an SLM model (WebGPU / WASM). */
  loadModel(manifestId: string, onProgress?: (pct: number, msg: string) => void): Promise<void>;

  /** Ingest a new book into KnowledgeStore. */
  ingestBook(
    descriptor: { bookId: string; title: string; subject: string; author: string },
    chapters:   Array<{ title: string; text: string }>,
  ): Promise<void>;
}

export type UseOfflineMediaEngineReturn = OMEStatus & OMEActions;

/* ── Hook ─────────────────────────────────────────────────────────────── */

export function useOfflineMediaEngine(): UseOfflineMediaEngineReturn {
  const [status, setStatus] = useState<OMEStatus>({
    ready:              false,
    initialising:       true,
    backend:            null,
    ttsActive:          false,
    ttsPaused:          false,
    currentWord:        "",
    aiLoading:          false,
    aiStreaming:        false,
    activeVoiceProfile: null,
    error:              null,
  });

  const bridgeRef = useRef<ConcreteWorkerBridge | null>(null);

  /* Init on first mount */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bridge = getWorkerBridge();
        bridgeRef.current = bridge;

        if (!bridge.isReady) {
          const info = await bridge.init();
          if (cancelled) return;
          setStatus(s => ({
            ...s,
            ready:        info.status === "ok",
            initialising: false,
            backend:      (info.backend as OMEStatus["backend"]) ?? null,
          }));
        } else {
          if (cancelled) return;
          setStatus(s => ({ ...s, ready: true, initialising: false }));
        }
      } catch (err) {
        if (cancelled) return;
        setStatus(s => ({
          ...s,
          initialising: false,
          error: err instanceof Error ? err.message : "Init failed",
        }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Actions ──────────────────────────────────────────────────────── */

  const speak = useCallback(async (
    text: string,
    opts?: { rate?: number; onWord?: (w: string) => void; onEnd?: () => void },
  ): Promise<void> => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setStatus(s => ({ ...s, ttsActive: true, currentWord: "" }));
    await bridge.speak(text, {
      rate:   opts?.rate,
      onWord: (w) => {
        setStatus(s => ({ ...s, currentWord: w }));
        opts?.onWord?.(w);
      },
      onEnd: () => {
        setStatus(s => ({ ...s, ttsActive: false, currentWord: "" }));
        opts?.onEnd?.();
      },
    });
  }, []);

  const pauseTTS  = useCallback(() => {
    bridgeRef.current?.pauseTTS();
    setStatus(s => ({ ...s, ttsPaused: true }));
  }, []);

  const resumeTTS = useCallback(() => {
    bridgeRef.current?.resumeTTS();
    setStatus(s => ({ ...s, ttsPaused: false }));
  }, []);

  const stopTTS   = useCallback(() => {
    bridgeRef.current?.stopTTS();
    setStatus(s => ({ ...s, ttsActive: false, ttsPaused: false, currentWord: "" }));
  }, []);

  const setVoiceProfile = useCallback(async (profile: VoiceProfile): Promise<void> => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    await bridge.setVoiceProfile(profile);
    setStatus(s => ({ ...s, activeVoiceProfile: profile }));
  }, []);

  const loadVoiceProfile = useCallback(async (profileId: string): Promise<VoiceProfile | null> => {
    const bridge = bridgeRef.current;
    if (!bridge) return null;
    const profile = await bridge.loadVoiceProfile(profileId);
    if (profile) setStatus(s => ({ ...s, activeVoiceProfile: profile }));
    return profile;
  }, []);

  const listVoiceProfiles = useCallback(async (): Promise<VoiceProfile[]> => {
    return bridgeRef.current?.listVoiceProfiles() ?? [];
  }, []);

  const search = useCallback(async (query: string, topK = 6): Promise<KSSearchResponse["results"]> => {
    return bridgeRef.current?.search(query, topK) ?? [];
  }, []);

  const getBooks = useCallback(async (): Promise<unknown[]> => {
    return bridgeRef.current?.getBooks() ?? [];
  }, []);

  const chat = useCallback(async (
    sessionId: string,
    message:   string,
    opts?:     { stream?: boolean; onToken?: (t: string) => void; useRAG?: boolean },
  ): Promise<string> => {
    const bridge = bridgeRef.current;
    if (!bridge) return "";
    setStatus(s => ({ ...s, aiLoading: true, aiStreaming: !!opts?.stream }));
    try {
      return await bridge.chat(sessionId, message, opts);
    } finally {
      setStatus(s => ({ ...s, aiLoading: false, aiStreaming: false }));
    }
  }, []);

  const loadModel = useCallback(async (
    manifestId:  string,
    onProgress?: (pct: number, msg: string) => void,
  ): Promise<void> => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setStatus(s => ({ ...s, aiLoading: true }));
    try {
      await bridge.loadModel(manifestId, onProgress);
    } finally {
      setStatus(s => ({ ...s, aiLoading: false }));
    }
  }, []);

  const ingestBook = useCallback(async (
    descriptor: { bookId: string; title: string; subject: string; author: string },
    chapters:   Array<{ title: string; text: string }>,
  ): Promise<void> => {
    await bridgeRef.current?.ingestBook(descriptor, chapters);
  }, []);

  return {
    ...status,
    speak,
    pauseTTS,
    resumeTTS,
    stopTTS,
    setVoiceProfile,
    loadVoiceProfile,
    listVoiceProfiles,
    search,
    getBooks,
    chat,
    loadModel,
    ingestBook,
  };
}
