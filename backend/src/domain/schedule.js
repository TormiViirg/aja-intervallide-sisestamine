/** `at` is Estonian local "YYYY-MM-DDTHH:mm" (Europe/Tallinn, DST-aware). Returns a UTC Date strictly in the future, else null. */
export function parseScheduled(at, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(at ?? ''); if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number); if (h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const offsetAt = (ms) => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms; };
  const utc = new Date(wall - offsetAt(wall - offsetAt(wall))); // two-pass offset handles the DST boundary
  return utc > now ? utc : null;
}
