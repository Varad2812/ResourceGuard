/**
 * Shared engine bridge (Node built-ins only). Used by the Express server
 * (server/index.js) and by the Vercel serverless functions (api/*.js).
 *
 * Nothing here computes anything about deadlocks: it validates the request
 * shape, pipes it to the C binary's stdin (`--json`) and parses its stdout.
 */
import { spawn } from 'node:child_process';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const BIN =
  process.env.RG_BINARY ||
  path.join(ROOT, 'core', 'build', process.platform === 'win32' ? 'resourceguard.exe' : 'resourceguard');
const SCENARIOS = path.join(ROOT, 'scenarios');
const TIMEOUT_MS = Number(process.env.RG_TIMEOUT_MS || 5000);

const MAX_P = 20;
const MAX_R = 10;
const ACTIONS = new Set([
  'safety', 'request', 'release', 'complete', 'all_sequences',
  'detect', 'max_grantable', 'graph', 'validate', 'random',
]);

const isInt = (v) => Number.isInteger(v) && Math.abs(v) <= 1_000_000;
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(isInt);
const isMat = (m, p, r) => Array.isArray(m) && m.length === p && m.every((row) => isVec(row, r));

/** Structural validation only. Semantic checks (Allocation <= Max, negatives) belong to C. */
export function validate(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['Body must be a JSON object'];
  if (!ACTIONS.has(body.action)) errors.push(`Unknown action '${body.action}'`);
  if (body.action === 'random') {
    const p = body.processes ?? 5;
    const r = body.resources ?? 3;
    if (!Number.isInteger(p) || p < 1 || p > MAX_P) errors.push(`processes must be 1..${MAX_P}`);
    if (!Number.isInteger(r) || r < 1 || r > MAX_R) errors.push(`resources must be 1..${MAX_R}`);
    return errors;
  }
  const s = body.state;
  if (!s || typeof s !== 'object') return [...errors, "Missing 'state' object"];
  const P = Array.isArray(s.allocation) ? s.allocation.length : 0;
  const R = Array.isArray(s.available) ? s.available.length : 0;
  if (P < 1 || P > MAX_P) errors.push(`allocation must have 1..${MAX_P} rows`);
  if (R < 1 || R > MAX_R) errors.push(`available must have 1..${MAX_R} entries`);
  if (errors.length) return errors;
  if (!isMat(s.allocation, P, R)) errors.push(`allocation must be a ${P}x${R} integer matrix`);
  if (!isMat(s.max, P, R)) errors.push(`max must be a ${P}x${R} integer matrix`);
  if (!isVec(s.available, R)) errors.push(`available must be ${R} integers`);
  if (['request', 'release', 'complete'].includes(body.action) && !Number.isInteger(body.pid)) {
    errors.push("'pid' must be an integer");
  }
  if (body.action === 'request' && !isVec(body.request, R)) errors.push(`request must be ${R} integers`);
  if (body.action === 'release' && !isVec(body.release, R)) errors.push(`release must be ${R} integers`);
  if (body.action === 'detect' && body.pid != null && !isVec(body.request, R)) {
    errors.push(`request must be ${R} integers`);
  }
  return errors;
}

let resolvedBin = null;
/** On read-only hosts the bundled binary may lose its exec bit: copy it to tmp and chmod. */
function executable() {
  if (resolvedBin) return resolvedBin;
  if (!existsSync(BIN)) return null;
  try {
    accessSync(BIN, constants.X_OK);
    resolvedBin = BIN;
  } catch {
    const tmp = path.join(os.tmpdir(), path.basename(BIN));
    copyFileSync(BIN, tmp);
    chmodSync(tmp, 0o755);
    resolvedBin = tmp;
  }
  return resolvedBin;
}

export const binaryAvailable = () => existsSync(BIN);
export const binaryLabel = () => path.relative(ROOT, BIN);

/** Runs the C engine once. Resolves with { result, raw, stderr, durationMs, exitCode }. */
export function runEngine(command) {
  return new Promise((resolve, reject) => {
    const bin = executable();
    if (!bin) {
      reject(Object.assign(new Error(`C binary not found at ${BIN}. Run 'make' in core/ first.`), { status: 500 }));
      return;
    }
    const started = process.hrtime.bigint();
    // cwd = tmp dir: the engine's trace-file fallback must be writable (serverless FS is read-only).
    const child = spawn(bin, ['--json'], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(Object.assign(new Error(`C engine timed out after ${TIMEOUT_MS} ms`), { status: 504 }));
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 16 * 1024 * 1024) child.kill('SIGKILL');
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(Object.assign(err, { status: 500 }));
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      try {
        resolve({ result: JSON.parse(stdout), raw: stdout.trim(), stderr, durationMs, exitCode: code });
      } catch {
        reject(Object.assign(new Error(`C engine produced invalid JSON (exit ${code}): ${stderr || stdout.slice(0, 200)}`), { status: 500 }));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(command));
  });
}

/** Full /api/run behaviour, framework-agnostic: returns { status, body }. */
export async function handleRun(body) {
  const errors = validate(body);
  if (errors.length) return { status: 400, body: { ok: false, decision: 'INVALID', errors, source: 'server-validation' } };
  try {
    const out = await runEngine(body);
    return {
      status: 200,
      body: {
        ...out.result,
        _meta: {
          binary: binaryLabel(),
          command: `${binaryLabel()} --json`,
          durationMs: Math.round(out.durationMs * 100) / 100,
          exitCode: out.exitCode,
          raw: out.raw,
          stdin: JSON.stringify(body),
        },
      },
    };
  } catch (err) {
    return { status: err.status || 500, body: { ok: false, decision: 'ERROR', errors: [err.message] } };
  }
}

export function loadScenarios() {
  if (!existsSync(SCENARIOS)) return [];
  return readdirSync(SCENARIOS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(SCENARIOS, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
