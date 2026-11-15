/*
 * ResourceGuard - test_banker.c
 * Unit + stress tests for the Banker's Algorithm. Run with `make test`.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "state.h"
#include "banker.h"

static int g_pass = 0, g_fail = 0;

#define CHECK(cond, msg)                                                                 \
    do {                                                                                 \
        if (cond) {                                                                      \
            g_pass++;                                                                    \
            printf("    \033[32mPASS\033[0m %s\n", msg);                                      \
        } else {                                                                         \
            g_fail++;                                                                    \
            printf("    \033[31mFAIL\033[0m %s  (%s:%d)\n", msg, __FILE__, __LINE__);       \
        }                                                                                \
    } while (0)

static void section(const char *name) { printf("\n\033[1m%s\033[0m\n", name); }

static bool seq_equals(const int *seq, int n, const int *expect, int m) {
    if (n != m) return false;
    for (int k = 0; k < n; k++)
        if (seq[k] != expect[k]) return false;
    return true;
}

static SafetyResult sr;
static RequestResult rr;

/* 1. initial textbook state is safe */
static void test_initial_safe(void) {
    section("Test 1: textbook initial state is SAFE");
    State s;
    state_load_textbook(&s);
    CHECK(s.need[0][0] == 7 && s.need[0][1] == 4 && s.need[0][2] == 3, "Need[P0] = 7 4 3");
    CHECK(s.need[1][0] == 1 && s.need[1][1] == 2 && s.need[1][2] == 2, "Need[P1] = 1 2 2");
    CHECK(s.need[2][0] == 6 && s.need[2][1] == 0 && s.need[2][2] == 0, "Need[P2] = 6 0 0");
    CHECK(s.need[3][0] == 0 && s.need[3][1] == 1 && s.need[3][2] == 1, "Need[P3] = 0 1 1");
    CHECK(s.need[4][0] == 4 && s.need[4][1] == 3 && s.need[4][2] == 1, "Need[P4] = 4 3 1");
    CHECK(is_safe(&s, &sr), "is_safe() returns true");
    int expect[] = {1, 3, 4, 0, 2};
    CHECK(seq_equals(sr.seq, sr.seq_len, expect, 5), "pass-based sequence P1 P3 P4 P0 P2");
    CHECK(sr.passes == 2, "two passes");
    CHECK(sr.nsteps == 7, "seven recorded checks (5 in pass 1, 2 in pass 2)");
    CHECK(sr.steps[0].pid == 0 && !sr.steps[0].ok && sr.steps[0].fail[0], "first check: P0 fails on R0");
    CHECK(sr.work[0] == 10 && sr.work[1] == 5 && sr.work[2] == 7, "final Work = total = 10 5 7");
    printf("    sequence P1 -> P3 -> P4 -> P0 -> P2 in %d passes, %ld ops\n", sr.passes, sr.ops);
}

