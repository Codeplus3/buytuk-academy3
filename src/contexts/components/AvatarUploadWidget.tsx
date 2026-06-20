/**
 * AvatarUploadWidget
 * Generic photo-upload card for Admin / SchoolAdmin
 * (Teachers use ProfileSettingsPanel which writes into the teachers DB record.)
 *
 * Storage: localStorage key  buytuk_photo_<email>  (base64 data-URL)
 */
import { useState, useRef } from "react";
import { UserAvatar } from "./UserAvatar";
import { toast } from "./Toast";

const MAX_BYTES = 2 * 1024 * 1024;

export const photoKey    = (email: string) => `buytuk_photo_${email}`;
export const getPhoto    = (email: string): string | undefined =>
  localStorage.getItem(photoKey(email)) ?? undefined;
export const removePhoto = (email: string) =>
  localStorage.removeItem(photoKey(email));

interface Props {
  email:            string;
  name:             string;
  initialPhoto?:    string;
  onPhotoChange?:   (url: string | undefined) => void;
  card:             React.CSSProperties;
}

export function AvatarUploadWidget({ email, name, initialPhoto, onPhotoChange, card }: Props) {
  const [preview, setPreview] = useState<string | undefined>(initialPhoto);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const persist = (url: string | undefined) => {
    if (url) localStorage.setItem(photoKey(email), url);
    else removePhoto(email);
    setPreview(url);
    onPhotoChange?.(url);
  };

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
      persist(ev.target?.result as string);
      setLoading(false);
      toast("✅ تم حفظ الصورة الشخصية", "success");
    };
    reader.onerror = () => { setLoading(false); toast("خطأ في قراءة الملف", "error"); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div style={{ ...card, maxWidth: 480, marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: "var(--primary)" }}>
        📸 الصورة الشخصية
      </h3>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* Live preview */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <UserAvatar name={name} src={preview} size={80} border="3px solid var(--primary)" />
          {loading && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "rgba(0,0,0,0.45)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                width: 20, height: 20,
                border: "2px solid rgba(255,255,255,0.4)",
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
              ref={fileRef} type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleFile}
            />
            <button
              onClick={() => fileRef.current?.click()} disabled={loading}
              style={{
                padding: "8px 16px", background: "var(--primary)", border: "none",
                borderRadius: "var(--radius-sm)", color: "#fff",
                cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 700,
              }}>
              {loading ? "جاري الرفع..." : "📁 اختر صورة"}
            </button>
            {preview && !loading && (
              <button
                onClick={() => persist(undefined)}
                style={{
                  padding: "8px 16px", background: "rgba(255,71,87,0.1)",
                  border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)",
                  color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 700,
                }}>
                🗑 إزالة
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
