import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Sidebar, Toasts, TopBar } from './components/Shell';
import { useStore } from './lib/store';
import type { PageId } from './lib/types';
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';
import RequestSim from './pages/RequestSim';
import SafetyViz from './pages/SafetyViz';
import GraphPage from './pages/GraphPage';
import Sequences from './pages/Sequences';
import MaxGrant from './pages/MaxGrant';
import Compare from './pages/Compare';
import History from './pages/History';
import Terminal from './pages/Terminal';
import Theory from './pages/Theory';
import ExportPage from './pages/ExportPage';

const PAGES: Record<PageId, () => JSX.Element> = {
  dashboard: Dashboard,
  editor: Editor,
  request: RequestSim,
  safety: SafetyViz,
  graph: GraphPage,
  sequences: Sequences,
  maxgrant: MaxGrant,
  compare: Compare,
  history: History,
  terminal: Terminal,
  theory: Theory,
  export: ExportPage,
};

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export default function App() {
  const store = useStore();
  const { page, navigate, undo, redo, run, state, toast } = store;
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey || isTyping(e.target)) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        navigate('request');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        run({ action: 'safety', state })
          .then((r) =>
            r.ok
              ? toast(
                  r.safe ? 'SAFE: safe sequence found' : 'UNSAFE: no safe sequence',
                  r.safe ? 'safe' : 'unsafe',
                  r.safe ? r.safety?.sequence.map((p) => `P${p}`).join(' → ') : r.reason,
                )
              : toast('Invalid state', 'unsafe', r.errors.join('; ')),
          )
          .catch((err) => toast('Engine error', 'unsafe', String(err)));
      } else if (e.key === '?') {
        setHelpOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, undo, redo, run, state, toast]);

  const Page = PAGES[page];
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-5 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="border-t border-line px-6 py-3 text-[11px] text-muted">
          ResourceGuard · System Programming project · Banker's Algorithm in C17 · press <span className="font-mono">?</span> for shortcuts
        </footer>
      </div>
      <Toasts />
    </div>
  );
}
