/* ─────────────────────────────────────────────────────────────────────────────
 * Security Module
 *  1. AuditLog     — per-event log stored in localStorage (max 500 entries)
 *  2. BruteForce   — lockout after 5 failed attempts for 15 minutes
 *  3. sanitize()   — XSS-safe input cleaning (no external deps)
 *  4. SubtleCrypto — HMAC-SHA256 session token signing / verification
 * ─────────────────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════════════════
 * 1. AUDIT LOG
 * ════════════════════════════════════════════════════════════════════════════ */

export type AuditEventType =
  | "login_success"
  | "login_failed"
  | "logout"
  | "account_locked"
  | "account_unlocked"
  | "register"
  | "permission_change"
  | "subscription_change"
  | "password_reset_request"
  | "session_expired";

export interface AuditLog {
  id:         string;
  email:      string;
  name:       string;
  type:       AuditEventType;
  timestamp:  number;
  userAgent:  string;   // truncated to 120 chars
  device:     string;   // "mobile" | "desktop" | "tablet"
  browser:    string;   // simplified browser name
  suspicious: boolean;  // true when ≥ 3 consecutive failures within 15 min
  details?:   string;
}

const LS_AUDIT  = "ome_audit_logs";
const MAX_LOGS  = 500;
const SUSP_WINDOW_MS = 15 * 60_000;

function _detectDevice(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua))          return "tablet";
  return "desktop";
}

function _detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua))                       return "Firefox";
  if (/Edg\//i.test(ua))                           return "Edge";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua))   return "Safari";
  if (/OPR\/|Opera\//i.test(ua))                   return "Opera";
  return "Other";
}

export function addAuditLog(
  entry: Omit<AuditLog, "id" | "userAgent" | "device" | "browser" | "timestamp" | "suspicious">,
): void {
  const logs = getAuditLogs();

  /* Suspicious detection: ≥ 3 failed attempts for same email in past 15 min */
  let suspicious = false;
  if (entry.type === "login_failed") {
    const recentFails = logs.filter(
      l => l.email.toLowerCase() === entry.email.toLowerCase() &&
           l.type === "login_failed" &&
           l.timestamp > Date.now() - SUSP_WINDOW_MS,
    );
    if (recentFails.length >= 2) suspicious = true; // this is the 3rd+
  }

  const record: AuditLog = {
    id:         `al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp:  Date.now(),
    userAgent:  navigator.userAgent.substring(0, 120),
    device:     _detectDevice(),
    browser:    _detectBrowser(),
    suspicious,
    ...entry,
  };

  logs.unshift(record);
  try { localStorage.setItem(LS_AUDIT, JSON.stringify(logs.slice(0, MAX_LOGS))); }
  catch { /* quota exceeded — non-fatal */ }
}

export function getAuditLogs(): AuditLog[] {
  try { return JSON.parse(localStorage.getItem(LS_AUDIT) ?? "[]") as AuditLog[]; }
  catch { return []; }
}

export function clearAuditLogs(): void { localStorage.removeItem(LS_AUDIT); }

/* ════════════════════════════════════════════════════════════════════════════
 * 2. BRUTE-FORCE PROTECTION
 * ════════════════════════════════════════════════════════════════════════════ */

interface BruteEntry {
  attempts:    number;
  lockedUntil: number | null;
}

const LS_BRUTE     = "ome_brute_force";
const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000; // 15 minutes

function _loadBrute(): Record<string, BruteEntry> {
  try { return JSON.parse(localStorage.getItem(LS_BRUTE) ?? "{}") as Record<string, BruteEntry>; }
  catch { return {}; }
}
function _saveBrute(b: Record<string, BruteEntry>): void {
  try { localStorage.setItem(LS_BRUTE, JSON.stringify(b)); } catch { /* noop */ }
}

/** Returns current lock state for an email. Clears expired locks automatically. */
export function checkLocked(email: string): { locked: boolean; remainingMs: number } {
  const brute = _loadBrute();
  const entry = brute[email.toLowerCase()];
  if (!entry?.lockedUntil) return { locked: false, remainingMs: 0 };
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    delete brute[email.toLowerCase()];
    _saveBrute(brute);
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs: remaining };
}

/**
 * Records one failed login attempt.
 * Returns whether account is now locked + how many attempts remain.
 */
export function recordFailedAttempt(email: string): { locked: boolean; attemptsLeft: number } {
  const brute = _loadBrute();
  const key   = email.toLowerCase();
  const entry = brute[key] ?? { attempts: 0, lockedUntil: null };

  entry.attempts++;

  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    brute[key] = entry;
    _saveBrute(brute);
    addAuditLog({
      email,
      name:    email,
      type:    "account_locked",
      details: `${entry.attempts} محاولات فاشلة متتالية`,
    });
    return { locked: true, attemptsLeft: 0 };
  }

  brute[key] = entry;
  _saveBrute(brute);
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - entry.attempts };
}

/** Clears failed-attempt counter after successful login. */
export function clearFailedAttempts(email: string): void {
  const brute = _loadBrute();
  delete brute[email.toLowerCase()];
  _saveBrute(brute);
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. INPUT SANITIZATION  (no external deps — manual XSS prevention)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Sanitizes user text input to prevent XSS.
 * Escapes HTML special chars, strips dangerous attributes and protocols.
 * Use on ALL user-supplied text before storing or rendering as innerHTML.
 */
export function sanitizeInput(raw: string): string {
  return raw
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#x27;")
    .replace(/`/g,  "&#x60;")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi,       "")
    .replace(/vbscript:/gi,   "")
    .replace(/on\w+\s*=/gi,   "")
    .trim();
}

/** Strips all HTML tags — returns plain text only. */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4. SESSION INTEGRITY — SubtleCrypto HMAC-SHA256 signing
 *
 * Key lives in sessionStorage (cleared on tab/browser close).
 * Token format: "<payload>.<hex-signature>"
 * ════════════════════════════════════════════════════════════════════════════ */

const SS_KEY = "ome_session_hmac_key";

async function _getHmacKey(): Promise<CryptoKey> {
  const stored = sessionStorage.getItem(SS_KEY);

  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0)).buffer;
    return crypto.subtle.importKey(
      "raw", raw,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }

  const key      = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  sessionStorage.setItem(SS_KEY, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

/**
 * Signs a session payload string with HMAC-SHA256.
 * Returns "payload.hexSignature".
 */
export async function signSession(payload: string): Promise<string> {
  const key = await _getHmacKey();
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payload}.${hex}`;
}

/**
 * Verifies a signed session token.
 * Returns the original payload on success, null if tampered or invalid.
 */
export async function verifySession(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;

  const payload  = token.substring(0, dot);
  const hexSig   = token.substring(dot + 1);

  try {
    const key      = await _getHmacKey();
    const enc      = new TextEncoder();
    const sigBytes = new Uint8Array(
      (hexSig.match(/.{2}/g) ?? []).map(h => parseInt(h, 16)),
    );
    const valid    = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload));
    return valid ? payload : null;
  } catch {
    return null;
  }
}
