import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "./Modal";
import { parseBackup } from "../lib/backup";
import type { BackupPayload } from "../lib/backup";
import { DEFAULT_CLASS_NAMES, DEFAULT_SECTIONS, DEFAULT_SUBJECT_NAMES, defaultClasses, makeId } from "../lib/storage";
import type { Settings } from "../lib/types";

export type SettingsTab = "classes" | "subjects" | "sections" | "backup";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "classes", label: "Classes" },
  { id: "subjects", label: "Subjects" },
  { id: "sections", label: "Sections" },
  { id: "backup", label: "Backup" },
];

type Props = {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onExportBackup: () => void;
  onRestore: (payload: BackupPayload) => void;
  onClose: () => void;
  notify: (text: string, tone?: "success" | "error" | "info") => void;
};

function EditableList({
  items,
  placeholder,
  addLabel,
  minItems,
  onRename,
  onMove,
  onRemove,
  onAdd,
}: {
  items: string[];
  placeholder: string;
  addLabel: string;
  minItems: number;
  onRename: (index: number, value: string) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <div className="edit-list">
      {items.length === 0 ? <p className="muted">Nothing here yet.</p> : null}
      {items.map((item, index) => (
        <div className="edit-row" key={index}>
          <span className="edit-index">{index + 1}</span>
          <input
            type="text"
            value={item}
            dir="auto"
            placeholder={placeholder}
            aria-label={`${placeholder} ${index + 1}`}
            onChange={(event) => onRename(index, event.target.value)}
          />
          <button type="button" className="icon-btn" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, -1)}>
            <ArrowUp size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Move down" disabled={index === items.length - 1} onClick={() => onMove(index, 1)}>
            <ArrowDown size={18} />
          </button>
          <button type="button" className="icon-btn danger" aria-label="Remove" disabled={items.length <= minItems} onClick={() => onRemove(index)}>
            <Trash2 size={18} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={onAdd}>
        <Plus size={18} /> {addLabel}
      </button>
    </div>
  );
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function SettingsDialog({
  tab,
  onTab,
  settings,
  onSettings,
  onExportBackup,
  onRestore,
  onClose,
  notify,
}: Props) {
  const [pendingBackup, setPendingBackup] = useState<BackupPayload | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  async function readBackup(file: File) {
    setBackupError(null);
    setPendingBackup(null);
    try {
      setPendingBackup(parseBackup(await file.text()));
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "That backup could not be read.");
    }
  }

  const classNames = settings.classes.map((item) => item.name);

  return (
    <Modal title="Settings" kicker="SCHOOL SETUP" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-on" : ""} onClick={() => onTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "classes" && (
        <div className="settings-pane">
          <p className="pane-intro">
            Each class keeps its own diary for every date. Renaming a class keeps its saved diaries. Default list: {DEFAULT_CLASS_NAMES.join(", ")}.
          </p>
          <EditableList
            items={classNames}
            placeholder="Class name"
            addLabel="Add a class"
            minItems={1}
            onRename={(index, value) =>
              onSettings({ ...settings, classes: settings.classes.map((item, i) => (i === index ? { ...item, name: value } : item)) })
            }
            onMove={(index, delta) => onSettings({ ...settings, classes: move(settings.classes, index, delta) })}
            onRemove={(index) => onSettings({ ...settings, classes: settings.classes.filter((_, i) => i !== index) })}
            onAdd={() => onSettings({ ...settings, classes: [...settings.classes, { id: `class-${makeId()}`, name: "New class" }] })}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm("Restore the standard class list (Montessori Junior to Grade 10)? Diaries already saved are kept.")) {
                  onSettings({ ...settings, classes: defaultClasses() });
                }
              }}
            >
              Restore standard class list
            </button>
          </div>
        </div>
      )}

      {tab === "subjects" && (
        <div className="settings-pane">
          <p className="pane-intro">
            These are the subjects teachers can choose from when preparing a diary. Teachers pick only the subjects needed that day. Changes apply to new diaries;
            diaries already started keep their own subject list.
          </p>
          <EditableList
            items={settings.defaultSubjects}
            placeholder="Subject name"
            addLabel="Add a subject"
            minItems={1}
            onRename={(index, value) =>
              onSettings({ ...settings, defaultSubjects: settings.defaultSubjects.map((item, i) => (i === index ? value : item)) })
            }
            onMove={(index, delta) => onSettings({ ...settings, defaultSubjects: move(settings.defaultSubjects, index, delta) })}
            onRemove={(index) => onSettings({ ...settings, defaultSubjects: settings.defaultSubjects.filter((_, i) => i !== index) })}
            onAdd={() => onSettings({ ...settings, defaultSubjects: [...settings.defaultSubjects, "New subject"] })}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm("Restore the standard subject list?")) onSettings({ ...settings, defaultSubjects: [...DEFAULT_SUBJECT_NAMES] });
              }}
            >
              Restore standard subjects
            </button>
          </div>
        </div>
      )}

      {tab === "sections" && (
        <div className="settings-pane">
          <p className="pane-intro">
            Sections are optional. Teachers pick one from this list, or choose &quot;No section&quot;. Leave the list empty if your school has no sections.
          </p>
          <EditableList
            items={settings.sections}
            placeholder="Section name"
            addLabel="Add a section"
            minItems={0}
            onRename={(index, value) =>
              onSettings({ ...settings, sections: settings.sections.map((item, i) => (i === index ? value : item)) })
            }
            onMove={(index, delta) => onSettings({ ...settings, sections: move(settings.sections, index, delta) })}
            onRemove={(index) => onSettings({ ...settings, sections: settings.sections.filter((_, i) => i !== index) })}
            onAdd={() => onSettings({ ...settings, sections: [...settings.sections, "New"] })}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSettings({ ...settings, sections: [...DEFAULT_SECTIONS] })}
            >
              Restore A, B, C, D
            </button>
          </div>
        </div>
      )}

      {tab === "backup" && (
        <div className="settings-pane">
          <p className="pane-intro">
            Everything is stored in this browser, on this device only. A backup file contains your classes, subjects and saved diaries, so you can move them to
            another phone or keep a safe copy. Treat the file as private: it contains homework and teacher names.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={onExportBackup}>
              <Download size={18} /> Download backup file
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => backupInput.current?.click()}>
              <Upload size={18} /> Restore from backup
            </button>
          </div>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readBackup(file);
            }}
          />
          {backupError ? <p className="inline-error">{backupError}</p> : null}
          {pendingBackup ? (
            <div className="notice">
              <strong>Backup found</strong>
              <p>
                {pendingBackup.diaries.length} saved {pendingBackup.diaries.length === 1 ? "diary" : "diaries"}, {pendingBackup.settings.classes.length} classes.
                Restoring replaces your class, subject and section lists and adds these diaries (matching diaries are overwritten).
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onRestore(pendingBackup);
                    setPendingBackup(null);
                    notify("Backup restored.", "success");
                  }}
                >
                  Restore now
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPendingBackup(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <p className="muted small">
            There is no login or online storage. Anyone who opens this portal on a device can open Settings on that device. Saved diaries are not sent to any
            server.
          </p>
        </div>
      )}
    </Modal>
  );
}
