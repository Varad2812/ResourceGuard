import { motion } from 'framer-motion';
import { AlertOctagon, CheckCircle2, CircleDot, RefreshCcw, XCircle } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CSourceNote, EmptyState, PageHeader, Segmented, Skeleton } from '../components/ui';
import { useEngine, useStore } from '../lib/store';
import type { CycleNode, EngineResult } from '../lib/types';
import { cx } from '../lib/util';

const W = 780;
const H = 460;
type Pos = Record<string, { x: number; y: number }>;
const nid = (n: CycleNode) => `${n.kind}${n.id}`;

/** Small deterministic force layout (repulsion + springs + gravity). Pure layout, no algorithm logic. */
function layout(P: number, R: number, edges: [string, string][]): Pos {
  const pos: Pos = {};
  for (let i = 0; i < P; i++) {
    const a = Math.PI * (0.6 + (0.8 * (i + 0.5)) / P);
    pos[`P${i}`] = { x: W / 2 + Math.cos(a) * 280, y: H / 2 - Math.sin(a) * 180 };
  }
  for (let j = 0; j < R; j++) {
    const a = Math.PI * (-0.4 + (0.8 * (j + 0.5)) / R);
    pos[`R${j}`] = { x: W / 2 + Math.cos(a) * 240, y: H / 2 - Math.sin(a) * 160 };
  }
  const ids = Object.keys(pos);
  for (let it = 0; it < 260; it++) {
    const cool = 1 - it / 260;
    const f: Record<string, { x: number; y: number }> = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const pa = pos[ids[a]];
        const pb = pos[ids[b]];
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const d2 = Math.max(dx * dx + dy * dy, 100);
        const k = 5200 / d2;
        f[ids[a]].x += dx * k * 0.05;
        f[ids[a]].y += dy * k * 0.05;
        f[ids[b]].x -= dx * k * 0.05;
        f[ids[b]].y -= dy * k * 0.05;
      }
    for (const [s, t] of edges) {
      const ps = pos[s];
      const pt = pos[t];
      if (!ps || !pt) continue;
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = (d - 150) * 0.012;
      f[s].x += (dx / d) * k * d * 0.05;
      f[s].y += (dy / d) * k * d * 0.05;
      f[t].x -= (dx / d) * k * d * 0.05;
      f[t].y -= (dy / d) * k * d * 0.05;
    }
    for (const id of ids) {
      f[id].x += (W / 2 - pos[id].x) * 0.004;
      f[id].y += (H / 2 - pos[id].y) * 0.006;
      const step = Math.max(-12, Math.min(12, f[id].x)) * cool;
      const stepY = Math.max(-12, Math.min(12, f[id].y)) * cool;
      pos[id] = { x: Math.max(48, Math.min(W - 48, pos[id].x + step)), y: Math.max(42, Math.min(H - 42, pos[id].y + stepY)) };
    }
  }
  return pos;
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, pad: number, bend: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const sx = a.x + ux * pad;
  const sy = a.y + uy * pad;
  const ex = b.x - ux * (pad + 4);
  const ey = b.y - uy * (pad + 4);
  const mx = (sx + ex) / 2 - uy * bend;
  const my = (sy + ey) / 2 + ux * bend;
  return { d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, mx, my };
}

