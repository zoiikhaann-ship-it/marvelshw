const URDU_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsUrdu(value: string): boolean {
  return URDU_RE.test(value);
}

export type ParsedLine = {
  kind: "gap" | "plain" | "item";
  marker: string;
  text: string;
  urdu: boolean;
};

const BULLET_RE = /^\s*[-*\u2022]\s+(.+)$/;
const NUMBER_RE = /^\s*([0-9\u0660-\u0669\u06F0-\u06F9]{1,3}[.)])\s+(.+)$/;

/** Turns typed homework into display lines (plain lines, bullets, numbered items, gaps). */
export function parseHomework(raw: string): ParsedLine[] {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
  const out: ParsedLine[] = [];
  let lastWasGap = true;

  for (const line of lines) {
    if (!line.trim()) {
      if (!lastWasGap) out.push({ kind: "gap", marker: "", text: "", urdu: false });
      lastWasGap = true;
      continue;
    }
    lastWasGap = false;

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      out.push({ kind: "item", marker: "\u2022", text: bullet[1], urdu: containsUrdu(bullet[1]) });
      continue;
    }
    const numbered = NUMBER_RE.exec(line);
    if (numbered) {
      out.push({ kind: "item", marker: numbered[1], text: numbered[2], urdu: containsUrdu(numbered[2]) });
      continue;
    }
    const text = line.replace(/\s+$/, "");
    out.push({ kind: "plain", marker: "", text, urdu: containsUrdu(text) });
  }
  return out;
}

/** Splits **double-star** words into bold segments. */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.length ? parts : [{ text, bold: false }];
}

type Unit = { text: string; joiner: string };

/**
 * Splits very long homework into roughly equal pieces at line or word
 * boundaries so that nothing is ever cut off when a page fills up.
 */
export function splitText(text: string, parts: number): string[] {
  const clean = text.replace(/\s+$/, "");
  if (parts <= 1 || clean.length < 2) return [clean];

  const target = Math.ceil(clean.length / parts);
  const units: Unit[] = [];

  for (const line of clean.split("\n")) {
    if (line.length <= target * 1.15) {
      units.push({ text: line, joiner: "\n" });
      continue;
    }
    let buffer = "";
    let first = true;
    for (const word of line.split(/(\s+)/)) {
      if (buffer.length + word.length > target && buffer.trim()) {
        units.push({ text: buffer.replace(/\s+$/, ""), joiner: first ? "\n" : " " });
        first = false;
        buffer = word.replace(/^\s+/, "");
      } else {
        buffer += word;
      }
    }
    if (buffer.trim()) units.push({ text: buffer, joiner: first ? "\n" : " " });
  }

  const chunks: string[] = [];
  let current = "";
  let currentLength = 0;
  for (const unit of units) {
    if (current && currentLength + unit.text.length > target && chunks.length < parts - 1) {
      chunks.push(current);
      current = "";
      currentLength = 0;
    }
    current = current ? `${current}${unit.joiner}${unit.text}` : unit.text;
    currentLength += unit.text.length + 1;
  }
  if (current) chunks.push(current);

  const usable = chunks.filter((chunk) => chunk.trim().length > 0);
  return usable.length ? usable : [clean];
}

export type PlainTextInput = {
  weekday: string;
  dateText: string;
  className: string;
  section: string;
  teacherName: string;
  entries: { name: string; text: string; blank: boolean }[];
};

function toWhatsAppText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const bullet = BULLET_RE.exec(line);
      const body = bullet ? `\u2022 ${bullet[1]}` : line;
      return body.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/\s+$/, "");
    })
    .join("\n");
}

/** Clean text version of the diary, ready to paste into WhatsApp. */
export function buildPlainText(input: PlainTextInput): string {
  const lines: string[] = [
    "*MARVELS MONTESSORI AND SCHOOL*",
    "Sector B-17, Islamabad",
    "",
    `*${input.weekday} | Daily Homework | Date: ${input.dateText}*`,
    `*Class: ${input.className}*${input.section ? ` (Section ${input.section})` : ""}`,
    "",
  ];
  for (const entry of input.entries) {
    lines.push(`*${entry.name}*`);
    lines.push(entry.blank ? "No homework" : toWhatsAppText(entry.text));
    lines.push("");
  }
  if (input.teacherName) lines.push(`Class Teacher: ${input.teacherName}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