/* 2-4: sequential requests on the textbook state */
static void test_request_chain(void) {
    State s;
    ErrorList err;
    errors_clear(&err);
    state_load_textbook(&s);

    section("Test 2: P1 requests (1,0,2) -> GRANTED");
    int r1[3] = {1, 0, 2};
    RequestOutcome o = request_resources(&s, 1, r1, &rr, &err);
    CHECK(o == REQ_GRANTED, "outcome GRANTED");
    CHECK(rr.need_ok && rr.avail_ok && rr.safety_run && rr.safe, "all three checks pass");
    int expect[] = {1, 3, 4, 0, 2};
    CHECK(seq_equals(rr.safety.seq, rr.safety.seq_len, expect, 5), "safe sequence P1 P3 P4 P0 P2");
    CHECK(s.avail[0] == 2 && s.avail[1] == 3 && s.avail[2] == 0, "Available now 2 3 0");
    CHECK(s.alloc[1][0] == 3 && s.alloc[1][1] == 0 && s.alloc[1][2] == 2, "Allocation[P1] now 3 0 2");
    CHECK(s.need[1][0] == 0 && s.need[1][1] == 2 && s.need[1][2] == 0, "Need[P1] now 0 2 0");

    section("Test 3: then P4 requests (3,3,0) -> DENIED (Request > Available)");
    State before = s;
    int r2[3] = {3, 3, 0};
    o = request_resources(&s, 4, r2, &rr, &err);
    CHECK(o == REQ_DENIED_AVAIL, "outcome DENIED_AVAIL");
    CHECK(rr.need_ok, "Request <= Need passes (3 3 0 <= 4 3 1)");
    CHECK(!rr.avail_ok && rr.avail_fail[0] && !rr.avail_fail[1] && !rr.avail_fail[2],
          "Request <= Available fails only on R0 (3 > 2)");
    CHECK(!rr.safety_run, "safety test skipped");
    CHECK(state_equal(&s, &before), "state unchanged");

    section("Test 4: then P0 requests (0,2,0) -> available but UNSAFE -> ROLLED BACK");
    before = s;
    int r3[3] = {0, 2, 0};
    o = request_resources(&s, 0, r3, &rr, &err);
    CHECK(rr.need_ok && rr.avail_ok, "Request <= Need and Request <= Available both pass");
    CHECK(rr.safety_run && !rr.safe, "safety test ran and failed");
    CHECK(o == REQ_ROLLED_BACK, "outcome ROLLED_BACK");
    CHECK(rr.provisional.avail[1] == 1, "provisional Available was 2 1 0");
    CHECK(rr.safety.seq_len == 0, "no process could finish in the provisional state");
    CHECK(memcmp(&s, &before, sizeof s) == 0, "memcmp(state, snapshot) == 0 after rollback");
    CHECK(memcmp(&s, &rr.before, sizeof s) == 0, "memcmp(state, recorded snapshot) == 0");
    CHECK(rr.rollback_verified, "engine reports rollback_verified");
}

/* 5. Request > Need */
static void test_exceeds_need(void) {
    section("Test 5: P1 requests (0,3,0) on initial state -> DENIED (Request > Need)");
    State s, before;
    ErrorList err;
    errors_clear(&err);
    state_load_textbook(&s);
    before = s;
    int r[3] = {0, 3, 0};
    RequestOutcome o = request_resources(&s, 1, r, &rr, &err);
    CHECK(o == REQ_DENIED_NEED, "outcome DENIED_NEED");
    CHECK(!rr.need_ok && rr.need_fail[1] && !rr.need_fail[0] && !rr.need_fail[2], "fails only on R1 (3 > 2)");
    CHECK(rr.avail_ok, "Request <= Available reported separately (passes: 0 3 0 <= 3 3 2)");
    CHECK(state_equal(&s, &before), "state unchanged");
}