function Graph({ g, P, R }: { g: EngineResult; P: number; R: number }) {
  const { analysis } = useStore();
  const total = analysis?.state?.total ?? [];
  const avail = analysis?.state?.available ?? [];
  const [view, setView] = useState<'all' | 'cycles'>('all');
  const [hover, setHover] = useState<string | null>(null);
  const [selCycle, setSelCycle] = useState(0);
  const edges = useMemo<[string, string][]>(
    () => [...(g.assign ?? []).map((e) => [`R${e.r}`, `P${e.p}`] as [string, string]), ...(g.waits ?? []).map((e) => [`P${e.p}`, `R${e.r}`] as [string, string])],
    [g],
  );
  const base = useMemo(() => layout(P, R, edges), [P, R, edges]);
  const [drag, setDrag] = useState<Pos>({});
  const pos = { ...base, ...drag };
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);

  const cycleEdges = useMemo(() => {
    const s = new Set<string>();
    const cyc = g.cycles ?? [];
    const pick = view === 'cycles' && cyc[selCycle] ? [cyc[selCycle]] : cyc;
    for (const c of pick) for (let k = 0; k < c.length; k++) s.add(`${nid(c[k])}>${nid(c[(k + 1) % c.length])}`);
    return s;
  }, [g, view, selCycle]);
  const cycleNodes = useMemo(() => new Set([...cycleEdges].flatMap((e) => e.split('>'))), [cycleEdges]);

  const toLocal = useCallback((e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }, []);

  const showEdge = (k: string) => view === 'all' || cycleEdges.has(k);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'all', label: 'All edges' }, { value: 'cycles', label: 'Cycle only' }]} />
        <Button size="sm" variant="ghost" onClick={() => setDrag({})}>
          <RefreshCcw size={12} /> Re-layout
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="rgb(var(--ink) / 0.55)" strokeWidth="2" /></svg> assignment R→P</span>
          <span className="flex items-center gap-1"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="rgb(var(--amber))" strokeWidth="2" strokeDasharray="4 3" /></svg> request P→R (Need &gt; Avail)</span>
          <span className="flex items-center gap-1"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="rgb(var(--unsafe))" strokeWidth="2.5" /></svg> cycle</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-sunk/30">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label="Resource allocation graph"
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const p = toLocal(e);
            setDrag((d) => ({ ...d, [dragging.current!]: { x: Math.max(30, Math.min(W - 30, p.x)), y: Math.max(30, Math.min(H - 30, p.y)) } }));
          }}
          onPointerUp={() => (dragging.current = null)}
          onPointerLeave={() => (dragging.current = null)}
        >
          <defs>
            {[
              ['a-assign', 'rgb(var(--ink) / 0.55)'],
              ['a-wait', 'rgb(var(--amber))'],
              ['a-cycle', 'rgb(var(--unsafe))'],
            ].map(([id, c]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {(g.assign ?? []).map((e) => {
            const k = `R${e.r}>P${e.p}`;
            if (!showEdge(k)) return null;
            const inCycle = cycleEdges.has(k);
            const dim = hover && hover !== `P${e.p}` && hover !== `R${e.r}`;
            const { d, mx, my } = edgePath(pos[`R${e.r}`], pos[`P${e.p}`], 26, 14);
            return (
              <g key={k} opacity={dim ? 0.15 : 1}>
                <path d={d} fill="none" stroke={inCycle ? 'rgb(var(--unsafe))' : 'rgb(var(--ink) / 0.5)'} strokeWidth={inCycle ? 2.6 : 1.6} markerEnd={`url(#${inCycle ? 'a-cycle' : 'a-assign'})`} />
                {e.count > 1 && (
                  <text x={mx} y={my} fontSize="10" textAnchor="middle" className="fill-muted font-mono">
                    ×{e.count}
                  </text>
                )}
              </g>
            );
          })}
          {(g.waits ?? []).map((e) => {
            const k = `P${e.p}>R${e.r}`;
            if (!showEdge(k)) return null;
            const inCycle = cycleEdges.has(k);
            const dim = hover && hover !== `P${e.p}` && hover !== `R${e.r}`;
            const { d } = edgePath(pos[`P${e.p}`], pos[`R${e.r}`], 26, 14);
            return (
              <path
                key={k}
                d={d}
                opacity={dim ? 0.15 : 1}
                fill="none"
                stroke={inCycle ? 'rgb(var(--unsafe))' : 'rgb(var(--amber))'}
                strokeWidth={inCycle ? 2.6 : 1.6}
                strokeDasharray={inCycle ? undefined : '5 4'}
                markerEnd={`url(#${inCycle ? 'a-cycle' : 'a-wait'})`}
              />
            );
          })}
          {Array.from({ length: R }, (_, j) => {
            const id = `R${j}`;
            const p = pos[id];
            const t = total[j] ?? 0;
            const dots = Math.min(t, 12);
            const held = t - (avail[j] ?? 0);
            const hot = cycleNodes.has(id);
            return (
              <g
                key={id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-grab"
                onPointerDown={(e) => ((dragging.current = id), (e.target as Element).setPointerCapture?.(e.pointerId))}
                onPointerEnter={() => setHover(id)}
                onPointerLeave={() => setHover(null)}
              >
                <rect x={-24} y={-24} width={48} height={48} rx={8} fill="rgb(var(--card))" stroke={hot ? 'rgb(var(--unsafe))' : 'rgb(var(--amber))'} strokeWidth={hot ? 2.6 : 1.8} />
                <text y={-8} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-ink font-mono">
                  {id}
                </text>
                {Array.from({ length: dots }, (_, k) => (
                  <circle key={k} cx={-15 + (k % 6) * 6} cy={4 + Math.floor(k / 6) * 7} r={2.2} fill={k < Math.round((held / Math.max(t, 1)) * dots) ? 'rgb(var(--primary))' : 'none'} stroke="rgb(var(--primary))" strokeWidth={1} />
                ))}
                {t > 12 && (
                  <text y={30 + 8} textAnchor="middle" fontSize="9" className="fill-muted font-mono">
                    {held}/{t}
                  </text>
                )}
              </g>
            );
          })}
          {Array.from({ length: P }, (_, i) => {
            const id = `P${i}`;
            const p = pos[id];
            const hot = cycleNodes.has(id);
            const dead = g.detection?.deadlocked.includes(i);
            return (
              <g
                key={id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-grab"
                onPointerDown={(e) => ((dragging.current = id), (e.target as Element).setPointerCapture?.(e.pointerId))}
                onPointerEnter={() => setHover(id)}
                onPointerLeave={() => setHover(null)}
              >
                <circle r={24} fill={dead ? 'rgb(var(--unsafe) / 0.12)' : 'rgb(var(--card))'} stroke={hot ? 'rgb(var(--unsafe))' : 'rgb(var(--primary))'} strokeWidth={hot ? 2.8 : 2} />
                <text y={4.5} textAnchor="middle" fontSize="13" fontWeight="700" className={cx('font-mono', dead ? 'fill-unsafe' : 'fill-ink')}>
                  {id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {(g.cycles?.length ?? 0) > 1 && view === 'cycles' && (
        <div className="mt-2 flex flex-wrap gap-1">
          {g.cycles!.map((_, k) => (
            <Button key={k} size="sm" variant={k === selCycle ? 'primary' : 'outline'} onClick={() => setSelCycle(k)}>
              Cycle {k + 1}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function Coffman({ name, holds, detail }: { name: string; holds: boolean; detail: string }) {
  return (
    <li className="flex gap-2.5 rounded-lg border border-line/80 bg-sunk/40 px-3 py-2">
      {holds ? <AlertOctagon size={16} className="mt-0.5 shrink-0 text-unsafe" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-safe" />}
      <div>
        <div className="text-[13px] font-semibold">
          {name} <span className={cx('ml-1 text-[11px] font-semibold', holds ? 'text-unsafe' : 'text-safe')}>{holds ? 'present' : 'absent'}</span>
        </div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
    </li>
  );
}

export default function GraphPage() {
  const { state, analysis } = useStore();
  const { data: g, loading } = useEngine({ action: 'graph', state }, JSON.stringify(state));
  const P = state.allocation.length;
  const R = state.available.length;
  if (analysis && !analysis.ok) return <EmptyState title="Invalid state" body={analysis.errors.join(' · ')} />;
  const cycles = g?.cycles ?? [];
  const holdWait = !!g && (g.waits ?? []).some((w) => (g.assign ?? []).some((a) => a.p === w.p));
  const label = (n: CycleNode) => `${n.kind}${n.id}`;

  return (
    <>
      <PageHeader title="Resource Allocation Graph" kicker="Processes, resources and circular wait">
        {g && <Badge tone={cycles.length ? (g.deadlock ? 'unsafe' : 'warn') : 'safe'} dot>{cycles.length ? `${cycles.length}${g.truncated ? '+' : ''} cycle${cycles.length > 1 ? 's' : ''}` : 'No cycle'}</Badge>}
        {g && <Badge tone={g.deadlock ? 'unsafe' : 'safe'}>{g.deadlock ? 'Deadlock (detection)' : 'No deadlock now'}</Badge>}
      </PageHeader>
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 xl:col-span-8" title="Interactive graph" subtitle="Drag nodes to rearrange · hover to isolate edges · dots are resource instances (filled = held)" actions={g && <CSourceNote action="graph" ops={g.ops} />}>
          {g && g.ok ? <Graph g={g} P={P} R={R} /> : loading || !g ? <Skeleton className="h-[460px]" /> : <EmptyState title="Graph unavailable" body={g.errors.join(' · ')} />}
        </Card>
        <div className="col-span-12 flex flex-col gap-3 xl:col-span-4">
          <Card title="Circular wait" icon={<CircleDot size={14} />}>
            {!g ? (
              <Skeleton className="h-20" />
            ) : cycles.length === 0 ? (
              <p className="text-sm text-safe">No cycle among request and assignment edges, so circular wait is impossible right now.</p>
            ) : (
              <div className="space-y-2.5">
                {cycles.slice(0, 4).map((c, k) => (
                  <motion.div key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-unsafe/30 bg-unsafe/5 p-2.5">
                    <div className="flex flex-wrap items-center gap-1 font-mono text-xs font-semibold text-unsafe">
                      {[...c, c[0]].map((n, idx) => (
                        <span key={idx}>
                          {label(n)}
                          {idx < c.length ? ' →' : ''}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink/80">
                      {c
                        .filter((n) => n.kind === 'P')
                        .map((n) => {
                          const idx = c.indexOf(n);
                          const r = c[(idx + 1) % c.length];
                          const holder = c[(idx + 2) % c.length];
                          return `P${n.id} waits for R${r.id}, held by ${label(holder)}`;
                        })
                        .join('; ')}
                      .
                    </p>
                  </motion.div>
                ))}
                {cycles.length > 4 && <p className="text-xs text-muted">…and {cycles.length - 4} more cycles.</p>}
                <p className="text-xs text-muted">
                  {g.deadlock
                    ? 'The detection algorithm confirms these processes can never proceed.'
                    : 'With multiple instances per resource a cycle is necessary but not sufficient: the C detection algorithm finds no deadlock, because some process in the cycle can still finish.'}
                </p>
              </div>
            )}
          </Card>
          <Card title="Coffman conditions" subtitle="Deadlock requires all four at once">
            <ul className="space-y-1.5">
              <Coffman name="Mutual exclusion" holds detail="Resource instances are non-shareable: each one is held by at most one process." />
              <Coffman name="Hold and wait" holds={holdWait} detail={holdWait ? 'Some process holds resources while waiting for more (assignment + request edges on the same node).' : 'No process holds resources while waiting.'} />
              <Coffman name="No preemption" holds detail="The model never forcibly takes resources back; only the holder releases them." />
              <Coffman name="Circular wait" holds={cycles.length > 0} detail={cycles.length ? `${cycles.length} cycle(s) in the graph.` : 'The wait-for relation is acyclic.'} />
            </ul>
            <div className={cx('mt-2.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold', g?.deadlock ? 'bg-unsafe/10 text-unsafe' : 'bg-safe/10 text-safe')}>
              {g?.deadlock ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
              {g?.deadlock ? `Deadlocked: ${g.detection?.deadlocked.map((p) => `P${p}`).join(', ')}` : cycles.length ? 'No deadlock: in every cycle some process can still finish and release' : 'No deadlock: the four conditions never hold together'}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
