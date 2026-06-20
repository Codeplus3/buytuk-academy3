/**
 * social-config.ts
 * ─────────────────────────────────────────────────
 * Central configuration for BuyTuk Academy platform
 * social / contact links. Edit href values here only.
 */

export interface SocialLink {
  id:    string;
  label: string;
  href:  string;
  color: string;
}

const LS_KEY = "buytuk_social_links_v1";

/** Returns persisted links (admin-edited) or falls back to defaults */
export function getSocialLinks(): SocialLink[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as SocialLink[];
  } catch { /* ignore */ }
  return [...PLATFORM_SOCIAL_LINKS];
}

/** Persists links and fires a CustomEvent so GlobalSocialLinks updates live */
export function saveSocialLinks(links: SocialLink[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(links));
  window.dispatchEvent(new CustomEvent("buytuk:social-links-changed"));
}

export const PLATFORM_SOCIAL_LINKS: SocialLink[] = [
  {
    id:    "facebook",
    label: "فيسبوك",
    href:  "https://facebook.com/buytukacademy",
    color: "#1877F2",
  },
  {
    id:    "telegram",
    label: "تلجرام",
    href:  "https://t.me/buytukacademy",
    color: "#2AABEE",
  },
  {
    id:    "whatsapp",
    label: "واتساب",
    href:  "https://wa.me/201010389600",
    color: "#25D366",
  },
  {
    id:    "youtube",
    label: "يوتيوب",
    href:  "https://youtube.com/@buytukacademy",
    color: "#FF0000",
  },
  {
    id:    "instagram",
    label: "إنستغرام",
    href:  "https://instagram.com/buytukacademy",
    color: "#E4405F",
  },
];
