// Vercel serverless function: GET /api/scenarios
import { loadScenarios } from '../server/engine.js';

export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ scenarios: loadScenarios() });
}
