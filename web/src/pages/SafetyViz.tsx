import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MatrixTable } from '../components/Matrix';
import { Badge, Button, Card, CSourceNote, EmptyState, PageHeader, Segmented, Skeleton } from '../components/ui';
import { useStore } from '../lib/store';
import type { EngineState, Safety } from '../lib/types';
import { cx, rLabel } from '../lib/util';

const SPEEDS = { '0.5': 1600, '1': 900, '2': 450, '4': 200 } as const;
type Speed = keyof typeof SPEEDS;

export default function SafetyViz() {
  const { analysis, lastDecision, navigate } = useStore();
  const [source, setSource] = useState<'current' | 'request'>('current');
  const [k, setK] = useState(-1); // index of the step being shown (-1 = initial)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('1');

  const reqAvailable = !!(lastDecision?.action === 'request' && lastDecision.safety && lastDecision.provisional);
  const { safety, st } = useMemo((): { safety: Safety | null; st: EngineState | null } => {
    if (source === 'request' && reqAvailable) return { safety: lastDecision!.safety!, st: lastDecision!.provisional! };
    return { safety: analysis?.ok ? (analysis.safety ?? null) : null, st: analysis?.ok ? (analysis.state ?? null) : null };
  }, [source, reqAvailable, lastDecision, analysis]);

  const n = safety?.steps.length ?? 0;
  useEffect(() => {
    setK(-1);
    setPlaying(false);
  }, [safety]);

  useEffect(() => {
    if (!playing) return;
    if (k >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setK((x) => x + 1), SPEEDS[speed]);
    return () => clearTimeout(t);
  }, [playing, k, n, speed]);

  if (!safety || !st) {
    return (
      <>
        <PageHeader title="Safety Visualizer" kicker="Step-by-step trace" />
        {analysis && !analysis.ok ? (
          <EmptyState title="Invalid state" body={analysis.errors.join(' · ')} action={<Button onClick={() => navigate('editor')}>Open State Editor</Button>} />
        ) : (
          <Skeleton className="h-96 rounded-xl" />
        )}
      </>
    );
  }

  const step = k >= 0 ? safety.steps[k] : null;
  const R = st.resources;
  const done = safety.steps.slice(0, k + 1).filter((s) => s.ok);
  const finished = new Set(done.map((s) => s.pid));
  const work = step ? step.work_after : safety.initial_work;
  const prevWork = step ? step.work : safety.initial_work;
  const atEnd = k === n - 1;

  return (
    <>
      <PageHeader title="Safety Visualizer" kicker="Step-by-step playback of the C trace">
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: 'current', label: 'Current state' },
            { value: 'request', label: reqAvailable ? `Last request (P${lastDecision?.pid})` : 'Last request (none)' },
          ]}
        />
      </PageHeader>

      <div className="grid grid-cols-12 gap-3">
        {/* Controls */}
        <Card className="col-span-12" bodyClass="flex flex-wrap items-center gap-3 py-3">
          <div className="flex items-center gap-1">
            <Button size="sm" aria-label="Reset" onClick={() => (setK(-1), setPlaying(false))}>
              <RotateCcw size={13} />
            </Button>
            <Button size="sm" aria-label="Step back" onClick={() => setK((x) => Math.max(-1, x - 1))} disabled={k < 0}>
              <ChevronLeft size={14} />
            </Button>
            <Button size="sm" variant="primary" className="w-20" onClick={() => (atEnd ? (setK(-1), setPlaying(true)) : setPlaying((p) => !p))}>
              {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
            </Button>
            <Button size="sm" aria-label="Step forward" onClick={() => setK((x) => Math.min(n - 1, x + 1))} disabled={atEnd}>
              <ChevronRight size={14} />
            </Button>
            <Button size="sm" aria-label="Jump to end" onClick={() => (setK(n - 1), setPlaying(false))} disabled={atEnd}>
              <SkipForward size={13} />
            </Button>
          </div>
          <Segmented value={speed} onChange={setSpeed} options={(['0.5', '1', '2', '4'] as Speed[]).map((s) => ({ value: s, label: `${s}×` }))} />
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <input
              type="range"
              min={-1}
              max={n - 1}
              value={k}
              onChange={(e) => (setK(Number(e.target.value)), setPlaying(false))}
              className="w-full accent-[rgb(var(--primary))]"
              aria-label="Trace position"
            />
            <span className="w-24 text-right font-mono text-xs text-muted">
              step {k + 1}/{n}
            </span>
          </div>
          <CSourceNote action={source === 'request' ? 'request' : 'safety'} ops={safety.ops} />
        </Card>

        {/* Narration + Work */}
        <Card className="col-span-12 lg:col-span-5" title="Current check" subtitle={step ? `Pass ${step.pass} · examining P${step.pid}` : 'Initialisation'}>
          <AnimatePresence mode="wait">
            <motion.div key={k} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-h-[92px]">
              {step ? (
                <div className="space-y-2">
                  <div className="font-mono text-sm">
                    Need<sub>P{step.pid}</sub> [{step.need.join(' ')}] ≤ Work [{step.work.join(' ')}] ?
                  </div>
                  <div className="grid gap-1 font-mono text-xs" style={{ gridTemplateColumns: `3.5rem repeat(${R}, minmax(0,1fr))` }}>
                    <span />
                    {step.need.map((_, j) => (
                      <span key={j} className="text-center text-[10px] text-muted">{rLabel(j)}</span>
                    ))}
                    <span className="text-muted">Need</span>
                    {step.need.map((v, j) => (
                      <span key={j} className={cx('rounded py-0.5 text-center font-bold', step.fail[j] ? 'bg-unsafe/15 text-unsafe' : 'bg-safe/10 text-safe')}>{v}</span>
                    ))}
                    <span className="text-muted">Work</span>
                    {step.work.map((v, j) => (
                      <span key={j} className="rounded bg-sunk py-0.5 text-center">{v}</span>
                    ))}
                  </div>
                  {step.ok ? (
                    <p className="text-sm text-safe">
                      <b>PASS.</b> P{step.pid} can finish and releases its allocation: Work becomes [{step.work_after.join(' ')}], Finish[{step.pid}] = true.
                    </p>
                  ) : (
                    <p className="text-sm text-unsafe">
                      <b>FAIL.</b> Short on {step.fail.map((f, j) => (f ? `${rLabel(j)} (${step.need[j]} > ${step.work[j]})` : null)).filter(Boolean).join(', ')}. P{step.pid} must wait.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Work ← Available = [{safety.initial_work.join(' ')}], Finish[i] ← false for all {st.processes} processes. Each pass scans P0…P{st.processes - 1}; a pass that finds no eligible process ends the algorithm.
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-3 border-t border-line/70 pt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Work vector</div>
            <div className="flex flex-wrap gap-2">
              {work.map((v, j) => (
                <div key={j} className="flex flex-col items-center">
                  <span className="font-mono text-[10px] text-muted">{rLabel(j)}</span>
                  <motion.span
                    key={`${k}-${v}`}
                    initial={v !== prevWork[j] ? { scale: 1.35 } : false}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className={cx(
                      'flex h-10 w-12 items-center justify-center rounded-lg border font-mono text-lg font-bold transition-colors duration-700',
                      v !== prevWork[j] ? 'border-safe/50 bg-safe/20 text-safe' : 'border-line bg-sunk',
                    )}
                  >
                    {v}
                  </motion.span>
                  {v !== prevWork[j] && <span className="font-mono text-[10px] text-safe">+{v - prevWork[j]}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-line/70 pt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Finish[ ]</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: st.processes }, (_, i) => (
                <motion.span
                  key={i}
                  animate={finished.has(i) ? { scale: [1, 1.15, 1] } : {}}
                  className={cx(
                    'flex h-8 min-w-[3.2rem] flex-col items-center justify-center rounded-lg font-mono text-[10.5px] ring-1 ring-inset',
                    finished.has(i) ? 'bg-safe text-white ring-safe' : step?.pid === i ? 'bg-primary/10 text-primary ring-primary/50' : 'bg-sunk text-muted ring-line',
                  )}
                >
                  <b className="text-[12px]">P{i}</b>
                  {finished.has(i) ? 'true' : 'false'}
                </motion.span>
              ))}
            </div>
          </div>
        </Card>

        {/* Matrices with highlighted row */}
        <Card className="col-span-12 lg:col-span-7" title="Need & Allocation" subtitle="The highlighted row is the process being examined">
          <div className="grid gap-3 sm:grid-cols-2">
            <MatrixTable
              title="Need"
              accent
              data={st.need}
              rowToneFn={(i) => (step?.pid === i ? 'active' : finished.has(i) ? 'done' : undefined)}
              cellToneFn={(i, j) => (step?.pid === i ? (step.fail[j] ? 'fail' : 'ok') : finished.has(i) ? 'dim' : undefined)}
            />
            <MatrixTable title="Allocation (released on PASS)" data={st.allocation} rowToneFn={(i) => (step?.pid === i ? 'active' : finished.has(i) ? 'done' : undefined)} cellToneFn={(i) => (finished.has(i) && step?.pid !== i ? 'dim' : undefined)} />
          </div>
        </Card>

        {/* Sequence timeline */}
        <Card
          className="col-span-12"
          title="Safe sequence timeline"
          actions={atEnd && <Badge tone={safety.safe ? 'safe' : 'unsafe'}>{safety.safe ? `SAFE · ${safety.passes} passes` : 'UNSAFE'}</Badge>}
        >
          <div className="flex min-h-[44px] flex-wrap items-center gap-2">
            <AnimatePresence>
              {done.map((s, idx) => (
                <motion.div key={s.pid} layout initial={{ opacity: 0, scale: 0.6, x: -10 }} animate={{ opacity: 1, scale: 1, x: 0 }} className="flex items-center gap-2">
                  <div className="rounded-lg bg-safe/15 px-3 py-1.5 text-center ring-1 ring-inset ring-safe/30">
                    <div className="font-mono text-sm font-bold text-safe">P{s.pid}</div>
                    <div className="font-mono text-[9.5px] text-muted">pass {s.pass}</div>
                  </div>
                  {(idx < done.length - 1 || !atEnd) && <ArrowRight size={14} className="text-muted" />}
                </motion.div>
              ))}
            </AnimatePresence>
            {!atEnd && <span className="rounded-lg border border-dashed border-line px-3 py-2 font-mono text-xs text-muted">…</span>}
            {atEnd && !safety.safe && (
              <span className="text-sm text-unsafe">
                Stuck: {safety.finish.map((f, i) => (!f ? `P${i}` : null)).filter(Boolean).join(', ')} can never obtain their Need.
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1 scroll-thin">
            {safety.steps.map((s, idx) => (
              <button
                key={idx}
                onClick={() => (setK(idx), setPlaying(false))}
                title={`Pass ${s.pass}: P${s.pid} ${s.ok ? 'PASS' : 'FAIL'}`}
                className={cx(
                  'h-6 min-w-[2.4rem] shrink-0 rounded font-mono text-[10px] font-semibold transition',
                  idx === k ? 'ring-2 ring-primary' : '',
                  idx <= k ? (s.ok ? 'bg-safe/80 text-white' : 'bg-unsafe/70 text-white') : s.ok ? 'bg-safe/15 text-safe' : 'bg-unsafe/10 text-unsafe',
                )}
              >
                P{s.pid}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
