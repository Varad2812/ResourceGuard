import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Tone } from '../lib/types';
import { cx } from '../lib/util';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClass,
  icon,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  icon?: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cx('card', className)}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold leading-tight text-ink">
              {icon && <span className="text-primary">{icon}</span>}
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </motion.section>
  );
}

const toneClass: Record<Tone, string> = {
  safe: 'bg-safe/10 text-safe ring-safe/30',
  unsafe: 'bg-unsafe/10 text-unsafe ring-unsafe/30',
  warn: 'bg-amber/15 text-[rgb(var(--amber-ink))] ring-amber/40',
  neutral: 'bg-sunk text-muted ring-line',
  primary: 'bg-primary/10 text-primary ring-primary/30',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset', toneClass[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'safe';
export function Button({
  variant = 'outline',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-primary text-white hover:brightness-110 shadow-sm',
    safe: 'bg-safe text-white hover:brightness-110 shadow-sm',
    danger: 'bg-unsafe text-white hover:brightness-110 shadow-sm',
    outline: 'border border-line bg-card text-ink hover:bg-sunk',
    ghost: 'text-muted hover:bg-sunk hover:text-ink',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        v[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const color =
    tone === 'safe' ? 'text-safe' : tone === 'unsafe' ? 'text-unsafe' : tone === 'warn' ? 'text-amber' : tone === 'primary' ? 'text-primary' : 'text-ink';
  return (
    <div className="card flex flex-col justify-between px-3.5 py-3">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted">
        <span>{label}</span>
        {icon && <span className="opacity-70">{icon}</span>}
      </div>
      <div className={cx('mt-1.5 font-display text-2xl font-semibold leading-none tabular-nums', color)}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-sunk', className)} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-sunk/40 px-4 py-6 text-center">
      {icon && <div className="mb-2 text-primary/80">{icon}</div>}
      <div className="font-display text-sm font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-sm text-xs text-muted">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Chip({ children, tone = 'neutral', active, className }: { children: ReactNode; tone?: Tone; active?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 min-w-[2rem] items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold ring-1 ring-inset',
        active ? toneClass[tone] : 'bg-sunk text-muted ring-line',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunk p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition',
            value === o.value ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</div>;
}

export function PageHeader({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{kicker}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-sunk px-1.5 py-px font-mono text-[10px] text-muted">{children}</kbd>;
}

export function CSourceNote({ action, ops }: { action: string; ops?: number }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10.5px] text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-safe" />
      computed by C · <span className="text-ink/80">--json {action}</span>
      {ops !== undefined && <span>· {ops} ops</span>}
    </div>
  );
}
