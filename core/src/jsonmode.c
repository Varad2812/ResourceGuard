/*
 * ResourceGuard - jsonmode.c
 * Machine interface used by the web dashboard. Every decision, check, trace
 * step and safe sequence the UI displays originates here.
 *
 * Input:  {"action": "...", "state": {...}, ...action params}
 * Output: exactly one JSON object on stdout.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "jsonmode.h"
#include "banker.h"
#include "print.h"

#define ENGINE_NAME "ResourceGuard C engine 1.0 (C17, Banker's Algorithm)"
#define MAX_INPUT (4 * 1024 * 1024)

/* ------------------------------------------------------------------ */
/* Input helpers                                                       */
/* ------------------------------------------------------------------ */
static bool get_int(const JVal *v, int *out) {
    if (!v || v->t != J_NUM || !v->n_int) return false;
    if (v->n > 2000000000LL || v->n < -2000000000LL) return false;
    *out = (int)v->n;
    return true;
}

static bool parse_vector(const JVal *v, int n, int *out, ErrorList *err, const char *name) {
    if (!v || v->t != J_ARR) {
        snprintf(errors_slot(err), RG_ERR_LEN, "'%s' must be an array of %d integers", name, n);
        return false;
    }
    if (v->len != n) {
        snprintf(errors_slot(err), RG_ERR_LEN, "'%s' has %d entries, expected %d", name, v->len, n);
        return false;
    }
    for (int j = 0; j < n; j++) {
        if (!get_int(v->items[j], &out[j])) {
            snprintf(errors_slot(err), RG_ERR_LEN, "'%s'[%d] is not an integer", name, j);
            return false;
        }
    }
    return true;
}

static bool parse_matrix(const JVal *v, int P, int R, int (*out)[MAX_R], ErrorList *err, const char *name) {
    if (!v || v->t != J_ARR) {
        snprintf(errors_slot(err), RG_ERR_LEN, "'%s' must be a %dx%d array", name, P, R);
        return false;
    }
    if (v->len != P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "'%s' has %d rows, expected %d", name, v->len, P);
        return false;
    }
    bool ok = true;
    for (int i = 0; i < P; i++) {
        char rowname[48];
        snprintf(rowname, sizeof rowname, "%s[P%d]", name, i);
        if (!parse_vector(v->items[i], R, out[i], err, rowname)) ok = false;
    }
    return ok;
}

bool json_to_state(const JVal *st, State *s, ErrorList *err) {
    if (!st || st->t != J_OBJ) {
        errors_add(err, "Missing 'state' object");
        return false;
    }
    const JVal *A = json_get(st, "allocation");
    const JVal *M = json_get(st, "max");
    const JVal *V = json_get(st, "available");
    int P = -1, R = -1;
    if (!get_int(json_get(st, "processes"), &P)) P = (A && A->t == J_ARR) ? A->len : -1;
    if (!get_int(json_get(st, "resources"), &R)) R = (V && V->t == J_ARR) ? V->len : -1;
    if (P < 1 || P > MAX_P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Process count %d out of range (1..%d)", P, MAX_P);
        return false;
    }
    if (R < 1 || R > MAX_R) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Resource count %d out of range (1..%d)", R, MAX_R);
        return false;
    }
    state_init(s, P, R);
    bool ok = parse_matrix(A, P, R, s->alloc, err, "allocation");
    ok = parse_matrix(M, P, R, s->max, err, "max") && ok;
    ok = parse_vector(V, R, s->avail, err, "available") && ok;
    return ok;
}

static bool parse_request_matrix(const JVal *v, const State *s, int (*out)[MAX_R], ErrorList *err) {
    if (!parse_matrix(v, s->P, s->R, out, err, "request_matrix")) return false;
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++)
            if (out[i][j] < 0) {
                snprintf(errors_slot(err), RG_ERR_LEN, "request_matrix[P%d][R%d] is negative", i, j);
                return false;
            }
    return true;
}

