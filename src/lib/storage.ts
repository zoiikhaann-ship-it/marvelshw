import { getPakistanToday, isValidISODate } from "./dates";
import type { ClassItem, Diary, Session, Settings, SubjectEntry, TextDir } from "./types";

const KEYS = {
  settings: "marvels-diary:v2:settings",
  session: "marvels-diary:v2:session",
  diaries: "marvels-diary:v2:diaries",
};

export const DEFAULT_CLASS_NAMES = [
  "Montessori Junior",
  "Montessori Senior",
  "Montessori Advance",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
];

export const DEFAULT_SUBJECT_NAMES = [
  "Qur'an",
  "Islamiyat",
  "Urdu",
  "English",
  "Mathematics",
  "General Knowledge",
  "Social Studies",
  "Science",
  "Art and Craft",
  "Other",
];

export const DEFAULT_SECTIONS = ["A", "B", "C", "D"];

const MAX_SAVED_DIARIES = 200;

export function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function makeDiaryKey(date: string, classId: string, section: string): string {
  return `${date}|${classId}|${section}`;
}

export function defaultClasses(): ClassItem[] {
  return DEFAULT_CLASS_NAMES.map((name, index) => ({ id: `class-${index + 1}`, name }));
}

export function defaultSettings(): Settings {
  return {
    classes: defaultClasses(),
    sections: [...DEFAULT_SECTIONS],
    defaultSubjects: [...DEFAULT_SUBJECT_NAMES],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJSON(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  }
  return out;
}

/** Appends Grade 7–10 for devices that still have the older list ending at Grade 6. */
function ensureGradesThrough10(classes: ClassItem[]): ClassItem[] {
  const names = new Set(classes.map((item) => item.name.toLowerCase()));
  const hasGrade6 = names.has("grade 6");
  const missing = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"].filter((name) => !names.has(name.toLowerCase()));
  if (!hasGrade6 || missing.length === 0) return classes;
  const usedIds = new Set(classes.map((item) => item.id));
  const extra: ClassItem[] = [];
  let n = classes.length + 1;
  for (const name of missing) {
    let id = `class-${n}`;
    while (usedIds.has(id)) {
      n += 1;
      id = `class-${n}`;
    }
    usedIds.add(id);
    extra.push({ id, name });
    n += 1;
  }
  return [...classes, ...extra];
}

export function sanitizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const classes: ClassItem[] = [];
  const usedIds = new Set<string>();
  if (Array.isArray(source.classes)) {
    for (const item of source.classes) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const name = item.name.trim();
      if (!name || usedIds.has(item.id)) continue;
      usedIds.add(item.id);
      classes.push({ id: item.id, name });
    }
  }
  const subjects = cleanStrings(source.defaultSubjects);
  return {
    classes: classes.length ? ensureGradesThrough10(classes) : defaultClasses(),
    sections: Array.isArray(source.sections) ? cleanStrings(source.sections) : [...DEFAULT_SECTIONS],
    defaultSubjects: subjects.length ? subjects : [...DEFAULT_SUBJECT_NAMES],
  };
}

export function loadSettings(): Settings {
  return sanitizeSettings(readJSON(KEYS.settings));
}

export function saveSettings(settings: Settings): boolean {
  return writeJSON(KEYS.settings, settings);
}

export function loadSession(settings: Settings): Session {
  const raw = readJSON(KEYS.session);
  const source = isRecord(raw) ? raw : {};
  const today = getPakistanToday();
  const storedDate = isValidISODate(source.date) ? source.date : today;
  // A manually chosen date is only kept when it is still in the future; otherwise start on today.
  const keepManual = source.dateMode === "manual" && storedDate > today;
  const classId =
    typeof source.classId === "string" && settings.classes.some((item) => item.id === source.classId)
      ? source.classId
      : settings.classes[0].id;
  const section =
    typeof source.section === "string" && settings.sections.includes(source.section) ? source.section : "";
  const teachers: Record<string, string> = {};
  if (isRecord(source.teachers)) {
    for (const [id, name] of Object.entries(source.teachers)) {
      if (typeof name === "string") teachers[id] = name;
    }
  }
  return {
    date: keepManual ? storedDate : today,
    dateMode: keepManual ? "manual" : "auto",
    classId,
    section,
    teachers,
  };
}

export function saveSession(session: Session): boolean {
  return writeJSON(KEYS.session, session);
}

export function newSubject(name: string): SubjectEntry {
  return { id: makeId(), name, homework: "", dir: "auto", showIfBlank: false };
}

export function cloneSubject(subject: SubjectEntry): SubjectEntry {
  return { ...subject, id: makeId() };
}

function sanitizeSubject(raw: unknown): SubjectEntry | null {
  if (!isRecord(raw)) return null;
  const dir: TextDir = raw.dir === "rtl" || raw.dir === "ltr" ? raw.dir : "auto";
  return {
    id: typeof raw.id === "string" ? raw.id : makeId(),
    name: typeof raw.name === "string" ? raw.name : "Subject",
    homework: typeof raw.homework === "string" ? raw.homework : "",
    dir,
    showIfBlank: raw.showIfBlank === true,
  };
}

export function sanitizeDiary(raw: unknown): Diary | null {
  if (!isRecord(raw) || !isValidISODate(raw.date) || typeof raw.classId !== "string") return null;
  const section = typeof raw.section === "string" ? raw.section : "";
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects.map(sanitizeSubject).filter((item): item is SubjectEntry => item !== null)
    : [];
  return {
    key: makeDiaryKey(raw.date, raw.classId, section),
    date: raw.date,
    classId: raw.classId,
    className: typeof raw.className === "string" ? raw.className : "",
    section,
    teacherName: typeof raw.teacherName === "string" ? raw.teacherName : "",
    subjects,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    manuallySaved: raw.manuallySaved === true,
  };
}

export function loadDiaries(): Record<string, Diary> {
  const raw = readJSON(KEYS.diaries);
  const out: Record<string, Diary> = {};
  if (!isRecord(raw)) return out;
  for (const value of Object.values(raw)) {
    const diary = sanitizeDiary(value);
    if (diary) out[diary.key] = diary;
  }
  return out;
}

export function diaryHasHomework(diary: Diary): boolean {
  return diary.subjects.some((subject) => subject.homework.trim().length > 0);
}

/** Saves diaries that contain homework (plus the one currently open). Returns false if storage is full. */
export function saveDiaries(diaries: Record<string, Diary>, currentKey: string): boolean {
  const kept = Object.values(diaries)
    .filter((diary) => diary.key === currentKey || diaryHasHomework(diary))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SAVED_DIARIES);
  const out: Record<string, Diary> = {};
  for (const diary of kept) out[diary.key] = diary;
  return writeJSON(KEYS.diaries, out);
}

export function createBlankDiary(args: {
  date: string;
  classItem: ClassItem;
  section: string;
  teacher: string;
}): Diary {
  return {
    key: makeDiaryKey(args.date, args.classItem.id, args.section),
    date: args.date,
    classId: args.classItem.id,
    className: args.classItem.name,
    section: args.section,
    teacherName: args.teacher,
    // Starts empty — teachers pick which subjects to include for this diary.
    subjects: [],
    updatedAt: new Date().toISOString(),
  };
}
