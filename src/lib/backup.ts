import { sanitizeDiary, sanitizeSettings } from "./storage";
import type { Diary, Settings } from "./types";

export type BackupPayload = {
  settings: Settings;
  diaries: Diary[];
  logo: string | null;
};

const FORMAT = "marvels-diary-backup";

export function buildBackup(settings: Settings, diaries: Record<string, Diary>): string {
  return JSON.stringify(
    {
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      logo: null,
      diaries: Object.values(diaries),
    },
    null,
    2,
  );
}

export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not a valid backup file.");
  }
  if (typeof raw !== "object" || raw === null || (raw as Record<string, unknown>).format !== FORMAT) {
    throw new Error("That file is not a Marvels Diary backup.");
  }
  const source = raw as Record<string, unknown>;
  const diaries = Array.isArray(source.diaries)
    ? source.diaries.map(sanitizeDiary).filter((item): item is Diary => item !== null)
    : [];
  const logo =
    typeof source.logo === "string" && source.logo.startsWith("data:image/") ? source.logo : null;
  return { settings: sanitizeSettings(source.settings), diaries, logo };
}
