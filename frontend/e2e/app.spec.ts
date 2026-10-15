/**
 * End-to-end: real pointer gestures, layout and the full publish flow in three languages.
 * The clock is pinned with ?now= so the legend's 24 h / 72 h classes are stable.
 *
 * ┌────┬──────────────────────────────────────────┬───────────────────────────────────────────────┐
 * │ id │ scenario                                 │ class / boundary                              │
 * ├────┼──────────────────────────────────────────┼───────────────────────────────────────────────┤
 * │ E1 │ typed times (TIME_CASES)                 │ see e2e/data/cases.ts                         │
 * │ E2 │ drag across Mon→Fri with touch overwrite │ unlocked days written + marked, locked kept   │
 * │ E3 │ hold one card ≥ 700 ms                   │ every unlocked day written, locked kept       │
 * │ E4 │ publish now from the overview            │ status becomes "published" in each language  │
 * │ E5 │ phone progress bar                       │ value + 1 after completing an empty day       │
 * │ E6 │ no horizontal scroll                     │ phone 412 px and desktop 1440 px              │
 * └────┴──────────────────────────────────────────┴───────────────────────────────────────────────┘
 */
import { expect, type Page, test } from '@playwright/test';
import { type Lang, LABELS, LOCKED_DAYS, TIME_CASES, UNLOCKED_DAYS } from './data/cases';

const NOW = '2026-10-15T09:00:00Z';
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

async function open(page: Page, lang: Lang) {
  await page.goto(`/?now=${NOW}&lng=${lang}`);
  await expect(page.getByTestId('card-2026-10-26')).toBeVisible();
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

test.describe('E1 typed time boundaries', () => {
  for (const c of TIME_CASES) {
    test(`${c.lang}: ${c.boundary}`, async ({ page }) => {
      await open(page, c.lang);
      const L = LABELS[c.lang];
      const card = page.getByTestId('card-2026-11-03');
      await card.getByRole('button', { name: `${L.start('03.11')}: XX:XX` }).click();
      const input = card.getByRole('textbox', { name: L.start('03.11') });
      await input.fill(c.input);
      await input.press('Enter');
      if (c.expected === null) {
        await expect(card.getByRole('alert')).toHaveText(L.invalid);
      } else {
        await expect(card.getByRole('button', { name: `${L.start('03.11')}: ${c.expected}` })).toBeVisible();
      }
    });
  }
});

async function setBulkEnd(page: Page, lang: Lang, value: string) {
  const L = LABELS[lang];
  if (isPhone(page)) await page.locator('.fbtn--tools').click();
  const scope = page.getByTestId('mass-panel').last();
  await scope.getByRole('button', { name: new RegExp(`^${L.bulkEnd}`) }).click();
  const input = scope.getByRole('textbox', { name: L.bulkEnd });
  await input.fill(value);
  await input.press('Enter');
  await scope.getByRole('switch', { name: L.onTouch }).click();
  if (isPhone(page)) await page.locator('.sheet__close').click();
}

test.describe('touch overwrite', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 760, 'pointer strokes are tested on the desktop grid');

  test('E2 en: dragging paints unlocked days and skips locked ones', async ({ page }) => {
    await open(page, 'en');
    await setBulkEnd(page, 'en', '22:15');
    const centre = async (iso: string) => {
      const box = (await page.getByTestId(`card-${iso}`).boundingBox())!;
      return { x: box.x + 30, y: box.y + box.height / 2 };
    };
    const a = await centre('2026-10-26');
    const b = await centre('2026-10-30');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y, { steps: 2 });
    await page.mouse.up();

    for (const d of ['2026-10-26', '2026-10-30']) {
      const card = page.getByTestId(`card-${d}`);
      await expect(card.getByRole('button', { name: `${LABELS.en.end(ddmm(d))}: 22:15` })).toBeVisible();
      await expect(card.locator('.card__mark--end')).toHaveAttribute('style', /oklch\(/);
    }
    for (const d of LOCKED_DAYS) {
      await expect(page.getByTestId(`card-${d}`).getByRole('button', { name: new RegExp(`${LABELS.en.end(ddmm(d))}: (?!22:15)`) })).toBeVisible();
    }
  });

  test('E3 et: holding one card fills every unlocked day', async ({ page }) => {
    await open(page, 'et');
    await setBulkEnd(page, 'et', '22:45');
    const box = (await page.getByTestId('card-2026-11-02').boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 40);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    for (const d of [...UNLOCKED_DAYS, '2026-11-23']) {
      await expect(page.getByTestId(`card-${d}`).getByRole('button', { name: `${LABELS.et.end(ddmm(d))}: 22:45` })).toBeVisible();
    }
    for (const d of LOCKED_DAYS) {
      await expect(page.getByTestId(`card-${d}`).getByRole('button', { name: `${LABELS.et.end(ddmm(d))}: 22:45` })).toHaveCount(0);
    }
  });
});