/* 6. invalid inputs */
static void test_invalid(void) {
    section("Test 6: invalid input is rejected");
    State s;
    ErrorList err;

    state_load_textbook(&s);
    s.alloc[2][0] = 10; /* Max is 9 */
    errors_clear(&err);
    CHECK(!calculate_need(&s, &err), "Allocation > Max rejected");
    CHECK(err.count == 1 && strstr(err.msg[0], "exceeds Max") != NULL, "clear error message");
    printf("    -> %s\n", err.msg[0]);

    state_load_textbook(&s);
    s.max[1][2] = -1;
    errors_clear(&err);
    CHECK(!calculate_need(&s, &err), "negative Max rejected");

    state_load_textbook(&s);
    s.alloc[0][1] = -2;
    errors_clear(&err);
    CHECK(!calculate_need(&s, &err), "negative Allocation rejected");

    state_load_textbook(&s);
    s.avail[0] = -1;
    errors_clear(&err);
    CHECK(!calculate_need(&s, &err), "negative Available rejected");

    state_load_textbook(&s);
    State before = s;
    int r[3] = {0, 0, 1};
    errors_clear(&err);
    CHECK(request_resources(&s, 7, r, &rr, &err) == REQ_INVALID, "pid 7 out of range rejected");
    CHECK(request_resources(&s, -1, r, &rr, &err) == REQ_INVALID, "pid -1 rejected");
    int neg[3] = {0, -1, 0};
    CHECK(request_resources(&s, 1, neg, &rr, &err) == REQ_INVALID, "negative request rejected");
    CHECK(state_equal(&s, &before), "state unchanged by invalid requests");

    int rel[3] = {5, 0, 0};
    errors_clear(&err);
    CHECK(!release_resources(&s, 1, rel, &err), "release more than allocated rejected");
    int rel_ok[3] = {2, 0, 0};
    CHECK(release_resources(&s, 1, rel_ok, &err), "valid release accepted");
    CHECK(s.avail[0] == 5 && s.alloc[1][0] == 0 && s.need[1][0] == 3, "release updates Available/Alloc/Need");

    state_init(&s, 0, 3);
    errors_clear(&err);
    CHECK(!calculate_need(&s, &err), "zero processes rejected");
    state_init(&s, 3, MAX_R + 1);
    errors_clear(&err);
    CHECK(!calculate_need(&s, &err), "too many resource types rejected");
}

/* 7. random stress test */
static void test_stress(void) {
    section("Test 7: random stress (1000 runs) - no committed state is ever unsafe");
    unsigned long checks = 0;
    int granted = 0, denied = 0, rolled = 0, unsafe_commits = 0, bad_rollbacks = 0;
    srand(12345);
    for (int run = 0; run < 1000; run++) {
        State s;
        int P = 2 + rand() % 9, R = 1 + rand() % 5;
        random_state(&s, P, R, (unsigned)rand(), true);
        if (!is_safe(&s, &sr)) {
            unsafe_commits++;
            continue;
        }
        for (int step = 0; step < 25; step++) {
            ErrorList err;
            errors_clear(&err);
            int pid = rand() % P, req[MAX_R] = {0};
            for (int j = 0; j < R; j++) req[j] = s.need[pid][j] ? rand() % (s.need[pid][j] + 1) : 0;
            if (rand() % 6 == 0) req[rand() % R] += 1 + rand() % 3; /* sometimes exceed Need */
            State before = s;
            RequestOutcome o = request_resources(&s, pid, req, &rr, &err);
            if (o == REQ_GRANTED) {
                granted++;
                if (!is_safe(&s, &sr)) unsafe_commits++;
            } else {
                if (o == REQ_ROLLED_BACK) rolled++;
                else denied++;
                if (memcmp(&s, &before, sizeof s) != 0) bad_rollbacks++;
            }
            checks++;
            if (rand() % 4 == 0) { /* occasionally finish a process */
                int q = rand() % P;
                complete_process(&s, q, &err);
                if (!is_safe(&s, &sr)) unsafe_commits++;
            }
        }
    }
    CHECK(unsafe_commits == 0, "no committed state is unsafe");
    CHECK(bad_rollbacks == 0, "every denied / rolled-back request left the state byte-identical");
    CHECK(granted > 0 && rolled > 0 && denied > 0, "stress exercised all outcomes");
    printf("    %lu requests: %d granted, %d denied, %d rolled back\n", checks, granted, denied, rolled);
}

