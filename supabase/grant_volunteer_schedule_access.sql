grant usage on schema volunteer_schedule to service_role;
grant all privileges on all tables in schema volunteer_schedule to service_role;
grant all privileges on all sequences in schema volunteer_schedule to service_role;

alter default privileges in schema volunteer_schedule
  grant all privileges on tables to service_role;
alter default privileges in schema volunteer_schedule
  grant all privileges on sequences to service_role;