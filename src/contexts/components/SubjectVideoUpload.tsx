/**
 * SubjectVideoUpload
 * ------------------
 * Displays the video-upload card + curriculum/voice status card
 * + quick-action buttons for a single subject.
 *
 * All state lives in the parent (TeacherDashboard).
 * This component only fires callbacks — it never reads/writes IDB directly.
 *
 * Role-guard: upload button is rendered only when userRole === "teacher".
 */
import { useRef } from "react";
import type { Subject } from "../lib/db";

interface Props {
  subject:          Subject;
  uploadingVideo:   string | null;
  uploadingCurr?:   string | null;
  uploadingVoice?:  string | null;
  uploadProgress:   Record<string, number>;
  userRole:         string;
  onUpload:         (subjId: string, file: File) => void;
  onUploadCurriculum?: (subjId: string, file: File) => void;
  onUploadVoice?:      (subjId: string, file: File) => void;
  onGoToQuestions: () => void;
  onGoToExams:    () => void;
}

/* ── Shared design tokens ──────────────────────────────────────────── */
const CARD: React.CSSProperties = {
  background:   "var(--card)",
  border:       "1px solid var(--glass-border)",
  borderRadius: "var(--radius)",
  paddingBlock:  24,
  paddingInline: 20,
  boxShadow:    "0 2px 12px rgba(0,0,0,0.18)",
  transition:   "box-shadow 0.2s",
};

const CARD_TITLE: React.CSSProperties = {
  fontSize:          15,
  fontWeight:        800,
  marginBlockEnd:    18,
  paddingBlockEnd:   12,
  borderBlockEnd:    "1px solid var(--glass-border)",
  borderInlineStart: "3px solid var(--primary)",
  paddingInlineStart: 10,
  display:           "flex",
  alignItems:        "center",
  gap:               8,
};

