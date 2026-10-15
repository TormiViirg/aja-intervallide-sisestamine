# PÖFF volunteer backend (Node + Express)
`npm i && npm start` (port 3001) · `npm test` (node:test, no install needed for the domain/service tests).
Layers: `domain` (pure rules) → `services/scheduleService` → `app.js` (HTTP). Storage sits behind `ports/repository.js`.
## Adding Supabase later
1. `npm i @supabase/supabase-js`; create `src/adapters/supabaseRepository.js` implementing the 6 methods in `ports/repository.js`.
2. In `src/server.js` pass it: `createApp({ repo: createSupabaseRepository(...) })`. Nothing else changes.
3. Prove it with `runContract('supabase', () => repo)` from `tests/repository.contract.js`.
## Endpoints
GET /api/config · GET /api/teams · GET /api/volunteers?festival&team&locations= · GET|PUT /api/teams/:id/draft
POST /api/teams/:id/preview {values,locations} → affected / toNotify names · POST /api/teams/:id/publish {values,mode:'now'|'scheduled'|'draft',at}
Errors: 422 {errors:[{date?,code}]}. `at` is Estonian local time `YYYY-MM-DDTHH:mm`.
