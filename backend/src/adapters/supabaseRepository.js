import { toMin } from '../domain/intervals.js';

const TIME_ZONE = 'Europe/Tallinn';
const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function parts(formatter, value) {
  return Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
}

function localDate(value) {
  const p = parts(dateFormatter, value);
  return `${p.year}-${p.month}-${p.day}`;
}

function localTime(value) {
  if (!value) return null;
  const p = parts(timeFormatter, value);
  return `${p.hour}:${p.minute}`;
}

function toTallinnInstant(date, time, nextDay = false) {
  if (toMin(time) === null) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallTime = Date.UTC(year, month - 1, day + (nextDay ? 1 : 0), hour, minute);
  const offsetAt = (instant) => {
    const p = parts(new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }), instant);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };
  return new Date(wallTime - offsetAt(wallTime - offsetAt(wallTime))).toISOString();
}

function one(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function createSupabaseRepository(client, { festivalId, adminUserId } = {}) {
  const db = client.schema('volunteer_schedule');
  const festivalKey = festivalId ? Number(festivalId) : null;
  const adminKey = adminUserId ? Number(adminUserId) : null;

  async function getFestival() {
    if (!Number.isSafeInteger(festivalKey)) throw new Error('SUPABASE_FESTIVAL_ID must be set to festival.id');
    return unwrap(db.from('festival').select('id,eligible_from,eligible_until,reported_time_zone').eq('id', festivalKey).single());
  }

  async function getMaster(teamId) {
    return unwrap(db.from('master_interval').select('*').eq('festival_team_id', Number(teamId)).is('superseded_at', null).maybeSingle());
  }

  async function ensureMaster(teamId) {
    const current = await getMaster(teamId);
    if (current) return current;
    const festival = await getFestival();
    if (!Number.isSafeInteger(adminKey)) throw new Error('SUPABASE_ADMIN_USER_ID must be set to admin_user.id');
    return unwrap(db.from('master_interval').insert({
      festival_team_id: Number(teamId),
      status_code: 'draft',
      starts_at: festival.eligible_from,
      ends_at: festival.eligible_until,
      reported_time_zone: festival.reported_time_zone || TIME_ZONE,
      created_by: adminKey,
    }).select('*').single());
  }

  async function saveDraft(team, values) {
    const master = await ensureMaster(team);
    const current = await unwrap(db.from('admin_interval')
      .select('id,local_date,version,starts_at,ends_at')
      .eq('master_interval_id', master.id)
      .is('superseded_at', null));
    const existing = new Map(current.map((row) => [row.local_date, row]));
    const dates = new Set([...existing.keys(), ...Object.keys(values ?? {})]);
    for (const date of dates) {
      const value = values?.[date] ?? {};
      const previous = existing.get(date);
      const start = toMin(value.start) === null ? null : value.start;
      const end = toMin(value.end) === null ? null : value.end;
      if (previous && localTime(previous.starts_at) === start && localTime(previous.ends_at) === end) continue;
      const startsAt = start ? toTallinnInstant(date, start) : null;
      const endsAt = end ? toTallinnInstant(date, end, Boolean(start && toMin(end) < toMin(start))) : null;
      if (previous) await unwrap(db.from('admin_interval').update({ superseded_at: new Date().toISOString() }).eq('id', previous.id));
      await unwrap(db.from('admin_interval').insert({
        master_interval_id: master.id,
        local_date: date,
        version: previous ? previous.version + 1 : 1,
        replaces_id: previous?.id ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        start_source_code: startsAt ? 'manual' : null,
        end_source_code: endsAt ? 'manual' : null,
        created_by: adminKey,
      }));
    }
  }

  return {
    getConfig: async () => {
      const festival = await getFestival();
      const from = localDate(festival.eligible_from);
      const to = localDate(festival.eligible_until);
      const hours = await unwrap(db.from('location_opening_hours')
        .select('local_date,opens_at,closes_at,location(name)')
        .gte('local_date', from)
        .lte('local_date', to)
        .order('local_date'));
      const first = hours[0];
      return {
        allowedRange: { from, to },
        openingTimes: first ? {
          open: localTime(first.opens_at),
          close: localTime(first.closes_at),
          cinema: one(first.location)?.name ?? '',
        } : { open: '00:00', close: '23:59', cinema: '' },
        openingHours: hours.map((row) => ({
          date: row.local_date,
          open: localTime(row.opens_at),
          close: localTime(row.closes_at),
          location: one(row.location)?.name ?? '',
        })),
        timeZone: festival.reported_time_zone || TIME_ZONE,
      };
    },

    listTeams: async () => {
      const rows = await unwrap(db.from('festival_team').select('id,team(name)').eq('festival_id', festivalKey).order('id'));
      return rows.map((row) => ({ id: String(row.id), name: one(row.team)?.name ?? '' }));
    },

    listVolunteers: async ({ team, locations = [] }) => {
      const teamLocations = await unwrap(db.from('festival_team_location')
        .select('id,location(name)')
        .eq('festival_team_id', Number(team)));
      const selectedLocations = teamLocations.filter((row) => locations.length === 0 || locations.includes(one(row.location)?.name));
      const locationIds = selectedLocations.map((row) => row.id);
      if (!locationIds.length) return [];

      const memberships = await unwrap(db.from('volunteer_membership')
        .select('volunteer_id,festival_team_location_id,volunteer(display_name)')
        .in('festival_team_location_id', locationIds));
      const volunteerIds = [...new Set(memberships.map((row) => row.volunteer_id))];
      if (!volunteerIds.length) return [];

      const [opens, intervals] = await Promise.all([
        unwrap(db.from('volunteer_day_open')
          .select('volunteer_id,local_date')
          .eq('festival_team_id', Number(team))
          .in('volunteer_id', volunteerIds)),
        unwrap(db.from('volunteer_interval')
          .select('volunteer_id,local_date,starts_at,ends_at,festival_team_location_id')
          .in('festival_team_location_id', locationIds)
          .in('volunteer_id', volunteerIds)
          .is('deleted_at', null)),
      ]);

      const byVolunteer = new Map();
      for (const membership of memberships) {
        const id = membership.volunteer_id;
        const volunteer = one(membership.volunteer);
        if (!byVolunteer.has(id)) byVolunteer.set(id, { id, name: volunteer?.display_name ?? '', locations: new Set(), opened: new Map() });
        const location = selectedLocations.find((row) => row.id === membership.festival_team_location_id);
        if (location) byVolunteer.get(id).locations.add(one(location.location)?.name ?? '');
      }
      const addOpened = (volunteerId, date, interval = {}) => {
        const volunteer = byVolunteer.get(volunteerId);
        if (!volunteer) return;
        const key = `${date}/${interval.start ?? ''}/${interval.end ?? ''}`;
        volunteer.opened.set(key, { date, start: interval.start, end: interval.end });
      };
      for (const row of opens) addOpened(row.volunteer_id, row.local_date);
      for (const row of intervals) addOpened(row.volunteer_id, row.local_date, { start: localTime(row.starts_at), end: localTime(row.ends_at) });

      return [...byVolunteer.values()].map((volunteer) => ({
        id: volunteer.id,
        name: volunteer.name,
        festival: String(festivalKey),
        team: String(team),
        location: [...volunteer.locations].join(', '),
        opened: [...volunteer.opened.values()],
      }));
    },

    getDraft: async (team) => {
      const master = await getMaster(team);
      if (!master) return {};
      const rows = await unwrap(db.from('admin_interval')
        .select('local_date,starts_at,ends_at')
        .eq('master_interval_id', master.id)
        .is('superseded_at', null)
        .order('local_date'));
      return Object.fromEntries(rows.map((row) => [row.local_date, { start: localTime(row.starts_at), end: localTime(row.ends_at) }]));
    },

    saveDraft,

    savePublication: async (team, publication) => {
      await saveDraft(team, publication.values);
      const master = await getMaster(team);
      const publishedAt = publication.status === 'published' ? new Date().toISOString() : null;
      await unwrap(db.from('master_interval').update({
        status_code: publication.status,
        publish_at: publication.publishAt,
        published_at: publishedAt,
        publish_requested_by: adminKey,
      }).eq('id', master.id));
      if (publishedAt) {
        await unwrap(db.from('admin_interval')
          .update({ published_at: publishedAt })
          .eq('master_interval_id', master.id)
          .is('superseded_at', null));
      }
    },
  };
}