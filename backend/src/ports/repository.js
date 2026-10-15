/** PORT. Implement this with Supabase later (src/adapters/supabaseRepository.js) and pass it to createApp({repo}).
 * Every method is async. Run tests/repository.contract.js against the new adapter to prove it behaves the same.
 *  getConfig()                              -> {allowedRange:{from,to}, openingTimes:{open,close,cinema}}
 *  listTeams()                              -> [{id,name}]
 *  listVolunteers({festival,team,locations})-> [{id,name,festival,team,location,opened:[{date,start,end}]}]
 *  getDraft(team) / saveDraft(team, values) -> values = {isoDate:{start,end}}
 *  savePublication(team,{values,publishAt,status}) -> void   (status: 'published' | 'scheduled')
 */
export const REPOSITORY_METHODS = ['getConfig', 'listTeams', 'listVolunteers', 'getDraft', 'saveDraft', 'savePublication'];
