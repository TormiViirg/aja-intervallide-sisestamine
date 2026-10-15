# PÖFF – vabatahtlike vabade aegade vahemikud

This is the frontend admins use to set when volunteers can enter their free time. For each day in a collection period, the admin sets a window in Estonian time. The app compares each window with the cinema opening times entered by the superadmin and marks the result according to the legend. The admin can then publish the schedule immediately, schedule publishing for later, or save it as a draft.

The app is built with React 19, Vite 8, TypeScript 7 (strict), XState 5, i18next (et / en / ru) and DayPicker. There is no backend yet: every call goes through a port, and mock adapters with dummy data stand in for the server.

```bash
npm install
npm run dev          # http://localhost:5173  (add ?now=2026-10-15T09:00:00Z to pin the clock, ?lng=ru for Russian)
npm test             # 260 unit + UI tests (Vitest, jsdom)
npm run test:e2e     # 28 Playwright tests, desktop 1440×1024 + Pixel 7, uses the installed Chrome
npm run build
```

## Architecture: ports and adapters

```
src/
  domain/        pure rules, no React, no I/O        (time, interval, legend, OKLCH, ledger, impact, volunteers, publish, workspace)
  application/   ports, state machines, store, view-model selectors
  adapters/      mock backend (mock/), cookies + clock (browser/)
  ui/            React components; depend on application + domain only
  config/        values the backend will supply later
  compositionRoot.ts   the only place adapters are wired to ports
```

The `Ports` interface in `src/application/ports.ts` is the contract with the backend:

| Port | What it provides |
|---|---|
| `ReferenceDataPort` | Festival, locations, teams, superadmin opening times, the eligibility window and the feedback thresholds |
| `ScheduleRepository` | Loading the workspace and earlier mass-overwrite marks, saving drafts and publishing |
| `VolunteerDirectory` | The volunteers and the free-time intervals they have already opened |
| `ClockPort` | The current time. `?now=` pins it, which the e2e and visual tests rely on |
| `TimezonePreferencePort` | Remembers the device timezone and the collapsed state of the timezone warning, in cookies (`poff_tz`, `poff_tz_warning`) |

To connect a real API, write HTTP adapters for these interfaces and swap them in `compositionRoot.ts`. Nothing else changes.

## State machines and other formal pieces

| Where | Concept |
|---|---|
| `application/machines/paintMachine.ts` | XState machine for the "Kirjutab üle puudutusel" gesture: `idle → pressed → painting \| filledAll`. A tap paints one card, a drag paints each card it crosses once, and holding a card for ≥ 700 ms fills every card. |
| `application/machines/rangePickerMachine.ts` | Two-calendar period picker. The guards check eligibility, that the end is not before the start, and that both dates are set before APPLY. |
| `application/machines/workflowMachine.ts` | `editing → overview → submitting → editing`, or back to `overview` with an error |
| `domain/markLedger.ts` | Finite-state reducer that tracks which mass-overwrite batch wrote each day's start and end, and which grey each batch has |
| `domain/oklch.ts` | Picks the grey for a new batch with a maximin search in OKLCH lightness. The new grey is as far as possible from every colour already on the days. For achromatic colours, contrast reduces to \|ΔL\|. |
| `domain/volunteers.ts` | Interval union (sweep line), so overlapping submissions are not double-counted |
| `domain/impact.ts` | Half-open interval difference W₀ \ W₁. It decides who must be notified after a published window shrinks. |
| `domain/time.ts` | Converts Tallinn wall-clock time to UTC instants, including the DST gap (skipped hour) and the repeated hour |

## Rules implemented (legend and brief)

| Rule | Implementation |
|---|---|
| Times are stored internally as UTC | Every value is a `UtcIso` instant. Tallinn wall-clock time is used only for display and input. Times are never converted to the viewer's own timezone. |
| End not after start | An end that is not after the start belongs to the next day, e.g. 10:30 → 01:59. An equal start and end is flagged as invalid. |
| Enne avamisaega märgitud aeg | The start is earlier than the opening time of at least one selected location. The card gets the black block in its top-right corner. |
| Kestab südaööst kauem | The end falls after midnight. Ending exactly at 00:00 does not count. The card gets a grey halo. |
| 24 h / 72 h / vanemad muudatused | Age of the day's last change: [0, 24 h) → dark, [24 h, 72 h) → mid, ≥ 72 h → light, never changed → white |
| Avaldamisjärgne aja ülekirjutus | The day differs from the published version. The card shows a stack of sheets with **affected ✎** and **to notify @** counts. |
| U-turn | Shown on a field when it overwrote a saved, non-empty value. Clicking it restores that value. |
| Mass overwrite marks | Rectangles left of the card: the top half marks the start, the bottom half the end, in the batch's grey. The footer's left strip previews the grey of the next batch. |
| Tablock | A per-weekday lock that blocks mass overwrite. Hand edits are still allowed. |
| Multiple teams | Edits are written to every selected team. Removing a team saves its draft. "Continue with this team only" resumes it alone. If a team was edited together with others and never reviewed on its own, the overview warns. |
| Live feedback | Text size changes in 2 pt steps between 7 and 15 pt. Smaller text shows more rows per group (`rowsForSize`). |
| Short periods | The grid always has 7 day columns. A period of fewer than 7 days fills the matching columns, and a partial week's total sits right after its last card. |
| Phone | Single column, with a sticky progress bar of completed intervals. The mass panel, lock chips and legend are in a bottom sheet. |
| Colours | Every colour is OKLCH. `src/ui/oklchOnly.test.ts` fails the build if any other colour format appears. |

