/* ─────────────────────────────────────────────────────────────────────────────
 * SessionManager — Auto-logout after configurable idle timeout
 *
 * Tracks activity via: mousemove, mousedown, keydown, touchstart, scroll, click
 * Shows a 60-second warning before forcing logout.
 * Singleton — call sessionManager.start() after login, .stop() after logout.
 * ─────────────────────────────────────────────────────────────────────────── */

const DEFAULT_IDLE_MS = 30 * 60_000;   // 30 minutes
const DEFAULT_WARN_MS = 60_000;        // 1 minute warning before logout

const ACTIVITY_EVENTS = [
  "mousemove", "mousedown", "keydown",
  "touchstart", "scroll", "click",
] as const;

export type IdleCallback     = () => void;
export type WarnCallback     = (remainingSeconds: number) => void;

class SessionManager {
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _warnTimer: ReturnType<typeof setTimeout> | null = null;
  private _countdownInterval: ReturnType<typeof setInterval> | null = null;

  private _onLogout: IdleCallback  | null = null;
  private _onWarn:   WarnCallback  | null = null;
  private _onResume: IdleCallback  | null = null;

  private _idleMs   = DEFAULT_IDLE_MS;
  private _warnMs   = DEFAULT_WARN_MS;
  private _active   = false;
  private _warned   = false;

  private _handleActivity = (): void => {
    if (!this._active) return;
    if (this._warned) {
      /* User came back during warning window — cancel countdown */
      this._clearCountdown();
      this._warned = false;
      this._onResume?.();
    }
    this._schedule();
  };

  /**
   * Start monitoring idle time. Safe to call multiple times (resets on each call).
   */
  start(opts: {
    onLogout: IdleCallback;
    onWarn?:  WarnCallback;
    onResume?: IdleCallback;
    idleMs?:  number;
    warnMs?:  number;
  }): void {
    this.stop(); // clean slate

    this._onLogout = opts.onLogout;
    this._onWarn   = opts.onWarn   ?? null;
    this._onResume = opts.onResume ?? null;
    this._idleMs   = opts.idleMs   ?? DEFAULT_IDLE_MS;
    this._warnMs   = opts.warnMs   ?? DEFAULT_WARN_MS;
    this._active   = true;
    this._warned   = false;

    ACTIVITY_EVENTS.forEach(e =>
      window.addEventListener(e, this._handleActivity, { passive: true }),
    );

    this._schedule();
  }

  /** Stop monitoring (call on logout or component unmount). */
  stop(): void {
    this._clearTimers();
    this._clearCountdown();
    ACTIVITY_EVENTS.forEach(e =>
      window.removeEventListener(e, this._handleActivity),
    );
    this._active   = false;
    this._warned   = false;
    this._onLogout = null;
    this._onWarn   = null;
    this._onResume = null;
  }

  /** Manually reset the idle timer (e.g. after user dismisses a warning). */
  resetTimer(): void {
    if (!this._active) return;
    this._clearCountdown();
    this._warned = false;
    this._schedule();
  }

  /* ── private ──────────────────────────────────────────────────────────── */

  private _schedule(): void {
    this._clearTimers();

    /* Warn timer — fires WARN_MS before logout */
    this._warnTimer = setTimeout(() => {
      this._warned = true;
      let remaining = Math.round(this._warnMs / 1000);
      this._onWarn?.(remaining);

      /* Countdown ticks every second */
      this._countdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          this._onWarn?.(remaining);
        } else {
          this._clearCountdown();
        }
      }, 1000);
    }, this._idleMs - this._warnMs);

    /* Logout timer — fires at full idle timeout */
    this._idleTimer = setTimeout(() => {
      this.stop();
      this._onLogout?.();
    }, this._idleMs);
  }

  private _clearTimers(): void {
    if (this._idleTimer) { clearTimeout(this._idleTimer);  this._idleTimer = null; }
    if (this._warnTimer) { clearTimeout(this._warnTimer);  this._warnTimer = null; }
  }

  private _clearCountdown(): void {
    if (this._countdownInterval) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
  }
}

export const sessionManager = new SessionManager();
