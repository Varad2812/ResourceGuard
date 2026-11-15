// Vercel serverless function: GET /api/health
import { binaryAvailable, binaryLabel } from '../server/engine.js';

export default function handler(_req, res) {
  res.status(200).json({ ok: binaryAvailable(), binary: binaryLabel(), platform: process.platform, host: 'vercel' });
}
