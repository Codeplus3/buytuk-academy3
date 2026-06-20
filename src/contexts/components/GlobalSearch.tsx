import { useState, useRef, useEffect } from "react";
import type { Subject, Exam, Homework } from "../lib/db";

interface Props {
  subjects: Subject[];
  exams:    Exam[];
  homework: Homework[];
  onSelectTab: (tab: string) => void;
}

interface Result { type: "subject" | "exam" | "homework"; icon: string; title: string; sub: string; tab: string; }

export function GlobalSearch({ subjects, exams, homework, onSelectTab }: Props) {
  const [q,       setQ]       = useState("");
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setFocused(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const results: Result[] = q.trim().length < 2 ? [] : [
    ...subjects.filter(s => s.name.includes(q) || s.description.includes(q)).map(s => ({
      type: "subject" as const, icon: s.icon, title: s.name, sub: s.description, tab: "sections",
    })),
    ...exams.filter(e => e.title.includes(q) || e.description.includes(q)).map(e => ({
      type: "exam" as const, icon: "📝", title: e.title, sub: e.description, tab: "exams",
    })),
    ...homework.filter(h => h.title.includes(q) || h.description.includes(q)).map(h => ({
      type: "homework" as const, icon: "📋", title: h.title, sub: h.subjectName, tab: "homework",
    })),
  ].slice(0, 10);

  const TYPE_LABEL = { subject: "مادة", exam: "اختبار", homework: "واجب" };

  return (
    <div ref={ref} style={{ position: "relative", width: 220 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: `1px solid ${focused ? "var(--primary)" : "var(--glass-border)"}`, borderRadius: 20, transition: "border-color 0.2s" }}>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>🔍</span>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          placeholder="بحث..."
          style={{ background: "none", border: "none", outline: "none", color: "var(--text)", fontFamily: "inherit", fontSize: 13, width: "100%" }}
        />
        {q && <button onClick={() => { setQ(""); setOpen(false); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>}
      </div>

      {open && q.trim().length >= 2 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", insetInlineStart: 0, width: 300,
          background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 2000, overflow: "hidden",
        }}>
          {results.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>لا توجد نتائج لـ "{q}"</div>
          ) : results.map((r, i) => (
            <div key={i}
              onClick={() => { onSelectTab(r.tab); setQ(""); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--glass-border)", cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{r.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</div>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)", background: "rgba(108,99,255,0.1)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{TYPE_LABEL[r.type]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