static char *read_all(FILE *in, long *len_out) {
    size_t cap = 8192, n = 0;
    char *buf = malloc(cap);
    if (!buf) return NULL;
    for (;;) {
        if (n + 4096 + 1 > cap) {
            cap *= 2;
            char *nb = realloc(buf, cap);
            if (!nb) {
                free(buf);
                return NULL;
            }
            buf = nb;
        }
        size_t got = fread(buf + n, 1, 4096, in);
        n += got;
        if (n > MAX_INPUT) {
            free(buf);
            return NULL;
        }
        if (got == 0) break;
    }
    buf[n] = '\0';
    *len_out = (long)n;
    return buf;
}

/* ------------------------------------------------------------------ */
/* Output helpers                                                      */
/* ------------------------------------------------------------------ */
static void jw_matrix(JW *w, const int (*m)[MAX_R], int P, int R) {
    jw_arr_begin(w);
    for (int i = 0; i < P; i++) jw_int_array(w, m[i], R);
    jw_arr_end(w);
}

static void jw_state(JW *w, const State *s) {
    int total[MAX_R] = {0};
    state_totals(s, total);
    jw_obj_begin(w);
    jw_key(w, "processes"); jw_int(w, s->P);
    jw_key(w, "resources"); jw_int(w, s->R);
    jw_key(w, "allocation"); jw_matrix(w, s->alloc, s->P, s->R);
    jw_key(w, "max"); jw_matrix(w, s->max, s->P, s->R);
    jw_key(w, "need"); jw_matrix(w, s->need, s->P, s->R);
    jw_key(w, "available"); jw_int_array(w, s->avail, s->R);
    jw_key(w, "total"); jw_int_array(w, total, s->R);
    jw_obj_end(w);
}

static void jw_steps(JW *w, const TraceStep *steps, int n, int R) {
    jw_arr_begin(w);
    for (int k = 0; k < n; k++) {
        const TraceStep *st = &steps[k];
        jw_obj_begin(w);
        jw_key(w, "pass"); jw_int(w, st->pass);
        jw_key(w, "pid"); jw_int(w, st->pid);
        jw_key(w, "need"); jw_int_array(w, st->need, R);
        jw_key(w, "work"); jw_int_array(w, st->work, R);
        jw_key(w, "fail"); jw_bool_array(w, st->fail, R);
        jw_key(w, "ok"); jw_bool(w, st->ok);
        jw_key(w, "work_after"); jw_int_array(w, st->work_after, R);
        jw_obj_end(w);
    }
    jw_arr_end(w);
}

static void jw_safety(JW *w, const SafetyResult *r, const State *s) {
    jw_obj_begin(w);
    jw_key(w, "safe"); jw_bool(w, r->safe);
    jw_key(w, "sequence"); jw_int_array(w, r->seq, r->seq_len);
    jw_key(w, "passes"); jw_int(w, r->passes);
    jw_key(w, "finish"); jw_bool_array(w, r->finish, s->P);
    jw_key(w, "initial_work"); jw_int_array(w, s->avail, s->R);
    jw_key(w, "final_work"); jw_int_array(w, r->work, s->R);
    jw_key(w, "ops"); jw_int(w, r->ops);
    jw_key(w, "steps"); jw_steps(w, r->steps, r->nsteps, s->R);
    jw_obj_end(w);
}

static void jw_detection(JW *w, const DetectResult *d, const State *s) {
    jw_obj_begin(w);
    jw_key(w, "deadlock"); jw_bool(w, d->deadlock);
    jw_key(w, "deadlocked");
    jw_arr_begin(w);
    for (int i = 0; i < s->P; i++)
        if (d->deadlocked[i]) jw_int(w, i);
    jw_arr_end(w);
    jw_key(w, "order"); jw_int_array(w, d->order, d->order_len);
    jw_key(w, "init_finish"); jw_bool_array(w, d->init_finish, s->P);
    jw_key(w, "finish"); jw_bool_array(w, d->finish, s->P);
    jw_key(w, "passes"); jw_int(w, d->passes);
    jw_key(w, "ops"); jw_int(w, d->ops);
    jw_key(w, "steps"); jw_steps(w, d->steps, d->nsteps, s->R);
    jw_obj_end(w);
}

