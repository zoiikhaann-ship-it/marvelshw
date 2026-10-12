import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  CircleHelp,
  Clipboard,
  Clock3,
  Copy,
  Expand,
  Eye,
  FileDown,
  FileImage,
  FolderOpen,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
import { DiaryDocument } from "./components/DiaryDocument";
import type { Entry } from "./components/DiaryDocument";
import type { PageMeta } from "./components/DiaryPage";
import { Modal } from "./components/Modal";
import { SettingsDialog } from "./components/SettingsDialog";
import type { SettingsTab } from "./components/SettingsDialog";
import { SubjectCard } from "./components/SubjectCard";
import { buildBackup } from "./lib/backup";
import type { BackupPayload } from "./lib/backup";
import { formatStamp, getDateDetails, getPakistanToday, isValidISODate, shiftISODate } from "./lib/dates";
import {
  PAGE_WIDTH,
  buildPdf,
  canShareFiles,
  downloadBlob,
  downloadFiles,
  nativeShare,
  renderPagesToPng,
} from "./lib/export";
import { BUNDLED_LOGO } from "./lib/logo";
import {
  cloneSubject,
  createBlankDiary,
  diaryHasHomework,
  loadDiaries,
  loadSession,
  loadSettings,
  makeDiaryKey,
  newSubject,
  sanitizeSettings,
  saveDiaries,
  saveSession,
  saveSettings,
} from "./lib/storage";
import { buildPlainText } from "./lib/text";
import type { Diary, Session, Settings, SubjectEntry } from "./lib/types";

/** Old blank diaries pre-filled every default subject with ids `default-0`… — treat those as unselected. */
function isLegacyUnusedSubjectList(subjects: SubjectEntry[]): boolean {
  return subjects.length > 0 && subjects.every((subject, index) => subject.id === `default-${index}` && !subject.homework.trim());
}

type ModalState =
  | { kind: "saved" }
  | { kind: "reuse" }
  | { kind: "help" }
  | { kind: "settings"; tab: SettingsTab }
  | null;