export function SubjectVideoUpload({
  subject,
  uploadingVideo,
  uploadingCurr,
  uploadingVoice,
  uploadProgress,
  userRole,
  onUpload,
  onUploadCurriculum,
  onUploadVoice,
  onGoToQuestions,
  onGoToExams,
}: Props) {
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const currInputRef     = useRef<HTMLInputElement>(null);
  const voiceInputRef    = useRef<HTMLInputElement>(null);

  const pKey      = `video_${subject.id}`;
  const isUploading = uploadingVideo === subject.id;
  const pct       = uploadProgress[pKey];
  const isTeacher = userRole === "teacher";

  const resources = [
    {
      icon:   "📄",
      label:  "المنهج PDF",
      active: !!subject.curriculumFileId,
      name:   subject.curriculumFileName ?? null,
    },
    {
      icon:   "🎙",
      label:  "الصوت التعريفي",
      active: !!subject.voiceProfileId,
      name:   subject.voiceProfileId ? "نشط" : null,
    },
  ] as const;

  return (
    <div>
      {/* Hidden file inputs — only used by teacher */}
      {isTeacher && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.webm,.mkv,.mov,.avi"
            style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUpload(subject.id, file);
              e.target.value = "";
            }}
          />
          <input
            ref={currInputRef}
            type="file"
            accept=".pdf,.epub"
            style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file && onUploadCurriculum) onUploadCurriculum(subject.id, file);
              e.target.value = "";
            }}
          />
          <input
            ref={voiceInputRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/m4a,audio/*"
            style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file && onUploadVoice) onUploadVoice(subject.id, file);
              e.target.value = "";
            }}
          />
        </>
      )}

      {/* ── Responsive grid: video card | resources card ── */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap:                 20,
        }}
      >
        {/* ── Video upload card ── */}
        <div style={CARD}>
          <h4 style={CARD_TITLE}>
            🎬 فيديو الدرس
          </h4>

          {/* Status row */}
          <div
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           10,
              paddingBlock:  12,
              paddingInline: 14,
              borderRadius:  "var(--radius-sm)",
              background:     subject.videoFileId
                ? "rgba(0,200,150,0.08)"
                : "rgba(255,255,255,0.04)",
              border:         `1px solid ${
                subject.videoFileId
                  ? "rgba(0,200,150,0.3)"
                  : "var(--border)"
              }`,
              marginBlockEnd: 16,
            }}
          >
            <span style={{ fontSize: 24 }}>
              {subject.videoFileId ? "✅" : "📭"}
            </span>
            <div>
              <div
                style={{
                  fontSize:   13,
                  fontWeight: 700,
                  color:      subject.videoFileId
                    ? "var(--success)"
                    : "var(--text-muted)",
                }}
              >
                {subject.videoFileId ? "فيديو مرفوع" : "لم يُرفع فيديو بعد"}
              </div>
              {subject.videoFileName && (
                <div
                  style={{
                    fontSize:     11,
                    color:        "var(--text-muted)",
                    marginBlockStart: 2,
                  }}
                >
                  {subject.videoFileName}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar — shown while uploading or just after */}
          {pct !== undefined && (
            <div style={{ marginBlockEnd: 14 }}>
              <div
                style={{
                  display:        "flex",
                  justifyContent: "space-between",
                  fontSize:       11,
                  color:          "var(--text-muted)",
                  marginBlockEnd: 4,
                }}
              >
                <span>{isUploading ? "جارٍ الرفع…" : "اكتمل ✅"}</span>
                <span>{pct}%</span>
              </div>
              <div
                style={{
                  height:       6,
                  background:   "var(--border)",
                  borderRadius: 4,
                  overflow:     "hidden",
                }}
              >
                <div
                  style={{
                    height:     "100%",
                    borderRadius: 4,
                    width:      `${pct}%`,
                    background: "linear-gradient(90deg,var(--primary),var(--secondary))",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          )}

          {/* Upload button — teacher only */}
          {isTeacher && (
            <>
              <button
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width:        "100%",
                  paddingBlock:  11,
                  paddingInline: 0,
                  background:   "linear-gradient(135deg,rgba(255,165,0,0.2),rgba(255,165,0,0.1))",
                  border:       "1px solid rgba(255,165,0,0.4)",
                  borderRadius: "var(--radius-sm)",
                  color:        "#FFA500",
                  cursor:       isUploading ? "not-allowed" : "pointer",
                  fontSize:     13,
                  fontWeight:   700,
                  fontFamily:   "inherit",
                  opacity:      isUploading ? 0.6 : 1,
                  transition:   "opacity 0.2s, transform 0.15s",
                }}
              >
                {isUploading
                  ? "⏳ جارٍ الرفع…"
                  : subject.videoFileId
                    ? "🔄 استبدال الفيديو"
                    : "⬆️ رفع فيديو الدرس"}
              </button>
              <p
                style={{
                  fontSize:     11,
                  color:        "var(--text-muted)",
                  marginBlockStart: 8,
                  lineHeight:   1.6,
                }}
              >
                صيغ مدعومة: MP4، WebM، MKV، MOV · الفيديو يُخزَّن محلياً
                ويُتزامن مع الطلاب تلقائياً
              </p>
            </>
          )}
        </div>

        {/* ── Resources status card ── */}
        <div style={CARD}>
          <h4 style={{ ...CARD_TITLE, borderInlineStartColor: "var(--secondary)" }}>
            📄 الملفات والموارد
          </h4>

          {resources.map(r => (
            <div
              key={r.label}
              style={{
                display:       "flex",
                alignItems:    "center",
                gap:           10,
                paddingBlock:  10,
                paddingInline: 12,
                borderRadius:  "var(--radius-sm)",
                background:     r.active
                  ? "rgba(0,200,150,0.06)"
                  : "rgba(255,255,255,0.03)",
                border:         `1px solid ${
                  r.active ? "rgba(0,200,150,0.25)" : "var(--border)"
                }`,
                marginBlockEnd: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>{r.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                {r.name && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {r.name}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize:   11,
                  color:      r.active ? "var(--success)" : "var(--text-muted)",
                  fontWeight: 700,
                }}
              >
                {r.active ? "✅ موجود" : "— غير مرفوع"}
              </span>
            </div>
          ))}

          {/* ── Upload buttons for curriculum & voice (teacher) ── */}
          {isTeacher && (onUploadCurriculum || onUploadVoice) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlockStart: 12 }}>

              {/* Curriculum PDF */}
              {onUploadCurriculum && (() => {
                const pKey = `curr_${subject.id}`;
                const busy  = uploadingCurr === subject.id;
                const pct   = uploadProgress[pKey];
                return (
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <button
                      onClick={() => currInputRef.current?.click()}
                      disabled={busy}
                      style={{
                        width: "100%", padding: "9px 14px", borderRadius: 10,
                        background: busy ? "var(--border)" : subject.curriculumFileId
                          ? "rgba(0,200,150,0.12)" : "rgba(108,99,255,0.12)",
                        color: busy ? "var(--text-muted)" : subject.curriculumFileId
                          ? "var(--success)" : "var(--primary)",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontFamily: "inherit", fontWeight: 700, fontSize: 12,
                        border: `1px solid ${subject.curriculumFileId ? "rgba(0,200,150,0.3)" : "rgba(108,99,255,0.3)"}`,
                      }}
                    >
                      {busy ? `⏳ ${pct ?? 0}%` : subject.curriculumFileId ? "🔄 تحديث PDF" : "📤 رفع PDF"}
                    </button>
                    {busy && typeof pct === "number" && (
                      <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Voice profile */}
              {onUploadVoice && (() => {
                const pKey = `voice_${subject.id}`;
                const busy  = uploadingVoice === subject.id;
                const pct   = uploadProgress[pKey];
                return (
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <button
                      onClick={() => voiceInputRef.current?.click()}
                      disabled={busy}
                      style={{
                        width: "100%", padding: "9px 14px", borderRadius: 10,
                        background: busy ? "var(--border)" : subject.voiceProfileId
                          ? "rgba(0,200,150,0.12)" : "rgba(255,159,64,0.12)",
                        color: busy ? "var(--text-muted)" : subject.voiceProfileId
                          ? "var(--success)" : "var(--warning)",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontFamily: "inherit", fontWeight: 700, fontSize: 12,
                        border: `1px solid ${subject.voiceProfileId ? "rgba(0,200,150,0.3)" : "rgba(255,159,64,0.3)"}`,
                      }}
                    >
                      {busy ? `⏳ ${pct ?? 0}%` : subject.voiceProfileId ? "🔄 تحديث الصوت" : "🎙 رفع صوت تعريفي"}
                    </button>
                    {busy && typeof pct === "number" && (
                      <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "var(--warning)", borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          )}
        </div>
      </div>

      {/* ── Quick-action buttons — teacher only ── */}
      {isTeacher && (
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap:                 16,
            marginBlockStart:    20,
          }}
        >
          {(
            [
              {
                onClick: onGoToQuestions,
                bg:      "rgba(108,99,255,0.1)",
                border:  "var(--primary)",
                color:   "var(--primary)",
                label:   "إدارة بنك الأسئلة",
                icon:    "❓",
              },
              {
                onClick: onGoToExams,
                bg:      "rgba(236,72,153,0.1)",
                border:  "var(--secondary)",
                color:   "var(--secondary)",
                label:   "إدارة الاختبارات",
                icon:    "📝",
              },
            ] as const
          ).map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              style={{
                paddingBlock:   16,
                paddingInline:  20,
                background:     btn.bg,
                border:         `1px solid ${btn.border}`,
                borderRadius:   "var(--radius)",
                color:          btn.color,
                cursor:         "pointer",
                fontSize:       14,
                fontWeight:     700,
                fontFamily:     "inherit",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            8,
                transition:     "transform 0.15s, box-shadow 0.15s",
                boxShadow:      `0 0 0 0 ${btn.border}`,
              }}
            >
              <span style={{ fontSize: 18 }}>{btn.icon}</span>
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