static void jw_errors(JW *w, const ErrorList *e) {
    jw_arr_begin(w);
    for (int k = 0; k < e->count; k++) jw_str(w, e->msg[k]);
    jw_arr_end(w);
}

static void jw_complexity(JW *w, const State *s, long ops) {
    jw_key(w, "ops"); jw_int(w, ops);
    jw_key(w, "complexity");
    jw_obj_begin(w);
    jw_key(w, "P"); jw_int(w, s->P);
    jw_key(w, "R"); jw_int(w, s->R);
    jw_key(w, "time_bound"); jw_int(w, (long long)s->P * s->P * s->R);
    jw_key(w, "space_bound"); jw_int(w, (long long)s->P * s->R);
    jw_key(w, "time"); jw_str(w, "O(P^2 * R)");
    jw_key(w, "space"); jw_str(w, "O(P * R)");
    jw_obj_end(w);
}

static void jw_check(JW *w, const char *id, const char *label, bool pass, const int *lhs, const int *rhs,
                     const bool *fail, int R, const char *lhs_name, const char *rhs_name) {
    jw_obj_begin(w);
    jw_key(w, "id"); jw_str(w, id);
    jw_key(w, "label"); jw_str(w, label);
    jw_key(w, "status"); jw_str(w, pass ? "PASS" : "FAIL");
    jw_key(w, "pass"); jw_bool(w, pass);
    jw_key(w, "lhs_name"); jw_str(w, lhs_name);
    jw_key(w, "rhs_name"); jw_str(w, rhs_name);
    jw_key(w, "lhs"); jw_int_array(w, lhs, R);
    jw_key(w, "rhs"); jw_int_array(w, rhs, R);
    jw_key(w, "fail"); jw_bool_array(w, fail, R);
    jw_obj_end(w);
}

/* ------------------------------------------------------------------ */
/* Action handlers. Each writes its fields and returns the op count.   */
/* ------------------------------------------------------------------ */
static SafetyResult g_sr;
static RequestResult g_rr;
static DetectResult g_dr;
static GraphResult g_gr;
static int g_seqs[MAX_SEQUENCES][MAX_P];

static const char *safe_word(bool safe) { return safe ? "SAFE" : "UNSAFE"; }

static bool get_pid(const JVal *root, int *pid, ErrorList *err) {
    if (!get_int(json_get(root, "pid"), pid)) {
        errors_add(err, "'pid' must be an integer");
        return false;
    }
    return true;
}

static long act_safety(JW *w, State *s, FILE *tf) {
    is_safe(s, &g_sr);
    print_state(tf, s);
    print_safety(tf, s, &g_sr);
    jw_key(w, "decision"); jw_str(w, safe_word(g_sr.safe));
    jw_key(w, "reason");
    jw_str(w, g_sr.safe ? "A safe sequence exists: every process can finish in some order."
                        : "No ordering lets every process obtain its remaining Need.");
    jw_key(w, "safe"); jw_bool(w, g_sr.safe);
    jw_key(w, "state"); jw_state(w, s);
    jw_key(w, "safety"); jw_safety(w, &g_sr, s);
    return g_sr.ops;
}

