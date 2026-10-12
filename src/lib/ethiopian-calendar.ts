/**
 * The day in the Ethiopian Orthodox Church: the Ethiopian date, the feast
 * the Church keeps, and the fast it keeps. Everything is computed from the
 * calendar (the day turns in Addis Ababa), so it costs nothing to run.
 */
import { addisDay } from "./scripture/today";

export interface EthDate {
  year: number;
  /** 1 = Meskerem … 12 = Nehase, 13 = Pagume. */
  month: number;
  day: number;
}

export type FeastId =
  | "enkutatash"
  | "meskel"
  | "genna"
  | "gehad"
  | "timket"
  | "hosanna"
  | "siklet"
  | "fasika"
  | "erget"
  | "paraclete"
  | "debre_tabor"
  | "filseta";

/** The commemorations the Church keeps on the same day of every month. */
export type MonthlyId =
  | "gebre_menfes_kidus"
  | "selassie"
  | "michael"
  | "kidane_mihret"
  | "gabriel"
  | "maryam"
  | "giyorgis"
  | "takla_haymanot"
  | "medhane_alem"
  | "bale_wold";

export type FastId = "nineveh" | "hudade" | "hawaryat" | "nebiyat" | "filseta" | "gehad" | "wednesday" | "friday";

export interface ChurchDay {
  date: EthDate;
  /** 0 = Sunday … 6 = Saturday, in Addis Ababa. */
  weekday: number;
  feast?: FeastId;
  monthly?: MonthlyId;
  fast?: FastId;
}

/** Julian Day Number of 1970-01-01. */
const UNIX_JDN = 2440588;
/** The Ethiopic (Amete Mihret) epoch offset used by the standard conversion. */
const ETHIOPIC_EPOCH = 1723856;

/** Days since 1970-01-01 → the Ethiopian date. */
export function ethiopianFromDay(day: number): EthDate {
  const jdn = day + UNIX_JDN;
  const r = (jdn - ETHIOPIC_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - ETHIOPIC_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  return { year, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

/** The Ethiopian date of `date`, the day turning at midnight in Addis Ababa. */
export function toEthiopian(date: Date): EthDate {
  return ethiopianFromDay(addisDay(date));
}

/**
 * Days since 1970-01-01 of Easter (Fasika) in a Gregorian year, by the Julian
 * computus the Ethiopian and other Orthodox churches keep (Meeus), moved onto
 * the Gregorian calendar (13 days between 1900 and 2099).
 */
export function easterDay(gregorianYear: number): number {
  const a = gregorianYear % 4;
  const b = gregorianYear % 7;
  const c = gregorianYear % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = March, 4 = April (Julian)
  const dayOfMonth = ((d + e + 114) % 31) + 1;
  const julianDrift = Math.floor(gregorianYear / 100) - Math.floor(gregorianYear / 400) - 2;
  return Math.floor(Date.UTC(gregorianYear, month - 1, dayOfMonth) / 86_400_000) + julianDrift;
}

const MONTHLY: Record<number, MonthlyId> = {
  5: "gebre_menfes_kidus",
  7: "selassie",
  12: "michael",
  16: "kidane_mihret",
  19: "gabriel",
  21: "maryam",
  23: "giyorgis",
  24: "takla_haymanot",
  27: "medhane_alem",
  29: "bale_wold",
};

/** What the Church keeps on the Addis Ababa day `day` (days since 1970-01-01). */
export function churchDayFromDay(day: number): ChurchDay {
  const date = ethiopianFromDay(day);
  const weekday = (((day + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
  const gregorian = new Date(day * 86_400_000);
  const easter = easterDay(gregorian.getUTCFullYear());
  const fromEaster = day - easter;
  const { month: m, day: d } = date;
  const is = (month: number, dd: number) => m === month && d === dd;
  // Genna is 25 December in the Julian calendar: 7 January.
  const isGenna = gregorian.getUTCMonth() === 0 && gregorian.getUTCDate() === 7;

  const feast: FeastId | undefined = is(1, 1)
    ? "enkutatash"
    : is(1, 17)
      ? "meskel"
      : isGenna
        ? "genna"
        : is(5, 10)
          ? "gehad"
          : is(5, 11)
            ? "timket"
            : is(12, 13)
              ? "debre_tabor"
              : is(12, 16)
                ? "filseta"
                : fromEaster === -7
                  ? "hosanna"
                  : fromEaster === -2
                    ? "siklet"
                    : fromEaster === 0
                      ? "fasika"
                      : fromEaster === 39
                        ? "erget"
                        : fromEaster === 49
                          ? "paraclete"
                          : undefined;

  // The fifty days of Easter, and the great feasts themselves, are not fasted.
  const eastertide = fromEaster >= 0 && fromEaster <= 49;
  const apostlesEnd = m === 11 && d <= 4;
  const fast: FastId | undefined =
    fromEaster >= -69 && fromEaster <= -67
      ? "nineveh"
      : fromEaster >= -55 && fromEaster <= -1
        ? "hudade"
        : fromEaster >= 50 && (m < 11 || apostlesEnd) && m >= 9
          ? "hawaryat"
          : (m === 3 && d >= 15) || (m === 4 && d <= 28 && !isGenna)
            ? "nebiyat"
            : m === 12 && d <= 15
              ? "filseta"
              : feast === "gehad"
                ? "gehad"
                : !eastertide && !feast && weekday === 3
                  ? "wednesday"
                  : !eastertide && !feast && weekday === 5
                    ? "friday"
                    : undefined;

  return { date, weekday, feast, monthly: m <= 12 ? MONTHLY[d] : undefined, fast };
}

export function churchDay(date: Date): ChurchDay {
  return churchDayFromDay(addisDay(date));
}
