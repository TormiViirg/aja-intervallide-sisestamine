/**
 * Stores the viewer's device timezone and the warning's collapsed state in first-party cookies.
 */
import type { TimezonePreferencePort } from '../../application/ports';

export const TZ_COOKIE = 'poff_tz';
export const TZ_WARNING_COOKIE = 'poff_tz_warning';
const ONE_YEAR_S = 60 * 60 * 24 * 365;

export interface CookieJar {
  get(): string;
  set(cookie: string): void;
}

const documentJar: CookieJar = {
  get: () => document.cookie,
  set: (c) => {
    document.cookie = c;
  },
};

export function readCookie(jar: CookieJar, name: string): string | null {
  for (const part of jar.get().split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function writeCookie(jar: CookieJar, name: string, value: string): void {
  jar.set(`${name}=${encodeURIComponent(value)}; Max-Age=${ONE_YEAR_S}; Path=/; SameSite=Lax`);
}

export function createCookieTimezone(
  jar: CookieJar = documentJar,
  detect: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): TimezonePreferencePort {
  return {
    rememberDeviceZone() {
      const zone = detect() || 'UTC';
      if (readCookie(jar, TZ_COOKIE) !== zone) writeCookie(jar, TZ_COOKIE, zone);
      return zone;
    },
    storedZone: () => readCookie(jar, TZ_COOKIE),
    isWarningCollapsed() {
      const v = readCookie(jar, TZ_WARNING_COOKIE);
      return v === null ? null : v === 'collapsed';
    },
    setWarningCollapsed(collapsed) {
      writeCookie(jar, TZ_WARNING_COOKIE, collapsed ? 'collapsed' : 'open');
    },
  };
}
