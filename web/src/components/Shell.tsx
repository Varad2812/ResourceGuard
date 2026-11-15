import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BookOpen,
  Download,
  FileClock,
  GitCompareArrows,
  Gauge,
  ListOrdered,
  Menu,
  Moon,
  Network,
  PlayCircle,
  Send,
  ShieldCheck,
  Sun,
  Table2,
  TerminalSquare,
  TrendingUp,
  X,
  Keyboard,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import type { PageId } from '../lib/types';
import { cx } from '../lib/util';
import { Badge, Kbd } from './ui';

export const NAV: { group: string; items: { id: PageId; label: string; icon: ReactNode; hint?: string }[] }[] = [
  { group: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: <Gauge size={16} /> }] },
  { group: 'Model', items: [{ id: 'editor', label: 'State Editor', icon: <Table2 size={16} /> }] },
  {
    group: 'Simulate',
    items: [
      { id: 'request', label: 'Request Simulator', icon: <Send size={16} />, hint: 'R' },
      { id: 'safety', label: 'Safety Visualizer', icon: <PlayCircle size={16} /> },
      { id: 'graph', label: 'Allocation Graph', icon: <Network size={16} /> },
      { id: 'sequences', label: 'All Safe Sequences', icon: <ListOrdered size={16} /> },
      { id: 'maxgrant', label: 'Max Grantable', icon: <TrendingUp size={16} /> },
      { id: 'compare', label: 'Avoidance vs Detection', icon: <GitCompareArrows size={16} /> },
    ],
  },
  {
    group: 'Records',
    items: [
      { id: 'history', label: 'History & Timeline', icon: <FileClock size={16} /> },
      { id: 'terminal', label: 'Terminal (C output)', icon: <TerminalSquare size={16} /> },
      { id: 'export', label: 'Export Report', icon: <Download size={16} /> },
    ],
  },
  { group: 'Learn', items: [{ id: 'theory', label: 'Theory', icon: <BookOpen size={16} /> }] },
];

const TITLES: Record<PageId, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<PageId, string>;

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-sm">
        <ShieldCheck size={20} strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[17px] font-semibold tracking-tight text-ink">ResourceGuard</div>
        <div className="text-[10.5px] font-medium text-muted">Deadlock avoidance · C engine</div>
      </div>
    </div>
  );
}