type ConfirmState = {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

type ShareCardState = { mode: "shared" | "ready" | "manual"; files: File[]; kind: "image" | "pdf" } | null;

type Toast = { text: string; tone: "success" | "error" | "info" };

function slug(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "class";
}

function pageFileName(base: string, index: number, total: number, extension: string): string {
  return total > 1 ? `${base}_page-${index + 1}.${extension}` : `${base}.${extension}`;
}

function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [session, setSession] = useState<Session>(() => loadSession(settings));
  const [diaries, setDiaries] = useState<Record<string, Diary>>(() => loadDiaries());

  const [modal, setModal] = useState<ModalState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editSubjects, setEditSubjects] = useState(false);
  const [showAllClassesInReuse, setShowAllClassesInReuse] = useState(false);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saving");
  const [busy, setBusy] = useState<"png" | "pdf" | "share" | null>(null);
  const [shareKind, setShareKind] = useState<"image" | "pdf">("image");
  const [shareCard, setShareCard] = useState<ShareCardState>(null);
  const [pageCount, setPageCount] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [available, setAvailable] = useState(360);
  const [docHeight, setDocHeight] = useState(1123);

  const stageRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const logo = BUNDLED_LOGO;

  // ---- Current selection (class, section, date) ----
  const activeClass = settings.classes.find((item) => item.id === session.classId) ?? settings.classes[0];
  const activeSection = settings.sections.includes(session.section) ? session.section : "";
  const date = isValidISODate(session.date) ? session.date : getPakistanToday();
  const dateInfo = getDateDetails(date);
  const isToday = date === getPakistanToday();
  const diaryKey = makeDiaryKey(date, activeClass.id, activeSection);
  const rememberedTeacher = session.teachers[activeClass.id] ?? "";

  const blankDiary = useMemo(
    () =>
      createBlankDiary({
        date,
        classItem: activeClass,
        section: activeSection,
        teacher: rememberedTeacher,
      }),
    [date, activeClass, activeSection, rememberedTeacher],
  );
  const diary = useMemo(() => {
    const raw = diaries[diaryKey] ?? blankDiary;
    if (isLegacyUnusedSubjectList(raw.subjects)) return { ...raw, subjects: [] };
    return raw;
  }, [diaries, diaryKey, blankDiary]);

  const entries = useMemo<Entry[]>(
    () =>
      diary.subjects
        .filter((subject) => subject.homework.trim())
        .map((subject) => ({
          id: subject.id,
          name: subject.name.trim() || "Subject",
          text: subject.homework.replace(/\s+$/, ""),
          dir: subject.dir,
          blank: false,
        })),
    [diary.subjects],
  );

  const selectedSubjectNames = useMemo(
    () => new Set(diary.subjects.map((subject) => subject.name.trim().toLowerCase()).filter(Boolean)),
    [diary.subjects],
  );
  const filledCount = diary.subjects.filter((subject) => subject.homework.trim()).length;

  const teacherName = diary.teacherName.trim();
  const meta = useMemo<PageMeta>(
    () => ({
      weekday: dateInfo.weekday,
      dateText: dateInfo.long,
      className: activeClass.name,
      section: activeSection,
      teacherName,
    }),
    [dateInfo.weekday, dateInfo.long, activeClass.name, activeSection, teacherName],
  );

  const notify = useCallback((text: string, tone: Toast["tone"] = "info") => setToast({ text, tone }), []);

  const updateDiary = useCallback(
    (change: (current: Diary) => Diary) => {
      setDiaries((previous) => {
        const raw = previous[diaryKey] ?? blankDiary;
        const base = isLegacyUnusedSubjectList(raw.subjects) ? { ...raw, subjects: [] } : raw;
        return {
          ...previous,
          [diaryKey]: {
            ...change(base),
            key: diaryKey,
            className: activeClass.name,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [diaryKey, blankDiary, activeClass.name],
  );

  // ---- Persistence ----
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    setSaveState("saving");
    const timer = window.setTimeout(() => setSaveState(saveDiaries(diaries, diaryKey) ? "saved" : "error"), 400);
    return () => window.clearTimeout(timer);
  }, [diaries, diaryKey]);

  const latest = useRef({ diaries, diaryKey });
  latest.current = { diaries, diaryKey };
  useEffect(() => {
    const flush = () => {
      saveDiaries(latest.current.diaries, latest.current.diaryKey);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Keep the selected class valid if the administrator removes it.
  useEffect(() => {
    if (!settings.classes.some((item) => item.id === session.classId)) {
      setSession((current) => ({ ...current, classId: settings.classes[0].id }));
    }
  }, [settings.classes, session.classId]);

  // ---- Automatic Pakistan date: rolls over at midnight while the portal stays open ----
  useEffect(() => {
    const check = () =>
      setSession((current) => {
        if (current.dateMode !== "auto") return current;
        const today = getPakistanToday();
        return current.date === today ? current : { ...current, date: today };
      });
    const timer = window.setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  // ---- Toasts, keyboard and scroll lock ----
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirm) setConfirm(null);
      else if (modal) closeModal();
      else if (expanded) setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, modal, expanded, settings]);

  useEffect(() => {
    document.body.style.overflow = modal || confirm || expanded ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal, confirm, expanded]);

  // ---- Preview sizing ----
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const style = window.getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setAvailable(Math.max(200, width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  useLayoutEffect(() => {
    const element = docRef.current;
    if (!element) return;
    const update = () => setDocHeight(element.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = expanded ? (zoom === "fit" ? Math.min(1.3, available / PAGE_WIDTH) : 1) : Math.min(1, available / PAGE_WIDTH);

  // ---- Modals ----
  function closeModal() {
    if (modal?.kind === "settings") setSettings((current) => sanitizeSettings(current));
    setModal(null);
  }

  function openSettings(tab: SettingsTab) {
    setModal({ kind: "settings", tab });
  }

  // ---- Class, section, date ----
  function selectDate(value: string) {
    if (!isValidISODate(value)) return;
    setSession((current) => ({ ...current, date: value, dateMode: value === getPakistanToday() ? "auto" : "manual" }));
  }

  function useToday() {
    setSession((current) => ({ ...current, date: getPakistanToday(), dateMode: "auto" }));
  }

  // ---- Subjects ----
  function patchSubject(id: string, patch: Partial<SubjectEntry>) {
    updateDiary((current) => ({
      ...current,
      subjects: current.subjects.map((subject) => (subject.id === id ? { ...subject, ...patch } : subject)),
    }));
  }

  function moveSubject(id: string, delta: number) {
    updateDiary((current) => {
      const index = current.subjects.findIndex((subject) => subject.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.subjects.length) return current;
      const subjects = [...current.subjects];
      [subjects[index], subjects[target]] = [subjects[target], subjects[index]];
      return { ...current, subjects };
    });
  }

  function removeSubject(subject: SubjectEntry) {
    const remove = () => updateDiary((current) => ({ ...current, subjects: current.subjects.filter((item) => item.id !== subject.id) }));
    if (subject.homework.trim()) {
      setConfirm({
        title: `Remove ${subject.name || "this subject"}?`,
        body: "The homework typed under this subject will be removed from this diary.",
        confirmLabel: "Remove subject",
        danger: true,
        onConfirm: remove,
      });
    } else {
      remove();
    }
  }

  function addSubject() {
    updateDiary((current) => ({ ...current, subjects: [...current.subjects, newSubject("New subject")] }));
    setEditSubjects(true);
  }

  function toggleCatalogSubject(name: string) {
    const key = name.trim().toLowerCase();
    const existing = diary.subjects.find((subject) => subject.name.trim().toLowerCase() === key);
    if (existing) {
      removeSubject(existing);
      return;
    }
    updateDiary((current) => {
      if (current.subjects.some((subject) => subject.name.trim().toLowerCase() === key)) return current;
      return { ...current, subjects: [...current.subjects, newSubject(name)] };
    });
  }

  function changeTeacher(value: string) {
    setSession((current) => ({ ...current, teachers: { ...current.teachers, [activeClass.id]: value } }));
    updateDiary((current) => ({ ...current, teacherName: value }));
  }

  // ---- Drafts, duplicating and reusing ----
  function saveDraftNow() {
    if (filledCount === 0) {
      notify("Type some homework first, then save the draft.", "error");
      return;
    }
    updateDiary((current) => ({ ...current, manuallySaved: true }));
    notify(`Draft saved for ${activeClass.name}, ${dateInfo.full}. Drafts also save automatically while you type.`, "success");
  }

  function copyIntoCurrent(source: Diary, label: string) {
    if (source.key === diaryKey) {
      notify("That is the diary you are already editing.", "info");
      return;
    }
    const apply = () => {
      updateDiary((current) => ({
        ...current,
        teacherName: current.teacherName || source.teacherName,
        subjects: source.subjects.map(cloneSubject),
      }));
      if (!diary.teacherName && source.teacherName) {
        setSession((current) => ({ ...current, teachers: { ...current.teachers, [activeClass.id]: source.teacherName } }));
      }
      setModal(null);
      notify(`Copied ${label}. Edit anything you need before exporting. The original diary is unchanged.`, "success");
    };
    if (filledCount > 0) {
      setConfirm({
        title: "Replace the homework on screen?",
        body: `The homework currently entered for ${activeClass.name} on ${dateInfo.long} will be replaced by a copy of ${label}.`,
        confirmLabel: "Replace with copy",
        onConfirm: apply,
      });
    } else {
      apply();
    }
  }

  function duplicatePrevious() {
    const candidates = Object.values(diaries)
      .filter((item) => item.classId === activeClass.id && item.date < date && diaryHasHomework(item))
      .sort((a, b) => b.date.localeCompare(a.date) || Number(b.section === activeSection) - Number(a.section === activeSection));
    const source = candidates[0];
    if (!source) {
      notify(`No earlier diary for ${activeClass.name} is saved on this device yet.`, "error");
      return;
    }
    const exact = source.date === shiftISODate(date, -1);
    copyIntoCurrent(source, exact ? `the previous day's diary (${getDateDetails(source.date).full})` : `the latest earlier diary (${getDateDetails(source.date).full})`);
  }

  function openSavedDiary(item: Diary) {
    if (!settings.classes.some((entry) => entry.id === item.classId)) {
      notify("This diary's class is no longer in the class list. Add the class again in Settings to open it.", "error");
      return;
    }
    setSession((current) => ({
      ...current,
      date: item.date,
      dateMode: item.date === getPakistanToday() ? "auto" : "manual",
      classId: item.classId,
      section: settings.sections.includes(item.section) ? item.section : "",
    }));
    setModal(null);
    notify(`Opened ${getDateDetails(item.date).full}. Your changes here update that saved diary.`, "info");
  }

  function deleteSavedDiary(item: Diary) {
    setConfirm({
      title: "Delete this saved diary?",
      body: `${classNameOf(item)} on ${getDateDetails(item.date).full} will be removed from this device.`,
      confirmLabel: "Delete diary",
      danger: true,
      onConfirm: () =>
        setDiaries((previous) => {
          const next = { ...previous };
          delete next[item.key];
          return next;
        }),
    });
  }

  function requestClear() {
    setConfirm({
      title: "Clear this form?",
      body: `All homework typed for ${activeClass.name} on ${dateInfo.long} will be removed. Other classes and dates are not affected.`,
      confirmLabel: "Yes, clear it",
      danger: true,
      onConfirm: () => {
        setDiaries((previous) => {
          const next = { ...previous };
          delete next[diaryKey];
          return next;
        });
        setShareCard(null);
        setEditSubjects(false);
        notify("The form has been cleared.", "success");
      },
    });
  }

  function classNameOf(item: Diary): string {
    return settings.classes.find((entry) => entry.id === item.classId)?.name ?? (item.className || "Removed class");
  }

  // ---- Settings and backup ----
  function exportBackup() {
    const text = buildBackup(settings, diaries);
    downloadBlob(new Blob([text], { type: "application/json" }), `Marvels-Diary-Backup_${getPakistanToday()}.json`);
    notify("Backup file downloaded. Keep it private.", "success");
  }

  function restoreBackup(payload: BackupPayload) {
    setSettings(payload.settings);
    setDiaries((previous) => {
      const next = { ...previous };
      for (const item of payload.diaries) next[item.key] = item;
      return next;
    });
    setSession((current) => ({
      ...current,
      classId: payload.settings.classes.some((item) => item.id === current.classId) ? current.classId : payload.settings.classes[0].id,
      section: payload.settings.sections.includes(current.section) ? current.section : "",
    }));
  }

  // ---- Copy, download, share ----
  const plainText = useMemo(
    () =>
      buildPlainText({
        weekday: dateInfo.weekday,
        dateText: dateInfo.long,
        className: activeClass.name,
        section: activeSection,
        teacherName,
        entries: entries.map((entry) => ({ name: entry.name, text: entry.text, blank: entry.blank })),
      }),
    [dateInfo.weekday, dateInfo.long, activeClass.name, activeSection, teacherName, entries],
  );

  async function copyHomeworkText() {
    if (filledCount === 0) {
      notify("Type homework for at least one subject first.", "error");
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(plainText);
      notify("Homework text copied. You can paste it into WhatsApp.", "success");
    } catch {
      const area = document.createElement("textarea");
      area.value = plainText;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      area.remove();
      notify(copied ? "Homework text copied. You can paste it into WhatsApp." : "Copying is blocked by this browser. Please select the text and copy it manually.", copied ? "success" : "error");
    }
  }

  function prepareExport(): HTMLElement[] | null {
    if (filledCount === 0) {
      notify("Type homework for at least one subject first.", "error");
      return null;
    }
    const pages = Array.from(docRef.current?.querySelectorAll<HTMLElement>("[data-diary-page]") ?? []);
    if (!pages.length) {
      notify("The diary is not ready yet. Please try again in a moment.", "error");
      return null;
    }
    return pages;
  }

  const exportBase = `Marvels-Homework_${date}_${slug(activeClass.name)}${activeSection ? `_${slug(activeSection)}` : ""}`;
  const documentTitle = `Daily Homework - ${activeClass.name} - ${dateInfo.long}`;
  const shareMessage = `Daily Homework | ${dateInfo.weekday}, ${dateInfo.long}\n${activeClass.name}${activeSection ? ` - Section ${activeSection}` : ""}\nMarvels Montessori and School`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

  async function makeImageFiles(pages: HTMLElement[], ratio: number): Promise<File[]> {
    const blobs = await renderPagesToPng(pages, ratio);
    return blobs.map((blob, index) => new File([blob], pageFileName(exportBase, index, blobs.length, "png"), { type: "image/png" }));
  }

  async function makePdfFile(pages: HTMLElement[]): Promise<File> {
    const blobs = await renderPagesToPng(pages, 2.5);
    const pdf = await buildPdf(blobs, documentTitle);
    return new File([pdf], `${exportBase}.pdf`, { type: "application/pdf" });
  }

  async function downloadPNG() {
    const pages = prepareExport();
    if (!pages || busy) return;
    setBusy("png");
    try {
      const files = await makeImageFiles(pages, 3);
      await downloadFiles(files);
      notify(
        files.length === 1
          ? `Image downloaded: ${files[0].name}`
          : `${files.length} images downloaded (one for each page). If only one appears, allow multiple downloads in your browser.`,
        "success",
      );
    } catch {
      notify("The image could not be created. Please try again, or use Download as PDF.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function downloadPDF() {
    const pages = prepareExport();
    if (!pages || busy) return;
    setBusy("pdf");
    try {
      const file = await makePdfFile(pages);
      downloadBlob(file, file.name);
      notify(`PDF downloaded: ${file.name} (${pages.length} ${pages.length === 1 ? "page" : "pages"}).`, "success");
    } catch {
      notify("The PDF could not be created. Please try again, or use Download as PNG Image.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function shareOnWhatsApp() {
    const pages = prepareExport();
    if (!pages || busy) return;
    setBusy("share");
    setShareCard(null);
    try {
      const files = shareKind === "pdf" ? [await makePdfFile(pages)] : await makeImageFiles(pages, 2);
      const outcome = await nativeShare(files, documentTitle, shareMessage);
      if (outcome === "shared") {
        setShareCard({ mode: "shared", files, kind: shareKind });
      } else if (outcome === "cancelled") {
        setShareCard({ mode: "ready", files, kind: shareKind });
        notify("Sharing was cancelled. Nothing was sent.", "info");
      } else if (outcome === "blocked") {
        setShareCard({ mode: "ready", files, kind: shareKind });
      } else {
        await downloadFiles(files);
        setShareCard({ mode: "manual", files, kind: shareKind });
        notify("Your browser cannot send files to WhatsApp directly, so the file was downloaded. Nothing has been sent.", "info");
      }
    } catch {
      notify("The diary file could not be created for sharing. Please try Download as PNG Image instead.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function shareAgain() {
    if (!shareCard) return;
    const outcome = await nativeShare(shareCard.files, documentTitle, shareMessage);
    if (outcome === "shared") setShareCard({ ...shareCard, mode: "shared" });
    else if (outcome === "cancelled") notify("Sharing was cancelled. Nothing was sent.", "info");
    else if (outcome === "blocked") notify("Your browser blocked the share sheet. Please tap Share now again.", "error");
    else {
      await downloadFiles(shareCard.files);
      setShareCard({ ...shareCard, mode: "manual" });
    }
  }

  // ---- Derived lists for dialogs ----
  const savedList = useMemo(
    () =>
      Object.values(diaries)
        .filter(diaryHasHomework)
        .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)),
    [diaries],
  );
  const reuseList = useMemo(
    () =>
      savedList.filter(
        (item) => item.key !== diaryKey && (showAllClassesInReuse || item.classId === activeClass.id),
      ),
    [savedList, diaryKey, showAllClassesInReuse, activeClass.id],
  );

  const canSystemShare = shareCard ? canShareFiles(shareCard.files) : false;
  const isBusy = busy !== null;

  function exportButtons(kind: "grid" | "bar") {
    const png = (
      <button type="button" className="btn btn-primary btn-big" disabled={isBusy} onClick={downloadPNG}>
        {busy === "png" ? <LoaderCircle className="spin" size={22} /> : <FileImage size={22} />}
        <span>Download as PNG Image</span>
      </button>
    );
    const pdf = (
      <button type="button" className="btn btn-secondary btn-big" disabled={isBusy} onClick={downloadPDF}>
        {busy === "pdf" ? <LoaderCircle className="spin" size={22} /> : <FileDown size={22} />}
        <span>Download as PDF</span>
      </button>
    );
    const whatsapp = (
      <button type="button" className="btn btn-whatsapp btn-big" disabled={isBusy} onClick={shareOnWhatsApp}>
        {busy === "share" ? <LoaderCircle className="spin" size={22} /> : <MessageCircle size={22} />}
        <span>Share on WhatsApp</span>
      </button>
    );
    if (kind === "bar") return <>{png}{pdf}{whatsapp}</>;
    return (
      <>
        {png}
        {pdf}
        {whatsapp}
        <button type="button" className="btn btn-secondary btn-big" disabled={isBusy} onClick={copyHomeworkText}>
          <Clipboard size={22} />
          <span>Copy Homework Text</span>
        </button>
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="Marvels Montessori and School logo" />
          <div className="brand-text">
            <strong>MARVELS MONTESSORI AND SCHOOL</strong>
            <span>Sector B-17, Islamabad | Digital Homework Diary</span>
          </div>
        </div>
        <nav className="topnav" aria-label="Portal menu">
          <button type="button" aria-label="Saved diaries" onClick={() => setModal({ kind: "saved" })}>
            <FolderOpen size={19} />
            <span>Saved diaries</span>
            {savedList.length > 0 ? <em>{savedList.length}</em> : null}
          </button>
          <button type="button" aria-label="Settings" onClick={() => openSettings("classes")}>
            <SettingsIcon size={19} />
            <span>Settings</span>
          </button>
          <button type="button" aria-label="Help" onClick={() => setModal({ kind: "help" })}>
            <CircleHelp size={19} />
            <span>Help</span>
          </button>
        </nav>
      </header>

      <main className="workspace">
        <section className="editor" aria-label="Homework entry">
          <div className="card">
            <div className="card-title">
              <span className="step">1</span>
              <h2>Class and date</h2>
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor="class-select">Select class</label>
                <select
                  id="class-select"
                  value={activeClass.id}
                  onChange={(event) => setSession((current) => ({ ...current, classId: event.target.value }))}
                >
                  {settings.classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "(unnamed class)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="section-select">
                  Section <small>optional</small>
                </label>
                <select
                  id="section-select"
                  value={activeSection}
                  onChange={(event) => setSession((current) => ({ ...current, section: event.target.value }))}
                >
                  <option value="">No section</option>
                  {settings.sections.map((item) => (
                    <option key={item} value={item}>
                      Section {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`date-block${isToday ? "" : " is-other"}`}>
              <div className="date-big" aria-live="polite">
                <CalendarDays size={22} />
                <div>
                  <strong>
                    {dateInfo.weekday} | {dateInfo.long}
                  </strong>
                  <span>{session.dateMode === "auto" ? "Automatic: today in Pakistan time (PKT)" : "Date chosen by you, not today"}</span>
                </div>
              </div>
              <div className="date-controls">
                <input
                  type="date"
                  aria-label="Choose another date"
                  value={date}
                  onChange={(event) => selectDate(event.target.value)}
                />
                <button type="button" className="btn btn-secondary" onClick={useToday} disabled={session.dateMode === "auto"}>
                  Use today
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="teacher-name">
                Class teacher&apos;s name <small>optional</small>
              </label>
              <input
                id="teacher-name"
                type="text"
                dir="auto"
                placeholder="Printed above the Class Teacher line"
                value={diary.teacherName}
                onChange={(event) => changeTeacher(event.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span className="step">2</span>
              <h2>Homework</h2>
              <button type="button" className={`link-btn${editSubjects ? " is-on" : ""}`} onClick={() => setEditSubjects((current) => !current)}>
                {editSubjects ? <Check size={17} /> : <Pencil size={17} />}
                {editSubjects ? "Done" : "Edit selected"}
              </button>
            </div>
            <p className="hint">
              {editSubjects
                ? "Rename, reorder, remove or add subjects for this diary."
                : "Tap the subjects needed today, then type their homework. Only selected subjects appear below; blank ones stay off the printed diary."}
            </p>

            <div className="subject-picker" role="group" aria-label="Select subjects">
              {settings.defaultSubjects.map((name) => {
                const selected = selectedSubjectNames.has(name.trim().toLowerCase());
                return (
                  <button
                    key={name}
                    type="button"
                    className={`subject-chip${selected ? " is-on" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggleCatalogSubject(name)}
                  >
                    {selected ? <Check size={15} /> : <Plus size={15} />}
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>

            {diary.subjects.length === 0 ? (
              <div className="subject-empty">
                <strong>No subjects selected yet</strong>
                <span>Choose one or more subjects above to start typing homework.</span>
              </div>
            ) : (
              <div className="subject-list">
                {diary.subjects.map((subject, index) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    index={index}
                    total={diary.subjects.length}
                    editMode={editSubjects}
                    onChange={(patch) => patchSubject(subject.id, patch)}
                    onMove={(delta) => moveSubject(subject.id, delta)}
                    onRemove={() => removeSubject(subject)}
                  />
                ))}
              </div>
            )}

            {editSubjects ? (
              <button type="button" className="btn btn-secondary btn-wide" onClick={addSubject}>
                <Plus size={19} /> Add a custom subject
              </button>
            ) : null}
          </div>

          <div className="card">
            <div className="card-title">
              <span className="step">3</span>
              <h2>Check and share</h2>
            </div>
            <div className="action-stack">
              <button type="button" className="btn btn-primary btn-big" onClick={() => setExpanded(true)}>
                <Eye size={22} />
                <span>Preview Diary</span>
              </button>
              <div className="grid2">
                <button type="button" className="btn btn-secondary" onClick={saveDraftNow}>
                  <Save size={19} /> Save Draft
                </button>
                <button type="button" className="btn btn-secondary" onClick={requestClear}>
                  <RotateCcw size={19} /> Clear Form
                </button>
              </div>
              <div className="grid2">
                <button type="button" className="btn btn-secondary" onClick={duplicatePrevious}>
                  <Copy size={19} /> Duplicate previous diary
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal({ kind: "reuse" })}>
                  <Clock3 size={19} /> Reuse older homework
                </button>
              </div>
            </div>
            <p className={`save-state ${saveState}`}>
              {saveState === "error" ? (
                "This device is out of browser storage, so drafts cannot be saved right now."
              ) : (
                <>
                  <Check size={15} /> {saveState === "saving" ? "Saving draft..." : "Draft saved automatically on this device"}
                </>
              )}
            </p>
          </div>
        </section>

        <section className="preview-panel" aria-label="Live diary preview">
          <div className="panel-head">
            <div>
              <h2>Live diary preview</h2>
              <p>
                Updates as you type | {pageCount} {pageCount === 1 ? "page" : "pages"}
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setExpanded(true)}>
              <Expand size={18} /> Full screen
            </button>
          </div>

          <div className={`stage${expanded ? " is-expanded" : ""}`}>
            {expanded ? (
              <div className="stage-bar">
                <strong>Full-size diary preview</strong>
                <div className="stage-bar-actions">
                  <div className="zoom-toggle" role="group" aria-label="Zoom">
                    <button type="button" className={zoom === "fit" ? "is-on" : ""} onClick={() => setZoom("fit")}>
                      Fit screen
                    </button>
                    <button type="button" className={zoom === "actual" ? "is-on" : ""} onClick={() => setZoom("actual")}>
                      Actual size
                    </button>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => setExpanded(false)}>
                    <X size={18} /> Close
                  </button>
                </div>
              </div>
            ) : null}

            <div className="stage-scroll" ref={stageRef}>
              <div className="fit-box" style={{ width: PAGE_WIDTH * scale, height: docHeight * scale }}>
                <div className="fit-scaled" style={{ transform: `scale(${scale})` }}>
                  <DiaryDocument ref={docRef} meta={meta} logo={logo} entries={entries} onPageCount={setPageCount} />
                </div>
              </div>
            </div>

            {expanded ? <div className="stage-actions">{exportButtons("bar")}</div> : null}
          </div>

          <div className="share-head">
            <h3>Ready to share?</h3>
            <p>
              {filledCount === 0
                ? "Type homework for at least one subject to enable the buttons."
                : `${filledCount} ${filledCount === 1 ? "subject" : "subjects"} filled in for ${activeClass.name}.`}
            </p>
          </div>

          <div className="export-grid">{exportButtons("grid")}</div>

          <fieldset className="share-format" disabled={isBusy}>
            <legend>WhatsApp should send</legend>
            <label>
              <input type="radio" name="share-kind" checked={shareKind === "image"} onChange={() => setShareKind("image")} />
              <span>Image (PNG)</span>
            </label>
            <label>
              <input type="radio" name="share-kind" checked={shareKind === "pdf"} onChange={() => setShareKind("pdf")} />
              <span>PDF file</span>
            </label>
          </fieldset>

          {shareCard ? (
            <div className={`share-card mode-${shareCard.mode}`} role="status">
              {shareCard.mode === "shared" ? (
                <>
                  <strong>Share sheet closed</strong>
                  <p>
                    If you chose WhatsApp and the class group, please open the chat and check that the diary was posted. This portal cannot see whether it was
                    sent.
                  </p>
                </>
              ) : null}
              {shareCard.mode === "ready" ? (
                <>
                  <strong>Your diary is ready to share</strong>
                  <p>Tap Share now, choose WhatsApp, then pick the class group. Nothing has been sent yet.</p>
                </>
              ) : null}
              {shareCard.mode === "manual" ? (
                <>
                  <strong>
                    {shareCard.kind === "pdf" ? "PDF" : shareCard.files.length > 1 ? "Images" : "Image"} downloaded. Now attach it in WhatsApp
                  </strong>
                  <p>Nothing has been sent. Your browser does not allow files to be passed to WhatsApp directly.</p>
                  <ol>
                    <li>Press Open WhatsApp and choose the class group.</li>
                    <li>Tap the attach (paperclip) button and pick the file you just downloaded ({shareCard.files.map((file) => file.name).join(", ")}).</li>
                    <li>Check the diary, then press Send yourself.</li>
                  </ol>
                </>
              ) : null}
              <div className="share-card-actions">
                {canSystemShare ? (
                  <button type="button" className="btn btn-primary" onClick={shareAgain}>
                    Share now
                  </button>
                ) : null}
                <a className="btn btn-whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle size={19} /> Open WhatsApp
                </a>
                <button type="button" className="btn btn-secondary" onClick={() => void downloadFiles(shareCard.files)}>
                  Download again
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShareCard(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <p className="storage-note">
            Drafts and settings are stored only in this browser on this device. No login is needed and nothing is uploaded. Clearing the browser&apos;s site data
            removes them, so use Settings, then Backup, to keep a copy.
          </p>
        </section>
      </main>

      {modal?.kind === "saved" && (
        <Modal title="Saved diaries" kicker="THIS DEVICE" onClose={closeModal} wide>
          <p className="pane-intro">
            Open a diary to keep editing it. Duplicate copies its homework into the diary you are working on now (class {activeClass.name}, {dateInfo.long}); the
            saved original is never changed.
          </p>
          {savedList.length === 0 ? (
            <div className="empty">
              <FolderOpen size={26} />
              <strong>No saved diaries yet</strong>
              <span>Diaries with homework are saved automatically as you type.</span>
            </div>
          ) : (
            <div className="list">
              {savedList.map((item) => (
                <div className="list-item" key={item.key}>
                  <div className="list-main">
                    <strong>
                      {classNameOf(item)}
                      {item.section ? ` (Section ${item.section})` : ""}
                    </strong>
                    <span>
                      {getDateDetails(item.date).full} | {item.subjects.filter((subject) => subject.homework.trim()).length} subjects | updated {formatStamp(item.updatedAt)}
                    </span>
                  </div>
                  <div className="list-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => openSavedDiary(item)}>
                      Open
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => copyIntoCurrent(item, `${classNameOf(item)}, ${getDateDetails(item.date).full}`)}>
                      Duplicate
                    </button>
                    <button type="button" className="icon-btn danger" aria-label="Delete saved diary" onClick={() => deleteSavedDiary(item)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.kind === "reuse" && (
        <Modal title="Reuse older homework" kicker="COPY, THEN EDIT" onClose={closeModal} wide>
          <p className="pane-intro">
            Pick an earlier diary. Its homework is copied into today&apos;s form for {activeClass.name} so you can edit it. The earlier diary stays exactly as it was.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={showAllClassesInReuse} onChange={(event) => setShowAllClassesInReuse(event.target.checked)} />
            <span>Also show diaries from other classes</span>
          </label>
          {reuseList.length === 0 ? (
            <div className="empty">
              <Clock3 size={26} />
              <strong>No earlier diaries found</strong>
              <span>Once you have prepared a diary for this class, it will appear here.</span>
            </div>
          ) : (
            <div className="list">
              {reuseList.map((item) => (
                <div className="list-item" key={item.key}>
                  <div className="list-main">
                    <strong>{getDateDetails(item.date).full}</strong>
                    <span>
                      {classNameOf(item)}
                      {item.section ? ` (Section ${item.section})` : ""} | {item.subjects.filter((subject) => subject.homework.trim()).map((subject) => subject.name).slice(0, 4).join(", ")}
                    </span>
                  </div>
                  <div className="list-actions">
                    <button type="button" className="btn btn-primary" onClick={() => copyIntoCurrent(item, getDateDetails(item.date).full)}>
                      Use this homework
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {modal?.kind === "settings" && (
        <SettingsDialog
          tab={modal.tab}
          onTab={(tab) => setModal({ kind: "settings", tab })}
          settings={settings}
          onSettings={setSettings}
          onExportBackup={exportBackup}
          onRestore={restoreBackup}
          onClose={closeModal}
          notify={notify}
        />
      )}

      {modal?.kind === "help" && (
        <Modal title="How to prepare a diary" kicker="QUICK HELP" onClose={closeModal}>
          <ol className="help-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Choose the class</strong>
                <p>The date and weekday are filled in automatically using Pakistan time. Use the date box only to prepare another day. Classes go from Montessori through Grade 10.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Select subjects, then type homework</strong>
                <p>Tap only the subjects needed today, then type or paste homework. Switch your phone keyboard to Urdu (tap the globe key) or leave direction on Auto.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Preview, then share</strong>
                <p>Press Preview Diary, then Download as PNG Image or Share on WhatsApp. On a phone, choose WhatsApp and the class group in the share sheet.</p>
              </div>
            </li>
          </ol>
          <p className="muted small">
            Each class has its own diary for each date. Diaries are saved on this device only. If your browser cannot send files to WhatsApp directly, the file is
            downloaded and you attach it in WhatsApp yourself; the portal never claims a diary was sent.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={closeModal}>
              Got it
            </button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} kicker="PLEASE CONFIRM" onClose={() => setConfirm(null)} layer="top">
          <p className="pane-intro">{confirm.body}</p>
          <div className="btn-row end">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${confirm.danger ? "btn-danger" : "btn-primary"}`}
              onClick={() => {
                const action = confirm.onConfirm;
                setConfirm(null);
                action();
              }}
            >
              {confirm.confirmLabel}
            </button>
          </div>
        </Modal>
      )}

      {toast ? (
        <div className={`toast toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
          <span>{toast.text}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setToast(null)}>
            <X size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
