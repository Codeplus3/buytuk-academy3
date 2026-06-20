import { useState, useRef } from "react";
import { getTeachers, saveTeachers } from "@/lib/db";
import { UserAvatar } from "./UserAvatar";
import { toast } from "./Toast";

interface Props {
  teacherEmail:    string;
  name:            string;
  initialAvatarUrl?: string;
  onAvatarChange:  (url: string) => void;
  card:            React.CSSProperties;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function ProfileSettingsPanel({
  teacherEmail, name, initialAvatarUrl, onAvatarChange, card,
}: Props) {
  const [preview, setPreview] = useState<string | undefined>(initialAvatarUrl);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("الملف يجب أن يكون صورة (JPG, PNG, WebP)", "warning"); return;
    }
    if (file.size > MAX_BYTES) {
      toast("حجم الصورة يجب أن يكون أقل من 2MB", "warning"); return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = ev.target?.result as string;
      const all    = getTeachers();
      saveTeachers(all.map(t => t.email === teacherEmail ? { ...t, avatarUrl: base64 } : t));
      setPreview(base64);
      onAvatarChange(base64);
      setLoading(false);
      toast("✅ تم رفع الصورة الشخصية وحفظها", "success");
    };
    reader.onerror = () => { setLoading(false); toast("خطأ في قراءة الملف", "error"); };
    reader.readAsDataURL(file);

    e.target.value = "";
  };

  const removeAvatar = () => {
    const all = getTeachers();
    saveTeachers(all.map(t => t.email === teacherEmail ? { ...t, avatarUrl: undefined } : t));
    setPreview(undefined);
    onAvatarChange("");
    toast("تم حذف الصورة الشخصية", "info");
  };

  return (
    <div style={{ ...card, maxWidth: 480, marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: "var(--primary)" }}>
        📸 الصورة الشخصية
      </h3>

      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 8 }}>
        {/* Live preview */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <UserAvatar name={name} src={preview} size={80} border="3px solid var(--primary)" />
          {loading && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "rgba(0,0,0,0.4)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                width: 20, height: 20, border: "2px solid rgba(255,255,255,0.4)",
                borderTopColor: "#fff", borderRadius: "50%",
                animation: "spin 0.6s linear infinite",
                display: "inline-block",
              }} />
            </div>
          )}
        </div>

        <div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
            JPG أو PNG أو WebP<br />الحد الأقصى للحجم: 2MB
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleFile}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              style={{
                padding: "8px 16px",
                background: "var(--primary)", border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#fff", cursor: loading ? "wait" : "pointer",
                fontSize: 13, fontWeight: 700,
              }}
            >
              {loading ? "جاري الرفع..." : "📁 اختر صورة"}
            </button>
            {preview && !loading && (
              <button
                onClick={removeAvatar}
                style={{
                  padding: "8px 16px",
                  background: "rgba(255,71,87,0.1)",
                  border: "1px solid var(--danger)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--danger)", cursor: "pointer",
                  fontSize: 13, fontWeight: 700,
                }}
              >
                🗑 إزالة
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

