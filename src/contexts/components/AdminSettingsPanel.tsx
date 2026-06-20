import { useState } from "react";
import { getSocialLinks, saveSocialLinks } from "../lib/social-config";
import type { SocialLink } from "../lib/social-config";
import { toast } from "./Toast";

const SOCIAL_META: Record<string, { emoji: string; label: string; placeholder: string }> = {
  facebook:  { emoji: "🟦", label: "فيسبوك",    placeholder: "https://facebook.com/..." },
  telegram:  { emoji: "✈️",  label: "تلجرام",    placeholder: "https://t.me/..."         },
  whatsapp:  { emoji: "💬",  label: "واتساب",     placeholder: "https://wa.me/..."        },
  youtube:   { emoji: "🔴",  label: "يوتيوب",    placeholder: "https://youtube.com/..."  },
  instagram: { emoji: "📸",  label: "إنستغرام",  placeholder: "https://instagram.com/..." },
};

interface Props {
  card: React.CSSProperties;
}

export function AdminSettingsPanel({ card }: Props) {
  const [links,   setLinks]   = useState<SocialLink[]>(() => getSocialLinks());
  const [dirty,   setDirty]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const update = (id: string, href: string) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, href } : l));
    setDirty(true);
    setSavedOk(false);
  };

  const save = () => {
    saveSocialLinks(links);
    setDirty(false);
    setSavedOk(true);
    toast("تم حفظ روابط التواصل ✅", "success");
    setTimeout(() => setSavedOk(false), 2500);
  };

  const reset = () => {
    setLinks(getSocialLinks());
    setDirty(false);
  };

  const lbl: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700,
    color: "var(--text-muted)", marginBottom: 6,
  };

  return (
    <div className="page-flip">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>⚙️ إعدادات المنصة</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        هذه الإعدادات تؤثر على جميع المستخدمين في المنصة.
      </p>

      {/* ── Social Links ── */}
      <div style={{ ...card, maxWidth: 600 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, color: "var(--primary)" }}>
          🔗 روابط التواصل الاجتماعي
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
          تظهر هذه الروابط في الشريط الجانبي لجميع الأساتذة والطلاب.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {links.map(link => {
            const meta = SOCIAL_META[link.id];
            return (
              <div key={link.id}>
                <label style={lbl}>
                  {meta?.emoji ?? "🔗"} {meta?.label ?? link.label}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="url"
                    className="form-control"
                    value={link.href}
                    onChange={e => update(link.id, e.target.value)}
                    placeholder={meta?.placeholder ?? "https://..."}
                    style={{
                      fontSize: 13,
                      direction: "ltr",
                      textAlign: "start",
                      paddingInlineEnd: 14,
                      borderColor: link.color + "66",
                    }}
                  />
                  <span style={{
                    position: "absolute",
                    top: "50%", insetInlineEnd: 12,
                    transform: "translateY(-50%)",
                    width: 10, height: 10,
                    borderRadius: "50%",
                    background: link.color,
                    pointerEvents: "none",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={save}
            disabled={!dirty}
            style={{
              padding: "10px 28px",
              background: savedOk ? "var(--success)" : dirty ? "var(--primary)" : "var(--border)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: dirty ? "#fff" : "var(--text-muted)",
              cursor: dirty ? "pointer" : "default",
              fontSize: 14, fontWeight: 700,
              transition: "background 0.2s, color 0.2s",
            }}
          >
            {savedOk ? "✅ تم الحفظ" : "💾 حفظ الروابط"}
          </button>
          {dirty && (
            <button onClick={reset} style={{
              padding: "10px 18px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
            }}>
              إلغاء
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
