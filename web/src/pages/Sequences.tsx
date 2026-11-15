import { ArrowRight, ListOrdered, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, CSourceNote, EmptyState, Kpi, PageHeader, Segmented, SkeletonRows } from '../components/ui';
import { useEngine, useStore } from '../lib/store';
import { cx } from '../lib/util';

function parseQuery(q: string): number[] {
  return (q.match(/\d+/g) ?? []).map(Number);
}

export default function Sequences() {
  const { state, navigate } = useStore();
  const { data, loading } = useEngine({ action: 'all_sequences', state }, JSON.stringify(state));
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'prefix' | 'order'>('order');
  const [limit, setLimit] = useState(120);
  const terms = parseQuery(q);

  const filtered = useMemo(() => {
    const seqs = data?.sequences ?? [];
    if (!terms.length) return seqs.map((s, i) => ({ s, i }));
    return seqs
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        if (mode === 'prefix') return terms.every((t, k) => s[k] === t);
        let pos = 0;
        for (const t of terms) {
          const at = s.indexOf(t, pos);
          if (at < 0) return false;
          pos = at + 1;
        }
        return true;
      });
  }, [data, terms, mode]);

  const P = state.allocation.length;
  const firstCounts = useMemo(() => {
    const c = Array(P).fill(0) as number[];
    for (const s of data?.sequences ?? []) c[s[0]]++;
    return c.map((n, i) => ({ name: `P${i}`, n }));
  }, [data, P]);
  const lastCounts = useMemo(() => {
    const c = Array(P).fill(0) as number[];
    for (const s of data?.sequences ?? []) c[s[s.length - 1]]++;
    return c;
  }, [data, P]);

  const count = data?.count ?? 0;
  return (
    <>
      <PageHeader title="All Safe Sequences" kicker="Backtracking enumeration in C">
        {data && <CSourceNote action="all_sequences" ops={data.ops} />}
      </PageHeader>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Safe sequences" value={data ? `${count}${data.truncated ? '+' : ''}` : '…'} tone={count ? 'safe' : data ? 'unsafe' : undefined} sub={data?.truncated ? `capped at ${data.cap}` : 'complete enumeration'} />
          <Kpi label="Matching search" value={data ? filtered.length : '…'} sub={terms.length ? terms.map((t) => `P${t}`).join(mode === 'prefix' ? ' ' : ' … ') : 'no filter'} />
          <Kpi label="Possible orders" value={P <= 12 ? factorial(P).toLocaleString() : `${P}!`} sub={`${P}! permutations of ${P} processes`} />
          <Kpi label="Safe fraction" value={data && P <= 12 ? `${((count / factorial(P)) * 100).toFixed(count / factorial(P) < 0.01 ? 3 : 1)}%` : '—'} sub="of all permutations" />
        </div>

        <Card
          className="col-span-12 lg:col-span-8"
          title="Sequences"
          icon={<ListOrdered size={14} />}
          actions={
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'order', label: 'Contains in order' },
                { value: 'prefix', label: 'Starts with' },
              ]}
            />
          }
        >
          <label className="relative mb-3 block">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-full pl-8 font-mono" placeholder="e.g. P1 P3   or   1 4 0" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {loading && !data ? (
            <SkeletonRows rows={8} />
          ) : !data?.ok ? (
            <EmptyState title="Invalid state" body={data?.errors.join(' · ')} />
          ) : count === 0 ? (
            <EmptyState title="No safe sequence exists" body="This state is unsafe: the C backtracking search found no ordering in which every process can finish." action={<Button size="sm" onClick={() => navigate('safety')}>See where it gets stuck</Button>} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Search size={20} />} title="No sequence matches" body="Try fewer processes or switch to “contains in order”." action={<Button size="sm" variant="ghost" onClick={() => setQ('')}>Clear search</Button>} />
          ) : (
            <>
              <ol className="max-h-[520px] divide-y divide-line/60 overflow-y-auto rounded-lg border border-line scroll-thin">
                {filtered.slice(0, limit).map(({ s, i }) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-1.5 hover:bg-sunk/50">
                    <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">#{i + 1}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {s.map((p, k) => (
                        <span key={k} className="flex items-center gap-1">
                          <span className={cx('rounded px-1.5 py-0.5 font-mono text-xs font-semibold', terms.includes(p) ? 'bg-primary/15 text-primary' : 'bg-safe/10 text-safe')}>P{p}</span>
                          {k < s.length - 1 && <ArrowRight size={10} className="text-muted/70" />}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
              {filtered.length > limit && (
                <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setLimit((l) => l + 200)}>
                  Show more ({filtered.length - limit} remaining)
                </Button>
              )}
            </>
          )}
        </Card>

        <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
          <Card title="Who can go first?" subtitle="Sequences starting with each process">
            {data?.ok && count > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={firstCounts} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgb(var(--muted))', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgb(var(--sunk))' }} contentStyle={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--line))', borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="n" name="sequences" radius={[4, 4, 0, 0]}>
                      {firstCounts.map((c) => (
                        <Cell key={c.name} fill={c.n ? 'rgb(var(--safe))' : 'rgb(var(--line))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <SkeletonRows rows={3} />
            )}
          </Card>
          <Card title="Position summary">
            <div className="space-y-1">
              {firstCounts.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold">P{i}</span>
                  <span className="flex gap-1.5">
                    <Badge tone={c.n ? 'safe' : 'neutral'}>first {c.n}</Badge>
                    <Badge tone={lastCounts[i] ? 'primary' : 'neutral'}>last {lastCounts[i]}</Badge>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">From a safe state, running any eligible process keeps the state safe, so the search never dead-ends; it is capped at {data?.cap ?? 1000} sequences.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function factorial(n: number) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}
