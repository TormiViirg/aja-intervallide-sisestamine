/**
 * End-to-end test data in Estonian, English and Russian. Each row states the equivalence
 * class or boundary it exercises, so a failing case says *which* rule broke.
 */
export type Lang = 'et' | 'en' | 'ru';

export interface LabelSet {
  start: (ddmm: string) => string;
  end: (ddmm: string) => string;
  onTouch: string;
  bulkEnd: string;
  confirm: RegExp;
  publishNow: string;
  submitNow: RegExp;
  published: string;
  invalid: RegExp;
  progress: string;
}

export const LABELS: Record<Lang, LabelSet> = {
  et: {
    start: (d) => `Algus, ${d}`,
    end: (d) => `Lõpp, ${d}`,
    onTouch: 'Kirjutab üle puudutusel',
    bulkEnd: 'Massiline lõpp',
    confirm: /Valikuid kinnitama/,
    publishNow: 'Avalda kohe',
    submitNow: /^Avalda/,
    published: 'Avaldatud',
    invalid: /HH:MM/,
    progress: 'Lisatud vabatahtlike vahemikud',
  },
  en: {
    start: (d) => `Start, ${d}`,
    end: (d) => `End, ${d}`,
    onTouch: 'Overwrite on touch',
    bulkEnd: 'Bulk end',
    confirm: /Confirm choices/,
    publishNow: 'Publish now',
    submitNow: /^Publish/,
    published: 'Published',
    invalid: /HH:MM/,
    progress: 'Volunteer intervals added',
  },
  ru: {
    start: (d) => `Начало, ${d}`,
    end: (d) => `Конец, ${d}`,
    onTouch: 'Перезаписывать касанием',
    bulkEnd: 'Массовый конец',
    confirm: /Подтвердить выбор/,
    publishNow: 'Опубликовать сейчас',
    submitNow: /^Опубликовать/,
    published: 'Опубликовано',
    invalid: /ЧЧ:ММ/,
    progress: 'Добавленные интервалы волонтёров',
  },
};

export interface TimeCase {
  lang: Lang;
  /** What is being tested, e.g. "hour upper bound". */
  boundary: string;
  input: string;
  /** Expected rendered value, or null when the input must be rejected. */
  expected: string | null;
}

export const TIME_CASES: TimeCase[] = [
  { lang: 'et', boundary: 'lower bound 00:00 (valid)', input: '00:00', expected: '00:00' },
  { lang: 'et', boundary: 'upper bound 23:59 (valid)', input: '23:59', expected: '23:59' },
  { lang: 'en', boundary: 'hour upper bound + 1 → 24:00 (invalid)', input: '24:00', expected: null },
  { lang: 'en', boundary: 'minute upper bound + 1 → 12:60 (invalid)', input: '12:60', expected: null },
  { lang: 'ru', boundary: 'no separator 0830 (valid, normalised)', input: '0830', expected: '08:30' },
  { lang: 'ru', boundary: 'dot separator 8.30 (valid, normalised)', input: '8.30', expected: '08:30' },
  { lang: 'ru', boundary: 'letters (invalid)', input: 'ab:cd', expected: null },
];

/** Tuesday–Thursday are locked in the mock data (tablock). */
export const LOCKED_DAYS = ['2026-10-27', '2026-10-28', '2026-10-29'];
export const UNLOCKED_DAYS = ['2026-10-26', '2026-10-30', '2026-10-31'];
