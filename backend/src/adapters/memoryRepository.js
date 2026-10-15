import { DEFAULT_ALLOWED_RANGE } from '../domain/config.js';
import { filterVolunteers } from '../domain/volunteers.js';
export const SEED_VOLUNTEERS = [
  { id: 1, name: 'Mari Tamm', festival: 'poff30', team: 'usher', location: 'Solaris', opened: [{ date: '2026-10-27', start: '10:00', end: '21:45' }] },
  { id: 2, name: 'Jaan Kask', festival: 'poff30', team: 'usher', location: 'Coca-Cola Plaza', opened: [{ date: '2026-10-29', start: '10:30', end: '21:45' }] },
  { id: 3, name: 'Анна Иванова', festival: 'poff30', team: 'usher', location: 'Solaris', opened: [] },
  { id: 4, name: 'Olga Mägi', festival: 'poff30', team: 'press', location: 'Solaris', opened: [{ date: '2026-10-27', start: '09:00', end: '18:00' }] },
  { id: 5, name: 'Old Festival Vol', festival: 'poff29', team: 'usher', location: 'Solaris', opened: [] },
];
export function createMemoryRepository({ volunteers = SEED_VOLUNTEERS, allowedRange = DEFAULT_ALLOWED_RANGE } = {}) {
  const drafts = new Map(), publications = new Map();
  return {
    getConfig: async () => ({ allowedRange, openingTimes: { open: '07:45', close: '19:45', cinema: 'Solaris' } }),
    listTeams: async () => [{ id: 'usher', name: 'Piletikontroll' }, { id: 'press', name: 'Press' }],
    listVolunteers: async (q) => filterVolunteers(volunteers, q),
    getDraft: async (team) => structuredClone(drafts.get(team) ?? {}),
    saveDraft: async (team, values) => { drafts.set(team, structuredClone(values)); },
    savePublication: async (team, p) => { publications.set(team, structuredClone(p)); },
    _publications: publications, // test inspection only
  };
}
