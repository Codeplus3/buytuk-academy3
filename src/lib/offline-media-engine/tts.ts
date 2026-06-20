/* ─── OfflineMediaEngine — Local TTS Engine (Web Speech API / ONNX interface) ─── */

import type { TTSVoice, TTSOptions, TTSState } from "./types";

export type TTSLanguage = "ar" | "en";

/**
 * LocalTTSEngine
 * Exposes an ONNX-TTS–compatible interface but delegates to the browser's
 * native SpeechSynthesis API, which runs fully offline once voices are cached.
 *
 * Bilingual support: call speak(text, { lang: "en" }) for English TTS.
 * Default language is Arabic ("ar-SA"). Auto-selects best available voice
 * for the requested language.
 */
export class LocalTTSEngine {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private _state: TTSState = {
    speaking:    false,
    paused:      false,
    currentWord: "",
    charIndex:   0,
    voices:      [],
  };

  readonly available: boolean;

  constructor() {
    this.available = typeof speechSynthesis !== "undefined";
    if (this.available) {
      this.synth = speechSynthesis;
      this._loadVoices();
      this.synth.onvoiceschanged = () => this._loadVoices();
    }
  }

  private _loadVoices(): void {
    if (!this.synth) return;
    const raw = this.synth.getVoices();
    this._state.voices = raw.map(v => ({
      id:           v.name,
      name:         v.name,
      lang:         v.lang,
      localService: v.localService,
    }));
  }

  get state(): Readonly<TTSState> { return { ...this._state }; }

  getVoices(): TTSVoice[] { return this._state.voices; }

  /** Get the best available voice for a given language code ("ar" | "en"). */
  getBestVoiceForLang(lang: TTSLanguage): TTSVoice | null {
    const voices = this._state.voices;
    if (lang === "ar") {
      return (
        voices.find(v => v.lang.startsWith("ar") && v.localService) ??
        voices.find(v => v.lang.startsWith("ar")) ??
        voices.find(v => v.localService) ??
        voices[0] ??
        null
      );
    }
    /* English */
    return (
      voices.find(v => (v.lang === "en-US" || v.lang === "en-GB") && v.localService) ??
      voices.find(v => v.lang.startsWith("en") && v.localService) ??
      voices.find(v => v.lang.startsWith("en")) ??
      voices.find(v => v.localService) ??
      voices[0] ??
      null
    );
  }

  /** @deprecated Use getBestVoiceForLang("ar") instead */
  getBestArabicVoice(): TTSVoice | null {
    return this.getBestVoiceForLang("ar");
  }

  /** Preprocess text for cleaner TTS output (handles Arabic & Latin scripts). */
  private _normalise(text: string, lang: TTSLanguage): string {
    if (lang === "ar") {
      return text
        .replace(/[،؛]/g, ",")
        .replace(/[؟]/g, "?")
        .replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
        .trim();
    }
    /* English — basic normalisation */
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Synthesise text.
   * @param text    — Content to speak.
   * @param options — TTSOptions extended with `lang?: "ar" | "en"`.
   */
  speak(text: string, options: TTSOptions & { lang?: TTSLanguage } = {}): Promise<void> {
    if (!this.available || !this.synth) return Promise.reject(new Error("TTS unavailable"));

    this.stop();

    const lang = options.lang ?? "ar";
    const langTag = lang === "ar" ? "ar-SA" : "en-US";

    return new Promise((resolve, reject) => {
      const utt       = new SpeechSynthesisUtterance(this._normalise(text, lang));
      utt.rate        = options.rate   ?? 0.9;
      utt.pitch       = options.pitch  ?? 1.0;
      utt.volume      = options.volume ?? 1.0;
      utt.lang        = langTag;

      const voices    = this.synth!.getVoices();
      const bestVoice = options.voice
        ? voices.find(v => v.name === options.voice!.id) ?? null
        : (() => {
            const best = this.getBestVoiceForLang(lang);
            return best ? voices.find(v => v.name === best.id) ?? null : null;
          })();

      if (bestVoice) utt.voice = bestVoice;

      utt.onstart    = () => { this._state.speaking = true; this._state.paused = false; };
      utt.onend      = () => {
        this._state.speaking    = false;
        this._state.currentWord = "";
        options.onEnd?.();
        resolve();
      };
      utt.onerror    = e => {
        this._state.speaking = false;
        if ((e as SpeechSynthesisErrorEvent).error !== "interrupted") reject(e);
        else resolve();
      };
      utt.onboundary = e => {
        if (e.name === "word") {
          const word = text.slice(e.charIndex, e.charIndex + (e.charLength ?? 0));
          this._state.currentWord = word;
          this._state.charIndex   = e.charIndex;
          options.onWord?.(word, e.charIndex);
        }
      };

      this.currentUtterance = utt;
      this.synth!.speak(utt);
    });
  }

  pause(): void {
    if (!this.available || !this.synth?.speaking) return;
    this.synth.pause();
    this._state.paused = true;
  }

  resume(): void {
    if (!this.available || !this.synth?.paused) return;
    this.synth.resume();
    this._state.paused = false;
  }

  stop(): void {
    if (!this.available || !this.synth) return;
    this.synth.cancel();
    this._state.speaking    = false;
    this._state.paused      = false;
    this._state.currentWord = "";
    this.currentUtterance   = null;
  }

  /** Simulates ONNX model warm-up. Returns backend info. */
  async init(): Promise<{ backend: "onnx-wasm" | "browser-tts"; voices: number; languages: string[] }> {
    await new Promise(r => setTimeout(r, 120));
    this._loadVoices();
    const langs = [...new Set(this._state.voices.map(v => v.lang.split("-")[0]))];
    return { backend: "browser-tts", voices: this._state.voices.length, languages: langs };
  }
}
