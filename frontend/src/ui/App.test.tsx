/**
 * UI tests, run in Estonian, English and Russian against the mock adapters
 * (latency 0, clock pinned to 15.10.2026 12:00 Tallinn).
 *
 * ┌────┬──────┬─────────────────────────────────┬──────────────────────────────────────────────────┐
 * │ id │ lang │ feature                         │ equivalence class / boundary under test          │
 * ├────┼──────┼─────────────────────────────────┼──────────────────────────────────────────────────┤
 * │ U1 │ et   │ grid from mock data             │ Mon–Sun columns, Sunday cards present            │
 * │ U2 │ et   │ time entry                      │ 24:00 invalid (hour upper bound + 1)             │
 * │    │      │                                 │ 23:59 valid (upper bound) · 00:00 valid (lower)  │
 * │    │      │                                 │ empty → clears the field                         │
 * │ U3 │ en   │ U-turn                          │ overwritten saved value → button; after → gone   │
 * │ U4 │ en   │ overview impact                 │ 17 affected / 3 notified, names listed           │
 * │ U5 │ en   │ scheduled publish (Estonian time)│ now+4 min rejected · now+5 min accepted          │
 * │ U6 │ ru   │ tablock + column overwrite      │ unlocked column written, locked header inert     │
 * │ U7 │ ru   │ live-feedback text size         │ 11→13→15 pt (max, A+ disabled) · 7 pt (min)      │
 * │ U8 │ ru   │ timezone warning                │ foreign zone: open + zone named · eye collapses  │
 * │    │ et   │                                 │ Tallinn zone: collapsed by default               │
 * │ U9 │ en   │ multi-team                      │ removing a team saves its draft; resume alone    │
 * │ U10│ et   │ range picker eligibility        │ first eligible day enabled, prev month disabled  │
 * │ U11│ en   │ backend unavailable             │ reference load rejects → error + retry, no hang  │
 * │    │      │                                 │ end before start disabled · apply rebuilds grid  │
 * └────┴──────┴─────────────────────────────────┴──────────────────────────────────────────────────┘
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PIIKSUTAJAD } from '../adapters/mock/data';
import { TZ_WARNING_COOKIE } from '../adapters/browser/cookieTimezone';
import { memoryJar, testPorts } from '../test/testPorts';
import { App } from './App';
import { AppProvider } from './AppProvider';

function renderApp(lang: 'et' | 'en' | 'ru', opts: Parameters<typeof testPorts>[0] = {}) {
  window.history.replaceState(null, '', `/?lng=${lang}`);
  const t = testPorts(opts);
  const utils = render(
    <AppProvider ports={t.ports} fallback={<p>loading</p>}>
      <App />
    </AppProvider>,
  );
  return { ...utils, ...t, user: userEvent.setup() };
}

const card = (date: string) => screen.findByTestId(`card-${date}`);

beforeEach(() => {
  window.localStorage.clear();
});

describe('Estonian', () => {
  it('U1 builds Monday–Sunday columns from the mock opening times', async () => {
    renderApp('et');
    await card('2026-10-26');
    for (const day of ['esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev', 'pühapäev']) {
      expect(screen.getAllByText(day).length).toBeGreaterThan(0);
    }
    expect(await card('2026-11-01')).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('Ajastatud avaldamiseks');
  });

  it('U2 validates typed times at the 00:00 / 23:59 / 24:00 boundaries', async () => {
    const { user } = renderApp('et');
    const c = await card('2026-11-03');
    await user.click(within(c).getByRole('button', { name: 'Algus, 03.11: XX:XX' }));
    const input = within(c).getByRole('textbox', { name: 'Algus, 03.11' });

    await user.type(input, '24:00{Enter}');
    expect(within(c).getByRole('alert')).toHaveTextContent('Kasuta kuju HH:MM');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.clear(input);
    await user.type(input, '23:59{Enter}');
    expect(within(c).getByRole('button', { name: 'Algus, 03.11: 23:59' })).toBeInTheDocument();

    await user.click(within(c).getByRole('button', { name: 'Algus, 03.11: 23:59' }));
    await user.clear(within(c).getByRole('textbox'));
    await user.type(within(c).getByRole('textbox'), '0000{Enter}');
    expect(within(c).getByRole('button', { name: 'Algus, 03.11: 00:00' })).toBeInTheDocument();

    await user.click(within(c).getByRole('button', { name: 'Algus, 03.11: 00:00' }));
    await user.clear(within(c).getByRole('textbox'));
    await user.keyboard('{Enter}');
    expect(within(c).getByRole('button', { name: 'Algus, 03.11: XX:XX' })).toBeInTheDocument();
  });
});

describe('English', () => {
  it('U3 restores an overwritten saved time with the U-turn button', async () => {
    const { user } = renderApp('en');
    const c = await card('2026-11-13');
    await user.click(within(c).getByRole('button', { name: 'Restore 10:00' }));
    expect(within(c).getByRole('button', { name: 'Start, 13.11: 10:00' })).toBeInTheDocument();
    expect(within(c).queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('U4 lists affected volunteers and who will be notified', async () => {
    const { user } = renderApp('en');
    await card('2026-10-26');
    await user.click(screen.getByRole('button', { name: /Confirm choices/ }));
    expect(await screen.findByRole('heading', { name: 'Review before confirming' })).toBeInTheDocument();
    expect(screen.getByTestId(`impact-${PIIKSUTAJAD}`)).toHaveTextContent('17 affected, 3 to notify');
    expect(screen.getAllByText('will be notified')).toHaveLength(3);
    expect(screen.getByText('Ольга Смирнова')).toBeInTheDocument();
  });

  it('U5 schedules publishing in Estonian time: 4 min ahead rejected, 5 min accepted', async () => {
    const { user } = renderApp('en');
    await card('2026-10-26');
    await user.click(screen.getByRole('button', { name: /Confirm choices/ }));
    await user.click(await screen.findByRole('radio', { name: 'Schedule publishing in Estonian time' }));
    const date = screen.getByLabelText('Date');
    const time = screen.getByLabelText('Time (Estonian time)');
    await user.clear(date);
    await user.type(date, '2026-10-15');
    await user.clear(time);
    await user.type(time, '12:04');
    await user.click(screen.getByRole('button', { name: /^Schedule/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 5 minutes from now');

    await user.clear(time);
    await user.type(time, '12:05');
    await user.click(screen.getByRole('button', { name: /^Schedule/ }));
    expect(await screen.findByText(/^Scheduled for/)).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('Scheduled to publish');
  });

  it('U9 saves a removed team as a draft and lets you continue with it alone', async () => {
    const { user, schedules } = renderApp('en');
    await card('2026-10-26');
    await user.click(screen.getByRole('button', { name: /Managed team/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Piletikontroll' }));
    expect(screen.getByTestId('team-value')).toHaveTextContent('Piiksutajad, Piletikontroll');
    await user.click(screen.getByRole('checkbox', { name: 'Piiksutajad' }));
    expect(await screen.findByText('Piiksutajad saved as a draft')).toBeInTheDocument();
    expect(schedules.savedDrafts.has(PIIKSUTAJAD)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Piiksutajad: Continue with this team only' }));
    expect(screen.getByTestId('team-value')).toHaveTextContent(/^Piiksutajad$/);
  });
});

describe('Russian', () => {
  it('U6 column overwrite respects tablock', async () => {
    const { user } = renderApp('ru');
    const mon = await card('2026-10-26');
    await user.click(screen.getByRole('switch', { name: 'Перезаписывать касанием' }));
    // Tuesday is locked in the mock data: its header is plain text, not an action.
    expect(screen.queryByRole('button', { name: 'Перезаписать столбец: вторник' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Перезаписать столбец: понедельник' }));
    expect(within(mon).getByRole('button', { name: 'Конец, 26.10: 21:45' })).toBeInTheDocument();
    const tue = await card('2026-10-27');
    expect(within(tue).getByRole('button', { name: 'Конец, 27.10: 21:45' })).toBeInTheDocument(); // unchanged value
    await user.click(screen.getByRole('button', { name: 'Разрешить массовую перезапись: вторник' }));
    expect(screen.getByRole('button', { name: 'Перезаписать столбец: вторник' })).toBeInTheDocument();
  });

  it('U7 steps the live-feedback text in 2 pt and clamps at 7 and 15 pt', async () => {
    const { user } = renderApp('ru');
    await card('2026-10-26');
    await user.click(screen.getByRole('button', { name: /Волонтёры команды/ }));
    const size = screen.getByTestId('feedback-size');
    expect(size).toHaveTextContent('11 pt');
    const larger = screen.getByRole('button', { name: 'Крупнее' });
    await user.click(larger);
    expect(size).toHaveTextContent('13 pt');
    await user.click(larger);
    expect(size).toHaveTextContent('15 pt');
    expect(larger).toBeDisabled();
    const smaller = screen.getByRole('button', { name: 'Мельче' });
    for (let i = 0; i < 4; i++) await user.click(smaller);
    expect(size).toHaveTextContent('7 pt');
    expect(smaller).toBeDisabled();
    expect(screen.getByTestId('group-count-unfilled')).toHaveTextContent('2');
  });

  it('U8 shows the Estonian-time warning for a foreign zone and remembers collapsing it', async () => {
    const jar = memoryJar();
    const { user } = renderApp('ru', { zone: 'America/New_York', jar });
    await card('2026-10-26');
    expect(screen.getByTestId('tz-body')).toHaveTextContent('America/New_York');
    await user.click(screen.getByRole('button', { name: 'Скрыть предупреждение' }));
    expect(screen.queryByTestId('tz-body')).toBeNull();
    expect(jar.all()).toContain(`${TZ_WARNING_COOKIE}=collapsed`);
  });

  it('U8b collapses the warning by default in Estonian time', async () => {
    renderApp('et', { zone: 'Europe/Tallinn' });
    await card('2026-10-26');
    expect(screen.queryByTestId('tz-body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Näita hoiatust' })).toBeInTheDocument();
  });
});

describe('Range picker (Estonian)', () => {
  it('U10 enforces the eligibility window and rebuilds the grid', async () => {
    const { user, container } = renderApp('et');
    await card('2026-10-26');
    await user.click(screen.getByRole('button', { name: /Vabatahtlikelt korjatav/ }));
    const start = screen.getByRole('region', { name: 'Algus' });
    const end = screen.getByRole('region', { name: 'Lõpp' });
    const day = (scope: HTMLElement, iso: string) => scope.querySelector<HTMLElement>(`[data-day="${iso}"]:not([data-outside])`)!;

    // First eligible day (1 Oct) is selectable; there's no earlier month to go to.
    expect(within(day(start, '2026-10-01')).getByRole('button')).toBeEnabled();
    expect(within(start).getByRole('button', { name: 'Eelmine kuu' })).toHaveAttribute('aria-disabled', 'true');
    // The end calendar opens on the end's month; one month back, days before the start (26.10) are disabled.
    expect(day(end, '2026-11-24')).toHaveAttribute('data-selected');
    await user.click(within(end).getByRole('button', { name: 'Eelmine kuu' }));
    expect(day(end, '2026-10-25')).toHaveAttribute('data-disabled');
    expect(day(end, '2026-10-26')).not.toHaveAttribute('data-disabled');
    await user.click(within(day(start, '2026-10-01')).getByRole('button'));
    await user.click(within(start).getByRole('button', { name: 'Järgmine kuu' }));
    await user.click(within(day(start, '2026-11-02')).getByRole('button'));
    await user.click(within(end).getByRole('button', { name: 'Järgmine kuu' }));
    await user.click(within(day(end, '2026-11-06')).getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'Kasuta vahemikku' }));

    await waitFor(() => expect(container.querySelectorAll('[data-testid^="card-"]')).toHaveLength(5));
    expect(screen.getByRole('button', { name: /Vabatahtlikelt korjatav/ })).toHaveTextContent('02.11.2026 - 06.11.2026');
    await act(async () => undefined);
  });
});

describe('Failure', () => {
  it('U11 shows an error with a retry when the backend cannot be reached', async () => {
    window.history.replaceState(null, '', '/?lng=en');
    const { ports } = testPorts();
    const broken = { ...ports, reference: { load: () => Promise.reject(new Error('503')) } };
    render(
      <AppProvider ports={broken} fallback={<p>loading</p>}>
        <App />
      </AppProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('The schedule couldn’t be loaded.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
