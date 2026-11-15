/** Server smoke test: replays the textbook test cases 2-5 through HTTP. */
import { createApp } from './index.js';
import assert from 'node:assert/strict';

const textbook = {
  allocation: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
  max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]],
  available: [3, 3, 2],
};
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (body) => (await fetch(`${base}/api/run`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})).json();
const strip = (s) => ({ allocation: s.allocation, max: s.max, available: s.available });

try {
  const t1 = await post({ action: 'safety', state: textbook });
  assert.equal(t1.decision, 'SAFE');
  const t2 = await post({ action: 'request', state: textbook, pid: 1, request: [1, 0, 2] });
  assert.equal(t2.decision, 'GRANTED');
  assert.deepEqual(t2.safety.sequence, [1, 3, 4, 0, 2]);
  const after = strip(t2.state);
  const t3 = await post({ action: 'request', state: after, pid: 4, request: [3, 3, 0] });
  assert.equal(t3.decision, 'DENIED');
  assert.equal(t3.denial_kind, 'REQUEST_EXCEEDS_AVAILABLE');
  const t4 = await post({ action: 'request', state: after, pid: 0, request: [0, 2, 0] });
  assert.equal(t4.decision, 'ROLLED_BACK');
  assert.equal(t4.rollback_verified, true);
  assert.deepEqual(strip(t4.state), after);
  const t5 = await post({ action: 'request', state: textbook, pid: 1, request: [0, 3, 0] });
  assert.equal(t5.denial_kind, 'REQUEST_EXCEEDS_NEED');
  const bad = await post({ action: 'request', state: textbook, pid: 9, request: [0, 0, 1] });
  assert.equal(bad.decision, 'INVALID');
  const sc = await (await fetch(`${base}/api/scenarios`)).json();
  assert.equal(sc.scenarios.length, 5);
  console.log('server smoke test: all checks passed');
} finally {
  server.close();
}
