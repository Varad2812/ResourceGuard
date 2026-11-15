import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, CircleSlash, Loader2, PackageMinus, RotateCcw, Send, ShieldCheck, XCircle, Undo2, Flag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MatrixTable, VectorRow } from '../components/Matrix';
import { Badge, Button, Card, CSourceNote, EmptyState, Label, PageHeader, Segmented } from '../components/ui';
import { useStore } from '../lib/store';
import type { Check, EngineResult, EngineState } from '../lib/types';
import { cx, decisionLabel, fmtVec, pLabel, rLabel } from '../lib/util';

type Mode = 'request' | 'release' | 'complete';

function CheckCard({ check, index, shown, R }: { check: Check | undefined; index: number; shown: boolean; R: number }) {
  const icons = [<ShieldCheck key="a" size={15} />, <PackageMinus key="b" size={15} />, <CheckCircle2 key="c" size={15} />];
  const status = check?.status;
  const tone = status === 'PASS' ? 'safe' : status === 'FAIL' ? 'unsafe' : 'neutral';
  return (
    <motion.div
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0.45, y: 0 }}
      className={cx(
        'card overflow-hidden p-3 transition-colors',
        shown && status === 'PASS' && 'border-safe/40',
        shown && status === 'FAIL' && 'border-unsafe/40',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-sunk text-muted">{index + 1}</span>
          {check?.label ?? ['Request ≤ Need', 'Request ≤ Available', 'Safety test'][index]}
        </div>
        <AnimatePresence mode="wait">
          {shown && status ? (
            <motion.div key={status} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <Badge tone={tone} className="text-xs">
                {status}
              </Badge>
            </motion.div>
          ) : (
            <span className="text-muted">{icons[index]}</span>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-2.5 min-h-[54px]">
        {shown && check && check.lhs && check.rhs ? (
          <div className="space-y-1 font-mono text-xs">
            <div className="grid gap-1" style={{ gridTemplateColumns: `6.2rem repeat(${R}, minmax(0,1fr))` }}>
              <span />
              {check.lhs.map((_, j) => (
                <span key={j} className="text-center text-[10px] text-muted">
                  {rLabel(j)}
                </span>
              ))}
              <span className="text-muted">{check.lhs_name}</span>
              {check.lhs.map((v, j) => (
                <span key={j} className={cx('rounded text-center font-semibold', check.fail?.[j] ? 'bg-unsafe/15 text-unsafe' : 'bg-safe/10 text-safe')}>
                  {v}
                </span>
              ))}
              <span className="whitespace-nowrap text-muted">≤ {check.rhs_name}</span>
              {check.rhs.map((v, j) => (
                <span key={j} className="rounded bg-sunk text-center">
                  {v}
                </span>
              ))}
            </div>
            {check.fail?.some(Boolean) && (
              <div className="text-[11px] text-unsafe">
                {check.fail.map((f, j) => (f ? `${rLabel(j)}: ${check.lhs![j]} > ${check.rhs![j]}` : null)).filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        ) : shown && check?.id === 'safety' ? (
          check.status === 'SKIPPED' ? (
            <p className="text-xs text-muted">Not run: an earlier condition failed, so no provisional allocation was made.</p>
          ) : check.status === 'PASS' ? (
            <div className="flex flex-wrap items-center gap-1">
              {check.sequence?.map((p, k) => (
                <span key={k} className="flex items-center gap-1 font-mono text-xs">
                  <span className="rounded bg-safe/15 px-1.5 py-0.5 font-bold text-safe">P{p}</span>
                  {k < (check.sequence?.length ?? 0) - 1 && <ArrowRight size={11} className="text-muted" />}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-unsafe">After the provisional allocation no process can finish. No safe sequence exists.</p>
          )
        ) : (
          <div className="space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-sunk" />
            <div className="h-3 w-1/2 rounded bg-sunk" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Verdict({ r }: { r: EngineResult }) {
  const d = r.decision;
  const cfg =
    d === 'GRANTED' || d === 'RELEASED' || d === 'COMPLETED'
      ? { cls: 'from-safe/20 to-safe/5 border-safe/40 text-safe', icon: <CheckCircle2 size={30} /> }
      : d === 'ROLLED_BACK'
        ? { cls: 'from-unsafe/20 to-unsafe/5 border-unsafe/40 text-unsafe', icon: <Undo2 size={30} /> }
        : { cls: 'from-amber/25 to-amber/5 border-amber/50 text-[rgb(var(--amber-ink))]', icon: <XCircle size={30} /> };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className={cx('flex items-center gap-4 rounded-xl border bg-gradient-to-br px-5 py-4', cfg.cls)}
    >
      {cfg.icon}
      <div className="min-w-0 flex-1">
        <div className="font-display text-3xl font-bold tracking-tight">{d === 'ROLLED_BACK' ? 'ROLLED BACK' : decisionLabel(d)}</div>
        <div className="mt-0.5 text-sm text-ink/80">{r.reason}</div>
      </div>
      <div className="hidden text-right font-mono text-[11px] text-ink/70 sm:block">
        {r.denial_kind && <div>{r.denial_kind}</div>}
        {r.rolled_back && <div>rollback memcmp: {r.rollback_verified ? 'identical ✓' : 'MISMATCH'}</div>}
        <div>{r.ops} ops · {r._meta?.durationMs ?? '–'} ms</div>
      </div>
    </motion.div>
  );
}

function Diff({ before, after, label }: { before: EngineState; after: EngineState; label: string }) {
  const ch = (a: number[][], b: number[][]) => (i: number, j: number) => (a[i][j] !== b[i][j] ? ('changed' as const) : undefined);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-ink">Before</span> <ArrowRight size={12} /> <span className="font-semibold text-ink">{label}</span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber/50" /> changed cell
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <MatrixTable compact title="Allocation · before" data={before.allocation} />
        <MatrixTable compact title={`Allocation · ${label.toLowerCase()}`} data={after.allocation} cellToneFn={ch(before.allocation, after.allocation)} />
        <MatrixTable compact title="Need · before" data={before.need} />
        <MatrixTable compact title={`Need · ${label.toLowerCase()}`} data={after.need} cellToneFn={ch(before.need, after.need)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <VectorRow label="Avail. before" data={before.available} />
        <VectorRow label={`Avail. ${label.toLowerCase()}`} data={after.available} toneFn={(j) => (before.available[j] !== after.available[j] ? 'changed' : undefined)} />
      </div>
    </div>
  );
}

export default function RequestSim() {
  const { state, analysis, run, commit, toast, requestDraft, setRequestDraft, setLastDecision, navigate } = useStore();
  const P = state.allocation.length;
  const R = state.available.length;
  const [mode, setMode] = useState<Mode>('request');
  const [pid, setPid] = useState(0);
  const [vec, setVec] = useState<number[]>(() => Array(R).fill(0));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [stage, setStage] = useState(0);
  const [diffView, setDiffView] = useState<'after' | 'provisional'>('after');

  useEffect(() => {
    if (requestDraft) {
      setMode('request');
      setPid(Math.min(requestDraft.pid, P - 1));
      setVec(requestDraft.vector.slice(0, R).concat(Array(Math.max(0, R - requestDraft.vector.length)).fill(0)));
      setRequestDraft(null);
    }
  }, [requestDraft, setRequestDraft, P, R]);

  useEffect(() => {
    if (vec.length !== R) setVec(Array(R).fill(0));
    if (pid >= P) setPid(0);
  }, [R, P, vec.length, pid]);

  useEffect(() => {
    if (!result) return;
    setStage(0);
    const steps = result.checks?.length ?? 0;
    const timers = Array.from({ length: steps + 1 }, (_, k) => setTimeout(() => setStage(k + 1), 260 + k * 340));
    return () => timers.forEach(clearTimeout);
  }, [result]);

  const st = analysis?.ok ? analysis.state : undefined;

  const submit = async () => {
    setBusy(true);
    try {
      const cmd =
        mode === 'request'
          ? { action: 'request', state, pid, request: vec }
          : mode === 'release'
            ? { action: 'release', state, pid, release: vec }
            : { action: 'complete', state, pid };
      const r = await run(cmd);
      setResult(r);
      setDiffView(r.rolled_back ? 'provisional' : 'after');
      if (!r.ok) {
        toast('Rejected by the C engine', 'unsafe', r.errors.join('; '));
        return;
      }
      setLastDecision(r);
      const label =
        mode === 'request' ? `P${pid} requests ${fmtVec(vec)}` : mode === 'release' ? `P${pid} releases ${fmtVec(vec)}` : `P${pid} completes and releases all`;
      commit({ kind: mode, label, state: r.state!, result: r });
      const tone = r.decision === 'GRANTED' || r.decision === 'RELEASED' || r.decision === 'COMPLETED' ? 'safe' : r.decision === 'ROLLED_BACK' ? 'unsafe' : 'warn';
      setTimeout(() => toast(`${decisionLabel(r.decision)}: ${label}`, tone, r.reason), 1200);
    } catch (e) {
      toast('Engine error', 'unsafe', String(e));
    } finally {
      setBusy(false);
    }
  };

  const showVerdict = result && stage > (result.checks?.length ?? 0);
  const before = result?.state_before;
  const after = diffView === 'provisional' && result?.provisional ? result.provisional : result?.state;

  return (
    <>
      <PageHeader title="Request Simulator" kicker="Resource-request algorithm">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setResult(null);
          }}
          options={[
            { value: 'request', label: 'Request' },
            { value: 'release', label: 'Release' },
            { value: 'complete', label: 'Complete' },
          ]}
        />
      </PageHeader>

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-4" title={mode === 'request' ? 'New request' : mode === 'release' ? 'Release resources' : 'Complete process'} subtitle="The C engine evaluates every condition separately">
          <Label>Process</Label>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: P }, (_, i) => (
              <button
                key={i}
                onClick={() => setPid(i)}
                className={cx(
                  'h-8 min-w-[2.6rem] rounded-lg border font-mono text-sm font-semibold transition',
                  pid === i ? 'border-primary bg-primary text-white shadow-sm' : 'border-line bg-sunk/50 hover:border-primary/50',
                )}
              >
                {pLabel(i)}
              </button>
            ))}
          </div>

          {st && (
            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              <table className="w-full font-mono text-xs tabular-nums">
                <thead className="bg-sunk/70 text-[10px] text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">P{pid}</th>
                    {Array.from({ length: R }, (_, j) => (
                      <th key={j} className="px-1 py-1 font-medium">
                        {rLabel(j)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Allocation', st.allocation[pid]],
                    ['Max', st.max[pid]],
                    ['Need', st.need[pid]],
                    ['Available', st.available],
                  ].map(([name, row]) => (
                    <tr key={name as string} className="border-t border-line/60">
                      <td className={cx('px-2 py-1', name === 'Need' ? 'font-semibold text-primary' : 'text-muted')}>{name as string}</td>
                      {(row as number[])?.map((v, j) => (
                        <td key={j} className="px-1 py-1 text-center">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mode !== 'complete' ? (
            <>
              <div className="mt-3 flex items-center justify-between">
                <Label>{mode === 'request' ? 'Request vector' : 'Release vector'}</Label>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setVec(Array(R).fill(0))}>
                    <RotateCcw size={12} /> Zero
                  </Button>
                  {st && (
                    <Button size="sm" variant="ghost" onClick={() => setVec([...(mode === 'request' ? st.need[pid] : st.allocation[pid])])}>
                      {mode === 'request' ? 'Fill Need' : 'Fill Alloc'}
                    </Button>
                  )}
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <VectorRow label="" data={vec} editable onChange={(j, v) => setVec((x) => x.map((y, k) => (k === j ? v : y)))} />
                <Button type="submit" variant="primary" className="mt-4 w-full" disabled={busy || !analysis?.ok}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {mode === 'request' ? `Submit P${pid} → ${fmtVec(vec)}` : `Release ${fmtVec(vec)} from P${pid}`}
                </Button>
              </form>
            </>
          ) : (
            <Button variant="primary" className="mt-4 w-full" disabled={busy || !analysis?.ok} onClick={submit}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Flag size={15} />} Complete P{pid} (release all)
            </Button>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Tip: press <span className="font-mono">Enter</span> to submit. Find the biggest safe request on{' '}
            <button className="text-primary underline-offset-2 hover:underline" onClick={() => navigate('maxgrant')}>
              Max Grantable
            </button>
            .
          </p>
        </Card>

        <div className="col-span-12 flex flex-col gap-3 lg:col-span-8">
          {result && !result.ok ? (
            <Card title="Rejected input">
              <EmptyState icon={<CircleSlash size={26} />} title="The C engine rejected this input" body={result.errors.join(' · ')} />
            </Card>
          ) : (
            <>
              <div className={cx('grid gap-3', mode === 'request' ? 'md:grid-cols-3' : 'md:grid-cols-1')}>
                {(mode === 'request' ? [0, 1, 2] : [0]).map((k) => (
                  <CheckCard key={k} index={k} check={result?.checks?.[k]} shown={!!result && stage > k} R={R} />
                ))}
              </div>
              <AnimatePresence mode="wait">
                {showVerdict && result ? (
                  <Verdict key={result._meta?.stdin} r={result} />
                ) : (
                  <motion.div key="idle" className="card flex items-center gap-3 px-5 py-4 text-sm text-muted">
                    {busy || result ? <Loader2 size={18} className="animate-spin text-primary" /> : <Send size={18} className="text-primary" />}
                    {busy || result ? 'Evaluating conditions in C…' : 'Choose a process and a vector, then submit. Each condition is checked and reported separately.'}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <Card
            title="State diff"
            subtitle={result?.ok ? 'Exactly which cells the operation touched' : 'Shows the before → after state once you submit'}
            actions={
              result?.ok && (
                <>
                  {result.provisional && (
                    <Segmented
                      value={diffView}
                      onChange={setDiffView}
                      options={[
                        { value: 'provisional', label: 'Provisional' },
                        { value: 'after', label: result.rolled_back ? 'After rollback' : 'Committed' },
                      ]}
                    />
                  )}
                  <CSourceNote action={result.action} />
                </>
              )
            }
          >
            {result?.ok && before && after ? (
              <>
                {diffView === 'after' && result.rolled_back && (
                  <div className="mb-3 rounded-lg border border-safe/30 bg-safe/10 px-3 py-2 text-xs text-safe">
                    Rollback restored the snapshot exactly (C verified with memcmp). No cells changed.
                  </div>
                )}
                <Diff before={before} after={after} label={diffView === 'provisional' ? 'Provisional' : result.rolled_back ? 'After rollback' : 'After'} />
              </>
            ) : (
              <EmptyState title="Nothing to compare yet" body="Submit an operation to see the Allocation, Need and Available cells it changed." />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
