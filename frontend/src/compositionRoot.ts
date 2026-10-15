/**
 * Wires adapters to ports. This is the only file that knows which backend is used.
 *   VITE_DATA_SOURCE=api  (default) → the Express backend over HTTP (which itself uses Supabase or memory)
 *   VITE_DATA_SOURCE=mock           → in-browser dummy data (`npm run dev:mock`)
 */
import { clockFromLocation } from './adapters/browser/clocks';
import { BACKEND_TZ_COOKIE, createCookieTimezone } from './adapters/browser/cookieTimezone';
import { createApiClient } from './adapters/http/apiClient';
import { createHttpPorts } from './adapters/http/httpAdapters';
import { createMockReference, createMockSchedules, createMockVolunteers } from './adapters/mock/mockAdapters';
import type { Ports } from './application/ports';
import { API_BASE_URL, DATA_SOURCE } from './config/runtime';

export function createPorts(search = window.location.search): Ports {
  const clock = clockFromLocation(search);
  if (DATA_SOURCE === 'mock') {
    return {
      clock,
      reference: createMockReference(),
      schedules: createMockSchedules(clock),
      volunteers: createMockVolunteers(),
      timezone: createCookieTimezone(),
    };
  }
  return {
    clock,
    ...createHttpPorts(createApiClient(API_BASE_URL), clock),
    // Same-origin cookie the backend reads as browserTz (GET /api/config).
    timezone: createCookieTimezone(undefined, undefined, BACKEND_TZ_COOKIE),
  };
}
