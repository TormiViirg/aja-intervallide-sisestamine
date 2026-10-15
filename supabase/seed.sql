insert into public.app_config (id, allowed_range, opening_times)
values (
  'default',
  '{"from":"2026-10-26","to":"2026-11-24"}'::jsonb,
  '{"open":"07:45","close":"19:45","cinema":"Solaris"}'::jsonb
)
on conflict (id) do update set allowed_range = excluded.allowed_range, opening_times = excluded.opening_times;

insert into public.teams (id, name) values
  ('usher', 'Piletikontroll'),
  ('press', 'Press')
on conflict (id) do update set name = excluded.name;

insert into public.volunteers (id, name, festival, team, location, opened) values
  (1, 'Mari Tamm', 'poff30', 'usher', 'Solaris', '[{"date":"2026-10-27","start":"10:00","end":"21:45"}]'::jsonb),
  (2, 'Jaan Kask', 'poff30', 'usher', 'Coca-Cola Plaza', '[{"date":"2026-10-29","start":"10:30","end":"21:45"}]'::jsonb),
  (3, 'Анна Иванова', 'poff30', 'usher', 'Solaris', '[]'::jsonb),
  (4, 'Olga Mägi', 'poff30', 'press', 'Solaris', '[{"date":"2026-10-27","start":"09:00","end":"18:00"}]'::jsonb),
  (5, 'Old Festival Vol', 'poff29', 'usher', 'Solaris', '[]'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  festival = excluded.festival,
  team = excluded.team,
  location = excluded.location,
  opened = excluded.opened;

select setval(pg_get_serial_sequence('public.volunteers', 'id'), coalesce(max(id), 1), max(id) is not null)
from public.volunteers;