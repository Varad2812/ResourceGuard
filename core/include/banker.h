/*
 * ResourceGuard - banker.h
 * Banker's Algorithm (safety + resource-request), release, all safe
 * sequences, deadlock detection, maximum grantable request, and resource
 * allocation graph cycle search.
 */
#ifndef RG_BANKER_H
#define RG_BANKER_H

#include <stdbool.h>
#include "state.h"

/* Upper bound on recorded checks: at most P passes, each checks <= P procs. */
#define MAX_TRACE (MAX_P * MAX_P + MAX_P)

typedef struct {
    int pass;              /* 1-based pass number */
    int pid;               /* process examined */
    int need[MAX_R];       /* Need_i (or Request_i in detection mode) */
    int work[MAX_R];       /* Work before the check */
    bool fail[MAX_R];      /* fail[j] => need[j] > work[j] */
    bool ok;               /* Need_i <= Work */
    int work_after[MAX_R]; /* Work after releasing Allocation_i (== work if !ok) */
} TraceStep;

typedef struct {
    bool safe;
    int seq[MAX_P];
    int seq_len;
    int passes;
    TraceStep steps[MAX_TRACE];
    int nsteps;
    bool finish[MAX_P];
    int work[MAX_R]; /* final Work */
    long ops;        /* element comparisons + additions performed */
} SafetyResult;

typedef enum {
    REQ_GRANTED = 0,
    REQ_DENIED_NEED,  /* Request > Need: process exceeded its maximum claim */
    REQ_DENIED_AVAIL, /* Request > Available: process must wait */
    REQ_ROLLED_BACK,  /* would leave the system unsafe: snapshot restored */
    REQ_INVALID       /* bad pid / negative values / invalid state */
} RequestOutcome;

typedef struct {
    RequestOutcome outcome;
    int pid;
    int req[MAX_R];
    bool need_ok, avail_ok;
    bool need_fail[MAX_R], avail_fail[MAX_R];
    bool safety_run, safe;
    SafetyResult safety; /* trace of the provisional state (if run) */
    State before;        /* snapshot taken before provisional allocation */
    State provisional;   /* state while the safety test ran */
    bool rollback_verified; /* memcmp(restored, snapshot) == 0 */
    long ops;
} RequestResult;

typedef struct {
    bool deadlock;
    bool deadlocked[MAX_P];
    int count;          /* number of deadlocked processes */
    int order[MAX_P];   /* processes that could complete, in order */
    int order_len;
    bool finish[MAX_P];
    bool init_finish[MAX_P]; /* Finish initialised true (Allocation == 0) */
    TraceStep steps[MAX_TRACE];
    int nsteps;
    int passes;
    long ops;
} DetectResult;

typedef struct {
    int single[MAX_R];   /* largest amount of resource j alone that stays safe */
    int combined[MAX_R]; /* greedy largest vector (j = 0..R-1) that stays safe */
    int limit[MAX_R];    /* min(Need, Available) upper bound */
    bool any;            /* some non-zero request is grantable */
} MaxGrant;

#define MAX_CYCLES 32
#define MAX_CYCLE_LEN (2 * (MAX_P + MAX_R))
typedef struct {
    int len;
    int nodes[MAX_CYCLE_LEN]; /* node ids: 0..P-1 processes, P..P+R-1 resources */
} Cycle;

typedef struct {
    bool waits[MAX_P][MAX_R]; /* request edge P_i -> R_j (Need > Available) */
    int ncycles;
    Cycle cycles[MAX_CYCLES];
    bool truncated;
    long ops;
} GraphResult;

/* ---- Core Banker's Algorithm ---- */
bool is_safe(const State *s, SafetyResult *out);
RequestOutcome request_resources(State *s, int pid, const int req[], RequestResult *out, ErrorList *err);
void rollback_state(State *s, const State *snapshot);

/* ---- Release / completion ---- */
bool release_resources(State *s, int pid, const int rel[], ErrorList *err);
bool complete_process(State *s, int pid, ErrorList *err);

/* ---- Extras ---- */
#define MAX_SEQUENCES 1000
/* Enumerate every safe sequence by backtracking (capped at `cap`). */
int all_safe_sequences(const State *s, int (*seqs)[MAX_P], int cap, bool *truncated, long *ops);
/* Deadlock detection (Coffman/Shoshani). request may be NULL => use Need. */
void detect_deadlock(const State *s, const int (*request)[MAX_R], DetectResult *out);
/* Largest request vectors for pid that keep the state safe. */
bool max_grantable(const State *s, int pid, MaxGrant *out, long *ops, ErrorList *err);
/* Resource allocation graph cycles (request edges where Need > Available). */
void find_graph_cycles(const State *s, GraphResult *out);

/* Random state generator (seeded); ensure_safe retries until safe. */
void random_state(State *s, int P, int R, unsigned seed, bool ensure_safe);

const char *outcome_name(RequestOutcome o);

#endif
