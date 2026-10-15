async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export function createSupabaseRepository(client) {
  return {
    getConfig: async () => {
      const row = await unwrap(client.from('app_config').select('allowed_range,opening_times').eq('id', 'default').single());
      return { allowedRange: row.allowed_range, openingTimes: row.opening_times };
    },
    listTeams: async () => unwrap(client.from('teams').select('id,name').order('id')),
    listVolunteers: async ({ festival, team, locations = [] }) => {
      let query = client.from('volunteers').select('id,name,festival,team,location,opened').eq('festival', festival).eq('team', team);
      if (locations.length) query = query.in('location', locations);
      return unwrap(query.order('id'));
    },
    getDraft: async (team) => {
      const row = await unwrap(client.from('drafts').select('schedule').eq('team_id', team).maybeSingle());
      return row?.schedule ?? {};
    },
    saveDraft: async (team, values) => {
      await unwrap(client.from('drafts').upsert({ team_id: team, schedule: values }, { onConflict: 'team_id' }));
    },
    savePublication: async (team, publication) => {
      await unwrap(client.from('publications').insert({
        team_id: team,
        schedule: publication.values,
        publish_at: publication.publishAt,
        status: publication.status,
      }));
    },
  };
}