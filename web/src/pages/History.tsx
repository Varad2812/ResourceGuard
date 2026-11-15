import { motion } from 'framer-motion';
import { Pause, Play, Redo2, Undo2, History as HistoryIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MatrixTable, VectorRow } from '../components/Matrix';
import { Badge, Button, Card, EmptyState, Kbd, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { cx, decisionLabel, fmtTime } from '../lib/util';

export default function History() {
  const { history, cursor, jumpTo, undo, redo, canUndo, canRedo, navigate } = useStore();
  const [sel, setSel] = useState(cursor);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => setSel(cursor), [cursor]);

  useEffect(() => {
    if (!replaying) return;
    if (cursor >= history.length - 1) {
      setReplaying(false);
      return;
    }
    const t = setTimeout(() => jumpTo(cursor + 1), 900);
    return () => clearTimeout(t);
  }, [replaying, cursor, history.length, jumpTo]);

  const e = history[sel] ?? history[cursor];
  const prev = sel > 0 ? history[sel - 1] : null;
  const changed = (m: 'allocation' | 'max') => (i: number, j: number) =>
    prev && prev.state[m][i] !== undefined && prev.state[m].length === e.state[m].length && prev.state[m][i][j] !== e.state[m][i][j] ? ('changed' as const) : undefined;

  return (
    <>
      <PageHeader title="History & Timeline" kicker="Every operation, with a state snapshot per step">
        <Button onClick={undo} disabled={!canUndo}>
          <Undo2 size={14} /> Undo <Kbd>⌘Z</Kbd>
        </Button>
        <Button onClick={redo} disabled={!canRedo}>
          <Redo2 size={14} /> Redo
        </Button>
        <Button
          variant="primary"
          disabled={history.length < 2}
          onClick={() => {
            if (replaying) return setReplaying(false);
            jumpTo(0);
            setReplaying(true);
          }}
        >
          {replaying ? <Pause size={14} /> : <Play size={14} />} {replaying ? 'Stop replay' : 'Replay from start'}
        </Button>
      </PageHeader>
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-5" title="Timeline" subtitle={`${history.length} snapshots · cursor at #${cursor + 1}`} icon={<HistoryIcon size={14} />} bodyClass="p-0">
          {history.length <= 1 && (
            <div className="p-4">
              <EmptyState title="Only the initial state so far" body="Requests, releases, edits and scenario loads appear here. Each one stores a full snapshot you can jump back to." action={<Button size="sm" variant="primary" onClick={() => navigate('request')}>Make a request</Button>} />
            </div>
          )}
          <ol className="relative max-h-[600px] overflow-y-auto py-2 scroll-thin">
            {history.map((h, i) => {
              const future = i > cursor;
              return (
                <li key={h.id} className="relative">
                  <button onClick={() => setSel(i)} onDoubleClick={() => jumpTo(i)} className={cx('group flex w-full items-start gap-3 px-4 py-2 text-left transition', sel === i ? 'bg-primary/5' : 'hover:bg-sunk/50', future && 'opacity-45')}>
                    <div className="relative flex flex-col items-center pt-0.5">
                      <span
                        className={cx(
                          'z-10 grid h-5 w-5 place-items-center rounded-full font-mono text-[9px] font-bold text-white ring-2 ring-card',
                          h.tone === 'safe' ? 'bg-safe' : h.tone === 'unsafe' ? 'bg-unsafe' : h.tone === 'warn' ? 'bg-amber' : 'bg-muted/60',
                          i === cursor && 'ring-primary',
                        )}
                      >
                        {i + 1}
                      </span>
                      {i < history.length - 1 && <span className="absolute top-5 h-[calc(100%+0.5rem)] w-px bg-line" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{h.label}</span>
                        {i === cursor && <Badge tone="primary">current</Badge>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        <span className="font-mono">{fmtTime(h.ts)}</span>
                        <span>·</span>
                        <span>{h.kind}</span>
                        {h.safe !== null && <span className={h.safe ? 'text-safe' : 'text-unsafe'}>· {h.safe ? 'safe' : 'unsafe'}</span>}
                      </div>
                    </div>
                    <Badge tone={h.tone === 'neutral' ? 'neutral' : h.tone}>{decisionLabel(h.decision)}</Badge>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card
          className="col-span-12 lg:col-span-7"
          title={`Snapshot #${sel + 1}`}
          subtitle={e.label}
          actions={
            sel !== cursor && (
              <Button size="sm" variant="primary" onClick={() => jumpTo(sel)}>
                Restore this snapshot
              </Button>
            )
          }
        >
          <motion.div key={sel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <MatrixTable compact title="Allocation" data={e.state.allocation} cellToneFn={changed('allocation')} />
              <MatrixTable compact title="Max" data={e.state.max} cellToneFn={changed('max')} />
            </div>
            <VectorRow label="Available" data={e.state.available} toneFn={(j) => (prev && prev.state.available[j] !== e.state.available[j] ? 'changed' : undefined)} />
            {e.result?.checks && (
              <div className="flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
                {e.result.checks.map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5 rounded-md bg-sunk/60 px-2 py-1 text-xs">
                    {c.label} <Badge tone={c.status === 'PASS' ? 'safe' : c.status === 'FAIL' ? 'unsafe' : 'neutral'}>{c.status}</Badge>
                  </span>
                ))}
              </div>
            )}
            {e.result?.reason && <p className="text-xs text-muted">{e.result.reason}</p>}
            <p className="text-[11px] text-muted">Click an entry to preview it, double-click (or use Restore) to move the cursor. Undo and redo walk the same timeline; a new operation after an undo discards the redo branch.</p>
          </motion.div>
        </Card>
      </div>
    </>
  );
}