static long act_request(JW *w, State *s, const JVal *root, ErrorList *err, FILE *tf, bool *valid) {
    int pid, req[MAX_R] = {0};
    if (!get_pid(root, &pid, err) || !parse_vector(json_get(root, "request"), s->R, req, err, "request")) {
        *valid = false;
        return 0;
    }
    RequestOutcome o = request_resources(s, pid, req, &g_rr, err);
    if (o == REQ_INVALID) {
        *valid = false;
        return 0;
    }
    const State *b = &g_rr.before;
    print_request(tf, s, &g_rr);
    const char *reason = "";
    switch (o) {
    case REQ_GRANTED: reason = "All three conditions passed: resources allocated and committed."; break;
    case REQ_DENIED_NEED: reason = "Request exceeds the process's remaining Need (maximum claim violated)."; break;
    case REQ_DENIED_AVAIL: reason = "Request exceeds Available: the process must wait."; break;
    case REQ_ROLLED_BACK:
        reason = "Resources were available, but granting them leaves no safe sequence. Snapshot restored.";
        break;
    case REQ_INVALID: break;
    }
    jw_key(w, "decision"); jw_str(w, outcome_name(o));
    jw_key(w, "denial_kind");
    if (o == REQ_DENIED_NEED) jw_str(w, "REQUEST_EXCEEDS_NEED");
    else if (o == REQ_DENIED_AVAIL) jw_str(w, "REQUEST_EXCEEDS_AVAILABLE");
    else if (o == REQ_ROLLED_BACK) jw_str(w, "UNSAFE_STATE");
    else jw_null(w);
    jw_key(w, "reason"); jw_str(w, reason);
    jw_key(w, "pid"); jw_int(w, pid);
    jw_key(w, "request"); jw_int_array(w, req, s->R);
    jw_key(w, "checks");
    jw_arr_begin(w);
    jw_check(w, "need", "Request <= Need", g_rr.need_ok, req, b->need[pid], g_rr.need_fail, s->R, "Request", "Need");
    jw_check(w, "available", "Request <= Available", g_rr.avail_ok, req, b->avail, g_rr.avail_fail, s->R, "Request",
             "Available");
    jw_obj_begin(w);
    jw_key(w, "id"); jw_str(w, "safety");
    jw_key(w, "label"); jw_str(w, "Safety test");
    jw_key(w, "status"); jw_str(w, g_rr.safety_run ? (g_rr.safe ? "PASS" : "FAIL") : "SKIPPED");
    jw_key(w, "pass");
    if (g_rr.safety_run) jw_bool(w, g_rr.safe);
    else jw_null(w);
    jw_key(w, "sequence"); jw_int_array(w, g_rr.safety.seq, g_rr.safety_run ? g_rr.safety.seq_len : 0);
    jw_obj_end(w);
    jw_arr_end(w);
    jw_key(w, "state_before"); jw_state(w, b);
    jw_key(w, "provisional");
    if (g_rr.safety_run) jw_state(w, &g_rr.provisional);
    else jw_null(w);
    jw_key(w, "safety");
    if (g_rr.safety_run) jw_safety(w, &g_rr.safety, &g_rr.provisional);
    else jw_null(w);
    jw_key(w, "rolled_back"); jw_bool(w, o == REQ_ROLLED_BACK);
    jw_key(w, "rollback_verified"); jw_bool(w, g_rr.rollback_verified);
    jw_key(w, "state"); jw_state(w, s);
    is_safe(s, &g_sr);
    jw_key(w, "safe"); jw_bool(w, g_sr.safe);
    return g_rr.ops;
}

