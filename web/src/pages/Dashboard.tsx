import { motion } from 'framer-motion';
import { ArrowRight, Boxes, CheckCircle2, Cpu, Gauge, Layers, ShieldAlert, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Heatmap } from '../components/Matrix';
import { Badge, Button, Card, CSourceNote, EmptyState, Kpi, Skeleton } from '../components/ui';
import { useStore } from '../lib/store';
import { cx, decisionLabel, decisionTone, fmtTime, fmtVec, rLabel, sum } from '../lib/util';

export default function Dashboard() {
  const { analysis, stats, history, cursor, navigate, lastDecision, scenarios, scenarioId, setRequestDraft, jumpTo } = useStore();
  const st = analysis?.ok ? analysis.state : undefined;
  const scenario = scenarios.find((s) => s.id === scenarioId);

  if (analysis && !analysis.ok) {
    return (
      <Card title="Current state is invalid">
        <EmptyState
          icon={<ShieldAlert size={28} />}
          title="The C engine rejected this state"
          body={analysis.errors.join(' · ')}
          action={<Button variant="primary" onClick={() => navigate('editor')}>Fix it in the State Editor</Button>}
        />
      </Card>
    );
  }

  const total = st?.total ?? [];
  const allocated = st ? total.map((t, j) => t - st.available[j]) : [];
  const util = st && sum(total) ? Math.round((sum(allocated) / sum(total)) * 100) : 0;
  const chart = st ? total.map((t, j) => ({ name: rLabel(j), Allocated: allocated[j], Available: st.available[j], pct: t ? Math.round((allocated[j] / t) * 100) : 0 })) : [];
  const latest = lastDecision ?? [...history.slice(0, cursor + 1)].reverse().find((e) => e.result && e.kind !== 'load')?.result ?? null;
  const feed = history.slice(0, cursor + 1).map((e, i) => ({ e, i })).reverse().slice(0, 9);

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* KPI row */}
      <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {st ? (
          <>
            <Kpi label="Processes" value={st.processes} sub={`P0 … P${st.processes - 1}`} icon={<Cpu size={13} />} />
            <Kpi label="Resource types" value={st.resources} sub={`R0 … R${st.resources - 1}`} icon={<Boxes size={13} />} />
            <Kpi label="Total instances" value={sum(total)} sub={fmtVec(total)} icon={<Layers size={13} />} />
            <Kpi label="Available" value={sum(st.available)} sub={fmtVec(st.available)} tone="primary" />
            <Kpi label="Utilisation" value={`${util}%`} sub={`${sum(allocated)} of ${sum(total)} held`} tone={util > 80 ? 'warn' : undefined} icon={<Gauge size={13} />} />
            <Kpi
              label="System state"
              value={analysis?.safe ? 'SAFE' : 'UNSAFE'}
              tone={analysis?.safe ? 'safe' : 'unsafe'}
              sub={analysis?.safe ? `${analysis.safety?.passes} passes · ${analysis.ops} ops` : 'no safe sequence'}
              icon={analysis?.safe ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
            />
            <Kpi label="Granted" value={stats.granted} tone="safe" sub={`${stats.released} releases`} icon={<CheckCircle2 size={13} />} />
            <Kpi label="Denied" value={stats.denied + stats.rolledBack} tone={stats.denied + stats.rolledBack ? 'unsafe' : undefined} sub={`${stats.rolledBack} rolled back`} icon={<XCircle size={13} />} />
          </>
        ) : (
          Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)
        )}
      </div>

      {/* Utilisation chart */}
      <Card className="col-span-12 lg:col-span-5" title="Utilisation per resource" subtitle="Allocated vs available instances" actions={<CSourceNote action="safety" />}>
        {st ? (
          <>
            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgb(var(--muted))', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--sunk))' }}
                    contentStyle={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 12, color: 'rgb(var(--ink))' }}
                  />
                  <Bar isAnimationActive={false} dataKey="Allocated" stackId="a" fill="rgb(var(--primary))" radius={[0, 0, 3, 3]} />
                  <Bar isAnimationActive={false} dataKey="Available" stackId="a" fill="rgb(var(--safe))" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(chart.length, 5)}, minmax(0,1fr))` }}>
              {chart.map((c) => (
                <div key={c.name} className="rounded-md bg-sunk/70 px-2 py-1">
                  <div className="flex justify-between font-mono text-[10.5px] text-muted">
                    <span>{c.name}</span>
                    <span>{c.pct}%</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${c.pct}%` }} className={cx('h-full rounded-full', c.pct > 85 ? 'bg-unsafe' : c.pct > 60 ? 'bg-amber' : 'bg-safe')} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Skeleton className="h-[220px]" />
        )}
      </Card>

      {/* Heatmaps */}
      <Card className="col-span-12 sm:col-span-6 lg:col-span-4" title="Allocation & Need" subtitle="Intensity relative to each resource's total">
        {st ? (
          <div className="grid grid-cols-2 gap-3">
            <Heatmap title="Allocation" data={st.allocation} scale={total} color="primary" />
            <Heatmap title="Need" data={st.need} scale={total} color="amber" />
          </div>
        ) : (
          <Skeleton className="h-[200px]" />
        )}
      </Card>

      {/* Latest decision */}
      <Card className="col-span-12 sm:col-span-6 lg:col-span-3" title="Latest decision">
        {latest ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Badge tone={decisionTone(latest.decision)} className="text-xs">{decisionLabel(latest.decision)}</Badge>
              <span className="font-mono text-[11px] text-muted">{latest.action}</span>
            </div>
            {latest.pid !== undefined && (
              <div className="font-mono text-sm">
                P{latest.pid} {latest.action === 'request' ? 'requests' : 'releases'} {fmtVec(latest.request ?? latest.release)}
              </div>
            )}
            <ul className="space-y-1">
              {latest.checks?.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-md bg-sunk/60 px-2 py-1 text-xs">
                  <span>{c.label}</span>
                  <Badge tone={c.status === 'PASS' ? 'safe' : c.status === 'FAIL' ? 'unsafe' : 'neutral'}>{c.status}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-muted">{latest.reason}</p>
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Button size="sm" variant="ghost" onClick={() => navigate('request')}>
                Open simulator <ArrowRight size={13} />
              </Button>
              <CSourceNote action={latest.action} ops={latest.ops} />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles size={22} />}
            title="No decisions yet"
            body="Submit a resource request to see every Banker's check here."
            action={<Button size="sm" variant="primary" onClick={() => navigate('request')}>New request <span className="opacity-70">(R)</span></Button>}
          />
        )}
      </Card>

      {/* Safe sequence */}
      <Card className="col-span-12 lg:col-span-7" title="Safe sequence" subtitle="Order found by the C safety algorithm (pass-based scan)" actions={<Button size="sm" variant="ghost" onClick={() => navigate('safety')}>Visualise <ArrowRight size={13} /></Button>}>
        {analysis?.safety ? (
          analysis.safe ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {analysis.safety.sequence.map((p, k) => (
                <motion.div key={`${p}-${k}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.05 }} className="flex items-center gap-1.5">
                  <span className="rounded-lg bg-safe/15 px-2.5 py-1 font-mono text-sm font-bold text-safe ring-1 ring-inset ring-safe/30">P{p}</span>
                  {k < analysis.safety!.sequence.length - 1 && <ArrowRight size={13} className="text-muted" />}
                </motion.div>
              ))}
              <span className="ml-auto font-mono text-[11px] text-muted">final Work {fmtVec(analysis.safety.final_work)}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="unsafe">Unsafe</Badge>
              <span className="text-muted">Finished before getting stuck:</span>
              {analysis.safety.sequence.length ? analysis.safety.sequence.map((p) => <span key={p} className="font-mono font-semibold">P{p}</span>) : <span className="font-mono">none</span>}
              <span className="text-muted">· stuck:</span>
              {analysis.safety.finish.map((f, i) => (!f ? <span key={i} className="font-mono font-semibold text-unsafe">P{i}</span> : null))}
            </div>
          )
        ) : (
          <Skeleton className="h-8" />
        )}
        {scenario && scenario.suggested.length > 0 && (
          <div className="mt-3 border-t border-line/70 pt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Try from “{scenario.name}”</div>
            <div className="flex flex-wrap gap-1.5">
              {scenario.suggested.map((s, k) => (
                <button
                  key={k}
                  title={s.note}
                  onClick={() => {
                    setRequestDraft({ pid: s.pid, vector: s.request });
                    navigate('request');
                  }}
                  className="rounded-lg border border-line bg-sunk/50 px-2.5 py-1 text-left text-xs transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="font-mono font-semibold">P{s.pid} {fmtVec(s.request)}</span>
                  <span className="ml-1.5 text-muted">→ {decisionLabel(s.expect)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Activity feed */}
      <Card className="col-span-12 lg:col-span-5" title="Recent activity" subtitle={`${cursor + 1} operations on the timeline`} actions={<Button size="sm" variant="ghost" onClick={() => navigate('history')}>History <ArrowRight size={13} /></Button>} bodyClass="p-0">
        <ul className="divide-y divide-line/60">
          {feed.map(({ e, i }) => (
            <li key={e.id}>
              <button onClick={() => jumpTo(i)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-sunk/60">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', e.tone === 'safe' ? 'bg-safe' : e.tone === 'unsafe' ? 'bg-unsafe' : e.tone === 'warn' ? 'bg-amber' : 'bg-muted/50')} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.label}</span>
                <Badge tone={e.tone === 'neutral' ? 'neutral' : e.tone}>{decisionLabel(e.decision)}</Badge>
                <span className="w-16 text-right font-mono text-[10.5px] text-muted">{fmtTime(e.ts)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
