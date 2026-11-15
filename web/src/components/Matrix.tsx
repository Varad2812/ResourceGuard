import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cx, pLabel, rLabel } from '../lib/util';

export type CellTone = 'changed' | 'error' | 'fail' | 'ok' | 'active' | 'dim' | undefined;

const cellTone: Record<Exclude<CellTone, undefined>, string> = {
  changed: 'bg-amber/25 text-ink font-bold ring-1 ring-inset ring-amber/60',
  error: 'bg-unsafe/15 text-unsafe font-bold ring-1 ring-inset ring-unsafe/50',
  fail: 'text-unsafe font-bold',
  ok: 'text-safe font-bold',
  active: 'bg-primary/10 text-primary font-bold',
  dim: 'text-muted/60',
};

/** Read-only or editable matrix rendered in JetBrains Mono. */
export function MatrixTable({
  title,
  data,
  editable,
  onChange,
  cellToneFn,
  rowToneFn,
  accent,
  compact,
  rowSuffix,
}: {
  title: string;
  data: number[][];
  editable?: boolean;
  onChange?: (i: number, j: number, v: number) => void;
  cellToneFn?: (i: number, j: number) => CellTone;
  rowToneFn?: (i: number) => 'active' | 'done' | 'stuck' | undefined;
  accent?: boolean;
  compact?: boolean;
  rowSuffix?: (i: number) => ReactNode;
}) {
  const R = data[0]?.length ?? 0;
  return (
    <div className="min-w-0">
      <div className={cx('mb-1 font-display text-[13px] font-semibold', accent ? 'text-primary' : 'text-ink')}>{title}</div>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full border-collapse font-mono text-[12.5px] tabular-nums">
          <thead>
            <tr className="bg-sunk/70 text-[10.5px] text-muted">
              <th className="w-10 px-2 py-1 text-left font-medium" />
              {Array.from({ length: R }, (_, j) => (
                <th key={j} className="px-1.5 py-1 text-center font-medium">
                  {rLabel(j)}
                </th>
              ))}
              {rowSuffix && <th className="w-6" />}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const rt = rowToneFn?.(i);
              return (
                <tr
                  key={i}
                  className={cx(
                    'border-t border-line/60 transition-colors',
                    rt === 'active' && 'bg-primary/10',
                    rt === 'done' && 'bg-safe/10',
                    rt === 'stuck' && 'bg-unsafe/5',
                  )}
                >
                  <td className={cx('px-2 font-semibold', compact ? 'py-0.5' : 'py-1', rt === 'active' ? 'text-primary' : 'text-muted')}>
                    {pLabel(i)}
                  </td>
                  {row.map((v, j) => {
                    const t = cellToneFn?.(i, j);
                    return (
                      <td key={j} className={cx('px-1 text-center', compact ? 'py-0.5' : 'py-1')}>
                        {editable ? (
                          <input
                            aria-label={`${title} ${pLabel(i)} ${rLabel(j)}`}
                            inputMode="numeric"
                            value={Number.isNaN(v) ? '' : v}
                            onChange={(e) => {
                              const n = e.target.value === '' ? 0 : Number.parseInt(e.target.value, 10);
                              onChange?.(i, j, Number.isNaN(n) ? 0 : n);
                            }}
                            onFocus={(e) => e.target.select()}
                            className={cx(
                              'h-7 w-full min-w-[2.25rem] rounded-md border border-transparent bg-sunk/60 text-center outline-none transition hover:border-line focus:border-primary focus:bg-card',
                              t && cellTone[t],
                            )}
                          />
                        ) : (
                          <motion.span
                            key={v}
                            initial={t === 'changed' ? { scale: 1.3 } : false}
                            animate={{ scale: 1 }}
                            className={cx('inline-block min-w-[1.75rem] rounded px-1', t && cellTone[t])}
                          >
                            {v}
                          </motion.span>
                        )}
                      </td>
                    );
                  })}
                  {rowSuffix && <td className="pr-1.5 text-right">{rowSuffix(i)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VectorRow({
  label,
  data,
  editable,
  onChange,
  toneFn,
}: {
  label: string;
  data: number[];
  editable?: boolean;
  onChange?: (j: number, v: number) => void;
  toneFn?: (j: number) => CellTone;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {data.map((v, j) => {
          const t = toneFn?.(j);
          return (
            <div key={j} className="flex flex-col items-center">
              <span className="font-mono text-[10px] text-muted">{rLabel(j)}</span>
              {editable ? (
                <input
                  aria-label={`${label} ${rLabel(j)}`}
                  inputMode="numeric"
                  value={v}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const n = e.target.value === '' ? 0 : Number.parseInt(e.target.value, 10);
                    onChange?.(j, Number.isNaN(n) ? 0 : n);
                  }}
                  className={cx(
                    'h-8 w-12 rounded-md border border-line bg-card text-center font-mono text-sm outline-none focus:border-primary',
                    t && cellTone[t],
                  )}
                />
              ) : (
                <motion.span
                  key={v}
                  initial={{ y: -4, opacity: 0.4 }}
                  animate={{ y: 0, opacity: 1 }}
                  className={cx('flex h-8 w-11 items-center justify-center rounded-md border border-line bg-sunk/60 font-mono text-sm font-semibold', t && cellTone[t])}
                >
                  {v}
                </motion.span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact colour heatmap; intensity is relative to `scale` (e.g. resource totals). */
export function Heatmap({ title, data, scale, color }: { title: string; data: number[][]; scale: number[]; color: 'primary' | 'amber' | 'safe' }) {
  const R = data[0]?.length ?? 0;
  const varName = color === 'primary' ? '--primary' : color === 'amber' ? '--amber' : '--safe';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[13px] font-semibold text-ink">{title}</span>
        <span className="font-mono text-[10px] text-muted">{data.length}×{R}</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `1.6rem repeat(${R}, minmax(0, 1fr))` }}>
        <span />
        {Array.from({ length: R }, (_, j) => (
          <span key={j} className="text-center font-mono text-[9.5px] text-muted">
            {rLabel(j)}
          </span>
        ))}
        {data.map((row, i) => (
          <div key={i} className="contents">
            <span className="self-center font-mono text-[10px] text-muted">{pLabel(i)}</span>
            {row.map((v, j) => {
              const a = scale[j] ? Math.min(1, v / scale[j]) : 0;
              return (
                <span
                  key={j}
                  title={`${pLabel(i)} ${rLabel(j)}: ${v}`}
                  className="flex h-5 items-center justify-center rounded-[4px] font-mono text-[10px] font-semibold"
                  style={{
                    background: `rgb(var(${varName}) / ${0.08 + a * 0.82})`,
                    color: a > 0.45 ? 'white' : 'rgb(var(--ink) / 0.75)',
                  }}
                >
                  {v}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
