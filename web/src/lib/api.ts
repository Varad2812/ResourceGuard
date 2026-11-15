import type { EngineResult, Scenario, SysState } from './types';

/** In dev Vite proxies /api to :4000; in production Express serves both. */
const BASE = import.meta.env.VITE_API_BASE ?? '';

export type Command = { action: string; state?: SysState; [key: string]: unknown };

export async function runEngine(cmd: Command): Promise<EngineResult> {
  const res = await fetch(`${BASE}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  let body: EngineResult;
  try {
    body = (await res.json()) as EngineResult;
  } catch {
    throw new Error(`Server returned ${res.status} with a non-JSON body`);
  }
  if (!res.ok && body.decision !== 'INVALID') {
    throw new Error(body.errors?.join('; ') || `Server error ${res.status}`);
  }
  return { ...body, action: body.action ?? cmd.action, errors: body.errors ?? [] };
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await fetch(`${BASE}/api/scenarios`);
  if (!res.ok) throw new Error(`Could not load scenarios (${res.status})`);
  const body = (await res.json()) as { scenarios: Scenario[] };
  return body.scenarios;
}

export async function fetchHealth(): Promise<{ ok: boolean; binary: string }> {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}
