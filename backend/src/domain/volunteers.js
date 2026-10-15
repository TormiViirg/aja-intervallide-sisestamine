export const filterVolunteers = (list, { festival, team, locations = [] }) =>
  list.filter((v) => v.festival === festival && v.team === team && (locations.length === 0 || locations.includes(v.location)));
/** edits {date:{start,end}}; affected = has an opened interval on an edited date; toNotify = that interval's times differ */
export function impact(volunteers, edits) {
  const affected = [], toNotify = [];
  for (const v of volunteers) {
    const hit = v.opened.filter((o) => edits[o.date]);
    if (hit.length) affected.push(v);
    if (hit.some((o) => o.start !== edits[o.date].start || o.end !== edits[o.date].end)) toNotify.push(v);
  }
  return { affected, toNotify };
}
