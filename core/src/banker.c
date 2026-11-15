/*
 * ResourceGuard - banker.c
 * The Banker's Algorithm (Dijkstra) and companion algorithms.
 *
 * Complexity (P processes, R resource types):
 *   is_safe            O(P^2 * R) time, O(P * R) space
 *   request_resources  O(R) checks + one is_safe  => O(P^2 * R)
 *   detect_deadlock    O(P^2 * R)
 *   max_grantable      O(R * log(V) * P^2 * R)   (binary search per resource)
 *   all_safe_sequences O(P! * P * R) worst case, capped at MAX_SEQUENCES
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "banker.h"

const char *outcome_name(RequestOutcome o) {
    switch (o) {
    case REQ_GRANTED: return "GRANTED";
    case REQ_DENIED_NEED: return "DENIED";
    case REQ_DENIED_AVAIL: return "DENIED";
    case REQ_ROLLED_BACK: return "ROLLED_BACK";
    case REQ_INVALID: return "INVALID";
    }
    return "UNKNOWN";
}

/* ------------------------------------------------------------------ */
/* Safety algorithm (pass-based scan)                                  */
/* ------------------------------------------------------------------ */
bool is_safe(const State *s, SafetyResult *out) {
    memset(out, 0, sizeof *out);
    int work[MAX_R] = {0};
    for (int j = 0; j < s->R; j++) work[j] = s->avail[j];
    int done = 0;

    while (done < s->P) {
        bool progress = false;
        out->passes++;
        for (int i = 0; i < s->P; i++) {
            if (out->finish[i]) continue;
            TraceStep *st = &out->steps[out->nsteps < MAX_TRACE ? out->nsteps++ : MAX_TRACE - 1];
            st->pass = out->passes;
            st->pid = i;
            bool ok = true;
            for (int j = 0; j < s->R; j++) {
                st->need[j] = s->need[i][j];
                st->work[j] = work[j];
                st->fail[j] = s->need[i][j] > work[j];
                out->ops++;
                if (st->fail[j]) ok = false;
            }
            st->ok = ok;
            if (ok) {
                for (int j = 0; j < s->R; j++) {
                    work[j] += s->alloc[i][j];
                    out->ops++;
                }
                out->finish[i] = true;
                out->seq[out->seq_len++] = i;
                done++;
                progress = true;
            }
            for (int j = 0; j < s->R; j++) st->work_after[j] = work[j];
        }
        if (!progress) break; /* a pass with no eligible process ends the scan */
    }
    for (int j = 0; j < s->R; j++) out->work[j] = work[j];
    out->safe = (done == s->P);
    return out->safe;
}

/* ------------------------------------------------------------------ */
/* Resource-request algorithm                                          */
/* ------------------------------------------------------------------ */
void rollback_state(State *s, const State *snapshot) {
    state_restore(s, snapshot);
#ifdef RG_DEBUG
    if (memcmp(s, snapshot, sizeof *s) != 0) {
        fprintf(stderr, "FATAL: rollback did not restore the snapshot\n");
        abort();
    }
#endif
}

RequestOutcome request_resources(State *s, int pid, const int req[], RequestResult *out, ErrorList *err) {
    memset(out, 0, sizeof *out);
    out->pid = pid;
    out->outcome = REQ_INVALID;

    if (!calculate_need(s, err)) return REQ_INVALID;
    if (pid < 0 || pid >= s->P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", pid, s->P - 1);
        return REQ_INVALID;
    }
    bool neg = false;
    for (int j = 0; j < s->R; j++) {
        out->req[j] = req[j];
        if (req[j] < 0) {
            snprintf(errors_slot(err), RG_ERR_LEN, "Request[R%d] = %d is negative", j, req[j]);
            neg = true;
        }
    }
    if (neg) return REQ_INVALID;

    /* Condition 1: Request <= Need (for every resource j) */
    out->need_ok = true;
    for (int j = 0; j < s->R; j++) {
        out->need_fail[j] = req[j] > s->need[pid][j];
        out->ops++;
        if (out->need_fail[j]) out->need_ok = false;
    }
    /* Condition 2: Request <= Available (evaluated & reported independently) */
    out->avail_ok = true;
    for (int j = 0; j < s->R; j++) {
        out->avail_fail[j] = req[j] > s->avail[j];
        out->ops++;
        if (out->avail_fail[j]) out->avail_ok = false;
    }
    state_snapshot(s, &out->before);

    if (!out->need_ok) {
        out->outcome = REQ_DENIED_NEED;
        out->rollback_verified = state_equal(s, &out->before);
        return out->outcome;
    }
    if (!out->avail_ok) {
        out->outcome = REQ_DENIED_AVAIL;
        out->rollback_verified = state_equal(s, &out->before);
        return out->outcome;
    }

    /* Provisional allocation */
    for (int j = 0; j < s->R; j++) {
        s->avail[j] -= req[j];
        s->alloc[pid][j] += req[j];
        s->need[pid][j] -= req[j];
        out->ops += 3;
    }
    state_snapshot(s, &out->provisional);

    /* Condition 3: resulting state must be safe */
    out->safety_run = true;
    out->safe = is_safe(s, &out->safety);
    out->ops += out->safety.ops;

    if (out->safe) {
        out->outcome = REQ_GRANTED; /* COMMIT: keep the provisional state */
        out->rollback_verified = true;
    } else {
        rollback_state(s, &out->before);
        out->rollback_verified = state_equal(s, &out->before);
        out->outcome = REQ_ROLLED_BACK;
    }
    return out->outcome;
}

