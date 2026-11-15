import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, PageHeader } from '../components/ui';

const SAFETY = `Safety(State):
  Work   ← Available                      // vector of length R
  Finish ← [false] × P
  repeat                                  // one pass
    progress ← false
    for i ← 0 .. P−1:
      if not Finish[i] and Need[i] ≤ Work:   // R comparisons
        Work      ← Work + Allocation[i]     // Pi finishes, releases
        Finish[i] ← true
        append Pi to sequence
        progress  ← true
  until not progress                       // a pass with no eligible Pi
  return all(Finish)                       // SAFE iff every Pi finished`;

const REQUEST = `Request(Pi, Request):
  1. if Request > Need[i]      → DENIED  (exceeds maximum claim)
  2. if Request > Available    → DENIED  (Pi must wait)
  3. snapshot ← copy(State)
     Available     −= Request
     Allocation[i] += Request
     Need[i]       −= Request
  4. if Safety(State)          → GRANTED (commit)
     else State ← snapshot     → ROLLED BACK
                                 (memcmp(State, snapshot) == 0)`;

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card title={title} className={className}>
      <div className="space-y-2 text-[13.5px] leading-relaxed text-ink/90">{children}</div>
    </Card>
  );
}

export default function Theory() {
  return (
    <>
      <PageHeader title="Theory" kicker="Deadlock, in one page" />
      <div className="grid grid-cols-12 gap-3">
        <Section title="What is a deadlock?" className="col-span-12 md:col-span-6 xl:col-span-4">
          <p>
            A set of processes is <b>deadlocked</b> when every process in the set waits for a resource held by another process in the same set. None can proceed, release or finish.
          </p>
          <p className="text-muted">Example: P0 holds a printer and wants the scanner; P1 holds the scanner and wants the printer.</p>
        </Section>
        <Section title="Coffman conditions" className="col-span-12 md:col-span-6 xl:col-span-4">
          <p>Deadlock is possible only when all four hold at the same time:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li><b>Mutual exclusion</b>: resources are non-shareable.</li>
            <li><b>Hold and wait</b>: a process holds resources while requesting more.</li>
            <li><b>No preemption</b>: resources are only released voluntarily.</li>
            <li><b>Circular wait</b>: a cycle P0 → P1 → … → P0 in the wait-for graph.</li>
          </ol>
        </Section>
        <Section title="Three strategies" className="col-span-12 xl:col-span-4">
          <div className="space-y-2">
            <div className="rounded-lg bg-sunk/60 p-2.5"><b>Prevention</b>: break one Coffman condition by design (e.g. order resources to forbid circular wait, or request everything up front).</div>
            <div className="rounded-lg bg-primary/10 p-2.5"><b className="text-primary">Avoidance</b>: grant a request only if the resulting state is <i>safe</i>. Needs each process's maximum claim. This is the Banker's Algorithm.</div>
            <div className="rounded-lg bg-sunk/60 p-2.5"><b>Detection &amp; recovery</b>: grant freely, periodically search for deadlock, then terminate or preempt victims.</div>
          </div>
        </Section>

        <Section title="Safe state" className="col-span-12 lg:col-span-5">
          <p>
            A state is <b>safe</b> if there exists a <b>safe sequence</b> ⟨P<sub>a</sub>, P<sub>b</sub>, …⟩ in which each process's remaining Need can be satisfied by Available plus the resources released by the processes before it.
          </p>
          <p>Safe ⇒ no deadlock. Unsafe does not mean deadlocked, only that the OS can no longer <i>guarantee</i> avoiding one.</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-[12px]">
            <div className="rounded-lg bg-sunk/60 p-2">Need = Max − Allocation</div>
            <div className="rounded-lg bg-sunk/60 p-2">Total = Available + ΣAllocation</div>
          </div>
        </Section>
        <Card title="Safety algorithm (as implemented in core/src/banker.c)" icon={<BookOpen size={14} />} className="col-span-12 lg:col-span-7">
          <pre className="terminal overflow-x-auto rounded-lg p-3 font-mono text-[12px] leading-relaxed">{SAFETY}</pre>
        </Card>
        <Card title="Resource-request algorithm" className="col-span-12 lg:col-span-7">
          <pre className="terminal overflow-x-auto rounded-lg p-3 font-mono text-[12px] leading-relaxed">{REQUEST}</pre>
        </Card>
        <Section title="Complexity" className="col-span-12 lg:col-span-5">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line/60">
              {[
                ['Safety algorithm', 'O(P² · R)', 'at most P passes × P processes × R comparisons'],
                ['Resource request', 'O(P² · R)', 'two O(R) checks + one safety test'],
                ['Space', 'O(P · R)', 'Allocation, Max, Need matrices + snapshot'],
                ['Detection', 'O(P² · R)', 'same scan with Request instead of Need'],
                ['All safe sequences', 'O(P! · P · R)', 'backtracking, capped at 1000'],
                ['Max grantable', 'O(R · log V · P² · R)', 'binary search per resource'],
              ].map(([a, b, c]) => (
                <tr key={a}>
                  <td className="py-1.5 pr-2 font-medium">{a}</td>
                  <td className="py-1.5 pr-2 font-mono font-semibold text-primary">{b}</td>
                  <td className="py-1.5 text-xs text-muted">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">Every response from the C engine includes an operation counter, shown next to each result as “N ops”, so you can compare the measured work with the P²R bound.</p>
        </Section>
        <Section title="Detection algorithm" className="col-span-12 md:col-span-6">
          <p>
            Identical scan, but Finish[i] starts <b>true</b> for processes holding nothing and the comparison uses outstanding <b>Request</b> instead of Need. Any process left unfinished is <b>deadlocked</b>.
          </p>
          <p className="text-muted">ResourceGuard uses the remaining Need as the worst-case outstanding request when comparing avoidance with detection.</p>
        </Section>
        <Section title="Resource-allocation graph" className="col-span-12 md:col-span-6">
          <p>
            Assignment edges R → P, request edges P → R. With single-instance resources a <b>cycle ⇔ deadlock</b>. With several instances per type a cycle is necessary but not sufficient, which is why the detection algorithm is still needed.
          </p>
        </Section>
      </div>
    </>
  );
}
