/* LessonManager — Admin component: manage lessons organized by units per subject */
import { useState, useRef } from "react";
import { getLessons, saveLessons, storeLessonFile, ORDINAL_AR } from "@/lib/db";
import type { Lesson } from "@/lib/db";
import { toast } from "./Toast";
import { syncEngine } from "@/lib/sync-engine";

interface Props {
  subjectId: string;
  subjectName: string;
  onClose: () => void;
}

export function LessonManager({ subjectId, subjectName, onClose }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>(() =>
    getLessons().filter(l => l.subjectId === subjectId)
  );
  const [form, setForm] = useState({
    unitNumber: 1, unitName: "", lessonNumber: 1, lessonName: "",
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const pendingLessonId   = useRef<string | null>(null);

  const label12: React.CSSProperties = {
    display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600,
  };

  const refresh = () =>
    setLessons(getLessons().filter(l => l.subjectId === subjectId));

  const broadcast = () =>
    window.dispatchEvent(new CustomEvent("ome-assets-updated", { detail: { source: "lesson" } }));

  const addLesson = () => {
    if (!form.unitName.trim() || !form.lessonName.trim()) {
      toast("يرجى تعبئة اسم الوحدة واسم الدرس", "error");
      return;
    }
    const id = `lesson_${Date.now()}`;
    const lesson: Lesson = {
      id,
      subjectId,
      unitNumber:   form.unitNumber,
      unitName:     form.unitName.trim(),
      lessonNumber: form.lessonNumber,
      lessonName:   form.lessonName.trim(),
      fileId: null, fileName: null, fileType: null,
      createdAt: new Date().toLocaleDateString("ar-SA"),
      createdBy: "admin",
      status: "active",
    };
    const all = getLessons();
    all.push(lesson);
    saveLessons(all);
    refresh();
    setForm(f => ({ ...f, lessonNumber: f.lessonNumber + 1 }));
    toast("✅ تم إضافة الدرس", "success");
    broadcast();
    void syncEngine.pushLesson(lesson);
  };

  const deleteLesson = (id: string) => {
    if (!confirm("حذف هذا الدرس؟")) return;
    saveLessons(getLessons().filter(l => l.id !== id));
    refresh();
    toast("تم الحذف", "warning");
    broadcast();
  };

  const uploadFile = async (lessonId: string, file: File) => {
    setUploading(lessonId);
    try {
      const buf = await file.arrayBuffer();
      await storeLessonFile(lessonId, buf, file.name, file.type);
      const all = getLessons();
      const idx = all.findIndex(l => l.id === lessonId);
      if (idx >= 0) {
        all[idx] = { ...all[idx]!, fileId: `lesson_${lessonId}`, fileName: file.name, fileType: file.type };
        saveLessons(all);
        refresh();
        broadcast();
        void syncEngine.pushLessonFile(lessonId, buf, { name: file.name, type: file.type });
        toast(`✅ تم رفع: ${file.name}`, "success");
      }
    } catch {
      toast("❌ فشل رفع الملف — تحقق من المساحة المتاحة", "error");
    } finally {
      setUploading(null);
    }
  };

  /* Group by unit */
  const unitMap = new Map<number, Lesson[]>();
  for (const l of lessons) {
    if (!unitMap.has(l.unitNumber)) unitMap.set(l.unitNumber, []);
    unitMap.get(l.unitNumber)!.push(l);
  }
  const sortedUnits = [...unitMap.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{
        background: "var(--card)", borderRadius: "var(--radius)", padding: 28,
        width: "min(700px,95vw)", maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📚 دروس الكتاب</h3>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{subjectName}</div>
          </div>
          <button onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>

        {/* Add lesson form */}
        <div style={{ padding: 16, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(108,99,255,0.2)", marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "var(--primary)" }}>➕ إضافة درس جديد</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label12}>رقم الوحدة</label>
              <input type="number" min={1} max={20} className="form-control"
                value={form.unitNumber}
                onChange={e => setForm(f => ({ ...f, unitNumber: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={label12}>اسم الوحدة</label>
              <input type="text" className="form-control"
                placeholder={`مثال: الوحدة ${ORDINAL_AR[form.unitNumber] ?? form.unitNumber}`}
                value={form.unitName}
                onChange={e => setForm(f => ({ ...f, unitName: e.target.value }))} />
            </div>
            <div>
              <label style={label12}>رقم الدرس داخل الوحدة</label>
              <input type="number" min={1} max={50} className="form-control"
                value={form.lessonNumber}
                onChange={e => setForm(f => ({ ...f, lessonNumber: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={label12}>اسم الدرس</label>
              <input type="text" className="form-control"
                placeholder="مثال: الجملة الاسمية"
                value={form.lessonName}
                onChange={e => setForm(f => ({ ...f, lessonName: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <button onClick={addLesson}
                style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
                ➕ إضافة الدرس
              </button>
            </div>
          </div>
        </div>

        {/* Lessons grouped by unit */}
        {lessons.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0", fontSize: 14 }}>
            لا توجد دروس بعد — أضف أول درس أعلاه
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {sortedUnits.map(([unitNum, unitLessons]) => (
              <div key={unitNum}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", marginBottom: 10, padding: "8px 14px", background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(108,99,255,0.2)" }}>
                  📖 الوحدة {unitNum} — {unitLessons[0]?.unitName}
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginRight: 8 }}>({unitLessons.length} درس)</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...unitLessons].sort((a, b) => a.lessonNumber - b.lessonNumber).map(l => (
                    <div key={l.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                        الدرس {l.lessonNumber} — {l.lessonName}
                      </span>
                      {l.fileName ? (
                        <span style={{ fontSize: 11, color: "var(--success)", whiteSpace: "nowrap" }}>✅ {l.fileName}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>بدون ملف</span>
                      )}
                      {uploading === l.id ? (
                        <span style={{ fontSize: 11, color: "var(--primary)" }}>⏳ جارٍ الرفع…</span>
                      ) : (
                        <button
                          onClick={() => { pendingLessonId.current = l.id; fileInputRef.current?.click(); }}
                          style={{ padding: "4px 10px", background: "rgba(0,200,150,0.1)", border: "1px solid var(--success)", borderRadius: 6, color: "var(--success)", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {l.fileId ? "🔄 تحديث" : "📤 رفع PDF"}
                        </button>
                      )}
                      <button onClick={() => deleteLesson(l.id)}
                        style={{ padding: "4px 8px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 11 }}>
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef} type="file" accept=".pdf,.epub,.pptx"
          style={{ display: "none" }}
          onChange={async e => {
            const f = e.target.files?.[0];
            const id = pendingLessonId.current;
            if (f && id) await uploadFile(id, f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