/* ------------------------------------------------------------------ */
/* Release / completion                                                */
/* ------------------------------------------------------------------ */
bool release_resources(State *s, int pid, const int rel[], ErrorList *err) {
    if (!calculate_need(s, err)) return false;
    if (pid < 0 || pid >= s->P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", pid, s->P - 1);
        return false;
    }
    bool ok = true;
    for (int j = 0; j < s->R; j++) {
        if (rel[j] < 0) {
            snprintf(errors_slot(err), RG_ERR_LEN, "Release[R%d] = %d is negative", j, rel[j]);
            ok = false;
        } else if (rel[j] > s->alloc[pid][j]) {
            snprintf(errors_slot(err), RG_ERR_LEN,
                     "Release[R%d] = %d exceeds Allocation[P%d][R%d] = %d", j, rel[j], pid, j,
                     s->alloc[pid][j]);
            ok = false;
        }
    }
    if (!ok) return false;
    for (int j = 0; j < s->R; j++) {
        s->alloc[pid][j] -= rel[j];
        s->avail[j] += rel[j];
        s->need[pid][j] = s->max[pid][j] - s->alloc[pid][j];
    }
    return true;
}

bool complete_process(State *s, int pid, ErrorList *err) {
    if (pid < 0 || pid >= s->P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", pid, s->P - 1);
        return false;
    }
    int rel[MAX_R] = {0};
    for (int j = 0; j < s->R; j++) rel[j] = s->alloc[pid][j];
    if (!release_resources(s, pid, rel, err)) return false;
    /* A finished process holds nothing and claims nothing more. */
    for (int j = 0; j < s->R; j++) {
        s->max[pid][j] = 0;
        s->need[pid][j] = 0;
    }
    return true;
}

/* ------------------------------------------------------------------ */
/* All safe sequences (backtracking)                                   */
/* ------------------------------------------------------------------ */
typedef struct {
    const State *s;
    int (*seqs)[MAX_P];
    int cap, count;
    bool truncated;
    bool used[MAX_P];
    int cur[MAX_P];
    long ops;
} SeqCtx;

