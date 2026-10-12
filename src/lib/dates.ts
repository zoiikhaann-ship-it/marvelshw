export const PAKISTAN_TZ = "Asia/Karachi";

/** Today's calendar date in Pakistan (Asia/Karachi), as YYYY-MM-DD. Never hardcoded. */
export function getPakistanToday(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: PAKISTAN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values: Record<string, string> = {};
    for (const part of parts) values[part.type] = part.value;
    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`;
    }
  } catch {
    // Fall through to the fixed UTC+5 offset (Pakistan does not use daylight saving time).
  }
  return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftISODate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type DateDetails = {
  weekday: string;
  /** e.g. "9 October 2026" */
  long: string;
  /** e.g. "Friday, 9 October 2026" */
  full: string;
};

/**
 * The weekday is derived from the calendar date itself (noon UTC avoids any
 * day-boundary drift), so the day name always matches the selected date.
 */
export function getDateDetails(iso: string): DateDetails {
  const safe = isValidISODate(iso) ? iso : getPakistanToday();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(`${safe}T12:00:00.000Z`));
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  const long = `${values.day} ${values.month} ${values.year}`;
  return { weekday: values.weekday, long, full: `${values.weekday}, ${long}` };
}

export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PAKISTAN_TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
