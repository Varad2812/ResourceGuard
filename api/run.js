// Vercel serverless function: POST /api/run -> spawns the C binary (core/build/resourceguard --json).
import { handleRun } from '../server/engine.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, decision: 'INVALID', errors: ['Use POST'] });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, decision: 'INVALID', errors: ['Body is not valid JSON'] });
    }
  }
  const { status, body: out } = await handleRun(body);
  res.status(status).json(out);
}
