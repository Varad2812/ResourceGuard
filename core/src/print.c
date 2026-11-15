/*
 * ResourceGuard - print.c
 * Pretty terminal output. Every condition of every decision is printed,
 * not only the final SAFE / UNSAFE verdict.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "print.h"

static bool g_color = false;

void print_set_color(bool on) { g_color = on; }
bool print_color_enabled(void) { return g_color; }

const char *c_reset(void) { return g_color ? "\033[0m" : ""; }
const char *c_bold(void) { return g_color ? "\033[1m" : ""; }
const char *c_dim(void) { return g_color ? "\033[2m" : ""; }
const char *c_green(void) { return g_color ? "\033[32m" : ""; }
const char *c_red(void) { return g_color ? "\033[31m" : ""; }
const char *c_yellow(void) { return g_color ? "\033[33m" : ""; }
const char *c_cyan(void) { return g_color ? "\033[36m" : ""; }
const char *c_accent(void) { return g_color ? "\033[38;5;173m" : ""; }

static const char *pf(bool ok) { return ok ? "PASS" : "FAIL"; }
static const char *pfc(bool ok) { return ok ? c_green() : c_red(); }

void print_vector(FILE *f, const int *v, int n) {
    fputc('[', f);
    for (int j = 0; j < n; j++) fprintf(f, "%s%d", j ? " " : "", v[j]);
    fputc(']', f);
}

static void rule(FILE *f, int w) {
    for (int k = 0; k < w; k++) fputc('-', f);
    fputc('\n', f);
}

static int col_width(const State *s) {
    int maxv = 0;
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++) {
            if (s->alloc[i][j] > maxv) maxv = s->alloc[i][j];
            if (s->max[i][j] > maxv) maxv = s->max[i][j];
        }
    for (int j = 0; j < s->R; j++)
        if (s->avail[j] > maxv) maxv = s->avail[j];
    int w = 1;
    while (maxv >= 10) {
        maxv /= 10;
        w++;
    }
    return w < 3 ? 3 : w + 1;
}

static int block_width(int R, int w) {
    int bw = R * w;
    return bw < 10 ? 10 : bw;
}

static void block_header(FILE *f, const char *title, int R, int w) {
    int pad = block_width(R, w) - (int)strlen(title);
    if (pad < 0) pad = 0;
    fprintf(f, " %s%s%s%*s |", c_bold(), title, c_reset(), pad, "");
}

static void block_pad(FILE *f, int R, int w) {
    int pad = block_width(R, w) - R * w;
    if (pad > 0) fprintf(f, "%*s", pad, "");
    fprintf(f, " |");
}

void print_state(FILE *f, const State *s) {
    int w = col_width(s);
    int total[MAX_R] = {0};
    state_totals(s, total);
    int line = 7 + 3 * (block_width(s->R, w) + 3);

    fprintf(f, "\n%sSystem state%s  (%d processes x %d resource types)\n", c_accent(), c_reset(), s->P, s->R);
    rule(f, line);
    fprintf(f, "      |");
    block_header(f, "Allocation", s->R, w);
    block_header(f, "Max", s->R, w);
    block_header(f, "Need", s->R, w);
    fputc('\n', f);
    fprintf(f, "      |");
    for (int b = 0; b < 3; b++) {
        fputc(' ', f);
        for (int j = 0; j < s->R; j++) fprintf(f, "%s%*s%d%s", c_dim(), w - 1, "R", j, c_reset());
        block_pad(f, s->R, w);
    }
    fputc('\n', f);
    rule(f, line);
    for (int i = 0; i < s->P; i++) {
        fprintf(f, " %sP%-3d%s |", c_bold(), i, c_reset());
        fputc(' ', f);
        for (int j = 0; j < s->R; j++) fprintf(f, "%*d", w, s->alloc[i][j]);
        block_pad(f, s->R, w);
        fputc(' ', f);
        for (int j = 0; j < s->R; j++) fprintf(f, "%*d", w, s->max[i][j]);
        block_pad(f, s->R, w);
        fputc(' ', f);
        for (int j = 0; j < s->R; j++) fprintf(f, "%s%*d%s", c_cyan(), w, s->need[i][j], c_reset());
        block_pad(f, s->R, w);
        fputc('\n', f);
    }
    rule(f, line);
    fprintf(f, " Available : ");
    print_vector(f, s->avail, s->R);
    fprintf(f, "\n Total     : ");
    print_vector(f, total, s->R);
    fputc('\n', f);
}

void print_errors(FILE *f, const ErrorList *e) {
    for (int k = 0; k < e->count; k++) fprintf(f, "%s  error:%s %s\n", c_red(), c_reset(), e->msg[k]);
}

static void print_trace_steps(FILE *f, int R, const TraceStep *steps, int n, const char *label) {
    int pass = 0;
    for (int k = 0; k < n; k++) {
        const TraceStep *st = &steps[k];
        if (st->pass != pass) {
            pass = st->pass;
            fprintf(f, "  %sPass %d%s\n", c_dim(), pass, c_reset());
        }
        fprintf(f, "    P%-2d %s ", st->pid, label);
        print_vector(f, st->need, R);
        fprintf(f, " <= Work ");
        print_vector(f, st->work, R);
        fprintf(f, " : %s%s%s", pfc(st->ok), pf(st->ok), c_reset());
        if (st->ok) {
            fprintf(f, "  -> Work = ");
            print_vector(f, st->work_after, R);
            fprintf(f, ", Finish[%d] = true", st->pid);
        } else {
            fprintf(f, "  (short on");
            for (int j = 0; j < R; j++)
                if (st->fail[j]) fprintf(f, " R%d:%d>%d", j, st->need[j], st->work[j]);
            fprintf(f, ")");
        }
        fputc('\n', f);
    }
}

static void print_seq(FILE *f, const int *seq, int n) {
    for (int k = 0; k < n; k++) fprintf(f, "%sP%d", k ? " -> " : "", seq[k]);
}

void print_safety(FILE *f, const State *s, const SafetyResult *r) {
    fprintf(f, "\n%sSafety algorithm trace%s (Work = Available = ", c_accent(), c_reset());
    print_vector(f, s->avail, s->R);
    fprintf(f, ")\n");
    print_trace_steps(f, s->R, r->steps, r->nsteps, "Need");
    if (r->safe) {
        fprintf(f, "Safe sequence: ");
        print_seq(f, r->seq, r->seq_len);
        fprintf(f, "\nResult: %sSAFE%s  (%d passes, %ld operations)\n", c_green(), c_reset(), r->passes, r->ops);
    } else {
        fprintf(f, "No eligible process in pass %d. Unfinished:", r->passes);
        for (int i = 0; i < s->P; i++)
            if (!r->finish[i]) fprintf(f, " P%d", i);
        fprintf(f, "\nResult: %sUNSAFE%s  (%d passes, %ld operations)\n", c_red(), c_reset(), r->passes, r->ops);
    }
}

void print_request(FILE *f, const State *after, const RequestResult *r) {
    const State *b = &r->before;
    fprintf(f, "\n%sRequest P%d: ", c_bold(), r->pid);
    for (int j = 0; j < b->R; j++) fprintf(f, "%s%d", j ? " " : "", r->req[j]);
    fprintf(f, "%s\n", c_reset());
    if (r->outcome == REQ_INVALID) {
        fprintf(f, "Decision: %sINVALID REQUEST%s\n", c_red(), c_reset());
        return;
    }
    fprintf(f, "Request <= Need      : %s%s%s   ", pfc(r->need_ok), pf(r->need_ok), c_reset());
    print_vector(f, r->req, b->R);
    fprintf(f, " vs ");
    print_vector(f, b->need[r->pid], b->R);
    for (int j = 0; j < b->R; j++)
        if (r->need_fail[j]) fprintf(f, "  R%d:%d>%d", j, r->req[j], b->need[r->pid][j]);
    fprintf(f, "\nRequest <= Available : %s%s%s   ", pfc(r->avail_ok), pf(r->avail_ok), c_reset());
    print_vector(f, r->req, b->R);
    fprintf(f, " vs ");
    print_vector(f, b->avail, b->R);
    for (int j = 0; j < b->R; j++)
        if (r->avail_fail[j]) fprintf(f, "  R%d:%d>%d", j, r->req[j], b->avail[j]);
    fputc('\n', f);

    if (!r->safety_run) {
        fprintf(f, "Safety test          : %sSKIPPED%s\n", c_dim(), c_reset());
        if (r->outcome == REQ_DENIED_NEED)
            fprintf(f, "Decision: %sDENIED (Request > Need: process exceeded its maximum claim)%s\n", c_red(), c_reset());
        else
            fprintf(f, "Decision: %sDENIED (Request > Available: P%d must wait)%s\n", c_red(), r->pid, c_reset());
        return;
    }
    fprintf(f, "Provisional allocation: Available ");
    print_vector(f, r->provisional.avail, b->R);
    fprintf(f, ", Allocation[P%d] ", r->pid);
    print_vector(f, r->provisional.alloc[r->pid], b->R);
    fprintf(f, ", Need[P%d] ", r->pid);
    print_vector(f, r->provisional.need[r->pid], b->R);
    fputc('\n', f);
    print_safety(f, &r->provisional, &r->safety);
    fprintf(f, "Safety test          : %s%s%s\n", pfc(r->safe), pf(r->safe), c_reset());
    if (r->safe) {
        fprintf(f, "Safe sequence: ");
        print_seq(f, r->safety.seq, r->safety.seq_len);
        fprintf(f, "\nDecision: %sGRANTED (SAFE)%s\n", c_green(), c_reset());
    } else {
        fprintf(f, "Decision: %sDENIED -> ROLLED BACK (UNSAFE)%s  snapshot restored, memcmp %s\n", c_red(), c_reset(),
                r->rollback_verified ? "== 0 (identical)" : "MISMATCH");
    }
    (void)after;
}

void print_release(FILE *f, int pid, const int *rel, int R, bool ok) {
    fprintf(f, "\n%sRelease P%d: ", c_bold(), pid);
    for (int j = 0; j < R; j++) fprintf(f, "%s%d", j ? " " : "", rel[j]);
    fprintf(f, "%s\nRelease <= Allocation : %s%s%s\n", c_reset(), pfc(ok), pf(ok), c_reset());
    fprintf(f, "Decision: %s%s%s\n", ok ? c_green() : c_red(), ok ? "RELEASED" : "DENIED", c_reset());
}

void print_sequences(FILE *f, int (*seqs)[MAX_P], int count, int P, bool truncated) {
    fprintf(f, "\n%sAll safe sequences%s: %d%s\n", c_accent(), c_reset(), count, truncated ? " (capped)" : "");
    int show = count < 50 ? count : 50;
    for (int k = 0; k < show; k++) {
        fprintf(f, "  %4d. ", k + 1);
        print_seq(f, seqs[k], P);
        fputc('\n', f);
    }
    if (count > show) fprintf(f, "  ... %d more\n", count - show);
    if (count == 0) fprintf(f, "  %sNone: the state is UNSAFE%s\n", c_red(), c_reset());
}

void print_detect(FILE *f, const State *s, const DetectResult *d) {
    fprintf(f, "\n%sDeadlock detection%s (Request = outstanding requests)\n", c_accent(), c_reset());
    for (int i = 0; i < s->P; i++)
        if (d->init_finish[i]) fprintf(f, "    P%-2d holds nothing -> Finish[%d] = true\n", i, i);
    print_trace_steps(f, s->R, d->steps, d->nsteps, "Req ");
    if (d->deadlock) {
        fprintf(f, "Result: %sDEADLOCK%s among", c_red(), c_reset());
        for (int i = 0; i < s->P; i++)
            if (d->deadlocked[i]) fprintf(f, " P%d", i);
        fputc('\n', f);
    } else {
        fprintf(f, "Result: %sNO DEADLOCK%s\n", c_green(), c_reset());
    }
}

void print_max_grant(FILE *f, const State *s, int pid, const MaxGrant *m) {
    fprintf(f, "  P%-2d  limit min(Need,Avail) ", pid);
    print_vector(f, m->limit, s->R);
    fprintf(f, "  per-resource ");
    print_vector(f, m->single, s->R);
    fprintf(f, "  combined ");
    print_vector(f, m->combined, s->R);
    fputc('\n', f);
}

void print_graph(FILE *f, const State *s, const GraphResult *g) {
    fprintf(f, "\n%sResource allocation graph%s\n", c_accent(), c_reset());
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++) {
            if (s->alloc[i][j] > 0) fprintf(f, "  R%d -> P%d  (assigned %d)\n", j, i, s->alloc[i][j]);
            if (g->waits[i][j]) fprintf(f, "  P%d -> R%d  (waits: need %d > avail %d)\n", i, j, s->need[i][j], s->avail[j]);
        }
    fprintf(f, "Cycles: %d%s\n", g->ncycles, g->truncated ? " (capped)" : "");
    for (int k = 0; k < g->ncycles; k++) {
        fprintf(f, "  ");
        for (int n = 0; n < g->cycles[k].len; n++) {
            int v = g->cycles[k].nodes[n];
            if (v < s->P) fprintf(f, "P%d -> ", v);
            else fprintf(f, "R%d -> ", v - s->P);
        }
        int v0 = g->cycles[k].nodes[0];
        fprintf(f, "%s%d\n", v0 < s->P ? "P" : "R", v0 < s->P ? v0 : v0 - s->P);
    }
}