static void seq_dfs(SeqCtx *c, int depth, const int work[]) {
    if (c->truncated) return;
    const State *s = c->s;
    if (depth == s->P) {
        if (c->count >= c->cap) {
            c->truncated = true;
            return;
        }
        memcpy(c->seqs[c->count], c->cur, sizeof c->cur);
        c->count++;
        return;
    }
    for (int i = 0; i < s->P && !c->truncated; i++) {
        if (c->used[i]) continue;
        bool ok = true;
        for (int j = 0; j < s->R; j++) {
            c->ops++;
            if (s->need[i][j] > work[j]) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;
        int nw[MAX_R] = {0};
        for (int j = 0; j < s->R; j++) nw[j] = work[j] + s->alloc[i][j];
        c->used[i] = true;
        c->cur[depth] = i;
        seq_dfs(c, depth + 1, nw);
        c->used[i] = false;
    }
}

int all_safe_sequences(const State *s, int (*seqs)[MAX_P], int cap, bool *truncated, long *ops) {
    static SafetyResult probe;
    *truncated = false;
    if (ops) *ops = 0;
    /* From a safe state every runnable process keeps it safe, so the search
     * has no dead ends. From an unsafe state there are no sequences at all,
     * and probing first avoids exploring factorially many dead prefixes. */
    if (!is_safe(s, &probe)) {
        if (ops) *ops = probe.ops;
        return 0;
    }
    SeqCtx c;
    memset(&c, 0, sizeof c);
    c.s = s;
    c.seqs = seqs;
    c.cap = cap;
    int work[MAX_R] = {0};
    for (int j = 0; j < s->R; j++) work[j] = s->avail[j];
    seq_dfs(&c, 0, work);
    *truncated = c.truncated;
    if (ops) *ops = c.ops + probe.ops;
    return c.count;
}

/* ------------------------------------------------------------------ */
/* Deadlock detection                                                  */
/* ------------------------------------------------------------------ */
void detect_deadlock(const State *s, const int (*request)[MAX_R], DetectResult *out) {
    memset(out, 0, sizeof *out);
    int work[MAX_R] = {0};
    for (int j = 0; j < s->R; j++) work[j] = s->avail[j];
    int done = 0;
    for (int i = 0; i < s->P; i++) {
        bool holds = false;
        for (int j = 0; j < s->R; j++) {
            out->ops++;
            if (s->alloc[i][j] != 0) holds = true;
        }
        out->finish[i] = !holds; /* a process holding nothing cannot be deadlocked */
        out->init_finish[i] = !holds;
        if (!holds) done++;
    }
    while (done < s->P) {
        bool progress = false;
        out->passes++;
        for (int i = 0; i < s->P; i++) {
            if (out->finish[i]) continue;
            TraceStep *st = &out->steps[out->nsteps < MAX_TRACE ? out->nsteps++ : MAX_TRACE - 1];
            st->pass = out->passes;
            st->pid = i;
            bool ok = true;
            for (int j = 0; j < s->R; j++) {
                int rq = request ? request[i][j] : s->need[i][j];
                st->need[j] = rq;
                st->work[j] = work[j];
                st->fail[j] = rq > work[j];
                out->ops++;
                if (st->fail[j]) ok = false;
            }
            st->ok = ok;
            if (ok) {
                for (int j = 0; j < s->R; j++) {
                    work[j] += s->alloc[i][j];
                    out->ops++;
                }
                out->finish[i] = true;
                out->order[out->order_len++] = i;
                done++;
                progress = true;
            }
            for (int j = 0; j < s->R; j++) st->work_after[j] = work[j];
        }
        if (!progress) break;
    }
    for (int i = 0; i < s->P; i++) {
        out->deadlocked[i] = !out->finish[i];
        if (out->deadlocked[i]) out->count++;
    }
    out->deadlock = out->count > 0;
}

/* ------------------------------------------------------------------ */
/* Maximum grantable request                                           */
/* ------------------------------------------------------------------ */
static bool safe_after(const State *s, int pid, const int req[], long *ops) {
    static SafetyResult sr;
    State t = *s;
    for (int j = 0; j < t.R; j++) {
        t.avail[j] -= req[j];
        t.alloc[pid][j] += req[j];
        t.need[pid][j] -= req[j];
    }
    bool ok = is_safe(&t, &sr);
    if (ops) *ops += sr.ops;
    return ok;
}

/* Largest k in [0, hi] such that setting req[j] = k is safe. Safety is
 * monotone in the request size, so binary search is valid. Returns -1 if
 * even k = 0 is unsafe. */
static int search_component(const State *s, int pid, int req[], int j, int hi, long *ops) {
    req[j] = 0;
    if (!safe_after(s, pid, req, ops)) return -1;
    int lo = 0;
    while (lo < hi) {
        int mid = lo + (hi - lo + 1) / 2;
        req[j] = mid;
        if (safe_after(s, pid, req, ops)) lo = mid;
        else hi = mid - 1;
    }
    req[j] = lo;
    return lo;
}

bool max_grantable(const State *s, int pid, MaxGrant *out, long *ops, ErrorList *err) {
    memset(out, 0, sizeof *out);
    if (pid < 0 || pid >= s->P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", pid, s->P - 1);
        return false;
    }
    for (int j = 0; j < s->R; j++) {
        int a = s->need[pid][j], b = s->avail[j];
        out->limit[j] = a < b ? a : b;
        if (out->limit[j] < 0) out->limit[j] = 0;
    }
    int req[MAX_R] = {0};
    for (int j = 0; j < s->R; j++) {
        memset(req, 0, sizeof req);
        int k = search_component(s, pid, req, j, out->limit[j], ops);
        out->single[j] = k < 0 ? 0 : k;
        if (k > 0) out->any = true;
    }
    memset(req, 0, sizeof req);
    for (int j = 0; j < s->R; j++) {
        int k = search_component(s, pid, req, j, out->limit[j], ops);
        if (k < 0) {
            memset(req, 0, sizeof req);
            break;
        }
    }
    for (int j = 0; j < s->R; j++) out->combined[j] = req[j];
    return true;
}

/* ------------------------------------------------------------------ */
/* Resource-allocation graph: elementary cycles                       */
/* ------------------------------------------------------------------ */
#define GRAPH_OPS_LIMIT 400000L
typedef struct {
    const State *s;
    GraphResult *g;
    int start;
    bool onpath[MAX_P + MAX_R];
    int path[MAX_CYCLE_LEN];
    int len;
} CycCtx;

/* adjacency: process i -> resource j if waits; resource j -> process i if alloc>0 */
static void cyc_dfs(CycCtx *c, int v) {
    GraphResult *g = c->g;
    const State *s = c->s;
    if (g->ncycles >= MAX_CYCLES || g->ops > GRAPH_OPS_LIMIT) {
        g->truncated = true;
        return;
    }
    c->onpath[v] = true;
    c->path[c->len++] = v;
    int N = s->P + s->R;
    for (int w = 0; w < N; w++) {
        bool edge;
        g->ops++;
        if (v < s->P) edge = (w >= s->P) && g->waits[v][w - s->P];
        else edge = (w < s->P) && s->alloc[w][v - s->P] > 0;
        if (!edge || w < c->start) continue;
        if (w == c->start) {
            /* A 2-node loop P -> R -> P only means P wants more of a type it
             * already holds; circular wait needs at least two processes. */
            if (c->len < 4) continue;
            if (g->ncycles < MAX_CYCLES) {
                Cycle *cy = &g->cycles[g->ncycles++];
                cy->len = c->len;
                memcpy(cy->nodes, c->path, sizeof(int) * (size_t)c->len);
            } else {
                g->truncated = true;
            }
        } else if (!c->onpath[w] && c->len < MAX_CYCLE_LEN) {
            cyc_dfs(c, w);
        }
        if (g->truncated) break;
    }
    c->len--;
    c->onpath[v] = false;
}

void find_graph_cycles(const State *s, GraphResult *out) {
    memset(out, 0, sizeof *out);
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++) {
            out->waits[i][j] = s->need[i][j] > s->avail[j];
            out->ops++;
        }
    CycCtx c;
    memset(&c, 0, sizeof c);
    c.s = s;
    c.g = out;
    /* Start only from processes: every cycle in a bipartite RAG contains one,
     * and the smallest-id node rule keeps each cycle unique. */
    for (int st = 0; st < s->P && !out->truncated; st++) {
        c.start = st;
        cyc_dfs(&c, st);
    }
}

/* ------------------------------------------------------------------ */
/* Random state generation                                             */
/* ------------------------------------------------------------------ */
void random_state(State *s, int P, int R, unsigned seed, bool ensure_safe) {
    static SafetyResult sr;
    if (P < 1) P = 1;
    if (P > MAX_P) P = MAX_P;
    if (R < 1) R = 1;
    if (R > MAX_R) R = MAX_R;
    srand(seed);
    for (int attempt = 0; attempt < 4000; attempt++) {
        state_init(s, P, R);
        for (int i = 0; i < P; i++)
            for (int j = 0; j < R; j++) {
                s->max[i][j] = rand() % 10;
                s->alloc[i][j] = s->max[i][j] ? rand() % (s->max[i][j] + 1) : 0;
            }
        for (int j = 0; j < R; j++) s->avail[j] = rand() % 6;
        calculate_need(s, NULL);
        if (!ensure_safe || is_safe(s, &sr)) return;
    }
    /* Fallback: enough Available to satisfy the largest Need is always safe. */
    for (int j = 0; j < R; j++) {
        int m = 0;
        for (int i = 0; i < P; i++)
            if (s->need[i][j] > m) m = s->need[i][j];
        s->avail[j] = m;
    }
}
