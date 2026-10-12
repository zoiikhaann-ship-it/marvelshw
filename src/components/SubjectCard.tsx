import { useLayoutEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import type { SubjectEntry, TextDir } from "../lib/types";

const DIR_OPTIONS: { value: TextDir; label: string; title: string }[] = [
  { value: "auto", label: "Auto", title: "Detect direction from the text (recommended)" },
  { value: "rtl", label: "Urdu", title: "Urdu: write right to left" },
  { value: "ltr", label: "English", title: "English: write left to right" },
];

function AutoTextarea({
  id,
  value,
  dir,
  label,
  onChange,
}: {
  id: string;
  value: string;
  dir: TextDir;
  label: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(element.scrollHeight + 2, 104)}px`;
  }, [value]);

  return (
    <textarea
      id={id}
      ref={ref}
      className="hw-input"
      aria-label={label}
      dir={dir}
      lang={dir === "rtl" ? "ur" : undefined}
      value={value}
      rows={3}
      spellCheck={false}
      autoCapitalize="sentences"
      placeholder="Type or paste homework in Urdu or English..."
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

type Props = {
  subject: SubjectEntry;
  index: number;
  total: number;
  editMode: boolean;
  onChange: (patch: Partial<SubjectEntry>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
};

export function SubjectCard({ subject, index, total, editMode, onChange, onMove, onRemove }: Props) {
  const filled = subject.homework.trim().length > 0;
  const inputId = `hw-${subject.id}`;

  return (
    <div className={`subject-card${filled ? " is-filled" : ""}`}>
      <div className="subject-head">
        {editMode ? (
          <input
            type="text"
            className="subject-name-input"
            aria-label={`Name of subject ${index + 1}`}
            dir="auto"
            value={subject.name}
            placeholder="Subject name"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        ) : (
          <label className="subject-title" htmlFor={inputId} dir="auto">
            <span>{subject.name || "Subject"}</span>
            {filled ? <Check size={15} aria-label="Filled in" /> : null}
          </label>
        )}

        {editMode ? (
          <div className="subject-tools">
            <button type="button" className="icon-btn" aria-label="Move subject up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp size={18} />
            </button>
            <button type="button" className="icon-btn" aria-label="Move subject down" disabled={index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown size={18} />
            </button>
            <button type="button" className="icon-btn danger" aria-label={`Remove ${subject.name || "subject"}`} onClick={onRemove}>
              <Trash2 size={18} />
            </button>
          </div>
        ) : (
          <div className="dir-toggle" role="group" aria-label="Text direction">
            {DIR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.title}
                aria-pressed={subject.dir === option.value}
                className={subject.dir === option.value ? "is-on" : ""}
                onClick={() => onChange({ dir: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <AutoTextarea
        id={inputId}
        value={subject.homework}
        dir={subject.dir}
        label={`${subject.name || "Subject"} homework`}
        onChange={(value) => onChange({ homework: value })}
      />
    </div>
  );
}
