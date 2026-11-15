import type { EngineState, SysState } from './types';

export const pLabel = (i: number) => `P${i}`;
export const rLabel = (j: number) => `R${j}`;

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

/** Strip derived fields so only the editable inputs travel to the C engine. */
export function toSys(s: SysState | EngineState): SysState {
  return {
    allocation: s.allocation.map((r) => [...r]),
    max: s.max.map((r) => [...r]),
    available: [...s.available],
  };
}

export const dims = (s: SysState) => ({ P: s.allocation.length, R: s.available.length });

export const sameState = (a: SysState, b: SysState) => JSON.stringify(toSys(a)) === JSON.stringify(toSys(b));

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const fmtVec = (v: number[] | undefined) => (v ? `(${v.join(', ')})` : '—');

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function download(name: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse C validation messages such as "Allocation[P2][R0] = 4 exceeds Max = 3" into cell keys. */
export function errorCells(errors: string[]): Set<string> {
  const out = new Set<string>();
  for (const e of errors) {
    const m = e.match(/^(Allocation|Max)\[P(\d+)\]\[R(\d+)\]/);
    if (m) {
      out.add(`alloc:${m[2]}:${m[3]}`);
      if (m[1] === 'Max' || /exceeds Max/.test(e)) out.add(`max:${m[2]}:${m[3]}`);
    }
    const a = e.match(/^Available\[R(\d+)\]/);
    if (a) out.add(`avail:${a[1]}`);
  }
  return out;
}

export function decisionTone(decision: string | undefined) {
  switch (decision) {
    case 'GRANTED':
    case 'SAFE':
    case 'RELEASED':
    case 'COMPLETED':
    case 'NO_DEADLOCK':
    case 'VALID':
    case 'NO_CYCLE':
      return 'safe' as const;
    case 'ROLLED_BACK':
    case 'UNSAFE':
    case 'DEADLOCK':
    case 'INVALID':
    case 'ERROR':
      return 'unsafe' as const;
    case 'DENIED':
    case 'CYCLE':
      return 'warn' as const;
    default:
      return 'neutral' as const;
  }
}

export const decisionLabel = (d: string | undefined) => (d ? d.replace(/_/g, ' ') : '—');
