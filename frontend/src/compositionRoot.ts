/**
 * Wires adapters to ports. Swapping the mock backend for HTTP adapters happens here only.
 */
import { clockFromLocation } from './adapters/browser/clocks';
import { createCookieTimezone } from './adapters/browser/cookieTimezone';
import { createMockReference, createMockSchedules, createMockVolunteers } from './adapters/mock/mockAdapters';
import type { Ports } from './application/ports';

export function createPorts(search = window.location.search): Ports {
  const clock = clockFromLocation(search);
  return {
    clock,
    reference: createMockReference(),
    schedules: createMockSchedules(clock),
    volunteers: createMockVolunteers(),
    timezone: createCookieTimezone(),
  };
}