static long act_release(JW *w, State *s, const JVal *root, ErrorList *err, FILE *tf, bool *valid, bool complete) {
    int pid, rel[MAX_R] = {0};
    if (!get_pid(root, &pid, err)) {
        *valid = false;
        return 0;
    }
    if (!complete && !parse_vector(json_get(root, "release"), s->R, rel, err, "release")) {
        *valid = false;
        return 0;
    }
    if (pid < 0 || pid >= s->P) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", pid, s->P - 1);
        *valid = false;
        return 0;
    }
    State before = *s;
    if (complete)
        for (int j = 0; j < s->R; j++) rel[j] = s->alloc[pid][j];
    bool ok = complete ? complete_process(s, pid, err) : release_resources(s, pid, rel, err);
    print_release(tf, pid, rel, s->R, ok);
    if (ok) print_state(tf, s);
    print_errors(tf, err);
    jw_key(w, "decision"); jw_str(w, ok ? (complete ? "COMPLETED" : "RELEASED") : "DENIED");
    jw_key(w, "reason");
    jw_str(w, ok ? (complete ? "Process finished: all held resources returned to Available."
                             : "Resources returned to Available.")
                 : "Release exceeds the process's current Allocation.");
    jw_key(w, "pid"); jw_int(w, pid);
    jw_key(w, "release"); jw_int_array(w, rel, s->R);
    jw_key(w, "checks");
    jw_arr_begin(w);
    bool fail[MAX_R] = {false};
    bool all = true;
    for (int j = 0; j < s->R; j++) {
        fail[j] = rel[j] > before.alloc[pid][j] || rel[j] < 0;
        if (fail[j]) all = false;
    }
    jw_check(w, "allocation", "Release <= Allocation", all, rel, before.alloc[pid], fail, s->R, "Release",
             "Allocation");
    jw_arr_end(w);
    jw_key(w, "state_before"); jw_state(w, &before);
    jw_key(w, "state"); jw_state(w, s);
    is_safe(s, &g_sr);
    jw_key(w, "safe"); jw_bool(w, g_sr.safe);
    jw_key(w, "safety"); jw_safety(w, &g_sr, s);
    return g_sr.ops + s->R;
}

static long act_sequences(JW *w, State *s, FILE *tf) {
    bool trunc = false;
    long ops = 0;
    int n = all_safe_sequences(s, g_seqs, MAX_SEQUENCES, &trunc, &ops);
    print_sequences(tf, g_seqs, n, s->P, trunc);
    jw_key(w, "decision"); jw_str(w, safe_word(n > 0));
    jw_key(w, "safe"); jw_bool(w, n > 0);
    jw_key(w, "count"); jw_int(w, n);
    jw_key(w, "truncated"); jw_bool(w, trunc);
    jw_key(w, "cap"); jw_int(w, MAX_SEQUENCES);
    jw_key(w, "sequences");
    jw_arr_begin(w);
    for (int k = 0; k < n; k++) jw_int_array(w, g_seqs[k], s->P);
    jw_arr_end(w);
    jw_key(w, "state"); jw_state(w, s);
    return ops;
}

