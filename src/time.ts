// Date helpers. The model sees "now" in the user's timezone and writes local
// wall-clock times ("2026-10-14T15:00"); these convert them to real instants.

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/;

/** Offset of `tz` from UTC at instant `at`, in minutes (e.g. +240 for Asia/Dubai). */
function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as wall-clock time in `tz`.
 * A date with no time gets 09:00. Returns null for anything else, including
 * impossible dates like 2026-02-30.
 */
export function parseLocalDateTime(value: string, tz: string): Date | null {
  const m = LOCAL_RE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h = 9, mi = 0] = m.slice(1).map((v) => (v === undefined ? undefined : Number(v))) as number[];
  if (h! > 23 || mi! > 59) return null;
  const wall = Date.UTC(y!, mo! - 1, d!, h, mi);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo! - 1 || check.getUTCDate() !== d) return null;
  // Two passes handle instants near a DST change.
  let guess = wall - offsetMinutes(new Date(wall), tz) * 60_000;
  guess = wall - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

/** Human "now" for prompts: "Tuesday 2026-10-13 14:05 (Asia/Dubai)". */
export function formatNow(now: Date, tz: string): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => s.find((p) => p.type === t)?.value ?? "";
  return `${g("weekday")} ${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")} (${tz})`;
}

/** Local "YYYY-MM-DD HH:MM" for showing a stored instant to the model. */
export function formatLocal(at: Date, tz: string): string {
  return formatNow(at, tz).replace(/^\S+ /, "").replace(/ \(.*\)$/, "");
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