for (const lang of ['et', 'en', 'ru'] as const) {
  test(`E4 ${lang}: publish now from the overview`, async ({ page }) => {
    await open(page, lang);
    const L = LABELS[lang];
    await page.getByRole('button', { name: L.confirm }).click();
    await page.getByRole('radio', { name: L.publishNow }).check();
    await page.getByRole('button', { name: L.submitNow }).click();
    await expect(page.getByTestId('status')).toHaveText(L.published);
  });
}

test('E5 ru: phone progress bar counts completed intervals', async ({ page }) => {
  test.skip(!isPhone(page), 'phone only');
  await open(page, 'ru');
  const bar = page.getByRole('progressbar', { name: LABELS.ru.progress });
  await expect(bar).toHaveAttribute('aria-valuenow', '15');
  const card = page.getByTestId('card-2026-11-03');
  for (const [label, value] of [
    [LABELS.ru.start('03.11'), '10:00'],
    [LABELS.ru.end('03.11'), '18:00'],
  ] as const) {
    await card.getByRole('button', { name: `${label}: XX:XX` }).click();
    await card.getByRole('textbox', { name: label }).fill(value);
    await card.getByRole('textbox', { name: label }).press('Enter');
  }
  await expect(bar).toHaveAttribute('aria-valuenow', '16');
});

test('E6 no horizontal scrolling', async ({ page }) => {
  await open(page, 'ru');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

/**
 * E7 — short periods (fewer than 7 days → fewer weekday columns).
 * Regression: the grid used to shrink, header text overlapped the cards and swallowed clicks.
 * ┌──────────────┬──────────────────────────────┬────────────────────────────────────────────┐
 * │ period       │ class                        │ checks                                     │
 * ├──────────────┼──────────────────────────────┼────────────────────────────────────────────┤
 * │ 04.11–04.11  │ 1 day (lower bound)          │ card keeps design size, editable           │
 * │ 02.11–04.11  │ 3 days, one week             │ no overlap, editable, header + footer work │
 * │ 05.11–10.11  │ 6 days (upper bound − 1),    │ spans two weeks incl. Sunday 08.11         │
 * │              │ two partial weeks            │                                            │
 * └──────────────┴──────────────────────────────┴────────────────────────────────────────────┘
 */
async function pickRange(page: Page, from: string, to: string) {
  await page.locator('.hdr__range-value').click();
  const start = page.getByRole('region', { name: 'Algus' });
  const end = page.getByRole('region', { name: 'Lõpp' });
  await start.getByRole('button', { name: 'Järgmine kuu' }).click();
  await start.locator(`[data-day="${from}"]:not([data-outside]) button`).click();
  await end.locator(`[data-day="${to}"]:not([data-outside]) button`).click();
  await page.getByRole('button', { name: 'Kasuta vahemikku' }).click();
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const [from, to, days] of [
  ['2026-11-04', '2026-11-04', 1],
  ['2026-11-02', '2026-11-04', 3],
  ['2026-11-05', '2026-11-10', 6],
] as const) {
  test(`E7 et: ${from} – ${to} stays usable`, async ({ page }) => {
    await open(page, 'et');
    await pickRange(page, from, to);
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(days);

    const first = page.getByTestId(`card-${from}`);
    const cardBox = (await first.boundingBox())!;
    if (!isPhone(page)) {
      // Cards keep the 14-column day width at 1440: 2·(1440 − 2·24 − 13·16)/14 + 16 = 185.14 px.
      expect(cardBox.width).toBeCloseTo(185.14, 0);
      // …and sit in their weekday column: margin 24 + weekday · (day 185.14 + gutter 16).
      const weekday = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7;
      expect(cardBox.x).toBeCloseTo(24 + weekday * (185.14 + 16), 0);
      for (const sel of ['.hdr__range', '.hdr__team', '.hdr__volunteers']) {
        expect(overlaps((await page.locator(sel).boundingBox())!, cardBox), `${sel} overlaps the card`).toBe(false);
      }
    }

    // Every area still takes clicks: card time, team menu, calendar, footer.
    await first.getByRole('button', { name: /^Lõpp, / }).click();
    const input = first.getByRole('textbox', { name: /^Lõpp, / });
    await input.fill('19:30');
    await input.press('Enter');
    await expect(first.getByRole('button', { name: /^Lõpp, .*19:30$/ })).toBeVisible();

    await page.getByRole('button', { name: /Hallatav tiim/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Piletikontroll' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('.hdr__range-value').click();
    await expect(page.getByRole('button', { name: 'Kasuta vahemikku' })).toBeVisible();
    await page.getByRole('button', { name: 'Tühista' }).click();

    await page.getByRole('button', { name: /Valikuid kinnitama/ }).click();
    await expect(page.getByRole('heading', { name: 'Ülevaade enne kinnitamist' })).toBeVisible();
  });
}
