import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchScenarios, runEngine, type Command } from './api';
import type { EngineResult, HistoryEntry, OpKind, PageId, Scenario, SysState, TermEntry, Tone } from './types';
import { decisionTone, toSys } from './util';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
}

export interface RequestDraft {
  pid: number;
  vector: number[];
  autoSubmit?: boolean;
}

interface Store {
  page: PageId;
  navigate: (p: PageId) => void;

  state: SysState;
  analysis: EngineResult | null; // C safety result for the current state
  analyzing: boolean;
  engineError: string | null;

  scenarios: Scenario[];
  scenariosLoading: boolean;
  scenarioId: string | null;
  loadScenario: (id: string) => void;

  history: HistoryEntry[];
  cursor: number;
  commit: (e: { kind: OpKind; label: string; state: SysState; result?: EngineResult; decision?: string }) => void;
  undo: () => void;
  redo: () => void;
  jumpTo: (i: number) => void;
  canUndo: boolean;
  canRedo: boolean;

  run: (cmd: Command, opts?: { auto?: boolean }) => Promise<EngineResult>;
  terminal: TermEntry[];
  clearTerminal: () => void;

  lastDecision: EngineResult | null;
  setLastDecision: (r: EngineResult) => void;
  stats: { granted: number; denied: number; rolledBack: number; released: number };

  requestDraft: RequestDraft | null;
  setRequestDraft: (d: RequestDraft | null) => void;

  toasts: Toast[];
  toast: (title: string, tone?: Tone, body?: string) => void;
  dismissToast: (id: number) => void;

  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Ctx = createContext<Store | null>(null);

const TEXTBOOK: SysState = {
  allocation: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
  max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]],
  available: [3, 3, 2],
};

const PAGES: PageId[] = [
  'dashboard', 'editor', 'request', 'safety', 'graph', 'sequences',
  'maxgrant', 'compare', 'history', 'terminal', 'theory', 'export',
];

function pageFromHash(): PageId {
  const h = window.location.hash.replace(/^#\/?/, '') as PageId;
  return PAGES.includes(h) ? h : 'dashboard';
}

function readTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

let seq = 1;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    { id: seq++, ts: Date.now(), kind: 'load', label: 'Loaded Textbook 5×3', decision: 'LOADED', tone: 'neutral', state: TEXTBOOK, safe: null },
  ]);
  const [cursor, setCursor] = useState(0);
  const [analysis, setAnalysis] = useState<EngineResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [scenarioId, setScenarioId] = useState<string | null>('textbook');
  const [terminal, setTerminal] = useState<TermEntry[]>([]);
  const [lastDecision, setLastDecisionState] = useState<EngineResult | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestDraft | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);
  const analysisToken = useRef(0);

  const state = history[cursor].state;

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((p: PageId) => {
    window.location.hash = `/${p}`;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((title: string, tone: Tone = 'neutral', body?: string) => {
    const id = seq++;
    setToasts((t) => [...t.slice(-3), { id, title, tone, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const run = useCallback(async (cmd: Command, opts?: { auto?: boolean }) => {
    try {
      const r = await runEngine(cmd);
      setEngineError(null);
      setTerminal((t) => [
        ...t.slice(-199),
        {
          id: seq++,
          ts: Date.now(),
          action: cmd.action,
          auto: !!opts?.auto,
          decision: r.decision,
          stdin: r._meta?.stdin ?? JSON.stringify(cmd),
          raw: r._meta?.raw ?? JSON.stringify(r),
          terminal: r.terminal ?? (r.errors ?? []).join('\n'),
          durationMs: r._meta?.durationMs ?? 0,
          ok: r.ok,
        },
      ]);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEngineError(msg);
      throw e;
    }
  }, []);

  // Every state change is analysed by the C engine (Need, safety, sequence).
  useEffect(() => {
    const token = ++analysisToken.current;
    setAnalyzing(true);
    run({ action: 'safety', state }, { auto: true })
      .then((r) => {
        if (token !== analysisToken.current) return;
        setAnalysis(r);
        setHistory((h) => h.map((e, i) => (i === cursor && e.safe === null ? { ...e, safe: r.ok ? !!r.safe : null } : e)));
      })
      .catch(() => {
        if (token === analysisToken.current) setAnalysis(null);
      })
      .finally(() => {
        if (token === analysisToken.current) setAnalyzing(false);
      });
  }, [state, cursor, run]);

  useEffect(() => {
    fetchScenarios()
      .then(setScenarios)
      .catch((e) => toast('Could not load scenarios', 'unsafe', String(e)))
      .finally(() => setScenariosLoading(false));
  }, [toast]);

  const commit = useCallback<Store['commit']>(
    ({ kind, label, state: next, result, decision }) => {
      const d = decision ?? result?.decision ?? 'UPDATED';
      const entry: HistoryEntry = {
        id: seq++,
        ts: Date.now(),
        kind,
        label,
        decision: d,
        tone: decisionTone(d) === 'neutral' ? 'neutral' : decisionTone(d),
        state: toSys(next),
        safe: result?.safe ?? null,
        result,
      };
      setHistory((h) => [...h.slice(0, cursor + 1), entry]);
      setCursor((c) => c + 1);
    },
    [cursor],
  );

  const loadScenario = useCallback(
    (id: string) => {
      const sc = scenarios.find((s) => s.id === id);
      if (!sc) return;
      setScenarioId(id);
      commit({ kind: 'load', label: `Loaded ${sc.name}`, state: toSys(sc.state), decision: 'LOADED' });
      setLastDecisionState(null);
      toast(`Scenario loaded: ${sc.name}`, 'primary', sc.description);
    },
    [scenarios, commit, toast],
  );

  const undo = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const redo = useCallback(() => setCursor((c) => Math.min(history.length - 1, c + 1)), [history.length]);
  const jumpTo = useCallback((i: number) => setCursor(Math.max(0, Math.min(history.length - 1, i))), [history.length]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('rg-theme', next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const s = { granted: 0, denied: 0, rolledBack: 0, released: 0 };
    for (const e of history.slice(0, cursor + 1)) {
      if (e.decision === 'GRANTED') s.granted++;
      else if (e.decision === 'DENIED' && e.kind === 'request') s.denied++;
      else if (e.decision === 'ROLLED_BACK') s.rolledBack++;
      else if (e.decision === 'RELEASED' || e.decision === 'COMPLETED') s.released++;
    }
    return s;
  }, [history, cursor]);

  const value: Store = {
    page,
    navigate,
    state,
    analysis,
    analyzing,
    engineError,
    scenarios,
    scenariosLoading,
    scenarioId,
    loadScenario,
    history,
    cursor,
    commit,
    undo,
    redo,
    jumpTo,
    canUndo: cursor > 0,
    canRedo: cursor < history.length - 1,
    run,
    terminal,
    clearTerminal: () => setTerminal([]),
    lastDecision,
    setLastDecision: setLastDecisionState,
    stats,
    requestDraft,
    setRequestDraft,
    toasts,
    toast,
    dismissToast,
    theme,
    toggleTheme,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Runs a C command whenever `key` changes; returns { data, loading, error }. */
export function useEngine(cmd: Command | null, key: string) {
  const { run } = useStore();
  const [data, setData] = useState<EngineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cmdRef = useRef(cmd);
  cmdRef.current = cmd;
  useEffect(() => {
    if (!cmdRef.current) return;
    let alive = true;
    setLoading(true);
    run(cmdRef.current, { auto: true })
      .then((r) => alive && (setData(r), setError(null)))
      .catch((e) => alive && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, run]);
  return { data, loading, error };
}
