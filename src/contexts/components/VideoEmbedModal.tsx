/**
 * VideoEmbedModal
 * ──────────────────────────────────────────────────────────────────
 * Teacher-facing modal to add an embedded video lesson to a Subject.
 * Supports YouTube (watch / short / embed) and Vimeo URLs.
 * Auto-converts watch URLs to embed URLs — teacher pastes any link.
 * Saves directly to localStorage via saveSubjects().
 */
import { useState } from "react";
import { getSubjects, saveSubjects } from "@/lib/db";
import type { Subject, EmbedVideo } from "@/lib/db";
import { toast } from "./Toast";

/* ── URL helpers ─────────────────────────────────────────────────── */
function toEmbedUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already a valid embed URL
  if (/youtube\.com\/embed\/[a-zA-Z0-9_-]+/.test(s)) return s;
  if (/player\.vimeo\.com\/video\/\d+/.test(s)) return s;

  // youtube.com/watch?v=ID  or  youtube.com/watch?v=ID&...
  const ytWatch = s.match(/youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]+)/);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;

  // youtu.be/ID
  const ytShort = s.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;

  // vimeo.com/ID
  const vimeo = s.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return null;  // unrecognised
}

function EmbedPreview({ url }: { url: string }) {
  return (
    <div style={{ borderRadius: "var(--radius-sm)", overflow: "hidden", marginTop: 12 }}>
      <iframe
        src={url}
        width="100%"
        height="220"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allowFullScreen
        style={{ border: "none", display: "block" }}
        title="معاينة الفيديو"
      />
    </div>
  );
}

interface Props {
  subject:  Subject;
  addedBy:  string;   // teacher name
  onClose:  () => void;
  onSaved:  (updated: Subject) => void;
}

export function VideoEmbedModal({ subject, addedBy, onClose, onSaved }: Props) {
  const [title,       setTitle]       = useState("");
  const [rawUrl,      setRawUrl]      = useState("");
  const [description, setDescription] = useState("");
  const [saving,      setSaving]      = useState(false);

  const embedUrl = toEmbedUrl(rawUrl);
  const urlValid = !!embedUrl;

  const handleSave = () => {
    if (!title.trim()) { toast("أدخل عنوان الفيديو", "warning"); return; }
    if (!urlValid)     { toast("رابط الفيديو غير صالح — استخدم رابط YouTube أو Vimeo", "warning"); return; }

    setSaving(true);
    const newVideo: EmbedVideo = {
      id:          `vid_${Date.now()}`,
      title:       title.trim(),
      embedUrl:    embedUrl!,
      description: description.trim(),
      addedAt:     new Date().toISOString(),
      addedBy,
    };

    const allSubjects = getSubjects();
    const updated = allSubjects.map(s =>
      s.id === subject.id
        ? { ...s, videos: [...(s.videos ?? []), newVideo] }
        : s,
    );
    saveSubjects(updated);
    const fresh = updated.find(s => s.id === subject.id)!;
    onSaved(fresh);
    setSaving(false);
    toast(`✅ تم إضافة "${newVideo.title}"`, "success");
    onClose();
  };

  const lbl: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700,
    color: "var(--text-muted)", marginBottom: 6,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--card)", border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius)", padding: 28, width: "100%", maxWidth: 540,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
            🎬 إضافة درس مرئي — {subject.icon} {subject.name}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>✕</button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>عنوان الدرس *</label>
          <input
            className="form-control"
            placeholder="مثال: الدرس الأول — مقدمة في الجبر"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ fontSize: 14 }}
          />
        </div>

        {/* URL */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>رابط الفيديو * (YouTube أو Vimeo)</label>
          <input
            className="form-control"
            placeholder="https://youtube.com/watch?v=... أو رابط embed مباشر"
            value={rawUrl}
            onChange={e => setRawUrl(e.target.value)}
            style={{
              fontSize: 13, direction: "ltr", textAlign: "start",
              borderColor: rawUrl.trim() ? (urlValid ? "var(--success)" : "var(--danger)") : undefined,
            }}
          />
          {rawUrl.trim() && !urlValid && (
            <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
              ⚠️ الرابط غير معروف — الصق رابط YouTube أو Vimeo مباشرة
            </p>
          )}
          {urlValid && (
            <p style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
              ✅ رابط صالح — معاينة ↓
            </p>
          )}
        </div>

        {/* Live preview */}
        {urlValid && embedUrl && <EmbedPreview url={embedUrl} />}

        {/* Description */}
        <div style={{ marginTop: 16, marginBottom: 20 }}>
          <label style={lbl}>وصف قصير (اختياري)</label>
          <textarea
            className="form-control"
            placeholder="ملاحظات أو محتوى الدرس..."
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ fontSize: 13, resize: "vertical" }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !urlValid}
            style={{
              flex: 1, padding: "11px 0",
              background: title.trim() && urlValid ? "var(--primary)" : "var(--border)",
              border: "none", borderRadius: "var(--radius-sm)",
              color: title.trim() && urlValid ? "#fff" : "var(--text-muted)",
              cursor: title.trim() && urlValid ? "pointer" : "default",
              fontSize: 14, fontWeight: 700,
            }}
          >
            {saving ? "جاري الحفظ..." : "💾 إضافة الفيديو"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "11px 20px", background: "transparent",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)", cursor: "pointer", fontSize: 14,
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

