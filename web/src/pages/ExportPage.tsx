import { FileDown, FileJson, FileText, Loader2, Terminal as TermIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';
import type { EngineResult, EngineState } from '../lib/types';
import { decisionLabel, download, fmtVec } from '../lib/util';

function stateText(s: EngineState) {
  const R = s.resources;
  const w = 4;
  const cell = (v: number) => String(v).padStart(w - 1) + ' ';
  const hdr = Array.from({ length: R }, (_, j) => `R${j}`.padStart(w - 1) + ' ').join('');
  const lines = [`      Allocation${' '.repeat(Math.max(1, R * w - 9))}Max${' '.repeat(Math.max(1, R * w - 2))}Need`, `      ${hdr}  ${hdr}  ${hdr}`];
  for (let i = 0; i < s.processes; i++) {
    lines.push(`P${String(i).padEnd(4)} ${s.allocation[i].map(cell).join('')}  ${s.max[i].map(cell).join('')}  ${s.need[i].map(cell).join('')}`);
  }
  lines.push('', `Available : ${fmtVec(s.available)}`, `Total     : ${fmtVec(s.total)}`);
  return lines;
}

function decisionLines(r: EngineResult) {
  const out = [`Action: ${r.action}   Decision: ${decisionLabel(r.decision)}`];
  if (r.pid !== undefined) out.push(`Process P${r.pid}  vector ${fmtVec(r.request ?? r.release)}`);
  for (const c of r.checks ?? []) out.push(`  ${c.label.padEnd(22)} : ${c.status}${c.lhs ? `   ${fmtVec(c.lhs)} vs ${fmtVec(c.rhs)}` : ''}`);
  if (r.reason) out.push(`Reason: ${r.reason}`);
  if (r.rolled_back) out.push(`Rollback verified (memcmp): ${r.rollback_verified ? 'yes' : 'NO'}`);
  return out;
}

export default function ExportPage() {
  const { analysis, lastDecision, history, cursor, terminal, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const st = analysis?.ok ? analysis.state : undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const report = () => ({
    generatedAt: new Date().toISOString(),
    engine: analysis?.engine,
    state: st,
    safety: analysis?.safety,
    decision: analysis?.decision,
    complexity: analysis?.complexity,
    lastDecision: lastDecision ? { ...lastDecision, _meta: undefined } : null,
    history: history.slice(0, cursor + 1).map((h) => ({ at: new Date(h.ts).toISOString(), kind: h.kind, label: h.label, decision: h.decision, safe: h.safe, state: h.state })),
  });

  const exportJson = () => {
    download(`resourceguard-report-${stamp}.json`, JSON.stringify(report(), null, 2), 'application/json');
    toast('JSON report downloaded', 'safe');
  };

  const exportTxt = () => {
    if (!st) return;
    const lines = ['# ResourceGuard state file (load with: resourceguard --load file.txt)', `${st.processes} ${st.resources}`];
    st.allocation.forEach((r) => lines.push(r.join(' ')));
    st.max.forEach((r) => lines.push(r.join(' ')));
    lines.push(st.available.join(' '));
    download(`resourceguard-state-${stamp}.txt`, lines.join('\n') + '\n', 'text/plain');
    toast('State file for the C CLI downloaded', 'safe');
  };

  const exportPdf = async () => {
    if (!st || !analysis) return;
    setBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const M = 48;
      const pageH = doc.internal.pageSize.getHeight();
      const pageW = doc.internal.pageSize.getWidth();
      let y = M;
      const ensure = (h: number) => {
        if (y + h > pageH - M) {
          doc.addPage();
          y = M;
        }
      };
      const heading = (t: string) => {
        ensure(34);
        y += 8;
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(194, 86, 47);
        doc.text(t, M, y);
        y += 6;
        doc.setDrawColor(234, 223, 203);
        doc.line(M, y, pageW - M, y);
        y += 14;
        doc.setTextColor(43, 29, 20);
      };
      const mono = (lines: string[], size = 9) => {
        doc.setFont('courier', 'normal');
        doc.setFontSize(size);
        for (const raw of lines) {
          for (const l of doc.splitTextToSize(raw, pageW - 2 * M) as string[]) {
            ensure(size + 3);
            doc.text(l, M, y);
            y += size + 3;
          }
        }
      };
      const para = (t: string) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        for (const l of doc.splitTextToSize(t, pageW - 2 * M) as string[]) {
          ensure(14);
          doc.text(l, M, y);
          y += 14;
        }
      };

      doc.setFillColor(194, 86, 47);
      doc.rect(0, 0, pageW, 6, 'F');
      doc.setFont('times', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(43, 29, 20);
      doc.text('ResourceGuard report', M, y + 10);
      y += 30;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(118, 98, 83);
      doc.text(`${new Date().toLocaleString()}  ·  ${analysis.engine ?? 'C engine'}`, M, y);
      y += 16;
      doc.setTextColor(43, 29, 20);
      para(`Verdict: the current state is ${analysis.safe ? 'SAFE' : 'UNSAFE'}. ${analysis.reason ?? ''}`);

      heading('System state');
      mono(stateText(st));
      heading('Safety algorithm trace');
      if (analysis.safety) {
        const lines: string[] = [`Work = Available = ${fmtVec(analysis.safety.initial_work)}`];
        let pass = 0;
        for (const s of analysis.safety.steps) {
          if (s.pass !== pass) lines.push(`Pass ${(pass = s.pass)}`);
          lines.push(`  P${s.pid}  Need ${fmtVec(s.need)} <= Work ${fmtVec(s.work)} : ${s.ok ? `PASS -> Work ${fmtVec(s.work_after)}` : 'FAIL'}`);
        }
        lines.push(analysis.safe ? `Safe sequence: ${analysis.safety.sequence.map((p) => `P${p}`).join(' -> ')}` : 'No safe sequence: UNSAFE');
        lines.push(`${analysis.ops} operations  (bound P^2*R = ${analysis.complexity?.time_bound})`);
        mono(lines);
      }
      if (lastDecision) {
        heading('Latest decision');
        mono(decisionLines(lastDecision));
        if (lastDecision.terminal) {
          heading('Raw C output for the latest decision');
          mono(lastDecision.terminal.split('\n'), 8);
        }
      }
      heading('Operation history');
      mono(history.slice(0, cursor + 1).map((h, i) => `${String(i + 1).padStart(3)}. ${new Date(h.ts).toLocaleTimeString()}  ${h.label.padEnd(42)} ${h.decision}`), 8.5);

      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(118, 98, 83);
        doc.text(`ResourceGuard · Banker's Algorithm in C · page ${p}/${pages}`, M, pageH - 24);
      }
      doc.save(`resourceguard-report-${stamp}.pdf`);
      toast('PDF report downloaded', 'safe');
    } catch (e) {
      toast('PDF export failed', 'unsafe', String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!st || !analysis) return <EmptyState title="Nothing to export" body="Load a valid state first." />;

  return (
    <>
      <PageHeader title="Export Report" kicker="State, trace and decisions" />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 grid gap-3 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1">
          {[
            { icon: <FileDown size={18} />, title: 'PDF report', body: 'State tables, the full safety trace, the latest decision with raw C output, and the operation history.', action: exportPdf, label: 'Download PDF' },
            { icon: <FileJson size={18} />, title: 'JSON report', body: 'Machine-readable: state with Need from C, safety result, latest decision and every snapshot.', action: exportJson, label: 'Download JSON' },
            { icon: <TermIcon size={18} />, title: 'C state file', body: 'Plain .txt for the terminal: ./resourceguard --load state.txt', action: exportTxt, label: 'Download .txt' },
          ].map((x) => (
            <Card key={x.title} title={x.title} icon={x.icon}>
              <p className="min-h-[48px] text-xs text-muted">{x.body}</p>
              <Button variant={x.title === 'PDF report' ? 'primary' : 'outline'} className="mt-3 w-full" onClick={x.action} disabled={busy}>
                {busy && x.title === 'PDF report' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {x.label}
              </Button>
            </Card>
          ))}
        </div>
        <Card className="col-span-12 lg:col-span-8" title="Preview" subtitle="What the PDF will contain" actions={<Badge tone={analysis.safe ? 'safe' : 'unsafe'}>{analysis.safe ? 'Safe' : 'Unsafe'}</Badge>}>
          <div className="rounded-lg border border-line bg-[#FFFDF8] p-5 text-[#2B1D14] shadow-inner">
            <div className="h-1 w-full rounded bg-[#C2562F]" />
            <h3 className="mt-3 font-display text-xl font-semibold">ResourceGuard report</h3>
            <p className="text-xs text-[#766253]">{new Date().toLocaleString()} · {analysis.engine}</p>
            <h4 className="mt-4 font-display text-sm font-semibold text-[#C2562F]">System state</h4>
            <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-snug">{stateText(st).join('\n')}</pre>
            <h4 className="mt-4 font-display text-sm font-semibold text-[#C2562F]">Safety</h4>
            <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-snug">
              {analysis.safe ? `Safe sequence: ${analysis.safety?.sequence.map((p) => `P${p}`).join(' -> ')}` : 'UNSAFE: no safe sequence'}
              {`\n${analysis.safety?.steps.length} checks in ${analysis.safety?.passes} passes · ${analysis.ops} ops`}
            </pre>
            {lastDecision && (
              <>
                <h4 className="mt-4 font-display text-sm font-semibold text-[#C2562F]">Latest decision</h4>
                <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-snug">{decisionLines(lastDecision).join('\n')}</pre>
              </>
            )}
            <h4 className="mt-4 font-display text-sm font-semibold text-[#C2562F]">History</h4>
            <p className="font-mono text-[11px]">{cursor + 1} operations · {terminal.length} engine runs captured</p>
          </div>
        </Card>
      </div>
    </>
  );
}
