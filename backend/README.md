# PÖFF volunteer backend (Node + Express)
`npm i && npm start` (port 3001) · `npm test` (node:test, no install needed for the domain/service tests).
Layers: `domain` (pure rules) → `services/scheduleService` → `app.js` (HTTP). Storage sits behind `ports/repository.js`.
## Supabase
Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_FESTIVAL_ID`, and `SUPABASE_ADMIN_USER_ID` in `backend/.env` to use Supabase. The IDs are `festival.id` and `admin_user.id` from the `volunteer_schedule` schema. Keep the service-role key secret and never put it in browser code. Without Supabase credentials, local development uses the in-memory repository; production startup requires Supabase credentials. `backend/.env.example` lists the expected variables.

Run `supabase start` and `supabase db reset` from the repository root to apply the schema and seed the local project. Supabase migrations create the repository tables; `supabase/seed.sql` adds the current sample config, teams, and volunteers.

For a hosted database using the `volunteer_schedule` schema, add that schema under **Project Settings → API → Exposed schemas**, then run `supabase/grant_volunteer_schedule_access.sql` in the Supabase SQL Editor for backend service-role access.
## Endpoints
GET /api/config · GET /api/teams · GET /api/volunteers?festival&team&locations= · GET|PUT /api/teams/:id/draft
POST /api/teams/:id/preview {values,locations} → affected / toNotify names · POST /api/teams/:id/publish {values,mode:'now'|'scheduled'|'draft',at}
Errors: 422 {errors:[{date?,code}]}. `at` is Estonian local time `YYYY-MM-DDTHH:mm`.
