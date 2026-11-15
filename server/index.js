/**
 * ResourceGuard API server (local / Render / any Node host).
 * On Vercel the same logic runs as serverless functions in /api.
 */
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIN, ROOT, binaryAvailable, binaryLabel, handleRun, loadScenarios } from './engine.js';

export { runEngine } from './engine.js';

const WEB_DIST = path.join(ROOT, 'web', 'dist');
const PORT = Number(process.env.PORT || 4000);

export function createApp() {
  const app = express();
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: binaryAvailable(), binary: binaryLabel(), platform: process.platform });
  });

  app.get('/api/scenarios', (_req, res) => {
    res.json({ scenarios: loadScenarios() });
  });

  app.post('/api/run', async (req, res) => {
    const { status, body } = await handleRun(req.body);
    res.status(status).json(body);
  });

  // Production: serve the built dashboard from the same origin.
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    res.status(err.status || 400).json({ ok: false, decision: 'INVALID', errors: [err.message] });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, () => {
    console.log(`ResourceGuard API listening on http://localhost:${PORT}`);
    console.log(`C engine: ${BIN}${existsSync(BIN) ? '' : '  (NOT BUILT)'}`);
  });
}