static long act_detect(JW *w, State *s, const JVal *root, ErrorList *err, FILE *tf, bool *valid) {
    static int reqm[MAX_P][MAX_R];
    bool have_matrix = false;
    const JVal *rm = json_get(root, "request_matrix");
    if (rm && rm->t != J_NULL) {
        if (!parse_request_matrix(rm, s, reqm, err)) {
            *valid = false;
            return 0;
        }
        have_matrix = true;
    }
    /* Optional: grant a request WITHOUT the Banker's safety check (what a
     * system without avoidance would do), then detect. */
    bool unchecked = false, granted = false;
    int pid = -1, req[MAX_R] = {0};
    State before = *s;
    const JVal *pj = json_get(root, "pid");
    if (pj && pj->t != J_NULL) {
        unchecked = true;
        if (!get_pid(root, &pid, err) || !parse_vector(json_get(root, "request"), s->R, req, err, "request")) {
            *valid = false;
            return 0;
        }
        if (pid < 0 || pid >= s->P) {
            snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", pid, s->P - 1);
            *valid = false;
            return 0;
        }
        bool fits = true;
        for (int j = 0; j < s->R; j++)
            if (req[j] < 0 || req[j] > s->need[pid][j] || req[j] > s->avail[j]) fits = false;
        if (fits) {
            for (int j = 0; j < s->R; j++) {
                s->avail[j] -= req[j];
                s->alloc[pid][j] += req[j];
                s->need[pid][j] -= req[j];
            }
            granted = true;
            fprintf(tf, "\nNo avoidance: P%d's request ", pid);
            print_vector(tf, req, s->R);
            fprintf(tf, " granted without a safety check.\n");
        } else {
            fprintf(tf, "\nNo avoidance: P%d's request cannot be granted (exceeds Need or Available).\n", pid);
        }
    }
    detect_deadlock(s, have_matrix ? (const int (*)[MAX_R])reqm : NULL, &g_dr);
    print_state(tf, s);
    print_detect(tf, s, &g_dr);
    jw_key(w, "decision"); jw_str(w, g_dr.deadlock ? "DEADLOCK" : "NO_DEADLOCK");
    jw_key(w, "reason");
    jw_str(w, g_dr.deadlock ? "Some processes can never obtain what they are waiting for: circular wait."
                            : "Every process can eventually obtain its outstanding request.");
    jw_key(w, "request_source"); jw_str(w, have_matrix ? "request_matrix" : "need");
    jw_key(w, "unchecked_grant"); jw_bool(w, unchecked);
    jw_key(w, "granted"); jw_bool(w, granted);
    if (unchecked) {
        jw_key(w, "pid"); jw_int(w, pid);
        jw_key(w, "request"); jw_int_array(w, req, s->R);
    }
    jw_key(w, "state_before"); jw_state(w, &before);
    jw_key(w, "state"); jw_state(w, s);
    jw_key(w, "detection"); jw_detection(w, &g_dr, s);
    return g_dr.ops;
}

static long act_max_grantable(JW *w, State *s, const JVal *root, ErrorList *err, FILE *tf, bool *valid) {
    int only = -1;
    const JVal *pj = json_get(root, "pid");
    if (pj && pj->t != J_NULL) {
        if (!get_pid(root, &only, err)) {
            *valid = false;
            return 0;
        }
        if (only < 0 || only >= s->P) {
            snprintf(errors_slot(err), RG_ERR_LEN, "Process id %d out of range (0..%d)", only, s->P - 1);
            *valid = false;
            return 0;
        }
    }
    long ops = 0;
    is_safe(s, &g_sr);
    ops += g_sr.ops;
    fprintf(tf, "\nMaximum grantable request per process (state is %s)\n", safe_word(g_sr.safe));
    jw_key(w, "decision"); jw_str(w, "OK");
    jw_key(w, "safe"); jw_bool(w, g_sr.safe);
    jw_key(w, "max_grantable");
    jw_arr_begin(w);
    for (int i = 0; i < s->P; i++) {
        if (only >= 0 && i != only) continue;
        MaxGrant m;
        max_grantable(s, i, &m, &ops, err);
        print_max_grant(tf, s, i, &m);
        jw_obj_begin(w);
        jw_key(w, "pid"); jw_int(w, i);
        jw_key(w, "need"); jw_int_array(w, s->need[i], s->R);
        jw_key(w, "limit"); jw_int_array(w, m.limit, s->R);
        jw_key(w, "single"); jw_int_array(w, m.single, s->R);
        jw_key(w, "combined"); jw_int_array(w, m.combined, s->R);
        jw_key(w, "any"); jw_bool(w, m.any);
        jw_obj_end(w);
    }
    jw_arr_end(w);
    jw_key(w, "state"); jw_state(w, s);
    return ops;
}

