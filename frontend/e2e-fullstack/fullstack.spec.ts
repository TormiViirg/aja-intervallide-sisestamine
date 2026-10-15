/**
 * Full stack: React frontend (API mode) → Vite proxy → Express backend (in-memory repository).
 * Backend sample data: team "Piletikontroll" (usher); Mari Tamm opened 27.10 10:00–21:45.
 *
 * ┌────┬──────────────────────────────────────────┬──────────────────────────────────────────────┐
 * │ id │ scenario                                 │ expected                                     │
 * ├────┼──────────────────────────────────────────┼──────────────────────────────────────────────┤
 * │ F1 │ first load                               │ backend team, Solaris 07:45, status draft    │
 * │ F2 │ edit 27.10 + save draft + reload         │ value comes back from the server             │
 * │ F3 │ overview after changing 27.10            │ backend preview: Mari Tamm affected+notified │
 * │ F4 │ publish with a start-only day            │ server rejects → validation message          │
 * │ F5 │ publish now with complete days           │ status becomes "Avaldatud"                   │
 * └────┴──────────────────────────────────────────┴──────────────────────────────────────────────┘
 */
import { expect, type Page, test } from '@playwright/test';

const URL = '/?now=2026-10-15T09:00:00Z&lng=et';

async function setTime(page: Page, date: string, field: 'Algus' | 'Lõpp', value: string) {
  const card = page.getByTestId(`card-${date}`);
  const label = `${field}, ${date.slice(8, 10)}.${date.slice(5, 7)}`;
  await card.getByRole('button', { name: new RegExp(`^${label}: `) }).click();
  const input = card.getByRole('textbox', { name: label });
  await input.fill(value);
  await input.press('Enter');
}

test.describe.serial('frontend ⇄ backend', () => {
  test('F1 loads what the backend serves', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('team-value')).toHaveText('Piletikontroll');
    await expect(page.getByTestId('status')).toHaveText('Mustand');
    await expect(page.getByTestId('card-2026-10-27')).toContainText('07:45');
  });

  test('F2 saves a draft that survives a reload', async ({ page }) => {
    await page.goto(URL);
    await setTime(page, '2026-10-28', 'Algus', '09:00');
    await setTime(page, '2026-10-28', 'Lõpp', '17:30');
    await page.getByRole('button', { name: /Salvesta mustand/ }).click();
    await expect(page.getByTestId('save-status')).toHaveText('Kõik muudatused on salvestatud');
    await page.reload();
    await expect(page.getByTestId('card-2026-10-28').getByRole('button', { name: 'Lõpp, 28.10: 17:30' })).toBeVisible();
  });

  test('F3 + F4 + F5 overview impact, rejected and accepted publishing', async ({ page }) => {
    await page.goto(URL);
    await setTime(page, '2026-10-27', 'Algus', '10:00');
    await setTime(page, '2026-10-27', 'Lõpp', '20:00');
    await setTime(page, '2026-10-29', 'Algus', '12:00');
    await page.getByRole('button', { name: /Valikuid kinnitama/ }).click();
    await expect(page.getByTestId('impact-usher')).toHaveText('1 mõjutatud, 1 tuleb teavitada');
    await expect(page.getByText('Mari Tamm')).toBeVisible();

    await page.getByRole('radio', { name: 'Avalda kohe' }).check();
    await page.getByRole('button', { name: /^Avalda/ }).click();
    await expect(page.getByRole('alert')).toContainText('Server ei võtnud valikuid vastu');

    await page.getByRole('button', { name: 'Tagasi muutma' }).click();
    await setTime(page, '2026-10-29', 'Lõpp', '18:00');
    await page.getByRole('button', { name: /Valikuid kinnitama/ }).click();
    await page.getByRole('radio', { name: 'Avalda kohe' }).check();
    await page.getByRole('button', { name: /^Avalda/ }).click();
    await expect(page.getByTestId('status')).toHaveText('Avaldatud');
  });
});
