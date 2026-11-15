import { Send, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, CSourceNote, EmptyState, PageHeader, SkeletonRows } from '../components/ui';
import { useEngine, useStore } from '../lib/store';
import { cx, fmtVec, rLabel, sum } from '../lib/util';

function Vec({ v, bound, strong }: { v: number[]; bound?: number[]; strong?: boolean }) {
  return (
    <span className="inline-flex gap-1 font-mono text-xs">
      {v.map((x, j) => (
        <span
          key={j}
          className={cx(
            'w-7 rounded py-0.5 text-center',
            strong ? (x > 0 ? 'bg-safe/15 font-bold text-safe' : 'bg-sunk text-muted') : 'bg-sunk/70',
            bound && x < bound[j] && 'ring-1 ring-inset ring-amber/60',
          )}
        >
          {x}
        </span>
      ))}
    </span>
  );
}

export default function MaxGrant() {
  const { state, setRequestDraft, navigate } = useStore();
  const { data, loading } = useEngine({ action: 'max_grantable', state }, JSON.stringify(state));
  const R = state.available.length;
  const rows = data?.max_grantable ?? [];

  return (
    <>
      <PageHeader title="Max Grantable Request" kicker="What can each process safely ask for right now?">
        {data && <CSourceNote action="max_grantable" ops={data.ops} />}
      </PageHeader>
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 xl:col-span-9" title="Largest safe request per process" icon={<TrendingUp size={14} />} subtitle="Binary search over each resource. Safety is monotone in the request size, so the search is exact." bodyClass="p-0">
          {loading && !data ? (
            <div className="p-4">
              <SkeletonRows rows={6} />
            </div>
          ) : !data?.ok ? (
            <div className="p-4">
              <EmptyState title="Invalid state" body={data?.errors.join(' · ')} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sunk/70 text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Process</th>
                    <th className="px-2 py-2 text-left font-semibold">Need</th>
                    <th className="px-2 py-2 text-left font-semibold">min(Need, Avail)</th>
                    <th className="px-2 py-2 text-left font-semibold">Per resource alone</th>
                    <th className="px-2 py-2 text-left font-semibold">Largest combined vector</th>
                    <th className="px-4 py-2" />
                  </tr>
                  <tr className="text-[10px] normal-case tracking-normal">
                    <th />
                    {[0, 1, 2, 3].map((c) => (
                      <th key={c} className="px-2 pb-1.5 text-left font-mono font-normal">
                        {Array.from({ length: R }, (_, j) => (
                          <span key={j} className="inline-block w-8 text-center">
                            {rLabel(j)}
                          </span>
                        ))}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {rows.map((r) => (
                    <tr key={r.pid} className="hover:bg-sunk/40">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">P{r.pid}</span>
                          {!r.any && <Badge tone={sum(r.need) === 0 ? 'neutral' : 'unsafe'}>{sum(r.need) === 0 ? 'done' : 'nothing safe'}</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-2"><Vec v={r.need} /></td>
                      <td className="px-2 py-2"><Vec v={r.limit} /></td>
                      <td className="px-2 py-2"><Vec v={r.single} bound={r.limit} /></td>
                      <td className="px-2 py-2"><Vec v={r.combined} strong /></td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          disabled={!r.any}
                          onClick={() => {
                            setRequestDraft({ pid: r.pid, vector: r.combined });
                            navigate('request');
                          }}
                        >
                          <Send size={12} /> Try it
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="col-span-12 flex flex-col gap-3 xl:col-span-3">
          <Card title="How to read this">
            <ul className="space-y-2 text-xs leading-relaxed text-ink/85">
              <li><b>min(Need, Avail)</b> is the upper bound from the first two Banker's checks.</li>
              <li><b>Per resource alone</b> is the largest amount of one resource type the process can take while asking for nothing else. A <span className="rounded px-1 ring-1 ring-amber/60">ring</span> marks a value below the bound: the safety test is what limits it.</li>
              <li><b>Largest combined vector</b> is filled greedily R0 → R{R - 1}. It is maximal: adding one more unit of any resource makes the state unsafe (checked in the C tests).</li>
            </ul>
          </Card>
          {data?.ok && (
            <Card title="Summary">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted">State</span><Badge tone={data.safe ? 'safe' : 'unsafe'}>{data.safe ? 'Safe' : 'Unsafe'}</Badge></div>
                <div className="flex justify-between"><span className="text-muted">Processes with a safe request</span><span className="font-mono font-semibold">{rows.filter((r) => r.any).length}/{rows.length}</span></div>
                <div className="flex justify-between"><span className="text-muted">Largest single grant</span><span className="font-mono font-semibold">{(() => { const best = [...rows].sort((a, b) => sum(b.combined) - sum(a.combined))[0]; return best ? `P${best.pid} ${fmtVec(best.combined)}` : '—'; })()}</span></div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
