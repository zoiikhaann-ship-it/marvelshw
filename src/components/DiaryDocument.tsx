import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiaryPage } from "./DiaryPage";
import type { DiaryRow, PageMeta } from "./DiaryPage";
import { splitText } from "../lib/text";
import type { TextDir } from "../lib/types";

export type Entry = {
  id: string;
  name: string;
  text: string;
  dir: TextDir;
  blank: boolean;
};

type Piece = DiaryRow & { splitKey: string };

type Props = {
  meta: PageMeta;
  logo: string | null;
  entries: Entry[];
  onPageCount?: (count: number) => void;
};

const SAFETY = 8;

function buildPieces(entries: Entry[], counts: Record<string, number>): Piece[] {
  const pieces: Piece[] = [];
  for (const entry of entries) {
    const splitKey = `${entry.id}\u0001${entry.text}`;
    if (entry.blank) {
      pieces.push({ id: `${entry.id}:0`, subject: entry.name, text: "", dir: entry.dir, continued: false, blank: true, splitKey });
      continue;
    }
    splitText(entry.text, counts[splitKey] ?? 1).forEach((chunk, index) => {
      pieces.push({
        id: `${entry.id}:${index}`,
        subject: entry.name,
        text: chunk,
        dir: entry.dir,
        continued: index > 0,
        blank: false,
        splitKey,
      });
    });
  }
  return pieces;
}

function samePages(a: DiaryRow[][], b: DiaryRow[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((page, index) => page.length === b[index].length && page.every((row, i) => row.id === b[index][i].id && row.text === b[index][i].text && row.subject === b[index][i].subject && row.dir === b[index][i].dir));
}

/**
 * Lays homework out on A4 pages. Row heights are measured in a hidden copy of the real page
 * styles, so long homework moves to a new page instead of being shrunk or cut off.
 */
export const DiaryDocument = forwardRef<HTMLDivElement, Props>(function DiaryDocument(
  { meta, logo, entries, onPageCount },
  ref,
) {
  const [splitCounts, setSplitCounts] = useState<Record<string, number>>({});
  const [capacity, setCapacity] = useState({ full: 420, compact: 640 });
  const [pages, setPages] = useState<DiaryRow[][]>([[]]);
  const [fontTick, setFontTick] = useState(0);

  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const pieces = useMemo(() => buildPieces(entries, splitCounts), [entries, splitCounts]);

  useEffect(() => {
    let alive = true;
    const bump = () => {
      if (alive) setFontTick((tick) => tick + 1);
    };
    document.fonts.ready.then(bump);
    document.fonts.addEventListener("loadingdone", bump);
    Promise.all([
      document.fonts.load('400 18px "Noto Nastaliq Urdu"', "\u0627\u0631\u062F\u0648"),
      document.fonts.load('700 18px "Noto Nastaliq Urdu"', "\u0627\u0631\u062F\u0648"),
    ])
      .then(bump)
      .catch(() => undefined);
    return () => {
      alive = false;
      document.fonts.removeEventListener("loadingdone", bump);
    };
  }, []);

  // 1) Space available for table rows on a first page and on a continuation page.
  useLayoutEffect(() => {
    const measure = (root: HTMLElement | null, fallback: number) => {
      const area = root?.querySelector<HTMLElement>(".diary-table-area");
      const head = root?.querySelector<HTMLElement>("thead");
      if (!area || !head) return fallback;
      const space = area.clientHeight - head.getBoundingClientRect().height - SAFETY;
      return space > 120 ? space : fallback;
    };
    const full = measure(fullRef.current, 420);
    const compact = measure(compactRef.current, 640);
    setCapacity((current) =>
      Math.abs(current.full - full) < 0.5 && Math.abs(current.compact - compact) < 0.5 ? current : { full, compact },
    );
  }, [fontTick, logo, meta.className, meta.section, meta.teacherName, meta.dateText, meta.weekday]);

  // 2) Measure every row, split anything taller than a page, then assign rows to pages.
  useLayoutEffect(() => {
    const root = rowsRef.current;
    if (!root) return;

    if (!pieces.length) {
      setPages((current) => (samePages(current, [[]]) ? current : [[]]));
      return;
    }

    const heights = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("tr[data-row-id]").forEach((row) => {
      heights.set(row.dataset.rowId ?? "", row.getBoundingClientRect().height);
    });

    const producedByKey = new Map<string, number>();
    pieces.forEach((piece) => producedByKey.set(piece.splitKey, (producedByKey.get(piece.splitKey) ?? 0) + 1));

    const limit = capacity.full;
    const grow: Record<string, number> = {};
    for (const piece of pieces) {
      const height = heights.get(piece.id) ?? 0;
      if (piece.blank || height <= limit) continue;
      const requested = splitCounts[piece.splitKey] ?? 1;
      const produced = producedByKey.get(piece.splitKey) ?? 1;
      if (requested < 40 && produced >= requested) {
        const wanted = Math.max(requested + 1, Math.ceil(requested * (height / limit)));
        grow[piece.splitKey] = Math.max(grow[piece.splitKey] ?? 0, wanted);
      }
    }
    if (Object.keys(grow).length) {
      setSplitCounts((current) => ({ ...current, ...grow }));
      return;
    }

    const next: DiaryRow[][] = [];
    let current: DiaryRow[] = [];
    let used = 0;
    let space = capacity.full;
    for (const piece of pieces) {
      const height = heights.get(piece.id) ?? 60;
      if (current.length > 0 && used + height > space) {
        next.push(current);
        current = [];
        used = 0;
        space = capacity.compact;
      }
      current.push(piece);
      used += height;
    }
    if (current.length || next.length === 0) next.push(current);
    setPages((existing) => (samePages(existing, next) ? existing : next));

    // Forget split counts for text that no longer exists.
    const valid = new Set(entries.map((entry) => `${entry.id}\u0001${entry.text}`));
    if (Object.keys(splitCounts).some((key) => !valid.has(key))) {
      setSplitCounts((existing) => {
        const kept: Record<string, number> = {};
        for (const [key, value] of Object.entries(existing)) if (valid.has(key)) kept[key] = value;
        return kept;
      });
    }
  }, [pieces, capacity, fontTick, splitCounts, entries]);

  useEffect(() => {
    onPageCount?.(pages.length);
  }, [pages.length, onPageCount]);

  return (
    <>
      <div className="diary-document" ref={ref}>
        {pages.map((rows, index) => (
          <DiaryPage
            key={index}
            meta={meta}
            logo={logo}
            rows={rows}
            variant={index === 0 ? "full" : "compact"}
            pageNumber={index + 1}
            pageCount={pages.length}
          />
        ))}
      </div>
      {createPortal(
        <div className="diary-measure" aria-hidden="true">
          <div ref={fullRef}>
            <DiaryPage meta={meta} logo={logo} rows={[]} variant="full" pageNumber={1} pageCount={2} mode="measure-structure" />
          </div>
          <div ref={compactRef}>
            <DiaryPage meta={meta} logo={logo} rows={[]} variant="compact" pageNumber={2} pageCount={2} mode="measure-structure" />
          </div>
          <div ref={rowsRef}>
            <DiaryPage meta={meta} logo={logo} rows={pieces} variant="full" pageNumber={1} pageCount={1} mode="measure-rows" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
});