/* extras */
static void test_extras(void) {
    section("Extras: all sequences, detection, max grantable, graph");
    static int seqs[MAX_SEQUENCES][MAX_P];
    State s;
    state_load_textbook(&s);
    bool trunc;
    long ops;
    int n = all_safe_sequences(&s, seqs, MAX_SEQUENCES, &trunc, &ops);
    CHECK(n > 1 && !trunc, "textbook state has several safe sequences");
    bool found = false;
    int expect[] = {1, 3, 4, 0, 2};
    for (int k = 0; k < n; k++)
        if (seq_equals(seqs[k], 5, expect, 5)) found = true;
    CHECK(found, "pass-based sequence is among them");
    for (int k = 0; k < n; k++) {
        /* every enumerated sequence must be valid */
        int work[MAX_R] = {0};
        bool ok = true;
        for (int j = 0; j < s.R; j++) work[j] = s.avail[j];
        for (int t = 0; t < s.P && ok; t++) {
            int i = seqs[k][t];
            for (int j = 0; j < s.R; j++)
                if (s.need[i][j] > work[j]) ok = false;
            for (int j = 0; j < s.R; j++) work[j] += s.alloc[i][j];
        }
        if (!ok) {
            CHECK(false, "enumerated sequence is valid");
            break;
        }
    }
    printf("    %d safe sequences\n", n);

    static DetectResult d;
    detect_deadlock(&s, NULL, &d);
    CHECK(!d.deadlock, "no deadlock in the safe textbook state");

    /* circular wait: three single-instance resources */
    State c;
    state_init(&c, 3, 3);
    int A[3][3] = {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}};
    int M[3][3] = {{1, 1, 0}, {0, 1, 1}, {1, 0, 1}};
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++) {
            c.alloc[i][j] = A[i][j];
            c.max[i][j] = M[i][j];
        }
    calculate_need(&c, NULL);
    CHECK(!is_safe(&c, &sr), "circular wait state is unsafe");
    detect_deadlock(&c, NULL, &d);
    CHECK(d.deadlock && d.count == 3, "detection finds all 3 processes deadlocked");
    static GraphResult g;
    find_graph_cycles(&c, &g);
    CHECK(g.ncycles == 1 && g.cycles[0].len == 6, "RAG has exactly one 6-node cycle P0 R1 P1 R2 P2 R0");
    n = all_safe_sequences(&c, seqs, MAX_SEQUENCES, &trunc, &ops);
    CHECK(n == 0, "unsafe state has zero safe sequences");
    find_graph_cycles(&s, &g);
    bool two_node = false;
    for (int k = 0; k < g.ncycles; k++)
        if (g.cycles[k].len < 4) two_node = true;
    CHECK(!two_node, "RAG cycles always involve at least two processes");

    MaxGrant m;
    max_grantable(&s, 1, &m, &ops, NULL);
    CHECK(m.limit[0] == 1 && m.limit[1] == 2 && m.limit[2] == 2, "P1 limit = min(Need, Avail) = 1 2 2");
    CHECK(m.combined[0] == 1 && m.combined[1] == 2 && m.combined[2] == 2, "P1 can safely take all of 1 2 2");
    max_grantable(&s, 0, &m, &ops, NULL);
    {
        /* the reported combined vector must itself be grantable */
        State t = s;
        ErrorList err;
        errors_clear(&err);
        CHECK(request_resources(&t, 0, m.combined, &rr, &err) == REQ_GRANTED, "P0 combined max is GRANTED");
        int more[MAX_R] = {0};
        bool any_more_safe = false;
        for (int j = 0; j < s.R; j++) {
            if (m.combined[j] >= m.limit[j]) continue;
            memcpy(more, m.combined, sizeof more);
            more[j]++;
            State u = s;
            if (request_resources(&u, 0, more, &rr, &err) == REQ_GRANTED) any_more_safe = true;
        }
        CHECK(!any_more_safe, "P0 combined max is maximal (no single increment is safe)");
        printf("    P0 max safe request: %d %d %d\n", m.combined[0], m.combined[1], m.combined[2]);
    }
}

int main(void) {
    printf("ResourceGuard test suite (C17)\n");
    test_initial_safe();
    test_request_chain();
    test_exceeds_need();
    test_invalid();
    test_stress();
    test_extras();
    printf("\n%s%d passed, %d failed\033[0m\n", g_fail ? "\033[31m" : "\033[32m", g_pass, g_fail);
    return g_fail ? 1 : 0;
}
