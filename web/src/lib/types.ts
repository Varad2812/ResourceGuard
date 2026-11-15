/** Shapes produced by the C engine (`resourceguard --json`). Nothing here is computed in JS. */
export type Matrix = number[][];

export interface SysState {
  allocation: Matrix;
  max: Matrix;
  available: number[];
}

export interface EngineState extends SysState {
  processes: number;
  resources: number;
  need: Matrix;
  total: number[];
}

export interface TraceStep {
  pass: number;
  pid: number;
  need: number[];
  work: number[];
  fail: boolean[];
  ok: boolean;
  work_after: number[];
}

export interface Safety {
  safe: boolean;
  sequence: number[];
  passes: number;
  finish: boolean[];
  initial_work: number[];
  final_work: number[];
  ops: number;
  steps: TraceStep[];
}

export interface Check {
  id: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  pass: boolean | null;
  lhs_name?: string;
  rhs_name?: string;
  lhs?: number[];
  rhs?: number[];
  fail?: boolean[];
  sequence?: number[];
}

export interface Detection {
  deadlock: boolean;
  deadlocked: number[];
  order: number[];
  init_finish: boolean[];
  finish: boolean[];
  passes: number;
  ops: number;
  steps: TraceStep[];
}

export interface MaxRow {
  pid: number;
  need: number[];
  limit: number[];
  single: number[];
  combined: number[];
  any: boolean;
}

export interface CycleNode {
  kind: 'P' | 'R';
  id: number;
}

export interface EngineMeta {
  binary: string;
  command: string;
  durationMs: number;
  exitCode: number;
  raw: string;
  stdin: string;
}

export interface EngineResult {
  engine?: string;
  action: string;
  ok: boolean;
  decision: string;
  reason?: string;
  errors: string[];
  terminal?: string;
  ops?: number;
  complexity?: { P: number; R: number; time_bound: number; space_bound: number; time: string; space: string };
  state?: EngineState;
  state_before?: EngineState;
  provisional?: EngineState | null;
  safety?: Safety | null;
  safe?: boolean;
  checks?: Check[];
  pid?: number;
  request?: number[];
  release?: number[];
  denial_kind?: string | null;
  rolled_back?: boolean;
  rollback_verified?: boolean;
  count?: number;
  truncated?: boolean;
  cap?: number;
  sequences?: number[][];
  detection?: Detection;
  granted?: boolean;
  unchecked_grant?: boolean;
  request_source?: string;
  max_grantable?: MaxRow[];
  assign?: { p: number; r: number; count: number }[];
  waits?: { p: number; r: number; need: number; available: number }[];
  cycles?: CycleNode[][];
  deadlock?: boolean;
  source?: string;
  _meta?: EngineMeta;
}

export interface Suggested {
  pid: number;
  request: number[];
  expect: string;
  note: string;
}

export interface Scenario {
  id: string;
  name: string;
  tag?: string;
  description: string;
  state: SysState & { processes?: number; resources?: number };
  suggested: Suggested[];
  order?: number;
}

export type Tone = 'safe' | 'unsafe' | 'warn' | 'neutral' | 'primary';

export type OpKind = 'load' | 'edit' | 'request' | 'release' | 'complete' | 'random' | 'import';

export interface HistoryEntry {
  id: number;
  ts: number;
  kind: OpKind;
  label: string;
  decision: string;
  tone: Tone;
  state: SysState;
  safe: boolean | null;
  result?: EngineResult;
}

export interface TermEntry {
  id: number;
  ts: number;
  action: string;
  auto: boolean;
  decision: string;
  stdin: string;
  raw: string;
  terminal: string;
  durationMs: number;
  ok: boolean;
}

export type PageId =
  | 'dashboard'
  | 'editor'
  | 'request'
  | 'safety'
  | 'graph'
  | 'sequences'
  | 'maxgrant'
  | 'compare'
  | 'history'
  | 'terminal'
  | 'theory'
  | 'export';