## Configuration

`src/config/runtime.ts`:

```ts
export const ELIGIBILITY_WINDOW = {
  fromUtc: parseUtc('2026-09-30T21:00:00Z'),   // 1 Oct 00:00 Tallinn
  untilUtc: parseUtc('2026-11-30T22:00:00Z'),  // 1 Dec 00:00 Tallinn (exclusive)
};
```

A Tallinn day can be picked only if the whole day lies inside the window. The schedule and range-picker tests import this constant directly, so they follow it automatically when you change it. The festival id, the feedback thresholds and the mock latency are also in this file.

## Design fidelity

The two exports in `design/` are 4× (5760 × 4096), so 1440 × 1024 at 1×.

**Grid.** The source design is a 12-column grid at 1440 px with a 32 px margin and 20 px gutters. Each day spans 2 columns, so a day is 2·(1440 − 64 − 220)/12 + 20 = **212.67 px**. Adding Sunday makes 7 days, or 14 columns. These use a common 14-column grid at 1440 px with a **24 px margin and 16 px gutter**, so a day is 2·(1440 − 48 − 208)/14 + 16 = **185.14 px**.

**Scale.** Every element inside a day (cards, type, icons, header and footer blocks) keeps its measured ratio. Sizes are written in source-design pixels (`--u`) and scaled by k = 185.14 / 212.67 = 0.8706, so a 93 px source card becomes 80.95 px. In `src/ui/styles/tokens.css`, the grid metrics are the 14-column values divided by k. In the browser at 1440 px the grid measures margin 24, day 185.14, gutter 16, and the right margin is 24.

**Measurements.** All lengths are source-design pixels multiplied by `--u`:

- **Element metrics:** 93 px cards, 48 px day headers and a 126 px footer. They were measured by scanning the export's pixels and dividing by 4.
- **Greys:** sampled from the export and converted sRGB → OKLab. The legend lightnesses are 0.676 / 0.823 / 0.925, the halo is 0.851 and the opening-time box is 0.402.
- **Text font:** **Fira Sans Extra Condensed**, identified from its width-to-cap-height ratio (16.45 measured, 16.47 for the font).
- **Mono font:** **JetBrains Mono**, identified from the dotted zero and the tall digits.
- **Font sizes:** every font size was solved so that real strings render at the design's widths, all within 1 %.
- **Scaling:** `--u` = viewport width ÷ design width on desktop, and ÷ 390 on phones.

On the 12-column version, the rendered page was compared with `avaldatud põhjad-1.png` in an ink overlay, and the grid and text lined up within 1–2 px. The 14-column version is the same layout scaled by k.

## Interpretations

Correct these if they're wrong:

1. **Banner:** the site banner is left out as requested. The language switch (ET / EN / RU) sits top-right in its place, and the timezone warning uses the 22 px band the banner left.
2. **Missing references:** no separate calendar or warning reference was provided, so both reuse the design's own vocabulary: hairline ink borders, mono numerals and a hatched attention stripe.
3. **Sunday column:** the week always shows Monday–Sunday. A short period fills only its own weekday columns, and the grid never reflows. The mock cinemas open on Sundays at 11:00 (Solaris) and 11:30 (Coca-Cola Plaza).
4. **Before-opening rule:** in the design, 27.10 and 30.10 start before an opening time but aren't drawn black, while 29.10 is. The rule is applied consistently, so those cards are black here.
5. **Card number:** the small number on each card is how many visible volunteers have opened an interval that day.
6. **Hold to paste:** with "Kirjutab üle puudutusel" on, dragging pastes the values onto every card it touches, and holding one card for 700 ms pastes them onto all cards. Locked columns are skipped. Clicking a weekday header overwrites that column.
7. **Feedback groups:** the minimum is 600 min of free time, "close to the limit" is the 120 min above that, and "unusual" means one day holds ≥ 60 % of the total. These are placeholders until the backend sends real values.