static long act_graph(JW *w, State *s, FILE *tf) {
    find_graph_cycles(s, &g_gr);
    detect_deadlock(s, NULL, &g_dr);
    print_graph(tf, s, &g_gr);
    print_detect(tf, s, &g_dr);
    jw_key(w, "decision"); jw_str(w, g_gr.ncycles > 0 ? "CYCLE" : "NO_CYCLE");
    jw_key(w, "assign");
    jw_arr_begin(w);
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++)
            if (s->alloc[i][j] > 0) {
                jw_obj_begin(w);
                jw_key(w, "p"); jw_int(w, i);
                jw_key(w, "r"); jw_int(w, j);
                jw_key(w, "count"); jw_int(w, s->alloc[i][j]);
                jw_obj_end(w);
            }
    jw_arr_end(w);
    jw_key(w, "waits");
    jw_arr_begin(w);
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++)
            if (g_gr.waits[i][j]) {
                jw_obj_begin(w);
                jw_key(w, "p"); jw_int(w, i);
                jw_key(w, "r"); jw_int(w, j);
                jw_key(w, "need"); jw_int(w, s->need[i][j]);
                jw_key(w, "available"); jw_int(w, s->avail[j]);
                jw_obj_end(w);
            }
    jw_arr_end(w);
    jw_key(w, "cycles");
    jw_arr_begin(w);
    for (int k = 0; k < g_gr.ncycles; k++) {
        jw_arr_begin(w);
        for (int n = 0; n < g_gr.cycles[k].len; n++) {
            int v = g_gr.cycles[k].nodes[n];
            jw_obj_begin(w);
            jw_key(w, "kind"); jw_str(w, v < s->P ? "P" : "R");
            jw_key(w, "id"); jw_int(w, v < s->P ? v : v - s->P);
            jw_obj_end(w);
        }
        jw_arr_end(w);
    }
    jw_arr_end(w);
    jw_key(w, "truncated"); jw_bool(w, g_gr.truncated);
    jw_key(w, "deadlock"); jw_bool(w, g_dr.deadlock);
    jw_key(w, "detection"); jw_detection(w, &g_dr, s);
    is_safe(s, &g_sr);
    jw_key(w, "safe"); jw_bool(w, g_sr.safe);
    jw_key(w, "state"); jw_state(w, s);
    return g_gr.ops + g_dr.ops + g_sr.ops;
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */
static void emit_terminal(JW *w, FILE *tf) {
    jw_key(w, "terminal");
    if (!tf) {
        jw_str(w, "");
        return;
    }
    long n = ftell(tf);
    if (n < 0) n = 0;
    char *buf = malloc((size_t)n + 1);
    if (!buf) {
        jw_str(w, "");
        return;
    }
    rewind(tf);
    size_t got = fread(buf, 1, (size_t)n, tf);
    buf[got] = '\0';
    jw_str_n(w, buf, (long)got);
    free(buf);
}

