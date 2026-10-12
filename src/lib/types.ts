export type TextDir = "auto" | "rtl" | "ltr";

export type SubjectEntry = {
  id: string;
  name: string;
  homework: string;
  /** Text direction of this homework field. "auto" follows the text itself. */
  dir: TextDir;
  /** Show this subject in the diary even when its homework is blank. */
  showIfBlank: boolean;
};

export type ClassItem = {
  id: string;
  name: string;
};

/** One diary = one class (and optional section) on one date. */
export type Diary = {
  key: string;
  date: string; // YYYY-MM-DD (Pakistan calendar date)
  classId: string;
  className: string;
  section: string;
  teacherName: string;
  subjects: SubjectEntry[];
  updatedAt: string;
  manuallySaved?: boolean;
};

export type Settings = {
  classes: ClassItem[];
  sections: string[];
  defaultSubjects: string[];
};

export type Session = {
  date: string;
  dateMode: "auto" | "manual";
  classId: string;
  section: string;
  /** Last teacher name used for each class (a convenience only). */
  teachers: Record<string, string>;
};
