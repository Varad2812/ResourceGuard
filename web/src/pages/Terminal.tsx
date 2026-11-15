import { Copy, TerminalSquare, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented } from '../components/ui';
import { useStore } from '../lib/store';
import { cx, decisionTone, fmtTime } from '../lib/util';

export default function Terminal() {
  const { terminal, clearTerminal, toast, navigate } = useStore();
  const [filter, setFilter] = useState<'all' | 'manual'>('all');
  const [view, setView] = useState<'trace' | 'json' | 'stdin'>('trace');
  const list = useMemo(() => [...terminal].reverse().filter((t) => filter === 'all' || !t.auto), [terminal, filter]);
  const [selId, setSelId] = useState<number | null>(null);
  const sel = list.find((t) => t.id === selId) ?? list[0];

  useEffect(() => {
    if (selId !== null && !list.some((t) => t.id === selId)) setSelId(null);
  }, [list, selId]);

  const body = !sel ? '' : view === 'trace' ? sel.terminal : pretty(view === 'json' ? sel.raw : sel.stdin);

  return (
    <>
      <PageHeader title="Terminal" kicker="Raw output of the C binary">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All runs' }, { value: 'manual', label: 'User actions' }]} />
        <Button variant="ghost" onClick={clearTerminal} disabled={!terminal.length}>
          <Trash2 size={14} /> Clear
        </Button>
      </PageHeader>
      {!sel ? (
        <EmptyState icon={<TerminalSquare size={26} />} title="No engine runs captured yet" body="Every call to core/build/resourceguard --json is captured here with its stdin, stdout and the human-readable trace." action={<Button variant="primary" onClick={() => navigate('request')}>Make a request</Button>} />
      ) : (
        <div className="grid grid-cols-12 gap-3">
          <Card className="col-span-12 lg:col-span-4" title="Runs" subtitle={`${list.length} invocation${list.length === 1 ? '' : 's'}`} bodyClass="p-0">
            <ul className="max-h-[620px] divide-y divide-line/60 overflow-y-auto scroll-thin">
              {list.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setSelId(t.id)} className={cx('flex w-full items-center gap-2 px-3 py-2 text-left', sel.id === t.id ? 'bg-primary/5' : 'hover:bg-sunk/50')}>
                    <span className="font-mono text-[10.5px] text-muted">{fmtTime(t.ts)}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">{t.action}</span>
                    {t.auto && <span className="text-[10px] text-muted">auto</span>}
                    <Badge tone={decisionTone(t.decision)}>{t.decision.replace(/_/g, ' ')}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <section className="col-span-12 overflow-hidden rounded-xl border border-line shadow-card lg:col-span-8">
            <div className="terminal flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#E5664F]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#E5B04F]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#7FB069]" />
              </span>
              <span className="ml-2 font-mono text-[11px] opacity-70">resourceguard · {sel.durationMs} ms · exit {sel.ok ? 0 : 'invalid'}</span>
              <div className="ml-auto flex gap-1">
                {(['trace', 'json', 'stdin'] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} className={cx('rounded px-2 py-0.5 font-mono text-[11px]', view === v ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white')}>
                    {v === 'trace' ? 'trace' : v === 'json' ? 'stdout.json' : 'stdin.json'}
                  </button>
                ))}
                <button
                  aria-label="Copy"
                  onClick={() => navigator.clipboard?.writeText(body).then(() => toast('Copied to clipboard', 'primary'))}
                  className="rounded px-1.5 text-white/60 hover:text-white"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <pre className="terminal max-h-[600px] min-h-[420px] overflow-auto p-4 font-mono text-[12px] leading-[1.55] scroll-thin">
              <span className="text-[#E5B04F]">$ </span>
              <span>echo '{'{'}…{'}'}' | ./core/build/resourceguard --json</span>
              {'\n'}
              <span className="opacity-60"># action: {sel.action}</span>
              {'\n'}
              {colorize(body, view)}
            </pre>
          </section>
        </div>
      )}
    </>
  );
}

function pretty(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

/** Light syntax highlighting of PASS / FAIL / SAFE etc. in the C trace. */
function colorize(text: string, view: string) {
  if (view !== 'trace') return text;
  const parts = text.split(/(PASS|FAIL|GRANTED \(SAFE\)|UNSAFE|SAFE|DENIED[^\n]*|ROLLED BACK[^\n]*|DEADLOCK|NO DEADLOCK|SKIPPED|error:)/g);
  return parts.map((p, i) => {
    if (/^(PASS|SAFE|GRANTED \(SAFE\)|NO DEADLOCK)$/.test(p)) return <span key={i} className="font-bold text-[#8FC093]">{p}</span>;
    if (/^(FAIL|UNSAFE|DEADLOCK|error:)$/.test(p) || /^(DENIED|ROLLED BACK)/.test(p)) return <span key={i} className="font-bold text-[#EC7A6E]">{p}</span>;
    if (p === 'SKIPPED') return <span key={i} className="opacity-60">{p}</span>;
    return p;
  });
}
