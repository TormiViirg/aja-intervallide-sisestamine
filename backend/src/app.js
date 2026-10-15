import express from 'express'; import cookieParser from 'cookie-parser';
import { createScheduleService, ValidationError } from './services/scheduleService.js';
import { createMemoryRepository } from './adapters/memoryRepository.js';
const TEAM_ID = /^[a-z0-9_-]{1,40}$/i;
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
export function createApp({ repo = createMemoryRepository(), clock } = {}) {
  const svc = createScheduleService({ repo, clock }); const app = express();
  app.use(express.json({ limit: '256kb' }), cookieParser());
  app.param('id', (req, res, next, id) => (TEAM_ID.test(id) ? next() : res.status(400).json({ errors: [{ code: 'bad_team_id' }] })));
  app.get('/api/config', wrap(async (req, res) => res.json({ ...(await repo.getConfig()), browserTz: req.cookies.tz ?? null, displayTz: 'Europe/Tallinn' })));
  app.get('/api/teams', wrap(async (_q, res) => res.json(await repo.listTeams())));
  app.get('/api/volunteers', wrap(async (req, res) => res.json(await repo.listVolunteers({ festival: String(req.query.festival ?? 'poff30'), team: String(req.query.team ?? ''), locations: String(req.query.locations ?? '').split(',').filter(Boolean) }))));
  app.get('/api/teams/:id/draft', wrap(async (req, res) => res.json(await repo.getDraft(req.params.id))));
  app.put('/api/teams/:id/draft', wrap(async (req, res) => res.json(await svc.publish(req.params.id, { mode: 'draft', values: req.body }))));
  app.post('/api/teams/:id/preview', wrap(async (req, res) => res.json(await svc.preview(req.params.id, req.body.values, req.body.locations))));
  app.post('/api/teams/:id/publish', wrap(async (req, res) => res.json(await svc.publish(req.params.id, req.body))));
  app.use((err, _req, res, _next) => (err instanceof ValidationError ? res.status(422).json({ errors: err.errors }) : (console.error(err), res.status(500).json({ errors: [{ code: 'internal' }] }))));
  return app;
}