int run_json_mode(FILE *in, FILE *out) {
    long len = 0;
    char perr[160] = "";
    ErrorList err;
    errors_clear(&err);
    char *text = read_all(in, &len);
    bool got_text = text != NULL;
    JVal *root = text ? json_parse(text, perr, sizeof perr) : NULL;
    free(text);

    /* The human-readable trace is captured in a temp file and embedded in the
     * JSON as "terminal". Some Windows runtimes refuse tmpfile(), so fall back
     * to a named scratch file in the working directory. */
    const char *fallback_name = "resourceguard_trace.tmp";
    bool used_fallback = false;
    FILE *tf = tmpfile();
    if (!tf) {
        tf = fopen(fallback_name, "w+");
        used_fallback = tf != NULL;
    }
    FILE *sink = tf ? tf : stderr;
    print_set_color(false);

    JW w;
    jw_init(&w, out);
    jw_obj_begin(&w);
    jw_key(&w, "engine"); jw_str(&w, ENGINE_NAME);

    int code = 0;
    bool valid = true;
    long ops = 0;
    static State s;
    state_init(&s, 0, 0);
    const char *action = "";
    const JVal *aj = root ? json_get(root, "action") : NULL;
    if (aj && aj->t == J_STR) action = aj->s;
    jw_key(&w, "action"); jw_str(&w, action);

    if (!root) {
        errors_add(&err, got_text ? perr : "Could not read input (empty or larger than 4 MB)");
        valid = false;
        code = 1;
    } else if (root->t != J_OBJ) {
        errors_add(&err, "Input must be a JSON object");
        valid = false;
        code = 1;
    } else if (strcmp(action, "random") == 0) {
        int P = 5, R = 3, seed = 1;
        get_int(json_get(root, "processes"), &P);
        get_int(json_get(root, "resources"), &R);
        get_int(json_get(root, "seed"), &seed);
        const JVal *es = json_get(root, "ensure_safe");
        bool ensure = !(es && es->t == J_BOOL && !es->b);
        if (P < 1 || P > MAX_P || R < 1 || R > MAX_R) {
            snprintf(errors_slot(&err), RG_ERR_LEN, "Random state size %dx%d out of range (max %dx%d)", P, R, MAX_P,
                     MAX_R);
            valid = false;
        } else {
            random_state(&s, P, R, (unsigned)seed, ensure);
            is_safe(&s, &g_sr);
            ops = g_sr.ops;
            print_state(sink, &s);
            print_safety(sink, &s, &g_sr);
            jw_key(&w, "decision"); jw_str(&w, "GENERATED");
            jw_key(&w, "safe"); jw_bool(&w, g_sr.safe);
            jw_key(&w, "state"); jw_state(&w, &s);
            jw_key(&w, "safety"); jw_safety(&w, &g_sr, &s);
        }
    } else {
        const char *known[] = {"validate", "safety", "request", "release", "complete",
                               "all_sequences", "detect", "max_grantable", "graph"};
        bool found = false;
        for (size_t k = 0; k < sizeof known / sizeof known[0]; k++)
            if (strcmp(action, known[k]) == 0) found = true;
        if (!found) {
            snprintf(errors_slot(&err), RG_ERR_LEN,
                     "Unknown action '%s' (expected safety|request|release|complete|all_sequences|detect|"
                     "max_grantable|graph|validate|random)",
                     action);
            valid = false;
            code = 1;
        } else if (!json_to_state(json_get(root, "state"), &s, &err) || !calculate_need(&s, &err)) {
            valid = false;
        } else if (strcmp(action, "validate") == 0) {
            print_state(sink, &s);
            jw_key(&w, "decision"); jw_str(&w, "VALID");
            jw_key(&w, "state"); jw_state(&w, &s);
        } else if (strcmp(action, "safety") == 0) {
            ops = act_safety(&w, &s, sink);
        } else if (strcmp(action, "request") == 0) {
            ops = act_request(&w, &s, root, &err, sink, &valid);
        } else if (strcmp(action, "release") == 0) {
            ops = act_release(&w, &s, root, &err, sink, &valid, false);
        } else if (strcmp(action, "complete") == 0) {
            ops = act_release(&w, &s, root, &err, sink, &valid, true);
        } else if (strcmp(action, "all_sequences") == 0) {
            ops = act_sequences(&w, &s, sink);
        } else if (strcmp(action, "detect") == 0) {
            ops = act_detect(&w, &s, root, &err, sink, &valid);
        } else if (strcmp(action, "max_grantable") == 0) {
            ops = act_max_grantable(&w, &s, root, &err, sink, &valid);
        } else if (strcmp(action, "graph") == 0) {
            ops = act_graph(&w, &s, sink);
        }
    }

    if (!valid) {
        jw_key(&w, "decision"); jw_str(&w, "INVALID");
        fprintf(sink, "\nInput rejected:\n");
        print_errors(sink, &err);
    }
    jw_key(&w, "ok"); jw_bool(&w, valid);
    jw_key(&w, "errors"); jw_errors(&w, &err);
    if (valid && s.P > 0) jw_complexity(&w, &s, ops);
    emit_terminal(&w, tf);
    jw_obj_end(&w);
    fputc('\n', out);
    fflush(out);

    if (tf) fclose(tf);
    if (used_fallback) remove(fallback_name);
    json_free(root);
    return code;
}
