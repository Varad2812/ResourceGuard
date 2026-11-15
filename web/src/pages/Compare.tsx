import { motion } from 'framer-motion';
import { GitCompareArrows, Loader2, ShieldCheck, Skull } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VectorRow } from '../components/Matrix';
import { Badge, Button, Card, CSourceNote, EmptyState, Label, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import type { EngineResult, TraceStep } from '../lib/types';
import { cx, decisionLabel, decisionTone, fmtVec, pLabel } from '../lib/util';

function Steps({ steps, label, initFinish }: { steps: TraceStep[]; label: string; initFinish?: boolean[] }) {
  return (
    <ol className="max-h-64 space-y-1 overflow-y-auto font-mono text-[11.5px] scroll-thin">
      {initFinish?.map((f, i) => (f ? <li key={`i${i}`} className="text-muted">P{i} holds nothing → Finish[{i}] = true</li> : null))}
      {steps.map((s, k) => (
        <li key={k} className={cx('flex flex-wrap gap-x-2 rounded px-1.5 py-0.5', s.ok ? 'bg-safe/10' : 'bg-unsafe/5')}>
          <span className="w-12 text-muted">pass {s.pass}</span>
          <span className="w-7 font-bold">P{s.pid}</span>
          <span>
            {label} [{s.need.join(' ')}] ≤ Work [{s.work.join(' ')}]
          </span>
          <span className={s.ok ? 'font-bold text-safe' : 'font-bold text-unsafe'}>{s.ok ? 'PASS' : 'FAIL'}</span>
          {s.ok && <span className="text-muted">→ [{s.work_after.join(' ')}]</span>}
        </li>
      ))}
    </ol>
  );
}

export default function Compare() {
  const { state, run, scenarios, scenarioId, analysis, toast } = useStore();
  const P = state.allocation.length;
  const R = state.available.length;
  const sc = scenarios.find((s) => s.id === scenarioId);
  const suggestion = sc?.suggested.find((s) => s.expect === 'ROLLED_BACK') ?? sc?.suggested[0];
  const [pid, setPid] = useState(0);
  const [vec, setVec] = useState<number[]>(Array(R).fill(0));
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ banker: EngineResult; detect: EngineResult } | null>(null);

  useEffect(() => {
    if (suggestion && suggestion.request.length === R) {
      setPid(suggestion.pid);
      setVec(suggestion.request);
    } else {
      setPid(0);
      setVec(Array(R).fill(0));
    }
    setRes(null);
  }, [suggestion, R, state]);

  const go = async () => {
    setBusy(true);
    try {
      const [banker, detect] = await Promise.all([
        run({ action: 'request', state, pid, request: vec }),
        run({ action: 'detect', state, pid, request: vec }),
      ]);
      setRes({ banker, detect });
      if (!banker.ok) toast('Invalid request', 'unsafe', banker.errors.join('; '));
    } catch (e) {
      toast('Engine error', 'unsafe', String(e));
    } finally {
      setBusy(false);
    }
  };

  const b = res?.banker;
  const d = res?.detect;
  return (
    <>
      <PageHeader title="Avoidance vs Detection" kicker="Same state, same request, two strategies" />
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12" bodyClass="flex flex-wrap items-end gap-4 py-3">
          <div>
            <Label>Process</Label>
            <select className="input h-9 font-mono" value={pid} onChange={(e) => setPid(Number(e.target.value))}>
              {Array.from({ length: P }, (_, i) => (
                <option key={i} value={i}>
                  {pLabel(i)}
                </option>
              ))}
            </select>
          </div>
          <VectorRow label="Request" data={vec} editable onChange={(j, v) => setVec((x) => x.map((y, k) => (k === j ? v : y)))} />
          <Button variant="primary" onClick={go} disabled={busy || !analysis?.ok}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <GitCompareArrows size={14} />} Compare strategies
          </Button>
          {suggestion && <span className="text-xs text-muted">Suggested for “{sc?.name}”: P{suggestion.pid} {fmtVec(suggestion.request)}. {suggestion.note}</span>}
        </Card>

        {!res ? (
          <div className="col-span-12">
            <EmptyState
              icon={<GitCompareArrows size={26} />}
              title="Run a comparison"
              body="The Banker's Algorithm tests safety before granting. A system that only detects deadlock grants any request that fits in Available and checks afterwards. Try the 3-process circular wait preset with P2 requesting (0, 0, 1)."
              action={<Button variant="primary" onClick={go} disabled={!analysis?.ok}>Compare now</Button>}
            />
          </div>
        ) : (
          <>
            <Card className="col-span-12 lg:col-span-6" title="Avoidance · Banker's Algorithm" icon={<ShieldCheck size={15} />} actions={<CSourceNote action="request" ops={b?.ops} />}>
              {b && b.ok ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge tone={decisionTone(b.decision)} className="px-3 py-1 text-sm">{decisionLabel(b.decision)}</Badge>
                    <span className="text-sm text-ink/80">{b.reason}</span>
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-3">
                    {b.checks?.map((c) => (
                      <li key={c.id} className="rounded-lg border border-line bg-sunk/40 px-2.5 py-1.5 text-xs">
                        <div className="text-muted">{c.label}</div>
                        <Badge tone={c.status === 'PASS' ? 'safe' : c.status === 'FAIL' ? 'unsafe' : 'neutral'}>{c.status}</Badge>
                      </li>
                    ))}
                  </ul>
                  {b.safety && (
                    <>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Safety trace on the provisional state</div>
                      <Steps steps={b.safety.steps} label="Need" />
                    </>
                  )}
                  <div className={cx('rounded-lg px-3 py-2 text-sm font-medium', b.decision === 'GRANTED' ? 'bg-safe/10 text-safe' : 'bg-amber/15 text-[rgb(var(--amber-ink))]')}>
                    {b.decision === 'GRANTED'
                      ? 'Banker grants: a safe sequence still exists afterwards.'
                      : b.decision === 'ROLLED_BACK'
                        ? 'Banker refuses and rolls back. The system stays in a safe state, so deadlock can never form.'
                        : 'Banker refuses before allocating anything.'}
                  </div>
                </motion.div>
              ) : (
                <EmptyState title="Rejected" body={b?.errors.join(' · ')} />
              )}
            </Card>

            <Card className="col-span-12 lg:col-span-6" title="Detection only · grant first, check later" icon={<Skull size={15} />} actions={<CSourceNote action="detect" ops={d?.ops} />}>
              {d && d.ok && d.detection ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge tone={d.detection.deadlock ? 'unsafe' : 'safe'} className="px-3 py-1 text-sm">{d.detection.deadlock ? 'DEADLOCK' : 'NO DEADLOCK'}</Badge>
                    <span className="text-sm text-ink/80">{d.granted ? `Request granted without a safety test.` : 'Request did not fit in Available; nothing was granted.'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Processes:</span>
                    {Array.from({ length: P }, (_, i) => {
                      const dead = d.detection!.deadlocked.includes(i);
                      return (
                        <span key={i} className={cx('rounded-md px-2 py-0.5 font-mono text-xs font-bold ring-1 ring-inset', dead ? 'bg-unsafe text-white ring-unsafe' : 'bg-safe/15 text-safe ring-safe/30')}>
                          P{i}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Detection trace (Request = remaining Need)</div>
                  <Steps steps={d.detection.steps} label="Req" initFinish={d.detection.init_finish} />
                  <div className={cx('rounded-lg px-3 py-2 text-sm font-medium', d.detection.deadlock ? 'bg-unsafe/10 text-unsafe' : 'bg-safe/10 text-safe')}>
                    {d.detection.deadlock
                      ? `${d.detection.deadlocked.map((p) => `P${p}`).join(', ')} wait on each other forever. Recovery would need termination or preemption.`
                      : 'No deadlock now, but without avoidance the system may still drift into one later.'}
                  </div>
                </motion.div>
              ) : (
                <EmptyState title="Rejected" body={d?.errors.join(' · ')} />
              )}
            </Card>

            {b?.ok && d?.ok && (
              <Card className="col-span-12" title="Verdict">
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div className="rounded-lg bg-sunk/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Banker's (avoidance)</div>
                    <div className="mt-1 font-display text-lg font-semibold">{b.decision === 'GRANTED' ? 'Grants' : 'Refuses'}</div>
                  </div>
                  <div className="rounded-lg bg-sunk/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Detection (no avoidance)</div>
                    <div className={cx('mt-1 font-display text-lg font-semibold', d.detection?.deadlock && 'text-unsafe')}>{d.detection?.deadlock ? `Deadlock: ${d.detection.deadlocked.length} processes` : 'No deadlock'}</div>
                  </div>
                  <div className="rounded-lg bg-sunk/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Cost</div>
                    <div className="mt-1 font-mono text-sm">
                      {b.ops} vs {d.ops} ops · O(P²R) each
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