function SidebarContent({ onPick }: { onPick?: () => void }) {
  const { page, navigate, terminal, history, cursor } = useStore();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Logo />
      <nav className="scroll-thin -mx-1 flex-1 space-y-3 overflow-y-auto px-1">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = page === it.id;
                const count = it.id === 'terminal' ? terminal.length : it.id === 'history' ? cursor + 1 : undefined;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => {
                        navigate(it.id);
                        onPick?.();
                      }}
                      className={cx(
                        'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition',
                        active ? 'bg-primary/10 text-primary' : 'text-ink/80 hover:bg-sunk hover:text-ink',
                      )}
                    >
                      {active && <motion.span layoutId="nav-pill" className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-primary" />}
                      <span className={cx(active ? 'text-primary' : 'text-muted group-hover:text-ink')}>{it.icon}</span>
                      <span className="flex-1 text-left">{it.label}</span>
                      {it.hint && <Kbd>{it.hint}</Kbd>}
                      {count !== undefined && count > 0 && (
                        <span className="rounded bg-sunk px-1.5 font-mono text-[10px] text-muted">{count > 99 ? '99+' : count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="rounded-lg border border-line bg-sunk/60 p-2.5 text-[11px] leading-relaxed text-muted">
        <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-ink">
          <Activity size={12} className="text-safe" /> {history.length} snapshots
        </div>
        Every decision on screen is computed by <span className="font-mono text-ink">core/build/resourceguard</span>.
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-card/70 backdrop-blur lg:block">
      <SidebarContent />
    </aside>
  );
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['R', 'Open the Request Simulator'],
    ['S', 'Run the safety check (C)'],
    ['⌘/Ctrl Z', 'Undo'],
    ['⇧⌘/Ctrl Z', 'Redo'],
    ['?', 'Show this help'],
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} className="card w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Keyboard shortcuts</h3>
          <button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {rows.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between">
              <span className="text-ink/85">{d}</span>
              <Kbd>{k}</Kbd>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}

export function TopBar({ helpOpen, setHelpOpen }: { helpOpen: boolean; setHelpOpen: (v: boolean) => void }) {
  const { page, analysis, analyzing, theme, toggleTheme, scenarios, scenarioId, loadScenario, engineError, undo, redo, canUndo, canRedo } = useStore();
  const [drawer, setDrawer] = useState(false);
  const safe = analysis?.ok ? analysis.safe : undefined;
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <button aria-label="Open navigation" className="rounded-lg p-1.5 text-muted hover:bg-sunk lg:hidden" onClick={() => setDrawer(true)}>
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="hidden font-semibold text-ink/80 sm:inline">ResourceGuard</span>
              <span className="hidden sm:inline">/</span>
              <span className="truncate">{TITLES[page]}</span>
            </div>
            <div className="flex items-center gap-2">
              {engineError ? (
                <Badge tone="unsafe" dot>Engine offline</Badge>
              ) : analyzing && !analysis ? (
                <Badge tone="neutral" dot>Checking…</Badge>
              ) : analysis && !analysis.ok ? (
                <Badge tone="unsafe" dot>Invalid state</Badge>
              ) : safe === undefined ? null : (
                <motion.div key={String(safe)} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <Badge tone={safe ? 'safe' : 'unsafe'} dot>
                    {safe ? 'Safe state' : 'Unsafe state'}
                  </Badge>
                </motion.div>
              )}
              {analysis?.safety && analysis.safe && (
                <span className="hidden truncate font-mono text-[11px] text-muted md:inline">
                  ⟨{analysis.safety.sequence.map((p) => `P${p}`).join(' → ')}⟩
                </span>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-0.5 sm:flex">
            <button aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo} className="rounded-lg p-2 text-muted hover:bg-sunk hover:text-ink disabled:opacity-35">
              <Undo2 size={16} />
            </button>
            <button aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo} className="rounded-lg p-2 text-muted hover:bg-sunk hover:text-ink disabled:opacity-35">
              <Redo2 size={16} />
            </button>
          </div>
          <label className="sr-only" htmlFor="scenario-picker">Scenario</label>
          <select
            id="scenario-picker"
            value={scenarioId ?? ''}
            onChange={(e) => loadScenario(e.target.value)}
            className="input h-8 max-w-[10.5rem] pr-7 text-xs sm:max-w-[13rem]"
          >
            {!scenarioId && <option value="">Custom state</option>}
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button aria-label="Keyboard shortcuts" title="Shortcuts (?)" onClick={() => setHelpOpen(true)} className="hidden rounded-lg p-2 text-muted hover:bg-sunk hover:text-ink md:block">
            <Keyboard size={16} />
          </button>
          <button aria-label="Toggle theme" title="Toggle theme" onClick={toggleTheme} className="rounded-lg border border-line bg-card p-1.5 text-ink hover:bg-sunk">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/30" onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'tween', duration: 0.2 }} className="absolute inset-y-0 left-0 w-64 border-r border-line bg-card">
              <SidebarContent onPick={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        )}
        {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
            className={cx(
              'card pointer-events-auto flex gap-3 overflow-hidden px-3.5 py-2.5',
            )}
          >
            <span
              className={cx(
                'mt-0.5 w-1 shrink-0 self-stretch rounded-full',
                t.tone === 'safe' ? 'bg-safe' : t.tone === 'unsafe' ? 'bg-unsafe' : t.tone === 'warn' ? 'bg-amber' : 'bg-primary',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{t.body}</div>}
            </div>
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="self-start text-muted hover:text-ink">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
